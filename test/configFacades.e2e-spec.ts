import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TypeOrmModule, getDataSourceToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { CoreModule } from "../src/core.module";
import { allCoreMigrations, coreEntities } from "../src/schema";
import { AccessScopeFacade } from "../src/modules/accessScopeModule/accessScope.facade";
import { ActorTokenEntity } from "../src/modules/actorTokenModule/actorToken.entity";
import { EActorType } from "../src/modules/actorTokenModule/enum/EActorType.enum";
import { EAccessPermission } from "../src/modules/actorTokenModule/enum/EAccessPermission.enum";
import { LobbyFacade } from "../src/modules/lobbyModule/lobby.facade";
import { PlatformAppFacade } from "../src/modules/platformAppModule/platformApp.facade";
import { EAppAccessMode } from "../src/modules/platformAppModule/enum/EAppAccessMode.enum";
import { ProjectEntity } from "../src/modules/projectModule/project.entity";
import { ProjectFacade } from "../src/modules/projectModule/project.facade";
import { RoomFacade } from "../src/modules/roomModule/room.facade";
import { RoomActorAccessFacade } from "../src/modules/roomModule/roomActorAccess.facade";

/**
 * The configuration facades, against a real Postgres.
 *
 * These are ported from Titus rather than written fresh, so the point of these
 * tests is not to re-derive the behaviour but to pin the places where core
 * deliberately differs, and the invariants that make an authorization decision
 * safe: uniqueness under a lock, soft deletes that stay filtered, and the
 * guards that refuse to widen access by accident.
 */
