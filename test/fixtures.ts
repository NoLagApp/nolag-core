import { DataSource } from "typeorm";
import { AccessScopeEntity } from "../src/modules/accessScopeModule/accessScope.entity";
import { ActorAppAccessEntity } from "../src/modules/actorTokenModule/actorAppAccess.entity";
import { ActorTokenEntity } from "../src/modules/actorTokenModule/actorToken.entity";
import { ActorTokenRepository } from "../src/modules/actorTokenModule/actorToken.repository";
import { ActorTokenFacade } from "../src/modules/actorTokenModule/actorToken.facade";
import { ActorTokenService } from "../src/modules/actorTokenModule/actorToken.service";
import { EAccessPermission } from "../src/modules/actorTokenModule/enum/EAccessPermission.enum";
import { EActorTokenStatus } from "../src/modules/actorTokenModule/enum/EActorTokenStatus.enum";
import { EActorType } from "../src/modules/actorTokenModule/enum/EActorType.enum";
import { AuthzService } from "../src/modules/authzModule/authz.service";
import { CoreConfigService } from "../src/modules/configModule/config.service";
import { LobbyEntity } from "../src/modules/lobbyModule/lobby.entity";
import { LobbyRoomEntity } from "../src/modules/lobbyModule/lobbyRoom.entity";
import { EAppAccessMode } from "../src/modules/platformAppModule/enum/EAppAccessMode.enum";
import { EAppStatus } from "../src/modules/platformAppModule/enum/EAppStatus.enum";
import {
  PlatformAppEntity,
  TopicConfigs,
} from "../src/modules/platformAppModule/platformApp.entity";
import { ProjectEntity } from "../src/modules/projectModule/project.entity";
import { ERoomStatus } from "../src/modules/roomModule/enum/ERoomStatus.enum";
import { RoomEntity } from "../src/modules/roomModule/room.entity";
import { RoomActorAccessEntity } from "../src/modules/roomModule/roomActorAccess.entity";
import { SigningKeyEntity } from "../src/modules/signingKeyModule/signingKey.entity";
import { SigningKeyFacade } from "../src/modules/signingKeyModule/signingKey.facade";
import { SigningKeyRepository } from "../src/modules/signingKeyModule/signingKey.repository";
import { SigningKeyService } from "../src/modules/signingKeyModule/signingKey.service";
import { generateCredential } from "../src/common/utils/secretHash";
import { randomBytes } from "crypto";

export const TEST_ENCRYPTION_KEY = randomBytes(32).toString("base64");

export function buildDataSource(): DataSource {
  return new DataSource({
    type: "postgres",
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
    entities: [`${__dirname}/../src/**/*.entity.ts`],
    synchronize: false,
    logging: false,
  });
}

export function buildConfig(
  overrides: Partial<{
    defaultMaxConnections: number | null;
    defaultMaxMessageSizeBytes: number | null;
    defaultSessionExpirySeconds: number;
    signingKeyEncryptionKey: string | undefined;
  }> = {},
): CoreConfigService {
  return {
    defaultMaxConnections: null,
    defaultMaxMessageSizeBytes: null,
    defaultSessionExpirySeconds: 3600,
    signingKeyEncryptionKey: TEST_ENCRYPTION_KEY,
    ...overrides,
  } as CoreConfigService;
}

/** A fully wired AuthzService with real repositories, no mocks in the path. */
export function buildAuthzService(
  ds: DataSource,
  config: CoreConfigService = buildConfig(),
): AuthzService {
  const actorTokenFacade = new ActorTokenFacade(
    new ActorTokenService(new ActorTokenRepository(ds)),
  );
  const signingKeyFacade = new SigningKeyFacade(
    new SigningKeyService(new SigningKeyRepository(ds), config),
  );
  return new AuthzService(ds, actorTokenFacade, signingKeyFacade, config);
}

/* ── Builders ────────────────────────────────────────────────────────────── */

export async function makeProject(
  ds: DataSource,
  overrides: Partial<ProjectEntity> = {},
): Promise<ProjectEntity> {
  const project = new ProjectEntity();
  project.organizationId = null;
  project.name = "Test project";
  project.maxConnections = null;
  project.maxMessageSizeBytes = null;
  project.sessionExpirySeconds = null;
  project.limitsSyncedAt = null;
  Object.assign(project, overrides);
  return ds.manager.save(ProjectEntity, project);
}

export async function makeApp(
  ds: DataSource,
  projectId: string,
  overrides: Partial<PlatformAppEntity> = {},
): Promise<PlatformAppEntity> {
  const app = new PlatformAppEntity();
  app.projectId = projectId;
  app.name = "Test app";
  app.slug = "test-app";
  app.status = EAppStatus.Active;
  app.accessMode = EAppAccessMode.Open;
  app.topics = ["messages"];
  Object.assign(app, overrides);
  return ds.manager.save(PlatformAppEntity, app);
}

export async function makeRoom(
  ds: DataSource,
  appId: string,
  overrides: Partial<RoomEntity> = {},
): Promise<RoomEntity> {
  const room = new RoomEntity();
  room.appId = appId;
  room.slug = "general";
  room.name = "General";
  room.status = ERoomStatus.Active;
  Object.assign(room, overrides);
  return ds.manager.save(RoomEntity, room);
}

