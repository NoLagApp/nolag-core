import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { CORE_DATA_SOURCE } from "../../core.options";
import { Repository } from "typeorm";
import { LobbyRoomEntity } from "./lobbyRoom.entity";

/**
 * Lobby membership.
 *
 * A join row with no soft delete: removing a room from a lobby is a membership
 * change, not something to keep a tombstone for, and a lingering row here would
 * keep the room in presence fan-out.
 */
@Injectable()
export class LobbyRoomRepository extends Repository<LobbyRoomEntity> {
  // Three-arg super, not `new Repository(entity, dataSource.createEntityManager())`.
  // EntityManager.withRepository re-invokes this constructor as
  // (target, manager, queryRunner), so a DataSource-shaped constructor breaks
  // the moment a facade wants this repository inside a transaction.
  constructor(
    @InjectRepository(LobbyRoomEntity, CORE_DATA_SOURCE)
    repository: Repository<LobbyRoomEntity>,
  ) {
    super(repository.target, repository.manager, repository.queryRunner);
  }

  findByLobbyId(lobbyId: string): Promise<LobbyRoomEntity[]> {
    return this.find({ where: { lobbyId } });
  }

  findByRoomId(roomId: string): Promise<LobbyRoomEntity[]> {
    return this.find({ where: { roomId } });
  }
}
