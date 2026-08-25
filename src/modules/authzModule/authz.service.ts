import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { CORE_DATA_SOURCE } from "../../core.options";
import { DataSource, EntityManager, In, IsNull } from "typeorm";
import { isClientTokenJwt } from "../../utils/clientToken";
import { AccessScopeEntity } from "../accessScopeModule/accessScope.entity";
import { ActorAppAccessEntity } from "../actorTokenModule/actorAppAccess.entity";
import { ActorTokenEntity } from "../actorTokenModule/actorToken.entity";
import { ActorTokenFacade } from "../actorTokenModule/actorToken.facade";
import { ActorTokenStateEntity } from "../actorTokenModule/actorTokenState.entity";
import { EAccessPermission } from "../actorTokenModule/enum/EAccessPermission.enum";
import { EActorTokenStatus } from "../actorTokenModule/enum/EActorTokenStatus.enum";
import {
  EActorType,
  PERSISTENT_SESSION_ACTOR_TYPES,
} from "../actorTokenModule/enum/EActorType.enum";
import { CoreConfig } from "../../core.config";
import { LobbyEntity } from "../lobbyModule/lobby.entity";
import { LobbyRoomEntity } from "../lobbyModule/lobbyRoom.entity";
import {
  IWebhookConfig,
  PlatformAppEntity,
  TopicConfigs,
} from "../platformAppModule/platformApp.entity";
import { EAppAccessMode } from "../platformAppModule/enum/EAppAccessMode.enum";
import { EAppStatus } from "../platformAppModule/enum/EAppStatus.enum";
import { ProjectEntity } from "../projectModule/project.entity";
import { ERoomStatus } from "../roomModule/enum/ERoomStatus.enum";
import { RoomEntity } from "../roomModule/room.entity";
import { RoomActorAccessEntity } from "../roomModule/roomActorAccess.entity";
import { SigningKeyFacade } from "../signingKeyModule/signingKey.facade";
import {
  ActiveSubscriptionDto,
  ActorAppAccessDto,
  ActorSessionPayload,
  AllowedTopicDto,
  CheckRoomAccessResult,
  RevalidateActorResponseDto,
  TopicWebhooksMap,
  ValidateActorResponseDto,
} from "./dto/authz.dto";

interface ResolvedScope {
  scopeId?: string;
  scopeSlug?: string;
  scopeName?: string;
}

interface ResolvedLimits {
  maxConnections: number | null;
  maxMessageSizeBytes: number | null;
  sessionExpirySeconds: number;
}

/**
 * Authorization Service
 *
 * Answers the three questions a broker asks: may this actor connect, is it still
 * valid, and may it reach this topic.
 *
 * Access model, in the order it is evaluated:
 *
 *  1. The actor token must be active and unexpired.
 *  2. App level: either the app is `open`, in which case every actor in the
 *     project has access with no stored grant, or a matching actor_app_access
 *     row must exist and be active and unexpired.
 *  3. Room level: a room is private if and only if at least one
 *     room_actor_access row exists for it. A public room inherits the app-level
 *     permission. A private room requires a grant, and an actor-specific grant
 *     beats a type-based one.
 *  4. Topics come from the most specific non-null list: the room grant, then the
 *     app grant, then the app's own topic list. A room's own `topics` column is
 *     never consulted.
 */
@Injectable()
export class AuthzService {
  private readonly _logger = new Logger(AuthzService.name);

  constructor(
    @InjectDataSource(CORE_DATA_SOURCE)
    private readonly _dataSource: DataSource,
    private readonly _actorTokenFacade: ActorTokenFacade,
    private readonly _signingKeyFacade: SigningKeyFacade,
    private readonly _config: CoreConfig,
  ) {}

  /* ── validate ──────────────────────────────────────────────────────────── */

