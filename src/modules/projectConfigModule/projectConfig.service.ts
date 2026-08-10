import { Injectable, Logger } from "@nestjs/common";
import { EntityManager, IsNull } from "typeorm";
import { ActorAppAccessEntity } from "../actorTokenModule/actorAppAccess.entity";
import { ActorTokenEntity } from "../actorTokenModule/actorToken.entity";
import { EActorTokenPrefix } from "../actorTokenModule/enum/EActorTokenPrefix.enum";
import { EActorTokenStatus } from "../actorTokenModule/enum/EActorTokenStatus.enum";
import { generateCredential } from "../../common/utils/secretHash";
import { AccessScopeEntity } from "../accessScopeModule/accessScope.entity";
import { LobbyEntity } from "../lobbyModule/lobby.entity";
import { LobbyRoomEntity } from "../lobbyModule/lobbyRoom.entity";
import { EAppAccessMode } from "../platformAppModule/enum/EAppAccessMode.enum";
import { EAppStatus } from "../platformAppModule/enum/EAppStatus.enum";
import {
  PlatformAppEntity,
  TopicConfigs,
} from "../platformAppModule/platformApp.entity";
import { ProjectEntity } from "../projectModule/project.entity";
import { ERoomStatus } from "../roomModule/enum/ERoomStatus.enum";
import { RoomEntity } from "../roomModule/room.entity";
import { RoomActorAccessEntity } from "../roomModule/roomActorAccess.entity";
import { SigningKeyEntity } from "../signingKeyModule/signingKey.entity";
import { SigningKeyFacade } from "../signingKeyModule/signingKey.facade";
import { badRequestException, notFoundException } from "../../utils/exceptions";
import {
  ActorDocDto,
  AppDocDto,
  ImportedCredentials,
  LobbyDocDto,
  ProjectConfigDocDto,
  RoomDocDto,
} from "./dto/projectConfig.dto";

const DOC_VERSION = 1;

/**
 * Whole-project configuration as one document.
 *
 * This is what makes a deployment portable: a project can be lifted out of one
 * core and dropped into another with no database access and no downtime. It is
 * also the seeding mechanism, so a fresh stack becomes useful with one request.
 */
@Injectable()
export class ProjectConfigService {
  private readonly _logger = new Logger(ProjectConfigService.name);

  constructor(private readonly _signingKeyFacade: SigningKeyFacade) {}

  /* ── import ────────────────────────────────────────────────────────────── */

