import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { BaseTimeEntity } from "../../common/entities/base.entity";
import { RoomEntity } from "../roomModule/room.entity";
import { LobbyEntity } from "./lobby.entity";

const entityName = "lobby_room";

/**
 * LobbyRoom Entity (junction)
 *
 * Links rooms to lobbies. A room may belong to several lobbies and a lobby may
 * contain several rooms. The inherited createdAt records when the room joined.
 */
@Entity(entityName)
@Index(["lobbyId", "roomId"], { unique: true })
@Index(["roomId"]) // lookup lobbies by room, which is the direction presence goes
export class LobbyRoomEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "lobby_id" })
  lobbyId: string;

  @PrimaryColumn({ type: "uuid", name: "room_id" })
  roomId: string;

  // Relations
  @ManyToOne(() => LobbyEntity, (lobby) => lobby.lobbyRooms, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "lobby_id" })
  lobby!: LobbyEntity;

  @ManyToOne(() => RoomEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "room_id" })
  room!: RoomEntity;
}