  /**
   * Called when an actor connects. Returns its identity and the complete set of
   * topics it may reach, which the broker then caches.
   */
  async validateActor(accessToken: string): Promise<ValidateActorResponseDto> {
    if (isClientTokenJwt(accessToken)) {
      return this._validateClientToken(accessToken);
    }

    const actorToken =
      await this._actorTokenFacade.authenticateActorToken(accessToken);

    if (!actorToken) {
      return { valid: false, error: "token_invalid" };
    }

    // authenticateActorToken already enforces both of these. Repeated here
    // because this response distinguishes suspended from expired, which is
    // useful to an operator reading broker logs, whereas authentication
    // deliberately collapses every failure into one.
    if (actorToken.status !== EActorTokenStatus.Active) {
      return { valid: false, error: "token_suspended" };
    }

    if (actorToken.expiresAt && new Date(actorToken.expiresAt) < new Date()) {
      return { valid: false, error: "token_expired" };
    }

    const payload = await this._buildSessionPayload(actorToken);
    if (!payload) {
      return { valid: false, error: "project_not_found" };
    }

    return { valid: true, ...payload };
  }

  /**
   * Client token path. The signature proves possession; identity and grants come
   * from the actor named in `sub`, exactly as for an opaque token.
   *
   * Every refusal is a generic `token_invalid`. Reasons are logged only.
   */
  private async _validateClientToken(
    token: string,
  ): Promise<ValidateActorResponseDto> {
    const deny: ValidateActorResponseDto = {
      valid: false,
      error: "token_invalid",
    };

    const verified = await this._signingKeyFacade.verifyClientToken(token);
    if (!verified) {
      return deny;
    }

    const actorToken = await this._actorTokenFacade.getActiveActorByKeyId(
      verified.payload.sub,
    );
    if (!actorToken) {
      this._logger.warn("Client token rejected: actor not found or inactive", {
        sub: verified.payload.sub,
        kid: verified.signingKey.keyId,
      });
      return deny;
    }

    // Cross-project binding, and the load-bearing tenant check on this path.
    //
    // Actor key ids are public. Without this, anyone holding any project's
    // signing key could mint a validly signed token naming another project's
    // actor and be issued that actor's grants. A signing key may only vouch for
    // actors in its own project.
    if (actorToken.projectId !== verified.signingKey.projectId) {
      this._logger.warn(
        "Client token rejected: signing key project does not match actor project",
        {
          kid: verified.signingKey.keyId,
          signingKeyProjectId: verified.signingKey.projectId,
          actorProjectId: actorToken.projectId,
        },
      );
      return deny;
    }

    const payload = await this._buildSessionPayload(actorToken);
    if (!payload) {
      return { valid: false, error: "project_not_found" };
    }

    return { valid: true, ...payload, authExpiresAt: verified.payload.exp };
  }

  /* ── revalidate ────────────────────────────────────────────────────────── */

  /**
   * Called periodically for a live session, to confirm the token is still valid
   * and to re-hydrate the session with any access that changed since connect.
   */
  async revalidateActor(
    actorTokenId: string,
  ): Promise<RevalidateActorResponseDto> {
    const actorToken = await this._dataSource.manager.findOne(
      ActorTokenEntity,
      {
        where: { actorTokenId, deletedAt: IsNull() },
      },
    );

    if (!actorToken) {
      this._logger.warn("revalidateActor: token not found", { actorTokenId });
      return {
        valid: false,
        error: "token_not_found",
        disconnectReason: "token_not_found",
      };
    }

    if (actorToken.status !== EActorTokenStatus.Active) {
      this._logger.warn("revalidateActor: token not active", {
        actorTokenId,
        status: actorToken.status,
      });
      return {
        valid: false,
        error: "token_suspended",
        disconnectReason: "token_revoked",
      };
    }

    if (actorToken.expiresAt && new Date(actorToken.expiresAt) < new Date()) {
      this._logger.warn("revalidateActor: token expired", { actorTokenId });
      return {
        valid: false,
        error: "token_expired",
        disconnectReason: "token_expired",
      };
    }

    const payload = await this._buildSessionPayload(actorToken);
    if (!payload) {
      return {
        valid: false,
        error: "project_not_found",
        disconnectReason: "project_not_found",
      };
    }

    return { valid: true, ...payload };
  }

