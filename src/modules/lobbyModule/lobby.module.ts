import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LobbyEntity } from "./lobby.entity";
import { LobbyFacade } from "./lobby.facade";
import { LobbyRepository } from "./lobby.repository";
import { LobbyService } from "./lobby.service";
import { LobbyRoomEntity } from "./lobbyRoom.entity";
import { LobbyRoomRepository } from "./lobbyRoom.repository";
import { LobbyQueryService } from "./query/lobby.query.service";

@Module({
  imports: [TypeOrmModule.forFeature([LobbyEntity, LobbyRoomEntity])],
  providers: [
    LobbyService,
    LobbyQueryService,
    LobbyFacade,
    LobbyRepository,
    LobbyRoomRepository,
  ],
  exports: [LobbyFacade],
})
export class LobbyModule {}
