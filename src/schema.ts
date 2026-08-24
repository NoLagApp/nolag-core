import type { MigrationInterface } from "typeorm";
import { InitialSchema1786323955167 } from "./migrations/1786323955167-InitialSchema";

/** What TypeORM accepts in `DataSourceOptions.migrations`. */
type MigrationClass = new (...args: never[]) => MigrationInterface;
import { AccessScopeEntity } from "./modules/accessScopeModule/accessScope.entity";
import { ActorAppAccessEntity } from "./modules/actorTokenModule/actorAppAccess.entity";
import { ActorTokenEntity } from "./modules/actorTokenModule/actorToken.entity";
import { ActorTokenStateEntity } from "./modules/actorTokenModule/actorTokenState.entity";
import { LobbyEntity } from "./modules/lobbyModule/lobby.entity";
import { LobbyRoomEntity } from "./modules/lobbyModule/lobbyRoom.entity";
import { PlatformAppEntity } from "./modules/platformAppModule/platformApp.entity";
import { ProjectEntity } from "./modules/projectModule/project.entity";
import { RoomActorAccessEntity } from "./modules/roomModule/roomActorAccess.entity";
import { RoomEntity } from "./modules/roomModule/room.entity";
import { SigningKeyEntity } from "./modules/signingKeyModule/signingKey.entity";

/**
 * Everything core needs in the host's DataSource.
 *
 * Listed explicitly rather than discovered. A host that finds entities with a
 * glob relative to its own source will never look inside node_modules, so a
 * glob here would work in this repository and fail in every consumer, which is
 * the worst kind of bug to ship.
 */
export const coreEntities = [
  ProjectEntity,
  PlatformAppEntity,
  RoomEntity,
  RoomActorAccessEntity,
  LobbyEntity,
  LobbyRoomEntity,
  AccessScopeEntity,
  ActorTokenEntity,
  ActorTokenStateEntity,
  ActorAppAccessEntity,
  SigningKeyEntity,
];

/**
 * Creates core's schema from empty.
 *
 * Kept separate from {@link coreMigrations} because the two audiences differ. A
 * fresh deployment runs both. A host whose database already carries these
 * tables, because it owned them before core existed, records this one as
 * applied without running it and then runs only the incremental set.
 */
export const coreInitialMigrations: MigrationClass[] = [
  InitialSchema1786323955167,
];

/**
 * Everything after the initial schema. Empty until core's first schema change.
 */
export const coreMigrations: MigrationClass[] = [];

/** Convenience for a greenfield host: the whole history, in order. */
export const allCoreMigrations = [...coreInitialMigrations, ...coreMigrations];