  /**
   * The shared body of validate and revalidate.
   *
   * Factored out deliberately. The original keeps two near-identical copies of
   * this, which is an invitation for the connect path and the refresh path to
   * drift into granting different access for the same actor.
   *
   * Returns null when the project is missing, which callers turn into their own
   * flavour of denial.
   */
  private async _buildSessionPayload(
    actorToken: ActorTokenEntity,
  ): Promise<ActorSessionPayload | null> {
    const project = await this._dataSource.manager.findOne(ProjectEntity, {
      where: { projectId: actorToken.projectId, deletedAt: IsNull() },
    });

    if (!project) {
      return null;
    }

    const scope = await this._resolveScope(actorToken);
    const { apps } = await this._buildAppAccess(
      actorToken,
      scope.scopeId,
      scope.scopeSlug,
    );
    const limits = this._resolveLimits(project);

    const persistentSession = PERSISTENT_SESSION_ACTOR_TYPES.includes(
      actorToken.actorType,
    );

    return {
      actorTokenId: actorToken.actorTokenId,
      organizationId: project.organizationId,
      projectId: actorToken.projectId,
      projectName: project.name,
      actorType: actorToken.actorType,
      scopeId: scope.scopeId,
      scopeSlug: scope.scopeSlug,
      scopeName: scope.scopeName,
      apps,
      maxConnections: limits.maxConnections,
      maxMessageSizeBytes: limits.maxMessageSizeBytes,
      // Only a persistent actor type has a session to expire. Everything else
      // gets 0, meaning the broker keeps no session across disconnects.
      sessionExpirySeconds: persistentSession ? limits.sessionExpirySeconds : 0,
      persistentSession,
    };
  }

  /**
   * An inactive scope resolves to no scope at all, which is the safe direction:
   * the actor then addresses the unscoped topic space, and its grants are
   * evaluated the same way.
   */
  private async _resolveScope(
    actorToken: ActorTokenEntity,
  ): Promise<ResolvedScope> {
    if (!actorToken.accessScopeId) {
      return {};
    }

    const scope = await this._dataSource.manager.findOne(AccessScopeEntity, {
      where: { accessScopeId: actorToken.accessScopeId, deletedAt: IsNull() },
    });

    if (!scope || !scope.isActive) {
      return {};
    }

    return {
      scopeId: scope.accessScopeId,
      scopeSlug: scope.slug,
      scopeName: scope.name,
    };
  }

  /**
   * Resolve the limits the broker should enforce.
   *
   * `limitsSyncedAt` is the presence marker: without it, null columns mean
   * "never configured" rather than "unlimited", and the configured defaults
   * apply.
   *
   * A stored zero is never authoritative. Upstream systems can derive zero from
   * a lapsed subscription, and honouring it would cap a live project at no
   * connections and no message size. Zero therefore falls back to the default.
   */
  private _resolveLimits(project: ProjectEntity): ResolvedLimits {
    if (!project.limitsSyncedAt) {
      return {
        maxConnections: this._config.defaultMaxConnections,
        maxMessageSizeBytes: this._config.defaultMaxMessageSizeBytes,
        sessionExpirySeconds: this._config.defaultSessionExpirySeconds,
      };
    }

    return {
      maxConnections:
        project.maxConnections === 0
          ? this._config.defaultMaxConnections
          : project.maxConnections,
      maxMessageSizeBytes:
        project.maxMessageSizeBytes === 0
          ? this._config.defaultMaxMessageSizeBytes
          : project.maxMessageSizeBytes,
      sessionExpirySeconds:
        project.sessionExpirySeconds && project.sessionExpirySeconds > 0
          ? project.sessionExpirySeconds
          : this._config.defaultSessionExpirySeconds,
    };
  }

  /* ── check-room-access ─────────────────────────────────────────────────── */

