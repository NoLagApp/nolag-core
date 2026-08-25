/**
 * @nolag/core
 *
 * The authorization domain of NoLag, as a library. Mount it into a host, give
 * it a DataSource, and ask it whether an actor may reach a topic.
 *
 * There is no transport here on purpose. Core has no controllers, no guards and
 * no opinion about who is calling it: NoLag mounts these facades behind its own
 * authentication, and the example host in this repository mounts them behind
 * none. Authenticating the *caller* is the host's job.
 *
 * Authenticating the *actor* is not. Whether an access token is real, whether a
 * client token was signed by the right key, and what either may reach, all live
 * here and nowhere else.
 */

/* ── Mounting ───────────────────────────────────────────────────────────── */

export { CoreModule } from "./core.module";
export { CoreConfig } from "./core.config";
export {
  CORE_AUDIT_SINK,
  CORE_OPTIONS,
  NoopAuditSink,
  type CoreAuditEvent,
  type CoreAuditSink,
  type CoreDefaultLimits,
  type CoreModuleOptions,
} from "./core.options";

/* ── Schema ─────────────────────────────────────────────────────────────
 *
 * Arrays of classes, not globs. A host that discovers entities with a glob
 * (`**\/*.entity.js`) will never reach into node_modules, so these have to be
 * passed explicitly:
 *
 *   TypeOrmModule.forRoot({ entities: [...coreEntities, ...hostEntities] })
 */

export {
  allCoreMigrations,
  coreEntities,
  coreInitialMigrations,
  coreMigrations,
} from "./schema";

/* ── Facades ────────────────────────────────────────────────────────────── */

export { ProjectFacade } from "./modules/projectModule/project.facade";
export { PlatformAppFacade } from "./modules/platformAppModule/platformApp.facade";
export { AccessScopeFacade } from "./modules/accessScopeModule/accessScope.facade";
export { LobbyFacade } from "./modules/lobbyModule/lobby.facade";
export { AuthzFacade } from "./modules/authzModule/authz.facade";
export { ActorTokenFacade } from "./modules/actorTokenModule/actorToken.facade";
export { RoomFacade } from "./modules/roomModule/room.facade";
export { RoomActorAccessFacade } from "./modules/roomModule/roomActorAccess.facade";
export { SigningKeyFacade } from "./modules/signingKeyModule/signingKey.facade";
export { ProjectConfigFacade } from "./modules/projectConfigModule/projectConfig.facade";

/* ── The wire contract ──────────────────────────────────────────────────
 *
 * These reshape a decision into the exact envelope the broker consumes. A host
 * serving the broker endpoints must use them rather than serialising a DTO, or
 * a field rename silently changes what every deployed broker receives.
 */

export {
  toBrokerCheckRoomAccessResponse,
  toBrokerRevalidateResponse,
  toBrokerValidateResponse,
} from "./modules/authzModule/adapters/brokerResponse.adapter";

/* ── Types ──────────────────────────────────────────────────────────────── */

export * from "./modules/accessScopeModule/dto/accessScope.dto";
export { AccessScopeQuery } from "./modules/accessScopeModule/query/accessScope.query";
export * from "./modules/authzModule/dto/authz.dto";
export * from "./modules/projectConfigModule/dto/projectConfig.dto";
export * from "./modules/actorTokenModule/dto/actorToken.dto";
export { ActorTokenQuery } from "./modules/actorTokenModule/query/actorToken.query";
export * from "./modules/signingKeyModule/dto/signingKey.dto";
export { SigningKeyQuery } from "./modules/signingKeyModule/query/signingKey.query";
export * from "./modules/roomModule/dto/room.dto";
export * from "./modules/roomModule/dto/roomActorAccess.dto";
export { RoomQuery } from "./modules/roomModule/query/room.query";
export * from "./modules/lobbyModule/dto/lobby.dto";
export { LobbyQuery } from "./modules/lobbyModule/query/lobby.query";
export * from "./modules/platformAppModule/dto/platformApp.dto";
export { PlatformAppQuery } from "./modules/platformAppModule/query/platformApp.query";
export * from "./modules/projectModule/dto/project.dto";
export { ProjectQuery } from "./modules/projectModule/query/project.query";
export {
  BaseQuery,
  BasePaginationService,
  type IBaseQuery,
  type PaginatedResult,
  type QueryOptions,
} from "./common/pagination";

export { EAccessPermission } from "./modules/actorTokenModule/enum/EAccessPermission.enum";
export { EActorTokenStatus } from "./modules/actorTokenModule/enum/EActorTokenStatus.enum";
export {
  EActorType,
  PERSISTENT_SESSION_ACTOR_TYPES,
} from "./modules/actorTokenModule/enum/EActorType.enum";
export { EAppAccessMode } from "./modules/platformAppModule/enum/EAppAccessMode.enum";
export { EAppStatus } from "./modules/platformAppModule/enum/EAppStatus.enum";
export { ERoomStatus } from "./modules/roomModule/enum/ERoomStatus.enum";
export { IsValidTopicName } from "./common/validators/isValidTopicName.validator";
export { ESigningKeyStatus } from "./modules/signingKeyModule/enum/ESigningKeyStatus.enum";
export { ESigningKeyPrefix } from "./modules/signingKeyModule/enum/ESigningKeyPrefix.enum";
export type {
  GeneratedSigningKey,
  VerifiedClientToken,
} from "./modules/signingKeyModule/signingKey.service";

/* ── Entities ───────────────────────────────────────────────────────────
 *
 * Exported so a host can write its own queries and relations against them.
 */

export { AccessScopeEntity } from "./modules/accessScopeModule/accessScope.entity";
export { ActorAppAccessEntity } from "./modules/actorTokenModule/actorAppAccess.entity";
export { ActorTokenEntity } from "./modules/actorTokenModule/actorToken.entity";
export {
  ActorTokenStateEntity,
  type IConnectionState,
} from "./modules/actorTokenModule/actorTokenState.entity";
export { LobbyEntity } from "./modules/lobbyModule/lobby.entity";
export { LobbyRoomEntity } from "./modules/lobbyModule/lobbyRoom.entity";
export { PlatformAppEntity } from "./modules/platformAppModule/platformApp.entity";
export { ProjectEntity } from "./modules/projectModule/project.entity";
export { RoomActorAccessEntity } from "./modules/roomModule/roomActorAccess.entity";
export { RoomEntity } from "./modules/roomModule/room.entity";
export { SigningKeyEntity } from "./modules/signingKeyModule/signingKey.entity";
