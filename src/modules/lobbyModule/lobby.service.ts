import { Injectable, Logger } from "@nestjs/common";
import { EntityManager, IsNull, UpdateResult } from "typeorm";
import { badRequestException } from "../../utils/exceptions";
import { LobbyCreateDto, LobbyPatchDto } from "./dto/lobby.dto";
import { LobbyEntity } from "./lobby.entity";
import { LobbyRepository } from "./lobby.repository";
import { LobbyRoomEntity } from "./lobbyRoom.entity";
import { LobbyRoomRepository } from "./lobbyRoom.repository";

/**
 * Ported from Titus's `lobbyModule/lobby.service.ts`, without the
 * static-lobby helpers, which materialise a blueprint's declared lobbies.
 */
@Injectable()
export class LobbyService {
  private readonly _logger = new Logger(LobbyService.name);

  constructor(
    private readonly _lobbyRepository: LobbyRepository,
    private readonly _lobbyRoomRepository: LobbyRoomRepository,
  ) {}

  private _lobbies(manager?: EntityManager) {
    return manager ? manager.getRepository(LobbyEntity) : this._lobbyRepository;
  }

  private _members(manager?: EntityManager) {
    return manager
      ? manager.getRepository(LobbyRoomEntity)
      : this._lobbyRoomRepository;
  }

  findByIdAndApp(
    lobbyId: string,
    appId: string,
    manager?: EntityManager,
  ): Promise<LobbyEntity | null> {
    return this._lobbies(manager).findOne({
      where: { lobbyId, appId, deletedAt: IsNull() },
    });
  }

  findBySlugAndApp(
    slug: string,
    appId: string,
    manager?: EntityManager,
  ): Promise<LobbyEntity | null> {
    return this._lobbies(manager).findOne({
      where: { slug, appId, deletedAt: IsNull() },
    });
  }

  listByAppId(appId: string): Promise<LobbyEntity[]> {
    return this._lobbyRepository.findByAppId(appId);
  }

  async slugExists(
    slug: string,
    appId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const count = await this._lobbies(manager).count({
      where: { slug, appId, deletedAt: IsNull() },
    });
    return count > 0;
  }

  createLobby(
    appId: string,
    data: LobbyCreateDto,
    manager?: EntityManager,
  ): Promise<LobbyEntity> {
    if (!data.slug) {
      throw badRequestException(this._logger, {
        errorMsgUser: "Lobby slug is required",
        errorMsgSystem: "LobbyService:createLobby:slug_required",
      });
    }

    const entity = new LobbyEntity();
    entity.appId = appId;
    entity.slug = data.slug;
    entity.name = data.name;
    entity.description = data.description ?? null;
    entity.metadata = data.metadata ?? null;

    return this._lobbies(manager).save(entity);
  }

  updateLock(
    lobbyId: string,
    appId: string,
    manager: EntityManager,
  ): Promise<LobbyEntity | null> {
    const alias = LobbyEntity.entityName();
    return manager
      .createQueryBuilder(LobbyEntity, alias)
      .where(`${alias}.lobbyId = :lobbyId AND ${alias}.appId = :appId`, {
        lobbyId,
        appId,
      })
      .andWhere(`${alias}.deletedAt IS NULL`)
      .setLock("pessimistic_read")
      .getOne();
  }

  patchLobby(
    existing: LobbyEntity,
    data: LobbyPatchDto,
    manager: EntityManager,
  ): Promise<LobbyEntity> {
    if (data.name !== undefined) existing.name = data.name;
    if (data.description !== undefined) existing.description = data.description;
    if (data.metadata !== undefined) existing.metadata = data.metadata;

    return manager.save(LobbyEntity, existing);
  }

  removeLobby(
    lobbyId: string,
    appId: string,
    manager?: EntityManager,
  ): Promise<UpdateResult> {
    return this._lobbies(manager).softDelete({
      lobbyId,
      appId,
      deletedAt: IsNull(),
    });
  }

  /**
   * Every precondition for adding a room to a lobby, in one round trip.
   *
   * Four separate queries would each be correct and the set of them still
   * wrong, because another writer can move between them. One statement inside
   * the caller's transaction sees one consistent snapshot.
   */
  async validateAddRoomToLobby(
    lobbyId: string,
    roomId: string,
    appId: string,
    manager: EntityManager,
  ): Promise<{
    lobbyExists: boolean;
    roomExists: boolean;
    alreadyInLobby: boolean;
    lobbyCountForRoom: number;
  }> {
    const rows = await manager.query<
      {
        lobby_exists: number;
        room_exists: number;
        already_in_lobby: number;
        lobby_count_for_room: number;
      }[]
    >(
      `SELECT
        (SELECT COUNT(*)::int FROM lobby WHERE lobby_id = $1 AND app_id = $3 AND deleted_at IS NULL) AS lobby_exists,
        (SELECT COUNT(*)::int FROM room WHERE room_id = $2 AND app_id = $3 AND deleted_at IS NULL) AS room_exists,
        (SELECT COUNT(*)::int FROM lobby_room WHERE lobby_id = $1 AND room_id = $2) AS already_in_lobby,
        (SELECT COUNT(*)::int FROM lobby_room WHERE room_id = $2) AS lobby_count_for_room`,
      [lobbyId, roomId, appId],
    );

    const row = rows[0];
    return {
      lobbyExists: row.lobby_exists > 0,
      roomExists: row.room_exists > 0,
      alreadyInLobby: row.already_in_lobby > 0,
      lobbyCountForRoom: row.lobby_count_for_room,
    };
  }

  /* ── Membership ─────────────────────────────────────────────────────── */

  listLobbyRooms(lobbyId: string): Promise<LobbyRoomEntity[]> {
    return this._lobbyRoomRepository.findByLobbyId(lobbyId);
  }

  findLobbiesForRoom(roomId: string): Promise<LobbyRoomEntity[]> {
    return this._lobbyRoomRepository.findByRoomId(roomId);
  }

  countLobbiesForRoom(
    roomId: string,
    manager?: EntityManager,
  ): Promise<number> {
    return this._members(manager).count({ where: { roomId } });
  }

  addRoomToLobby(
    lobbyId: string,
    roomId: string,
    manager?: EntityManager,
  ): Promise<LobbyRoomEntity> {
    const entity = new LobbyRoomEntity();
    entity.lobbyId = lobbyId;
    entity.roomId = roomId;

    return this._members(manager).save(entity);
  }

  async roomInLobby(
    lobbyId: string,
    roomId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const count = await this._members(manager).count({
      where: { lobbyId, roomId },
    });
    return count > 0;
  }

  async removeRoomFromLobby(
    lobbyId: string,
    roomId: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this._members(manager).delete({ lobbyId, roomId });
  }
}