  /**
   * Single-room live check, for when the broker sees a subscribe to a pattern
   * that is not in its cached set. Typically a room created, or a grant added,
   * after the actor connected.
   *
   * A cheaper targeted version of the same resolution: actor, app by slug, room
   * by slug, then privacy and grant. Any unknown or denied case returns
   * `{ allow: false, allowedTopics: [] }`; the broker fails closed on it.
   */
  async checkRoomAccess(
    actorTokenId: string,
    pattern: string,
  ): Promise<CheckRoomAccessResult> {
    const deny: CheckRoomAccessResult = { allow: false, allowedTopics: [] };

    const actorToken = await this._dataSource.manager.findOne(
      ActorTokenEntity,
      {
        where: { actorTokenId, deletedAt: IsNull() },
      },
    );
    if (!actorToken || actorToken.status !== EActorTokenStatus.Active) {
      return deny;
    }
    if (actorToken.expiresAt && new Date(actorToken.expiresAt) < new Date()) {
      return deny;
    }

    const scope = await this._resolveScope(actorToken);

    // Parse {appSlug}/[{scopeSlug}/]{roomSlug}/{topic}. Slugs and topic names
    // cannot contain a slash, so segment count identifies the form.
    const parts = pattern.split("/");
    let appSlug: string;
    let roomSlug: string;
    if (parts.length === 4) {
      // A scoped pattern must name the actor's own scope. This is what stops a
      // scoped actor from addressing a sibling tenant's rooms.
      if (!scope.scopeSlug || parts[1] !== scope.scopeSlug) return deny;
      appSlug = parts[0];
      roomSlug = parts[2];
    } else if (parts.length === 3) {
      // Note: a scoped actor sending a 3-segment pattern is NOT refused here,
      // matching the hosted control plane exactly. It resolves, and the topics
      // returned carry the scope segment, so the pattern the actor actually
      // asked for is still not among them and the broker still refuses the
      // subscribe. The only effect is that its scoped topics get hydrated as a
      // side effect of a malformed request.
      //
      // Refusing outright would be tidier, but it changes an allow/deny outcome
      // for a whole class of input, and it is not known whether any client
      // constructs unscoped patterns for scoped actors. Left as-is on purpose;
      // change it deliberately, with a client audit, not as a cleanup.
      appSlug = parts[0];
      roomSlug = parts[1];
    } else {
      return deny;
    }

    const app = await this._dataSource.manager.findOne(PlatformAppEntity, {
      where: {
        slug: appSlug,
        projectId: actorToken.projectId,
        status: EAppStatus.Active,
        deletedAt: IsNull(),
      },
    });
    if (!app) return deny;

    let appPermission: EAccessPermission;
    let appAccessTopics: string[] | null;
    if (app.accessMode === EAppAccessMode.Open) {
      appPermission = EAccessPermission.PubSub;
      appAccessTopics = null;
    } else {
      const appAccess = await this._dataSource.manager.findOne(
        ActorAppAccessEntity,
        {
          where: {
            actorTokenId,
            appId: app.appId,
            isActive: true,
            deletedAt: IsNull(),
          },
        },
      );
      if (!appAccess) return deny;
      if (appAccess.expiresAt && new Date(appAccess.expiresAt) < new Date()) {
        return deny;
      }
      appPermission = appAccess.permission;
      appAccessTopics = appAccess.topics ?? null;
    }

    const room = await this._dataSource.manager.findOne(RoomEntity, {
      where: {
        slug: roomSlug,
        appId: app.appId,
        status: ERoomStatus.Active,
        deletedAt: IsNull(),
      },
    });
    if (!room) return deny;

    const roomAccessEntries = await this._dataSource.manager.find(
      RoomActorAccessEntity,
      { where: { roomId: room.roomId, deletedAt: IsNull() } },
    );

    let permission: EAccessPermission;
    let topics: string[] | null;
    if (roomAccessEntries.length === 0) {
      // Public room.
      permission = appPermission;
      topics = appAccessTopics ?? app.topics ?? null;
    } else {
      // Private. An actor-specific grant wins over a type-based one.
      const grant =
        roomAccessEntries.find(
          (ra) => ra.actorTokenId === actorTokenId && ra.isActive,
        ) ??
        roomAccessEntries.find(
          (ra) =>
            !ra.actorTokenId &&
            ra.actorType === actorToken.actorType &&
            ra.isActive,
        );

      if (!grant) return deny;
      if (grant.expiresAt && new Date(grant.expiresAt) < new Date()) {
        return deny;
      }
      permission = grant.permission;
      topics = grant.topics ?? app.topics ?? null;
    }

    const topicsToAdd = topics ?? [];
    if (topicsToAdd.length === 0) return deny;

    return {
      allow: true,
      appId: app.appId,
      allowedTopics: topicsToAdd.map((topicName) =>
        this._buildAllowedTopic({
          appSlug: app.slug,
          room,
          topicName,
          permission,
          scope,
        }),
      ),
    };
  }

