import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PlatformAppEntity } from "../platformAppModule/platformApp.entity";
import { RoomEntity } from "./room.entity";
import { RoomFacade } from "./room.facade";
import { RoomRepository } from "./room.repository";
import { RoomService } from "./room.service";
import { RoomActorAccessEntity } from "./roomActorAccess.entity";
import { RoomActorAccessFacade } from "./roomActorAccess.facade";
import { RoomActorAccessRepository } from "./roomActorAccess.repository";
import { RoomQueryService } from "./query/room.query.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoomEntity,
      RoomActorAccessEntity,
      PlatformAppEntity,
    ]),
  ],
  providers: [
    RoomService,
    RoomQueryService,
    RoomFacade,
    RoomActorAccessFacade,
    RoomRepository,
    RoomActorAccessRepository,
  ],
  exports: [RoomFacade, RoomActorAccessFacade],
})
export class RoomModule {}
