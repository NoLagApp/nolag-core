import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccessScopeEntity } from "../accessScopeModule/accessScope.entity";
import { ActorAppAccessEntity } from "../actorTokenModule/actorAppAccess.entity";
import { ActorTokenEntity } from "../actorTokenModule/actorToken.entity";
import { ActorTokenModule } from "../actorTokenModule/actorToken.module";
import { ActorTokenStateEntity } from "../actorTokenModule/actorTokenState.entity";
import { LobbyEntity } from "../lobbyModule/lobby.entity";
import { LobbyRoomEntity } from "../lobbyModule/lobbyRoom.entity";
import { PlatformAppEntity } from "../platformAppModule/platformApp.entity";
import { ProjectEntity } from "../projectModule/project.entity";
import { RoomEntity } from "../roomModule/room.entity";
import { RoomActorAccessEntity } from "../roomModule/roomActorAccess.entity";
import { SigningKeyModule } from "../signingKeyModule/signingKey.module";
import { AuthzFacade } from "./authz.facade";
import { AuthzService } from "./authz.service";

/**
 * Everything this module depends on is either its own domain or authentication.
 * It knows nothing about organizations, users, billing, plans, metering or
 * broker fleet management, and it must stay that way: the moment authorization
 * reads billing state, the service stops being runnable on its own.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
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
    ]),
    ActorTokenModule,
    SigningKeyModule,
  ],
  providers: [AuthzService, AuthzFacade],
  exports: [AuthzFacade],
})
export class AuthzModule {}