  /* ── resolution ────────────────────────────────────────────────────────── */

  /**
   * The single place a topic address is constructed.
   *
   * Both entry points route through here so the two can never disagree about
   * what a topic is called. This IS the wire contract:
   *
   *   pattern  {appSlug}/{scopeSlug}/{roomSlug}/{topic}  when scoped
   *            {appSlug}/{roomSlug}/{topic}              otherwise
   *   topic    {scopeId}/{roomId}/{topic}                when scoped
   *            {roomId}/{topic}                          otherwise
   *
   * The internal form uses ids rather than slugs so renaming a room cannot
   * redirect live traffic, and so a scoped actor is structurally unable to
   * address another scope.
   */
  private _buildAllowedTopic(args: {
    appSlug: string;
    room: Pick<RoomEntity, "roomId" | "slug">;
    topicName: string;
    permission: EAccessPermission;
    scope: ResolvedScope;
  }): AllowedTopicDto {
    const { appSlug, room, topicName, permission, scope } = args;

    return {
      pattern: scope.scopeSlug
        ? `${appSlug}/${scope.scopeSlug}/${room.slug}/${topicName}`
        : `${appSlug}/${room.slug}/${topicName}`,
      topic: scope.scopeId
        ? `${scope.scopeId}/${room.roomId}/${topicName}`
        : `${room.roomId}/${topicName}`,
      permission,
      roomId: room.roomId,
      roomSlug: room.slug,
      scopeId: scope.scopeId,
      scopeSlug: scope.scopeSlug,
    };
  }

