import { DataSource } from "typeorm";
import * as jwt from "jsonwebtoken";
import { EAccessPermission } from "../src/modules/actorTokenModule/enum/EAccessPermission.enum";
import { EActorTokenStatus } from "../src/modules/actorTokenModule/enum/EActorTokenStatus.enum";
import { EActorType } from "../src/modules/actorTokenModule/enum/EActorType.enum";
import { AuthzService } from "../src/modules/authzModule/authz.service";
import {
  toBrokerCheckRoomAccessResponse,
  toBrokerValidateResponse,
} from "../src/modules/authzModule/adapters/brokerResponse.adapter";
import { ValidateActorSuccessResponseDto } from "../src/modules/authzModule/dto/authz.dto";
import { EAppAccessMode } from "../src/modules/platformAppModule/enum/EAppAccessMode.enum";
import { EAppStatus } from "../src/modules/platformAppModule/enum/EAppStatus.enum";
import { ProjectEntity } from "../src/modules/projectModule/project.entity";
import { SigningKeyRepository } from "../src/modules/signingKeyModule/signingKey.repository";
import { SigningKeyService } from "../src/modules/signingKeyModule/signingKey.service";
import {
  buildAuthzService,
  buildConfig,
  buildDataSource,
  cleanupProject,
  grantApp,
  grantRoom,
  makeActor,
  makeApp,
  makeLobby,
  makeProject,
  makeRoom,
  makeScope,
  makeSigningKey,
  webhookTopicConfig,
} from "./fixtures";

/** Narrow a validate result to the success shape, failing the test if denied. */
function expectAllowed(
  result: Awaited<ReturnType<AuthzService["validateActor"]>>,
): ValidateActorSuccessResponseDto {
  if (!result.valid) {
    throw new Error(`expected allow, got deny: ${result.error}`);
  }
  return result;
}

