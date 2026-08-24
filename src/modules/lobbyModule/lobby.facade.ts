import { Injectable, Logger } from "@nestjs/common";
import { DataSource, UpdateResult } from "typeorm";
import { PaginatedResult } from "../../common/pagination";
import { TtlCache } from "../../common/utils/ttlCache";
import {
  badRequestException,
  conflictException,
  notFoundException,
} from "../../utils/exceptions";
import { LobbyCreateDto, LobbyPatchDto } from "./dto/lobby.dto";
import { LobbyEntity } from "./lobby.entity";
import { LobbyRoomEntity } from "./lobbyRoom.entity";
import { LobbyService } from "./lobby.service";
import { LobbyQuery } from "./query/lobby.query";
import { LobbyQueryService } from "./query/lobby.query.service";

/**
 * A lobby is a set of rooms that share presence, so a client can watch who is
 * where across all of them with one subscription.
 *
 * The cap matters: presence fan-out is per lobby per room, so an unbounded
 * membership turns one presence update into an unbounded number of deliveries.
 */
const MAX_LOBBIES_PER_ROOM = 10;

/** Membership changes rarely and is read on every connect. */
const MEMBERSHIP_CACHE_TTL_MS = 120_000;

@Injectable()
export class LobbyFacade {
  private readonly _logger = new Logger(LobbyFacade.name);
  private readonly _lobbiesForRoomCache = new TtlCache<LobbyRoomEntity[]>(
    MEMBERSHIP_CACHE_TTL_MS,
  );
  private readonly _lobbyRoomsCache = new TtlCache<LobbyRoomEntity[]>(
    MEMBERSHIP_CACHE_TTL_MS,
  );

  constructor(
    private readonly _service: LobbyService,
    private readonly _queryService: LobbyQueryService,
    private readonly _dataSource: DataSource,
  ) {}

  listLobbies(
    appId: string,
    query: LobbyQuery,
  ): Promise<PaginatedResult<LobbyEntity>> {
    return this._queryService.findPaginated(query, appId);
  }

  async getLobby(lobbyId: string, appId: string): Promise<LobbyEntity> {
    const lobby = await this._service.findByIdAndApp(lobbyId, appId);
    if (!lobby) {
      throw notFoundException(this._logger, {
        errorMsgUser: `Lobby ${lobbyId} not found`,
      });
    }
    return lobby;
  }

  async getLobbyBySlug(slug: string, appId: string): Promise<LobbyEntity> {
    const lobby = await this._service.findBySlugAndApp(slug, appId);
    if (!lobby) {
      throw notFoundException(this._logger, {
        errorMsgUser: `Lobby "${slug}" not found`,
      });
    }
    return lobby;
  }

  createLobby(appId: string, data: LobbyCreateDto): Promise<LobbyEntity> {
    return this._dataSource.transaction(async (manager) => {
      const slug = data.slug ?? this._generateSlug(data.name);

      const exists = await this._service.slugExists(slug, appId, manager);
      if (exists) {
        throw conflictException(this._logger, {
          errorMsgUser: `Lobby with slug "${slug}" already exists`,
        });
      }

      return this._service.createLobby(appId, { ...data, slug }, manager);
    });
  }

  updateLobby(
    lobbyId: string,
    appId: string,
    data: LobbyPatchDto,
  ): Promise<LobbyEntity> {
    return this._dataSource.transaction(async (manager) => {
      const existing = await this._service.updateLock(lobbyId, appId, manager);
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Lobby ${lobbyId} not found`,
        });
      }

      return this._service.patchLobby(existing, data, manager);
    });
  }

  async deleteLobby(lobbyId: string, appId: string): Promise<UpdateResult> {
    const result = await this._dataSource.transaction(async (manager) => {
      const existing = await this._service.updateLock(lobbyId, appId, manager);
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Lobby ${lobbyId} not found`,
        });
      }

      return this._service.removeLobby(lobbyId, appId, manager);
    });

    // Membership rows outlive the lobby row, so the caches would keep serving
    // a deleted lobby's rooms for two minutes.
    this._lobbyRoomsCache.delete(lobbyId);
    this._lobbiesForRoomCache.clear();

    return result;
  }

  /* ── Membership ─────────────────────────────────────────────────────── */

  async listLobbyRooms(
    lobbyId: string,
    appId: string,
  ): Promise<LobbyRoomEntity[]> {
    // Scoped by app first, so an id from another app 404s rather than listing.
    await this.getLobby(lobbyId, appId);
    return this._service.listLobbyRooms(lobbyId);
  }

  async addRoomToLobby(
    lobbyId: string,
    roomId: string,
    appId: string,
  ): Promise<LobbyRoomEntity> {
    const result = await this._dataSource.transaction(async (manager) => {
      const check = await this._service.validateAddRoomToLobby(
        lobbyId,
        roomId,
        appId,
        manager,
      );

      if (!check.lobbyExists) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Lobby ${lobbyId} not found`,
        });
      }

      if (!check.roomExists) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Room ${roomId} not found in this app`,
        });
      }

      if (check.alreadyInLobby) {
        throw conflictException(this._logger, {
          errorMsgUser: `Room ${roomId} is already in lobby ${lobbyId}`,
        });
      }

      if (check.lobbyCountForRoom >= MAX_LOBBIES_PER_ROOM) {
        throw badRequestException(this._logger, {
          errorMsgUser:
            `Room ${roomId} is already in ${MAX_LOBBIES_PER_ROOM} lobbies, ` +
            `which is the maximum.`,
        });
      }

      return this._service.addRoomToLobby(lobbyId, roomId, manager);
    });

    this._lobbiesForRoomCache.delete(roomId);
    this._lobbyRoomsCache.delete(lobbyId);

    return result;
  }

  async removeRoomFromLobby(
    lobbyId: string,
    roomId: string,
    appId: string,
  ): Promise<void> {
    await this._dataSource.transaction(async (manager) => {
      const lobby = await this._service.findByIdAndApp(lobbyId, appId, manager);
      if (!lobby) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Lobby ${lobbyId} not found`,
        });
      }

      await this._service.removeRoomFromLobby(lobbyId, roomId, manager);
    });

    this._lobbiesForRoomCache.delete(roomId);
    this._lobbyRoomsCache.delete(lobbyId);
  }

  /**
   * Which lobbies a room belongs to. Cached, because this is read on the
   * connect path and membership almost never changes.
   */
  async findLobbiesForRoom(roomId: string): Promise<LobbyRoomEntity[]> {
    const cached = this._lobbiesForRoomCache.get(roomId);
    if (cached) {
      return cached;
    }

    const rows = await this._service.findLobbiesForRoom(roomId);
    this._lobbiesForRoomCache.set(roomId, rows);
    return rows;
  }

  /** Membership without the app check, for callers that already did one. */
  async listLobbyRoomsCached(lobbyId: string): Promise<LobbyRoomEntity[]> {
    const cached = this._lobbyRoomsCache.get(lobbyId);
    if (cached) {
      return cached;
    }

    const rows = await this._service.listLobbyRooms(lobbyId);
    this._lobbyRoomsCache.set(lobbyId, rows);
    return rows;
  }

  private _generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