export async function makeScope(
  ds: DataSource,
  projectId: string,
  overrides: Partial<AccessScopeEntity> = {},
): Promise<AccessScopeEntity> {
  const scope = new AccessScopeEntity();
  scope.projectId = projectId;
  scope.slug = "acme";
  scope.name = "Acme";
  scope.description = null;
  scope.metadata = null;
  scope.isActive = true;
  Object.assign(scope, overrides);
  return ds.manager.save(AccessScopeEntity, scope);
}

export interface MadeActor {
  entity: ActorTokenEntity;
  accessToken: string;
  keyId: string;
}

export async function makeActor(
  ds: DataSource,
  projectId: string,
  overrides: Partial<ActorTokenEntity> = {},
): Promise<MadeActor> {
  const credential = generateCredential("at_live");
  const actor = new ActorTokenEntity();
  actor.projectId = projectId;
  actor.keyId = credential.keyId;
  actor.secretHash = credential.secretHash;
  actor.name = "Test actor";
  actor.actorType = EActorType.Device;
  actor.status = EActorTokenStatus.Active;
  actor.expiresAt = null;
  actor.lastUsedAt = null;
  actor.accessScopeId = null;
  Object.assign(actor, overrides);

  const entity = await ds.manager.save(ActorTokenEntity, actor);
  return {
    entity,
    accessToken: credential.credential,
    keyId: credential.keyId,
  };
}

export async function grantApp(
  ds: DataSource,
  actorTokenId: string,
  appId: string,
  overrides: Partial<ActorAppAccessEntity> = {},
): Promise<ActorAppAccessEntity> {
  const grant = new ActorAppAccessEntity();
  grant.actorTokenId = actorTokenId;
  grant.appId = appId;
  grant.permission = EAccessPermission.PubSub;
  grant.topics = null;
  grant.isActive = true;
  grant.expiresAt = null;
  Object.assign(grant, overrides);
  return ds.manager.save(ActorAppAccessEntity, grant);
}

export async function grantRoom(
  ds: DataSource,
  roomId: string,
  overrides: Partial<RoomActorAccessEntity> = {},
): Promise<RoomActorAccessEntity> {
  const grant = new RoomActorAccessEntity();
  grant.roomId = roomId;
  grant.actorTokenId = null;
  grant.actorType = null;
  grant.permission = EAccessPermission.Subscribe;
  grant.topics = null;
  grant.isActive = true;
  grant.expiresAt = null;
  Object.assign(grant, overrides);
  return ds.manager.save(RoomActorAccessEntity, grant);
}

export async function makeLobby(
  ds: DataSource,
  appId: string,
  roomIds: string[],
  overrides: Partial<LobbyEntity> = {},
): Promise<LobbyEntity> {
  const lobby = new LobbyEntity();
  lobby.appId = appId;
  lobby.slug = "online";
  lobby.name = "Online";
  Object.assign(lobby, overrides);
  const saved = await ds.manager.save(LobbyEntity, lobby);

  for (const roomId of roomIds) {
    const link = new LobbyRoomEntity();
    link.lobbyId = saved.lobbyId;
    link.roomId = roomId;
    await ds.manager.save(LobbyRoomEntity, link);
  }

  return saved;
}

export async function makeSigningKey(
  ds: DataSource,
  projectId: string,
  signingKeyService: SigningKeyService,
  overrides: Partial<SigningKeyEntity> = {},
): Promise<{ entity: SigningKeyEntity; secret: string }> {
  const generated = signingKeyService.generateSigningKey();
  const key = new SigningKeyEntity();
  key.projectId = projectId;
  key.keyId = generated.keyId;
  key.secretEncrypted = signingKeyService.encryptForStorage(generated.secret);
  key.name = "Test key";
  key.lastUsedAt = null;
  Object.assign(key, overrides);
  const entity = await ds.manager.save(SigningKeyEntity, key);
  return { entity, secret: generated.secret };
}

export const webhookTopicConfig = (): TopicConfigs => ({
  messages: {
    webhooks: {
      onPublish: { url: "https://example.test/publish" },
      onSubscribe: {
        url: "https://example.test/subscribe",
        headers: { Authorization: "Bearer x" },
      },
    },
  },
  // A subtree core does not read. Must survive untouched rather than be dropped.
  typing: { logging: { enabled: true } },
});

/**
 * Teardown. Deleting the project cascades to everything below it.
 *
 * Verified: this works even when a scoped actor exists. Although
 * actor_token.access_scope_id is ON DELETE RESTRICT, Postgres orders the cascade
 * so the actor is removed before the scope, and the restriction is satisfied by
 * the time it is checked. The RESTRICT only blocks a *direct* delete of a scope
 * that still has actors, which is exactly its purpose.
 *
 * The explicit actor delete is kept anyway: it makes the ordering intent visible
 * rather than depending on the reader knowing that.
 */
export async function cleanupProject(
  ds: DataSource,
  projectId: string,
): Promise<void> {
  await ds.manager.delete(ActorTokenEntity, { projectId });
  await ds.manager.delete(ProjectEntity, { projectId });
}