describe("Authorization resolution", () => {
  let ds: DataSource;
  let service: AuthzService;
  let projectIds: string[];

  beforeAll(async () => {
    ds = buildDataSource();
    await ds.initialize();
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(() => {
    service = buildAuthzService(ds);
    projectIds = [];
  });

  afterEach(async () => {
    for (const projectId of projectIds) {
      await cleanupProject(ds, projectId);
    }
  });

  async function scenario() {
    const project = await makeProject(ds);
    projectIds.push(project.projectId);
    return project;
  }

  /* ── app level ─────────────────────────────────────────────────────────── */

  describe("app access", () => {
    it("grants an open app with no stored grant", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );

      expect(result.apps).toHaveLength(1);
      expect(result.apps[0].appSlug).toBe("test-app");
      expect(result.apps[0].allowedTopics).toHaveLength(1);
      expect(result.apps[0].allowedTopics[0].permission).toBe(
        EAccessPermission.PubSub,
      );
    });

    it("denies a restricted app with no grant", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, {
        accessMode: EAppAccessMode.Restricted,
      });
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps).toHaveLength(0);
    });

    it("grants a restricted app with an explicit grant, honouring its permission", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, {
        accessMode: EAppAccessMode.Restricted,
      });
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);
      await grantApp(ds, actor.entity.actorTokenId, app.appId, {
        permission: EAccessPermission.Subscribe,
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps).toHaveLength(1);
      expect(result.apps[0].allowedTopics[0].permission).toBe(
        EAccessPermission.Subscribe,
      );
    });

    it("ignores an expired app grant", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, {
        accessMode: EAppAccessMode.Restricted,
      });
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);
      await grantApp(ds, actor.entity.actorTokenId, app.appId, {
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps).toHaveLength(0);
    });

    it("ignores an inactive app grant", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, {
        accessMode: EAppAccessMode.Restricted,
      });
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);
      await grantApp(ds, actor.entity.actorTokenId, app.appId, {
        isActive: false,
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps).toHaveLength(0);
    });

    it("excludes a disabled app even from an open project", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, {
        status: EAppStatus.Disabled,
      });
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps).toHaveLength(0);
    });

    it("does not leak apps from another project", async () => {
      const mine = await scenario();
      const theirs = await scenario();
      const myApp = await makeApp(ds, mine.projectId, { slug: "mine" });
      await makeRoom(ds, myApp.appId);
      const theirApp = await makeApp(ds, theirs.projectId, { slug: "theirs" });
      await makeRoom(ds, theirApp.appId);
      const actor = await makeActor(ds, mine.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps.map((a) => a.appSlug)).toEqual(["mine"]);
    });
  });

  /* ── topic inheritance ─────────────────────────────────────────────────── */

  describe("topic inheritance", () => {
    it("inherits the app topic list when the grant has none", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, {
        accessMode: EAppAccessMode.Restricted,
        topics: ["messages", "typing", "presence"],
      });
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);
      await grantApp(ds, actor.entity.actorTokenId, app.appId, {
        topics: null,
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(
        result.apps[0].allowedTopics.map((t) => t.pattern.split("/").pop()),
      ).toEqual(["messages", "typing", "presence"]);
    });

    it("narrows to the grant topic list when present", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, {
        accessMode: EAppAccessMode.Restricted,
        topics: ["messages", "typing", "presence"],
      });
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);
      await grantApp(ds, actor.entity.actorTokenId, app.appId, {
        topics: ["messages"],
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].allowedTopics).toHaveLength(1);
    });

    it("never reads the room topic list", async () => {
      // The room's own topics column is inert for authorization. Setting it must
      // not widen access, which is the single most surprising rule in the model.
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, {
        topics: ["messages"],
      });
      await makeRoom(ds, app.appId, { topics: ["secret", "admin"] });
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      const names = result.apps[0].allowedTopics.map((t) =>
        t.pattern.split("/").pop(),
      );
      expect(names).toEqual(["messages"]);
      expect(names).not.toContain("secret");
    });

    it("yields no topics when the app defines none", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { topics: [] });
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].allowedTopics).toHaveLength(0);
    });
  });

  /* ── room level ────────────────────────────────────────────────────────── */

  describe("room access", () => {
    it("treats a room with no grants as public", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      await makeRoom(ds, app.appId, { slug: "public-room" });
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].allowedTopics[0].roomSlug).toBe("public-room");
    });

    it("makes a room private as soon as one grant exists, excluding everyone else", async () => {
      // Worth stating plainly: adding the first grant to a room revokes access
      // for every actor not named by a grant.
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      const room = await makeRoom(ds, app.appId);
      const insider = await makeActor(ds, project.projectId);
      const outsider = await makeActor(ds, project.projectId);
      await grantRoom(ds, room.roomId, {
        actorTokenId: insider.entity.actorTokenId,
      });

      const allowed = expectAllowed(
        await service.validateActor(insider.accessToken),
      );
      expect(allowed.apps[0].allowedTopics).toHaveLength(1);

      const denied = expectAllowed(
        await service.validateActor(outsider.accessToken),
      );
      expect(denied.apps[0].allowedTopics).toHaveLength(0);
    });

    it("applies a type-based grant to every actor of that type", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      const room = await makeRoom(ds, app.appId);
      const device = await makeActor(ds, project.projectId, {
        actorType: EActorType.Device,
      });
      const user = await makeActor(ds, project.projectId, {
        actorType: EActorType.User,
      });
      await grantRoom(ds, room.roomId, { actorType: EActorType.Device });

      const asDevice = expectAllowed(
        await service.validateActor(device.accessToken),
      );
      expect(asDevice.apps[0].allowedTopics).toHaveLength(1);

      const asUser = expectAllowed(
        await service.validateActor(user.accessToken),
      );
      expect(asUser.apps[0].allowedTopics).toHaveLength(0);
    });

    it("prefers an actor-specific grant over a type grant", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      const room = await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId, {
        actorType: EActorType.Device,
      });
      await grantRoom(ds, room.roomId, {
        actorType: EActorType.Device,
        permission: EAccessPermission.Subscribe,
      });
      await grantRoom(ds, room.roomId, {
        actorTokenId: actor.entity.actorTokenId,
        permission: EAccessPermission.PubSub,
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].allowedTopics[0].permission).toBe(
        EAccessPermission.PubSub,
      );
    });

    it("ignores an expired room grant", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      const room = await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);
      await grantRoom(ds, room.roomId, {
        actorTokenId: actor.entity.actorTokenId,
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].allowedTopics).toHaveLength(0);
    });

    it("ignores an inactive room grant", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      const room = await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);
      await grantRoom(ds, room.roomId, {
        actorTokenId: actor.entity.actorTokenId,
        isActive: false,
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].allowedTopics).toHaveLength(0);
    });

    it("narrows topics to the room grant list", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, {
        topics: ["messages", "typing"],
      });
      const room = await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);
      await grantRoom(ds, room.roomId, {
        actorTokenId: actor.entity.actorTokenId,
        topics: ["typing"],
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(
        result.apps[0].allowedTopics.map((t) => t.pattern.split("/").pop()),
      ).toEqual(["typing"]);
    });

    it("excludes a disabled room", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      await makeRoom(ds, app.appId, { status: "disabled" as never });
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].allowedTopics).toHaveLength(0);
    });
  });

  /* ── addressing ────────────────────────────────────────────────────────── */

  describe("topic addressing", () => {
    it("builds the three-segment form for an unscoped actor", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      const room = await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      const topic = result.apps[0].allowedTopics[0];

      expect(topic.pattern).toBe("chat/general/messages");
      expect(topic.topic).toBe(`${room.roomId}/messages`);
      expect(topic.scopeId).toBeUndefined();
    });

    it("builds the four-segment form for a scoped actor", async () => {
      const project = await scenario();
      const scope = await makeScope(ds, project.projectId, { slug: "acme" });
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      const room = await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId, {
        accessScopeId: scope.accessScopeId,
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      const topic = result.apps[0].allowedTopics[0];

      expect(topic.pattern).toBe("chat/acme/general/messages");
      expect(topic.topic).toBe(
        `${scope.accessScopeId}/${room.roomId}/messages`,
      );
      expect(topic.scopeSlug).toBe("acme");
      expect(result.scopeName).toBe("Acme");
    });

    it("treats an inactive scope as no scope at all", async () => {
      const project = await scenario();
      const scope = await makeScope(ds, project.projectId, { isActive: false });
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId, {
        accessScopeId: scope.accessScopeId,
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].allowedTopics[0].pattern).toBe(
        "chat/general/messages",
      );
      expect(result.scopeId).toBeUndefined();
    });
  });

  /* ── lobbies and webhooks ──────────────────────────────────────────────── */

  describe("lobbies", () => {
    it("surfaces a lobby when at least one of its rooms is reachable", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      const reachable = await makeRoom(ds, app.appId, { slug: "a" });
      const room2 = await makeRoom(ds, app.appId, { slug: "b" });
      await makeLobby(ds, app.appId, [reachable.roomId, room2.roomId]);
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].allowedLobbies).toEqual([
        expect.objectContaining({ lobbySlug: "online" }),
      ]);
    });

    it("hides a lobby whose only room is unreachable", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      const room = await makeRoom(ds, app.appId, { slug: "private" });
      await makeLobby(ds, app.appId, [room.roomId]);
      const outsider = await makeActor(ds, project.projectId);
      const insider = await makeActor(ds, project.projectId);
      await grantRoom(ds, room.roomId, {
        actorTokenId: insider.entity.actorTokenId,
      });

      const result = expectAllowed(
        await service.validateActor(outsider.accessToken),
      );
      expect(result.apps[0].allowedLobbies).toHaveLength(0);
    });

    it("lists a lobby once even when several of its rooms are reachable", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      const a = await makeRoom(ds, app.appId, { slug: "a" });
      const b = await makeRoom(ds, app.appId, { slug: "b" });
      await makeLobby(ds, app.appId, [a.roomId, b.roomId]);
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].allowedLobbies).toHaveLength(1);
    });
  });

  describe("webhooks", () => {
    it("maps per-topic webhooks to the broker's snake_case keys", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, {
        topicConfigs: webhookTopicConfig(),
        hydrationWebhook: { url: "https://example.test/hydrate" },
        triggerWebhook: { url: "https://example.test/trigger" },
      });
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );

      expect(result.apps[0].topicWebhooks).toEqual({
        messages: {
          on_publish: { url: "https://example.test/publish" },
          on_subscribe: {
            url: "https://example.test/subscribe",
            headers: { Authorization: "Bearer x" },
          },
        },
      });
      // The `typing` entry has only a logging subtree, which core does not read,
      // so it must not appear as a webhook.
      expect(result.apps[0].topicWebhooks).not.toHaveProperty("typing");
      expect(result.apps[0].hydrationWebhook?.url).toBe(
        "https://example.test/hydrate",
      );
    });
  });

  /* ── limits ────────────────────────────────────────────────────────────── */

  describe("limits", () => {
    it("uses configured defaults when the project has never been synced", async () => {
      const project = await scenario();
      await makeApp(ds, project.projectId);
      const actor = await makeActor(ds, project.projectId);

      const svc = buildAuthzService(
        ds,
        buildConfig({ defaultMaxConnections: 42 }),
      );
      const result = expectAllowed(await svc.validateActor(actor.accessToken));
      expect(result.maxConnections).toBe(42);
    });

    it("uses the stored limits once synced", async () => {
      const project = await scenario();
      await ds.manager.update(
        ProjectEntity,
        { projectId: project.projectId },
        {
          maxConnections: 7,
          maxMessageSizeBytes: 1024,
          limitsSyncedAt: new Date(),
        },
      );
      await makeApp(ds, project.projectId);
      const actor = await makeActor(ds, project.projectId);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.maxConnections).toBe(7);
      expect(result.maxMessageSizeBytes).toBe(1024);
    });

    it("treats a stored zero as unset rather than capping at zero", async () => {
      // A lapsed subscription upstream can resolve to zero. Honouring it would
      // silently cap a live project at no connections at all.
      const project = await scenario();
      await ds.manager.update(
        ProjectEntity,
        { projectId: project.projectId },
        { maxConnections: 0, limitsSyncedAt: new Date() },
      );
      await makeApp(ds, project.projectId);
      const actor = await makeActor(ds, project.projectId);

      const svc = buildAuthzService(
        ds,
        buildConfig({ defaultMaxConnections: 99 }),
      );
      const result = expectAllowed(await svc.validateActor(actor.accessToken));
      expect(result.maxConnections).toBe(99);
    });

    it("reports a session expiry only for persistent actor types", async () => {
      const project = await scenario();
      await makeApp(ds, project.projectId);
      const device = await makeActor(ds, project.projectId, {
        actorType: EActorType.Device,
      });
      const agent = await makeActor(ds, project.projectId, {
        actorType: EActorType.Agent,
      });

      const asDevice = expectAllowed(
        await service.validateActor(device.accessToken),
      );
      expect(asDevice.persistentSession).toBe(false);
      expect(asDevice.sessionExpirySeconds).toBe(0);

      const asAgent = expectAllowed(
        await service.validateActor(agent.accessToken),
      );
      expect(asAgent.persistentSession).toBe(true);
      expect(asAgent.sessionExpirySeconds).toBe(3600);
    });
  });

  /* ── denials ───────────────────────────────────────────────────────────── */

  describe("validate denials", () => {
    it("denies an unknown token", async () => {
      const result = await service.validateActor("at_live_aaaaaaaaaaaa.nope");
      expect(result).toEqual({ valid: false, error: "token_invalid" });
    });

    it("denies a disabled actor token", async () => {
      const project = await scenario();
      await makeApp(ds, project.projectId);
      const actor = await makeActor(ds, project.projectId, {
        status: EActorTokenStatus.Disabled,
      });

      const result = await service.validateActor(actor.accessToken);
      expect(result.valid).toBe(false);
    });

    it("denies an expired actor token", async () => {
      const project = await scenario();
      await makeApp(ds, project.projectId);
      const actor = await makeActor(ds, project.projectId, {
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await service.validateActor(actor.accessToken);
      expect(result.valid).toBe(false);
    });
  });

  /* ── client tokens ─────────────────────────────────────────────────────── */

  describe("client tokens", () => {
    let signingKeyService: SigningKeyService;

    beforeEach(() => {
      signingKeyService = new SigningKeyService(
        new SigningKeyRepository(ds),
        buildConfig(),
      );
    });

    const mint = (secret: string, kid: string, sub: string, ttl = 600) =>
      jwt.sign({ sub, exp: Math.floor(Date.now() / 1000) + ttl }, secret, {
        algorithm: "HS256",
        keyid: kid,
      });

    it("resolves the same access as the actor's opaque token, plus authExpiresAt", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);
      const key = await makeSigningKey(
        ds,
        project.projectId,
        signingKeyService,
      );

      const viaOpaque = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      const viaClient = expectAllowed(
        await service.validateActor(
          mint(key.secret, key.entity.keyId, actor.keyId),
        ),
      );

      expect(viaClient.apps).toEqual(viaOpaque.apps);
      expect(viaClient.authExpiresAt).toBeGreaterThan(
        Math.floor(Date.now() / 1000),
      );
      expect(viaOpaque.authExpiresAt).toBeUndefined();
    });

    it("refuses a signing key naming an actor in another project", async () => {
      // Actor key ids are public, so without this check any project's signing
      // key could vouch for another project's actor.
      const mine = await scenario();
      const theirs = await scenario();
      await makeApp(ds, theirs.projectId);
      const theirActor = await makeActor(ds, theirs.projectId);
      const myKey = await makeSigningKey(ds, mine.projectId, signingKeyService);

      const result = await service.validateActor(
        mint(myKey.secret, myKey.entity.keyId, theirActor.keyId),
      );
      expect(result).toEqual({ valid: false, error: "token_invalid" });
    });

    it("refuses a client token naming an unknown actor", async () => {
      const project = await scenario();
      const key = await makeSigningKey(
        ds,
        project.projectId,
        signingKeyService,
      );

      const result = await service.validateActor(
        mint(key.secret, key.entity.keyId, "at_live_ffffffffffff"),
      );
      expect(result).toEqual({ valid: false, error: "token_invalid" });
    });
  });

  /* ── revalidate ────────────────────────────────────────────────────────── */

  describe("revalidate", () => {
    it("returns the same access as validate", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId);
      await makeRoom(ds, app.appId);
      const actor = await makeActor(ds, project.projectId);

      const validated = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      const revalidated = await service.revalidateActor(
        actor.entity.actorTokenId,
      );

      if (!revalidated.valid) throw new Error("expected valid");
      expect(revalidated.apps).toEqual(validated.apps);
    });

    it("reports a disconnect reason for a revoked token", async () => {
      const project = await scenario();
      const actor = await makeActor(ds, project.projectId, {
        status: EActorTokenStatus.Disabled,
      });

      const result = await service.revalidateActor(actor.entity.actorTokenId);
      expect(result).toEqual({
        valid: false,
        error: "token_suspended",
        disconnectReason: "token_revoked",
      });
    });

    it("reports a disconnect reason for an unknown token", async () => {
      const result = await service.revalidateActor(
        "99999999-9999-4999-8999-999999999999",
      );
      expect(result).toEqual({
        valid: false,
        error: "token_not_found",
        disconnectReason: "token_not_found",
      });
    });
  });

  /* ── check-room-access ─────────────────────────────────────────────────── */

  describe("checkRoomAccess", () => {
    it("allows a public room in an open app", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      const room = await makeRoom(ds, app.appId, { slug: "later" });
      const actor = await makeActor(ds, project.projectId);

      const result = await service.checkRoomAccess(
        actor.entity.actorTokenId,
        "chat/later/messages",
      );

      expect(result.allow).toBe(true);
      expect(result.appId).toBe(app.appId);
      expect(result.allowedTopics[0].topic).toBe(`${room.roomId}/messages`);
    });

    it("matches the pattern validate would produce for the same room", async () => {
      // The two entry points must agree byte for byte, or the broker's cache and
      // its live checks disagree about what a topic is called.
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId);

      const validated = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      const checked = await service.checkRoomAccess(
        actor.entity.actorTokenId,
        "chat/general/messages",
      );

      expect(checked.allowedTopics[0].pattern).toBe(
        validated.apps[0].allowedTopics[0].pattern,
      );
      expect(checked.allowedTopics[0].topic).toBe(
        validated.apps[0].allowedTopics[0].topic,
      );
    });

    it("denies a private room without a grant", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      const room = await makeRoom(ds, app.appId, { slug: "vip" });
      const insider = await makeActor(ds, project.projectId);
      const outsider = await makeActor(ds, project.projectId);
      await grantRoom(ds, room.roomId, {
        actorTokenId: insider.entity.actorTokenId,
      });

      await expect(
        service.checkRoomAccess(
          outsider.entity.actorTokenId,
          "chat/vip/messages",
        ),
      ).resolves.toEqual({ allow: false, allowedTopics: [] });

      const allowed = await service.checkRoomAccess(
        insider.entity.actorTokenId,
        "chat/vip/messages",
      );
      expect(allowed.allow).toBe(true);
    });

    it("requires the scope segment to be the actor's own scope", async () => {
      const project = await scenario();
      const mine = await makeScope(ds, project.projectId, { slug: "acme" });
      await makeScope(ds, project.projectId, { slug: "other" });
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId, {
        accessScopeId: mine.accessScopeId,
      });

      await expect(
        service.checkRoomAccess(
          actor.entity.actorTokenId,
          "chat/acme/general/messages",
        ),
      ).resolves.toMatchObject({ allow: true });

      // Naming another tenant's scope must not resolve, even though that scope
      // exists in the same project.
      await expect(
        service.checkRoomAccess(
          actor.entity.actorTokenId,
          "chat/other/general/messages",
        ),
      ).resolves.toEqual({ allow: false, allowedTopics: [] });
    });

    it.each([
      ["too few segments", "chat/messages"],
      ["too many segments", "chat/a/b/c/d"],
      ["unknown app", "nosuchapp/general/messages"],
      ["unknown room", "chat/nosuchroom/messages"],
      ["empty", ""],
    ])("denies %s", async (_, pattern) => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId);

      await expect(
        service.checkRoomAccess(actor.entity.actorTokenId, pattern),
      ).resolves.toEqual({ allow: false, allowedTopics: [] });
    });

    it("denies an app in another project even by correct slug", async () => {
      const mine = await scenario();
      const theirs = await scenario();
      const theirApp = await makeApp(ds, theirs.projectId, { slug: "chat" });
      await makeRoom(ds, theirApp.appId, { slug: "general" });
      const actor = await makeActor(ds, mine.projectId);

      await expect(
        service.checkRoomAccess(
          actor.entity.actorTokenId,
          "chat/general/messages",
        ),
      ).resolves.toEqual({ allow: false, allowedTopics: [] });
    });

    it("denies a disabled actor", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId, {
        status: EActorTokenStatus.Disabled,
      });

      await expect(
        service.checkRoomAccess(
          actor.entity.actorTokenId,
          "chat/general/messages",
        ),
      ).resolves.toEqual({ allow: false, allowedTopics: [] });
    });
  });

  /* ── session state ─────────────────────────────────────────────────────── */

  describe("subscriptions", () => {
    it("records, replaces and clears a subscription", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId);
      const id = actor.entity.actorTokenId;

      await ds.transaction((m) =>
        service.updateSubscription(id, "chat/general/messages", "subscribe", m),
      );

      let result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].activeSubscriptions).toHaveLength(1);
      expect(result.apps[0].activeSubscriptions![0].topic).toContain(
        "messages",
      );

      // Re-subscribing replaces rather than duplicating.
      await ds.transaction((m) =>
        service.updateSubscription(
          id,
          "chat/general/messages",
          "subscribe",
          m,
          true,
          "group-a",
        ),
      );
      result = expectAllowed(await service.validateActor(actor.accessToken));
      expect(result.apps[0].activeSubscriptions).toHaveLength(1);
      expect(result.apps[0].activeSubscriptions![0].loadBalance).toBe(true);
      expect(result.apps[0].activeSubscriptions![0].loadBalanceGroup).toBe(
        "group-a",
      );

      await ds.transaction((m) =>
        service.updateSubscription(
          id,
          "chat/general/messages",
          "unsubscribe",
          m,
        ),
      );
      result = expectAllowed(await service.validateActor(actor.accessToken));
      expect(result.apps[0].activeSubscriptions).toHaveLength(0);
    });

    it("omits a recorded subscription whose access has since been revoked", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      const room = await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId);
      const other = await makeActor(ds, project.projectId);

      await ds.transaction((m) =>
        service.updateSubscription(
          actor.entity.actorTokenId,
          "chat/general/messages",
          "subscribe",
          m,
        ),
      );

      // Making the room private to someone else revokes this actor's access.
      await grantRoom(ds, room.roomId, {
        actorTokenId: other.entity.actorTokenId,
      });

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].activeSubscriptions).toHaveLength(0);
    });

    it("clears every subscription on disconnect", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId);
      const id = actor.entity.actorTokenId;

      await ds.transaction((m) =>
        service.updateSubscription(id, "chat/general/messages", "subscribe", m),
      );
      await service.clearSubscriptions(id);

      const result = expectAllowed(
        await service.validateActor(actor.accessToken),
      );
      expect(result.apps[0].activeSubscriptions).toHaveLength(0);
    });
  });

  /* ── wire contract ─────────────────────────────────────────────────────── */

  describe("broker envelope", () => {
    it("emits the allow envelope with snake_case client_attrs", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      const room = await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId);

      const envelope = toBrokerValidateResponse(
        await service.validateActor(actor.accessToken),
      );

      expect(envelope).toMatchObject({
        result: "allow",
        is_superuser: false,
        client_attrs: {
          actor_token_id: actor.entity.actorTokenId,
          project_id: project.projectId,
          actor_type: EActorType.Device,
          max_connections: null,
          persistent_session: false,
          session_expiry_seconds: 0,
          auth_expires_at: null,
          apps: [
            {
              app_id: app.appId,
              app_slug: "chat",
              allowed_topics: [
                {
                  pattern: "chat/general/messages",
                  topic: `${room.roomId}/messages`,
                  permission: "pubSub",
                  room_id: room.roomId,
                  room_slug: "general",
                },
              ],
              allowed_lobbies: [],
              active_subscriptions: [],
              hydration_webhook: null,
              trigger_webhook: null,
              topic_webhooks: {},
            },
          ],
        },
      });
    });

    it("emits a deny envelope carrying no reason", async () => {
      const envelope = toBrokerValidateResponse(
        await service.validateActor("at_live_aaaaaaaaaaaa.nope"),
      );
      expect(envelope).toEqual({ result: "deny", is_superuser: false });
      expect(JSON.stringify(envelope)).not.toContain("token_invalid");
    });

    it("injects app_id onto every check-room-access topic", async () => {
      const project = await scenario();
      const app = await makeApp(ds, project.projectId, { slug: "chat" });
      await makeRoom(ds, app.appId, { slug: "general" });
      const actor = await makeActor(ds, project.projectId);

      const envelope = toBrokerCheckRoomAccessResponse(
        await service.checkRoomAccess(
          actor.entity.actorTokenId,
          "chat/general/messages",
        ),
      );

      expect(envelope.allow).toBe(true);
      expect(envelope.allowed_topics[0].app_id).toBe(app.appId);
    });
  });
});