  /**
   * Build every app, room and topic this actor may reach.
   *
   * Batched deliberately: one query for grants, one for rooms across all apps,
   * one for room grants across all rooms, then everything else in memory. A
   * per-room query here would put an N+1 on the connect path.
   *
   * Columns this depends on from `app`: appId, slug, name, status, topics,
   * topicConfigs, hydrationWebhook, triggerWebhook. Anything large added to that
   * entity later lands on the connect path, so add it knowingly.
   */
  private async _buildAppAccess(
    actorToken: ActorTokenEntity,
    scopeId?: string,
    scopeSlug?: string,
  ): Promise<{ apps: ActorAppAccessDto[] }> {
    const scope: ResolvedScope = { scopeId, scopeSlug };

    const actorAppAccess = await this._dataSource.manager.find(
      ActorAppAccessEntity,
      {
        where: {
          actorTokenId: actorToken.actorTokenId,
          isActive: true,
          deletedAt: IsNull(),
        },
        relations: ["app"],
      },
    );

    const validAppAccess = actorAppAccess.filter((access) => {
      if (!access.app || access.app.status !== EAppStatus.Active) return false;
      if (access.expiresAt && new Date(access.expiresAt) < new Date()) {
        return false;
      }
      return true;
    });

    // Open apps need no stored grant, so synthesise one for each open app the
    // actor does not already hold an explicit grant for. These are in-memory
    // only and never persisted, which is why an open app has no rows in
    // actor_app_access.
    const explicitAppIds = new Set(
      validAppAccess.map((access) => access.app.appId),
    );

    const openApps = await this._dataSource.manager.find(PlatformAppEntity, {
      where: {
        projectId: actorToken.projectId,
        accessMode: EAppAccessMode.Open,
        status: EAppStatus.Active,
        deletedAt: IsNull(),
      },
    });

    for (const app of openApps) {
      if (!explicitAppIds.has(app.appId)) {
        const synthetic = new ActorAppAccessEntity();
        synthetic.actorTokenId = actorToken.actorTokenId;
        synthetic.appId = app.appId;
        synthetic.permission = EAccessPermission.PubSub;
        synthetic.topics = null; // inherit the app's topic list
        synthetic.isActive = true;
        synthetic.expiresAt = null;
        synthetic.app = app;
        validAppAccess.push(synthetic);
      }
    }

    if (validAppAccess.length === 0) {
      return { apps: [] };
    }

    const appIds = validAppAccess.map((access) => access.app.appId);

    const allRooms = await this._dataSource.manager.find(RoomEntity, {
      where: {
        appId: In(appIds),
        status: ERoomStatus.Active,
        deletedAt: IsNull(),
      },
    });

    const roomIds = allRooms.map((r) => r.roomId);

    const allRoomActorAccess = roomIds.length
      ? await this._dataSource.manager.find(RoomActorAccessEntity, {
          where: { roomId: In(roomIds), deletedAt: IsNull() },
        })
      : [];

    // Two maps: every grant per room, which decides whether the room is private
    // at all, and this actor's effective grant per room.
    const roomAccessByRoomId = new Map<string, RoomActorAccessEntity[]>();
    const actorAccessByRoomId = new Map<string, RoomActorAccessEntity>();

    for (const ra of allRoomActorAccess) {
      const forRoom = roomAccessByRoomId.get(ra.roomId);
      if (forRoom) {
        forRoom.push(ra);
      } else {
        roomAccessByRoomId.set(ra.roomId, [ra]);
      }
    }

    // Actor-specific grants first, so a later type grant cannot displace one.
    for (const ra of allRoomActorAccess) {
      if (ra.actorTokenId === actorToken.actorTokenId && ra.isActive) {
        actorAccessByRoomId.set(ra.roomId, ra);
      }
    }
    for (const ra of allRoomActorAccess) {
      if (
        !ra.actorTokenId &&
        ra.actorType === actorToken.actorType &&
        ra.isActive &&
        !actorAccessByRoomId.has(ra.roomId)
      ) {
        actorAccessByRoomId.set(ra.roomId, ra);
      }
    }

    const roomsByAppId = new Map<string, RoomEntity[]>();
    for (const room of allRooms) {
      const forApp = roomsByAppId.get(room.appId);
      if (forApp) {
        forApp.push(room);
      } else {
        roomsByAppId.set(room.appId, [room]);
      }
    }

    interface AppBuild {
      appId: string;
      appName: string;
      appSlug: string;
      hydrationWebhook: IWebhookConfig | null;
      triggerWebhook: IWebhookConfig | null;
      topicWebhooks: TopicWebhooksMap;
      allowedTopics: AllowedTopicDto[];
      allowedLobbies: { lobbyId: string; lobbySlug: string }[];
      accessibleRoomIds: string[];
    }

    const appsMap = new Map<string, AppBuild>();

    for (const access of validAppAccess) {
      const app = access.app;

      const build: AppBuild = {
        appId: app.appId,
        appName: app.name,
        appSlug: app.slug,
        hydrationWebhook: app.hydrationWebhook ?? null,
        triggerWebhook: app.triggerWebhook ?? null,
        topicWebhooks: this._buildTopicWebhooksMap(app.topicConfigs),
        allowedTopics: [],
        allowedLobbies: [],
        accessibleRoomIds: [],
      };
      appsMap.set(app.appId, build);

      for (const room of roomsByAppId.get(app.appId) ?? []) {
        const roomAccessEntries = roomAccessByRoomId.get(room.roomId);
        const isPrivate = !!roomAccessEntries?.length;

        let permission: EAccessPermission;
        let topics: string[] | null;

        if (!isPrivate) {
          permission = access.permission;
          topics = access.topics ?? app.topics ?? null;
        } else {
          const grant = actorAccessByRoomId.get(room.roomId);
          if (!grant) continue;
          if (grant.expiresAt && new Date(grant.expiresAt) < new Date()) {
            continue;
          }
          permission = grant.permission;
          topics = grant.topics ?? app.topics ?? null;
        }

        // Recorded before the topic check, because lobby visibility follows
        // room access rather than whether the room happens to define topics.
        build.accessibleRoomIds.push(room.roomId);

        for (const topicName of topics ?? []) {
          build.allowedTopics.push(
            this._buildAllowedTopic({
              appSlug: app.slug,
              room,
              topicName,
              permission,
              scope,
            }),
          );
        }
      }
    }

    await this._attachLobbies(appsMap);

    const subscriptionsByApp = await this._getActiveSubscriptionsGroupedByApp(
      actorToken.actorTokenId,
      appsMap,
    );

    const apps: ActorAppAccessDto[] = [];
    for (const [appId, build] of appsMap) {
      apps.push({
        appId: build.appId,
        appName: build.appName,
        appSlug: build.appSlug,
        allowedTopics: build.allowedTopics,
        allowedLobbies: build.allowedLobbies,
        activeSubscriptions: subscriptionsByApp.get(appId) ?? [],
        hydrationWebhook: build.hydrationWebhook,
        triggerWebhook: build.triggerWebhook,
        topicWebhooks: build.topicWebhooks,
      });
    }

    return { apps };
  }