  /**
   * Create a project and everything under it from a document.
   *
   * Always creates: this never merges into an existing project. Partial merges
   * across an authorization model are a good way to end up granting something
   * nobody intended, so replacing is left to delete-then-import.
   */
  async importProject(
    doc: ProjectConfigDocDto,
    manager: EntityManager,
  ): Promise<ImportedCredentials> {
    if (doc.version !== DOC_VERSION) {
      throw badRequestException(this._logger, {
        errorMsgUser: `Unsupported document version. Expected ${DOC_VERSION}.`,
        errorMsgSystem: `Got version ${doc.version}`,
      });
    }

    this._assertUniqueSlugs(doc);

    const project = await manager.save(
      ProjectEntity,
      Object.assign(new ProjectEntity(), {
        name: doc.project.name,
        description: doc.project.description ?? null,
        organizationId: doc.project.organizationId ?? null,
        maxConnections: doc.project.limits?.maxConnections ?? null,
        maxMessageSizeBytes: doc.project.limits?.maxMessageSizeBytes ?? null,
        sessionExpirySeconds: doc.project.limits?.sessionExpirySeconds ?? null,
        // Only mark limits as configured when the document said something about
        // them. Otherwise the configured defaults apply, which is what a
        // self-hosted deployment wants.
        limitsSyncedAt: doc.project.limits ? new Date() : null,
      }),
    );

    const scopeIdBySlug = new Map<string, string>();
    for (const scope of doc.accessScopes ?? []) {
      const saved = await manager.save(
        AccessScopeEntity,
        Object.assign(new AccessScopeEntity(), {
          projectId: project.projectId,
          slug: scope.slug,
          name: scope.name,
          description: scope.description ?? null,
          metadata: scope.metadata ?? null,
          isActive: scope.isActive ?? true,
        }),
      );
      scopeIdBySlug.set(scope.slug, saved.accessScopeId);
    }

    const appIdBySlug = new Map<string, string>();
    const roomIdByAppAndSlug = new Map<string, string>();

    for (const app of doc.apps ?? []) {
      const savedApp = await manager.save(
        PlatformAppEntity,
        Object.assign(new PlatformAppEntity(), {
          projectId: project.projectId,
          slug: app.slug,
          name: app.name,
          description: app.description ?? null,
          status: app.status ?? EAppStatus.Active,
          accessMode: app.accessMode ?? EAppAccessMode.Open,
          topics: app.topics,
          topicConfigs: (app.topicConfigs as TopicConfigs | null) ?? null,
          hydrationWebhook: app.hydrationWebhook ?? null,
          triggerWebhook: app.triggerWebhook ?? null,
        }),
      );
      appIdBySlug.set(app.slug, savedApp.appId);

      for (const room of app.rooms ?? []) {
        const savedRoom = await manager.save(
          RoomEntity,
          Object.assign(new RoomEntity(), {
            appId: savedApp.appId,
            slug: room.slug,
            name: room.name,
            description: room.description ?? null,
            status: room.status ?? ERoomStatus.Active,
            topics: room.topics ?? null,
            metadata: room.metadata ?? null,
          }),
        );
        roomIdByAppAndSlug.set(`${app.slug}/${room.slug}`, savedRoom.roomId);

        for (const grant of room.typeGrants ?? []) {
          await manager.save(
            RoomActorAccessEntity,
            Object.assign(new RoomActorAccessEntity(), {
              roomId: savedRoom.roomId,
              actorTokenId: null,
              actorType: grant.actorType,
              permission: grant.permission,
              topics: grant.topics ?? null,
              isActive: grant.isActive ?? true,
              expiresAt: null,
            }),
          );
        }
      }

      for (const lobby of app.lobbies ?? []) {
        const savedLobby = await manager.save(
          LobbyEntity,
          Object.assign(new LobbyEntity(), {
            appId: savedApp.appId,
            slug: lobby.slug,
            name: lobby.name,
            description: lobby.description ?? null,
            metadata: lobby.metadata ?? null,
          }),
        );

        for (const roomSlug of lobby.rooms) {
          const roomId = roomIdByAppAndSlug.get(`${app.slug}/${roomSlug}`);
          if (!roomId) {
            throw badRequestException(this._logger, {
              errorMsgUser: `Lobby "${lobby.slug}" references unknown room "${roomSlug}"`,
            });
          }
          await manager.save(
            LobbyRoomEntity,
            Object.assign(new LobbyRoomEntity(), {
              lobbyId: savedLobby.lobbyId,
              roomId,
            }),
          );
        }
      }
    }

    const credentials: ImportedCredentials = {
      projectId: project.projectId,
      actors: [],
      signingKeys: [],
    };

    for (const actor of doc.actors ?? []) {
      let accessScopeId: string | null = null;
      if (actor.scopeSlug) {
        accessScopeId = scopeIdBySlug.get(actor.scopeSlug) ?? null;
        if (!accessScopeId) {
          throw badRequestException(this._logger, {
            errorMsgUser: `Actor "${actor.ref}" references unknown scope "${actor.scopeSlug}"`,
          });
        }
      }

      const credential = generateCredential(EActorTokenPrefix.Live);
      const savedActor = await manager.save(
        ActorTokenEntity,
        Object.assign(new ActorTokenEntity(), {
          projectId: project.projectId,
          keyId: credential.keyId,
          secretHash: credential.secretHash,
          name: actor.name,
          actorType: actor.actorType,
          status: actor.status ?? EActorTokenStatus.Active,
          expiresAt: actor.expiresAt ? new Date(actor.expiresAt) : null,
          metadata: actor.metadata ?? null,
          accessScopeId,
        }),
      );

      credentials.actors.push({
        ref: actor.ref,
        keyId: credential.keyId,
        accessToken: credential.credential,
      });

      for (const grant of actor.appAccess ?? []) {
        const appId = appIdBySlug.get(grant.appSlug);
        if (!appId) {
          throw badRequestException(this._logger, {
            errorMsgUser: `Actor "${actor.ref}" references unknown app "${grant.appSlug}"`,
          });
        }
        await manager.save(
          ActorAppAccessEntity,
          Object.assign(new ActorAppAccessEntity(), {
            actorTokenId: savedActor.actorTokenId,
            appId,
            permission: grant.permission,
            topics: grant.topics ?? null,
            isActive: grant.isActive ?? true,
            expiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
          }),
        );
      }

      for (const grant of actor.roomAccess ?? []) {
        const roomId = roomIdByAppAndSlug.get(
          `${grant.appSlug}/${grant.roomSlug}`,
        );
        if (!roomId) {
          throw badRequestException(this._logger, {
            errorMsgUser: `Actor "${actor.ref}" references unknown room "${grant.appSlug}/${grant.roomSlug}"`,
          });
        }
        await manager.save(
          RoomActorAccessEntity,
          Object.assign(new RoomActorAccessEntity(), {
            roomId,
            actorTokenId: savedActor.actorTokenId,
            actorType: null,
            permission: grant.permission,
            topics: grant.topics ?? null,
            isActive: grant.isActive ?? true,
            expiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
            role: grant.role ?? null,
          }),
        );
      }
    }

    for (const key of doc.signingKeys ?? []) {
      const generated = this._signingKeyFacade.generateSigningKey();
      await manager.save(
        SigningKeyEntity,
        Object.assign(new SigningKeyEntity(), {
          projectId: project.projectId,
          keyId: generated.keyId,
          secretEncrypted: this._signingKeyFacade.encryptForStorage(
            generated.secret,
          ),
          name: key.name,
        }),
      );
      credentials.signingKeys.push({
        ref: key.ref,
        keyId: generated.keyId,
        signingKey: generated.signingKey,
      });
    }

    this._logger.log(
      `Imported project ${project.projectId}: ` +
        `${doc.apps?.length ?? 0} apps, ${credentials.actors.length} actors`,
    );

    return credentials;
  }

