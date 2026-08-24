import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CoreModule } from "../src/core.module";
import { CoreConfig } from "../src/core.config";
import { CORE_AUDIT_SINK, CoreAuditEvent } from "../src/core.options";
import { allCoreMigrations, coreEntities } from "../src/schema";
import { AccessScopeFacade } from "../src/modules/accessScopeModule/accessScope.facade";
import { ActorTokenFacade } from "../src/modules/actorTokenModule/actorToken.facade";
import { AuthzFacade } from "../src/modules/authzModule/authz.facade";
import { ProjectConfigFacade } from "../src/modules/projectConfigModule/projectConfig.facade";
import { LobbyFacade } from "../src/modules/lobbyModule/lobby.facade";
import { PlatformAppFacade } from "../src/modules/platformAppModule/platformApp.facade";
import { ProjectFacade } from "../src/modules/projectModule/project.facade";
import { RoomFacade } from "../src/modules/roomModule/room.facade";
import { RoomActorAccessFacade } from "../src/modules/roomModule/roomActorAccess.facade";
import { SigningKeyFacade } from "../src/modules/signingKeyModule/signingKey.facade";

/**
 * Does the library actually assemble?
 *
 * Unit tests construct services by hand and never touch the container, so they
 * cannot catch a missing provider, an unexported module or a repository whose
 * factory was never registered. Those failures only appear when a host mounts
 * core, which is the worst place to find them.
 *
 * This boots CoreModule the way a host does and resolves every facade it
 * promises. It is deliberately shallow: it proves the wiring, not the
 * behaviour, and it should stay fast enough to run on every port.
 */
describe("module wiring", () => {
  let app: INestApplication;
  const recorded: CoreAuditEvent[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "postgres",
          host: process.env.POSTGRES_HOST || "localhost",
          port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
          username: process.env.POSTGRES_USER,
          password: process.env.POSTGRES_PASSWORD,
          database: process.env.POSTGRES_DATABASE,
          // The same explicit arrays a host is told to use. A glob here would
          // pass and then fail in every consumer.
          entities: [...coreEntities],
          migrations: [...allCoreMigrations],
          synchronize: false,
          migrationsRun: false,
          logging: false,
        }),
        CoreModule.forRoot({
          signingKeyEncryptionKey: Buffer.alloc(32).toString("base64"),
          defaultLimits: { sessionExpirySeconds: 1800 },
          auditSink: { record: (event) => recorded.push(event) },
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ["AuthzFacade", AuthzFacade],
    ["ProjectFacade", ProjectFacade],
    ["PlatformAppFacade", PlatformAppFacade],
    ["LobbyFacade", LobbyFacade],
    ["AccessScopeFacade", AccessScopeFacade],
    ["ActorTokenFacade", ActorTokenFacade],
    ["RoomFacade", RoomFacade],
    ["RoomActorAccessFacade", RoomActorAccessFacade],
    ["SigningKeyFacade", SigningKeyFacade],
    ["ProjectConfigFacade", ProjectConfigFacade],
  ])("resolves %s from the container", (_name, token) => {
    expect(app.get(token)).toBeDefined();
  });

  it("hands the host's options through to CoreConfig", () => {
    const config = app.get(CoreConfig);
    expect(config.defaultSessionExpirySeconds).toBe(1800);
    // Unset limits mean unlimited, not zero.
    expect(config.defaultMaxConnections).toBeNull();
  });

  it("uses the host's audit sink rather than the no-op", () => {
    const sink = app.get(CORE_AUDIT_SINK);
    sink.record({ action: "test.event", resourceType: "test" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0].action).toBe("test.event");
  });
});