  /**
   * A lobby is visible when the actor can reach at least one room in it.
   */
  private async _attachLobbies(
    appsMap: Map<
      string,
      {
        accessibleRoomIds: string[];
        allowedLobbies: { lobbyId: string; lobbySlug: string }[];
      }
    >,
  ): Promise<void> {
    const allAccessibleRoomIds = [...appsMap.values()].flatMap(
      (a) => a.accessibleRoomIds,
    );
    if (allAccessibleRoomIds.length === 0) return;

    const lobbyRoomEntries = await this._dataSource.manager.find(
      LobbyRoomEntity,
      { where: { roomId: In(allAccessibleRoomIds), deletedAt: IsNull() } },
    );
    if (lobbyRoomEntries.length === 0) return;

    const lobbyIds = [...new Set(lobbyRoomEntries.map((lr) => lr.lobbyId))];

    const lobbies = await this._dataSource.manager.find(LobbyEntity, {
      where: { lobbyId: In(lobbyIds), deletedAt: IsNull() },
    });

    const lobbyById = new Map(lobbies.map((l) => [l.lobbyId, l]));

    // Which lobbies to surface per app, deduplicated: several accessible rooms
    // may belong to the same lobby.
    const lobbyIdsPerApp = new Map<string, Set<string>>();
    for (const lr of lobbyRoomEntries) {
      const lobby = lobbyById.get(lr.lobbyId);
      if (!lobby) continue;
      const set = lobbyIdsPerApp.get(lobby.appId);
      if (set) {
        set.add(lr.lobbyId);
      } else {
        lobbyIdsPerApp.set(lobby.appId, new Set([lr.lobbyId]));
      }
    }

    for (const [appId, build] of appsMap) {
      for (const lobbyId of lobbyIdsPerApp.get(appId) ?? []) {
        const lobby = lobbyById.get(lobbyId);
        if (lobby) {
          build.allowedLobbies.push({
            lobbyId: lobby.lobbyId,
            lobbySlug: lobby.slug,
          });
        }
      }
    }
  }

  /**
   * Per-topic webhooks, keyed by topic name.
   *
   * Only the `webhooks` subtree of topicConfigs is read. Any other subtree
   * belongs to something else and is left alone.
   */
  private _buildTopicWebhooksMap(
    topicConfigs: TopicConfigs | null | undefined,
  ): TopicWebhooksMap {
    if (!topicConfigs) return {};

    const result: TopicWebhooksMap = {};
    for (const [topicName, config] of Object.entries(topicConfigs)) {
      const onPublish = config?.webhooks?.onPublish;
      const onSubscribe = config?.webhooks?.onSubscribe;
      if (!onPublish && !onSubscribe) continue;

      result[topicName] = {};
      if (onPublish) result[topicName].on_publish = onPublish;
      if (onSubscribe) result[topicName].on_subscribe = onSubscribe;
    }
    return result;
  }

  /* ── session state ─────────────────────────────────────────────────────── */

  /**
   * Live subscriptions, grouped by app, so a reconnecting session can be
   * restored.
   *
   * A recorded subscription is only returned if its pattern is still in the
   * actor's resolved set. Access revoked while the session was live therefore
   * drops out here rather than being handed back as though still granted.
   */
  private async _getActiveSubscriptionsGroupedByApp(
    actorTokenId: string,
    appsMap: Map<string, { appId: string; allowedTopics: AllowedTopicDto[] }>,
  ): Promise<Map<string, ActiveSubscriptionDto[]>> {
    const result = new Map<string, ActiveSubscriptionDto[]>();

    const state = await this._dataSource.manager.findOne(
      ActorTokenStateEntity,
      {
        where: { actorTokenId, deletedAt: IsNull() },
      },
    );

    const recorded = state?.connectionState?.topics;
    if (!recorded?.length) {
      return result;
    }

    const patternLookup = new Map<string, { appId: string; topic: string }>();
    for (const build of appsMap.values()) {
      for (const allowed of build.allowedTopics) {
        patternLookup.set(allowed.pattern, {
          appId: build.appId,
          topic: allowed.topic,
        });
      }
    }

    for (const sub of recorded) {
      const lookup = patternLookup.get(sub.name);
      if (!lookup) continue;

      const forApp = result.get(lookup.appId);
      const entry: ActiveSubscriptionDto = {
        pattern: sub.name,
        topic: lookup.topic,
        loadBalance: sub.loadBalance,
        loadBalanceGroup: sub.loadBalanceGroup,
        filters: sub.filters,
      };

      if (forApp) {
        forApp.push(entry);
      } else {
        result.set(lookup.appId, [entry]);
      }
    }

    return result;
  }