  /**
   * Slug collisions are rejected before anything is written. The database would
   * catch most of these, but the error it produces names an index rather than the
   * duplicate, which is a poor experience for someone hand-writing a document.
   */
  private _assertUniqueSlugs(doc: ProjectConfigDocDto): void {
    const check = (label: string, values: string[]) => {
      const seen = new Set<string>();
      for (const value of values) {
        if (seen.has(value)) {
          throw badRequestException(this._logger, {
            errorMsgUser: `Duplicate ${label} "${value}"`,
          });
        }
        seen.add(value);
      }
    };

    check(
      "access scope slug",
      (doc.accessScopes ?? []).map((s) => s.slug),
    );
    check(
      "app slug",
      (doc.apps ?? []).map((a) => a.slug),
    );
    check(
      "actor ref",
      (doc.actors ?? []).map((a) => a.ref),
    );
    check(
      "signing key ref",
      (doc.signingKeys ?? []).map((k) => k.ref),
    );

    for (const app of doc.apps ?? []) {
      check(
        `room slug in app "${app.slug}"`,
        (app.rooms ?? []).map((r) => r.slug),
      );
      check(
        `lobby slug in app "${app.slug}"`,
        (app.lobbies ?? []).map((l) => l.slug),
      );
    }
  }

  /* ── export ────────────────────────────────────────────────────────────── */