describe("configuration facades", () => {
  let app: INestApplication;
  let ds: DataSource;

  let projects: ProjectFacade;
  let apps: PlatformAppFacade;
  let rooms: RoomFacade;
  let grants: RoomActorAccessFacade;
  let lobbies: LobbyFacade;
  let scopes: AccessScopeFacade;

  const createdProjectIds: string[] = [];

  async function newProject(name = "facade test") {
    const project = await projects.createProject({ name });
    createdProjectIds.push(project.projectId);
    return project;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          // Core binds to this name, not to the default connection.
          type: "postgres",
          host: process.env.POSTGRES_HOST || "localhost",
          port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
          username: process.env.POSTGRES_USER,
          password: process.env.POSTGRES_PASSWORD,
          database: process.env.POSTGRES_DATABASE,
          entities: [...coreEntities],
          migrations: [...allCoreMigrations],
          synchronize: false,
          migrationsRun: false,
          logging: false,
        }),
        CoreModule.forRoot(),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    projects = app.get(ProjectFacade);
    apps = app.get(PlatformAppFacade);
    rooms = app.get(RoomFacade);
    grants = app.get(RoomActorAccessFacade);
    lobbies = app.get(LobbyFacade);
    scopes = app.get(AccessScopeFacade);
  });

  afterAll(async () => {
    for (const projectId of createdProjectIds) {
      await ds.manager.delete(ActorTokenEntity, { projectId });
      await ds.manager.delete(ProjectEntity, { projectId });
    }
    await app?.close();
  });

  describe("apps", () => {
    /**
     * The deliberate divergence from Titus, and the reason it exists: this slug
     * is the first segment of every address in the app, so a random suffix
     * makes the address in the docs wrong.
     */
    it("uses the slug it was given, with no suffix", async () => {
      const project = await newProject();
      const created = await apps.createApp(project.projectId, {
        slug: "chat",
        name: "Chat",
        topics: ["messages"],
      });

      expect(created.slug).toBe("chat");
    });

    it("generates a slug from the name when none is given", async () => {
      const project = await newProject();
      const created = await apps.createApp(project.projectId, {
        name: "My Great App",
        topics: ["messages"],
      });

      expect(created.slug).toBe("my-great-app");
    });

    it("refuses a duplicate slug in the same project", async () => {
      const project = await newProject();
      await apps.createApp(project.projectId, {
        slug: "chat",
        name: "Chat",
        topics: ["messages"],
      });

      await expect(
        apps.createApp(project.projectId, {
          slug: "chat",
          name: "Chat again",
          topics: ["messages"],
        }),
      ).rejects.toThrow();
    });

    it("allows the same slug in a different project", async () => {
      const a = await newProject("project a");
      const b = await newProject("project b");

      await apps.createApp(a.projectId, {
        slug: "chat",
        name: "Chat",
        topics: ["messages"],
      });

      await expect(
        apps.createApp(b.projectId, {
          slug: "chat",
          name: "Chat",
          topics: ["messages"],
        }),
      ).resolves.toBeDefined();
    });

    it("defaults to open access", async () => {
      const project = await newProject();
      const created = await apps.createApp(project.projectId, {
        name: "Chat",
        topics: ["messages"],
      });

      expect(created.accessMode).toBe(EAppAccessMode.Open);
    });

    it("hides a deleted app from reads", async () => {
      const project = await newProject();
      const created = await apps.createApp(project.projectId, {
        name: "Chat",
        topics: ["messages"],
      });

      await apps.deleteApp(created.appId, project.projectId);

      await expect(
        apps.getAppById(created.appId, project.projectId),
      ).rejects.toThrow();
    });
  });

  describe("rooms", () => {
    it("inherits the app's topics when none are given", async () => {
      const project = await newProject();
      const created = await apps.createApp(project.projectId, {
        name: "Chat",
        topics: ["messages", "typing"],
      });

      const room = await rooms.createRoom(created.appId, { name: "General" });

      expect(room.topics).toEqual(["messages", "typing"]);
    });

    it("keeps the topics it was given rather than inheriting", async () => {
      const project = await newProject();
      const created = await apps.createApp(project.projectId, {
        name: "Chat",
        topics: ["messages", "typing"],
      });

      const room = await rooms.createRoom(created.appId, {
        name: "General",
        topics: ["messages"],
      });

      expect(room.topics).toEqual(["messages"]);
    });

    it("adds the WebRTC topics with colons, not slashes", async () => {
      const project = await newProject();
      const created = await apps.createApp(project.projectId, {
        name: "Chat",
        topics: ["messages"],
      });

      const room = await rooms.createRoom(created.appId, {
        name: "Call",
        enableWebRTC: true,
      });

      expect(room.topics).toContain("webrtc:offer");
      // A slash would change the shape of every address using it.
      expect(room.topics?.every((t) => !t.includes("/"))).toBe(true);
    });

    it("refuses a duplicate slug in the same app", async () => {
      const project = await newProject();
      const created = await apps.createApp(project.projectId, {
        name: "Chat",
        topics: ["messages"],
      });

      await rooms.createRoom(created.appId, { slug: "general", name: "G" });

      await expect(
        rooms.createRoom(created.appId, { slug: "general", name: "G2" }),
      ).rejects.toThrow();
    });
  });

  describe("room grants", () => {
    async function aRoom() {
      const project = await newProject();
      const created = await apps.createApp(project.projectId, {
        name: "Chat",
        topics: ["messages"],
      });
      const room = await rooms.createRoom(created.appId, { name: "General" });
      return room;
    }

    it("treats a room with no grants as public", async () => {
      const room = await aRoom();
      expect(await grants.isPrivateRoom(room.roomId)).toBe(false);
    });

    it("makes a room private the moment it carries one grant", async () => {
      const room = await aRoom();
      await grants.create(room.roomId, {
        actorType: EActorType.Service,
        permission: EAccessPermission.PubSub,
      });

      expect(await grants.isPrivateRoom(room.roomId)).toBe(true);
    });

    it("refuses a grant that names neither an actor nor a type", async () => {
      const room = await aRoom();
      await expect(
        grants.create(room.roomId, { permission: EAccessPermission.PubSub }),
      ).rejects.toThrow();
    });

    it("refuses a grant that names both", async () => {
      const room = await aRoom();
      await expect(
        grants.create(room.roomId, {
          actorTokenId: "00000000-0000-4000-8000-000000000000",
          actorType: EActorType.Service,
          permission: EAccessPermission.PubSub,
        }),
      ).rejects.toThrow();
    });

    it("refuses a second grant for the same type on the same room", async () => {
      const room = await aRoom();
      await grants.create(room.roomId, {
        actorType: EActorType.Service,
        permission: EAccessPermission.PubSub,
      });

      await expect(
        grants.create(room.roomId, {
          actorType: EActorType.Service,
          permission: EAccessPermission.Subscribe,
        }),
      ).rejects.toThrow();
    });

    /**
     * A deleted grant must stay deleted. If a soft-deleted row came back into
     * a resolution, an actor would keep access somebody explicitly removed.
     */
    it("does not resurrect a deleted grant", async () => {
      const room = await aRoom();
      const grant = await grants.create(room.roomId, {
        actorType: EActorType.Service,
        permission: EAccessPermission.PubSub,
      });

      await grants.delete(grant.roomActorAccessId);

      expect(await grants.listByRoomId(room.roomId)).toHaveLength(0);
      expect(await grants.isPrivateRoom(room.roomId)).toBe(false);
    });
  });

  describe("lobbies", () => {
    it("caps a room at ten lobbies", async () => {
      const project = await newProject();
      const created = await apps.createApp(project.projectId, {
        name: "Chat",
        topics: ["messages"],
      });
      const room = await rooms.createRoom(created.appId, { name: "General" });

      for (let i = 0; i < 10; i++) {
        const lobby = await lobbies.createLobby(created.appId, {
          name: `Lobby ${i}`,
        });
        await lobbies.addRoomToLobby(lobby.lobbyId, room.roomId, created.appId);
      }

      const eleventh = await lobbies.createLobby(created.appId, {
        name: "One too many",
      });

      // The cap is about presence fan-out, not tidiness: each membership
      // multiplies the deliveries one presence update produces.
      await expect(
        lobbies.addRoomToLobby(eleventh.lobbyId, room.roomId, created.appId),
      ).rejects.toThrow();
    });

    it("refuses the same room twice in one lobby", async () => {
      const project = await newProject();
      const created = await apps.createApp(project.projectId, {
        name: "Chat",
        topics: ["messages"],
      });
      const room = await rooms.createRoom(created.appId, { name: "General" });
      const lobby = await lobbies.createLobby(created.appId, {
        name: "Online",
      });

      await lobbies.addRoomToLobby(lobby.lobbyId, room.roomId, created.appId);

      await expect(
        lobbies.addRoomToLobby(lobby.lobbyId, room.roomId, created.appId),
      ).rejects.toThrow();
    });

    it("refuses a room from another app", async () => {
      const project = await newProject();
      const appA = await apps.createApp(project.projectId, {
        name: "A",
        topics: ["messages"],
      });
      const appB = await apps.createApp(project.projectId, {
        name: "B",
        topics: ["messages"],
      });

      const roomInB = await rooms.createRoom(appB.appId, { name: "General" });
      const lobbyInA = await lobbies.createLobby(appA.appId, {
        name: "Online",
      });

      await expect(
        lobbies.addRoomToLobby(lobbyInA.lobbyId, roomInB.roomId, appA.appId),
      ).rejects.toThrow();
    });
  });

  describe("access scopes", () => {
    it("refuses a duplicate slug in the same project", async () => {
      const project = await newProject();
      await scopes.create(project.projectId, { slug: "acme", name: "Acme" });

      await expect(
        scopes.create(project.projectId, { slug: "acme", name: "Acme 2" }),
      ).rejects.toThrow();
    });

    /**
     * The guard that matters most here. Deleting a scope out from under its
     * actors does not orphan them: an actor with no scope resolves to the
     * project-wide address space, so it would silently *widen* their reach.
     */
    it("refuses to delete a scope that still has actors", async () => {
      const project = await newProject();
      const scope = await scopes.create(project.projectId, {
        slug: "acme",
        name: "Acme",
      });

      const actor = new ActorTokenEntity();
      actor.projectId = project.projectId;
      actor.accessScopeId = scope.accessScopeId;
      actor.keyId = "at_live_ffffffffffff";
      actor.secretHash = "0".repeat(64);
      actor.name = "Bound actor";
      actor.actorType = EActorType.Device;
      await ds.manager.save(ActorTokenEntity, actor);

      await expect(
        scopes.delete(scope.accessScopeId, project.projectId),
      ).rejects.toThrow();
    });
  });

  describe("project limits", () => {
    it("starts unsynced, so resolution falls back to the host's defaults", async () => {
      const project = await newProject();
      expect(project.limitsSyncedAt).toBeNull();
    });

    /**
     * The inversion that removes core's billing dependency. Whatever decides
     * limits writes plain numbers here and core stops caring where they came
     * from.
     */
    it("stamps limitsSyncedAt so defaults stop applying", async () => {
      const project = await newProject();

      const synced = await projects.syncLimits(project.projectId, {
        maxConnections: 50,
        maxMessageSizeBytes: 65536,
      });

      expect(synced.maxConnections).toBe(50);
      expect(synced.maxMessageSizeBytes).toBe(65536);
      expect(synced.limitsSyncedAt).not.toBeNull();
    });

    it("leaves a limit alone when the caller omits it", async () => {
      const project = await newProject();
      await projects.syncLimits(project.projectId, { maxConnections: 50 });

      const again = await projects.syncLimits(project.projectId, {
        maxMessageSizeBytes: 1024,
      });

      expect(again.maxConnections).toBe(50);
      expect(again.maxMessageSizeBytes).toBe(1024);
    });
  });
});