  /**
   * Record a subscribe or unsubscribe.
   *
   * The state row is locked for update because subscribe and unsubscribe race
   * against each other on a busy connection, and a read-modify-write without the
   * lock loses whichever update commits first.
   *
   * Takes an EntityManager: the caller owns the transaction.
   */
  async updateSubscription(
    actorTokenId: string,
    topic: string,
    action: "subscribe" | "unsubscribe",
    manager: EntityManager,
    loadBalance?: boolean,
    loadBalanceGroup?: string,
    filters?: string[],
  ): Promise<void> {
    let state = await manager
      .createQueryBuilder(ActorTokenStateEntity, "state")
      .where("state.actor_token_id = :actorTokenId", { actorTokenId })
      .andWhere("state.deleted_at IS NULL")
      .setLock("pessimistic_write")
      .getOne();

    if (!state) {
      state = new ActorTokenStateEntity();
      state.actorTokenId = actorTokenId;
      state.connectionState = { topics: [] };
    }

    if (!state.connectionState) {
      state.connectionState = { topics: [] };
    }
    if (!state.connectionState.topics) {
      state.connectionState.topics = [];
    }

    if (action === "subscribe") {
      const subscription = {
        name: topic,
        loadBalance: loadBalance ?? false,
        loadBalanceGroup: loadBalance ? loadBalanceGroup : undefined,
        ...(filters?.length ? { filters } : {}),
      };

      const existingIndex = state.connectionState.topics.findIndex(
        (t) => t.name === topic,
      );
      if (existingIndex === -1) {
        state.connectionState.topics.push(subscription);
      } else {
        state.connectionState.topics[existingIndex] = subscription;
      }
    } else {
      state.connectionState.topics = state.connectionState.topics.filter(
        (t) => t.name !== topic,
      );
    }

    state.lastActivityAt = new Date();

    await manager.save(ActorTokenStateEntity, state);
  }

  /** Drop all recorded subscriptions, on disconnect. */
  async clearSubscriptions(actorTokenId: string): Promise<void> {
    const state = await this._dataSource.manager.findOne(
      ActorTokenStateEntity,
      {
        where: { actorTokenId, deletedAt: IsNull() },
      },
    );

    if (state) {
      state.connectionState = { topics: [] };
      state.lastActivityAt = new Date();
      await this._dataSource.manager.save(ActorTokenStateEntity, state);
    }
  }

  /* ── misc ──────────────────────────────────────────────────────────────── */

  /**
   * The tenant an actor belongs to. Returns null when the actor or its project
   * is missing, so callers fail closed.
   */
  async getActorScope(
    actorTokenId: string,
  ): Promise<{ organizationId: string | null; projectId: string } | null> {
    const actorToken = await this._dataSource.manager.findOne(
      ActorTokenEntity,
      {
        where: { actorTokenId, deletedAt: IsNull() },
      },
    );
    if (!actorToken) return null;

    const project = await this._dataSource.manager.findOne(ProjectEntity, {
      where: { projectId: actorToken.projectId, deletedAt: IsNull() },
    });
    if (!project) return null;

    return {
      organizationId: project.organizationId,
      projectId: actorToken.projectId,
    };
  }

  /** Exposed for tests: the actor types that hold a session across disconnects. */
  static isPersistentActorType(actorType: EActorType): boolean {
    return PERSISTENT_SESSION_ACTOR_TYPES.includes(actorType);
  }
}