  /**
   * Serialise a project to a document.
   *
   * Contains no secrets, so the result is safe to commit to version control. An
   * actor's `ref` is its public key id, which is a stable handle but not a
   * credential: re-importing mints new secrets.
   */
  async exportProject(
    projectId: string,
    manager: EntityManager,
  ): Promise<ProjectConfigDocDto> {
    const project = await manager.findOne(ProjectEntity, {
      where: { projectId, deletedAt: IsNull() },
    });
    if (!project) {
      throw notFoundException(this._logger, {
        errorMsgUser: "Project not found",
      });
    }

    const scopes = await manager.find(AccessScopeEntity, {
      where: { projectId, deletedAt: IsNull() },
      order: { slug: "ASC" },
    });
    const scopeSlugById = new Map(scopes.map((s) => [s.accessScopeId, s.slug]));

    const apps = await manager.find(PlatformAppEntity, {
      where: { projectId, deletedAt: IsNull() },
      order: { slug: "ASC" },
    });

    const appSlugById = new Map(apps.map((a) => [a.appId, a.slug]));
    const roomRefById = new Map<
      string,
      { appSlug: string; roomSlug: string }
    >();

    const appDocs: AppDocDto[] = [];
    for (const app of apps) {
      const rooms = await manager.find(RoomEntity, {
        where: { appId: app.appId, deletedAt: IsNull() },
        order: { slug: "ASC" },
      });

      const roomDocs: RoomDocDto[] = [];
      for (const room of rooms) {
        roomRefById.set(room.roomId, {
          appSlug: app.slug,
          roomSlug: room.slug,
        });

        const grants = await manager.find(RoomActorAccessEntity, {
          where: {
            roomId: room.roomId,
            actorTokenId: IsNull(),
            deletedAt: IsNull(),
          },
        });

        roomDocs.push({
          slug: room.slug,
          name: room.name,
          description: room.description ?? null,
          status: room.status,
          topics: room.topics ?? null,
          metadata: room.metadata ?? null,
          typeGrants: grants.map((g) => ({
            actorType: g.actorType!,
            permission: g.permission,
            topics: g.topics ?? null,
            isActive: g.isActive,
          })),
        });
      }

      const lobbies = await manager.find(LobbyEntity, {
        where: { appId: app.appId, deletedAt: IsNull() },
        order: { slug: "ASC" },
      });

      const lobbyDocs: LobbyDocDto[] = [];
      for (const lobby of lobbies) {
        const links = await manager.find(LobbyRoomEntity, {
          where: { lobbyId: lobby.lobbyId, deletedAt: IsNull() },
        });
        lobbyDocs.push({
          slug: lobby.slug,
          name: lobby.name,
          description: lobby.description ?? null,
          metadata: lobby.metadata ?? null,
          rooms: links
            .map((l) => roomRefById.get(l.roomId)?.roomSlug)
            .filter((s): s is string => !!s)
            .sort(),
        });
      }

      appDocs.push({
        slug: app.slug,
        name: app.name,
        description: app.description ?? null,
        status: app.status,
        accessMode: app.accessMode,
        topics: app.topics ?? [],
        topicConfigs: app.topicConfigs ?? null,
        hydrationWebhook: app.hydrationWebhook ?? null,
        triggerWebhook: app.triggerWebhook ?? null,
        rooms: roomDocs,
        lobbies: lobbyDocs,
      });
    }

    const actors = await manager.find(ActorTokenEntity, {
      where: { projectId, deletedAt: IsNull() },
      order: { keyId: "ASC" },
    });

    const actorDocs: ActorDocDto[] = [];
    for (const actor of actors) {
      const appGrants = await manager.find(ActorAppAccessEntity, {
        where: { actorTokenId: actor.actorTokenId, deletedAt: IsNull() },
      });
      const roomGrants = await manager.find(RoomActorAccessEntity, {
        where: { actorTokenId: actor.actorTokenId, deletedAt: IsNull() },
      });

      actorDocs.push({
        // The public key id, not a secret. Stable enough to correlate against a
        // previous export; re-importing still mints a new credential.
        ref: actor.keyId,
        name: actor.name,
        actorType: actor.actorType,
        status: actor.status,
        expiresAt: actor.expiresAt ? actor.expiresAt.toISOString() : null,
        metadata: actor.metadata ?? null,
        scopeSlug: actor.accessScopeId
          ? (scopeSlugById.get(actor.accessScopeId) ?? null)
          : null,
        appAccess: appGrants
          .map((g) => ({
            appSlug: appSlugById.get(g.appId)!,
            permission: g.permission,
            topics: g.topics ?? null,
            isActive: g.isActive,
            expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
          }))
          .filter((g) => !!g.appSlug),
        roomAccess: roomGrants
          .map((g) => {
            const ref = roomRefById.get(g.roomId);
            return ref
              ? {
                  appSlug: ref.appSlug,
                  roomSlug: ref.roomSlug,
                  permission: g.permission,
                  topics: g.topics ?? null,
                  isActive: g.isActive,
                  expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
                  role: g.role ?? null,
                }
              : null;
          })
          .filter((g): g is NonNullable<typeof g> => g !== null),
      });
    }

    const signingKeys = await manager.find(SigningKeyEntity, {
      where: { projectId, deletedAt: IsNull() },
      order: { keyId: "ASC" },
    });

    return {
      version: DOC_VERSION,
      project: {
        name: project.name,
        description: project.description ?? null,
        organizationId: project.organizationId,
        ...(project.limitsSyncedAt
          ? {
              limits: {
                maxConnections: project.maxConnections,
                maxMessageSizeBytes: project.maxMessageSizeBytes,
                sessionExpirySeconds: project.sessionExpirySeconds,
              },
            }
          : {}),
      },
      accessScopes: scopes.map((s) => ({
        slug: s.slug,
        name: s.name,
        description: s.description,
        metadata: s.metadata,
        isActive: s.isActive,
      })),
      apps: appDocs,
      actors: actorDocs,
      // Names only. The secret is encrypted with a deployment-specific key and
      // cannot travel, so an import mints replacements.
      signingKeys: signingKeys.map((k) => ({ ref: k.keyId, name: k.name })),
    };
  }
}
