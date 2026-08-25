import { InjectDataSource } from "@nestjs/typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { DataSource, EntityManager, UpdateResult } from "typeorm";
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
    @InjectDataSource()
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

  /**
   * Provision the lobbies an app declares up front, wiring each lobby's room
   * slug list to rooms created in the same pass. A slug that matches no room
   * is logged and skipped rather than failing provisioning, since the rooms
   * are the useful half and a missing lobby membership is repairable.
   *
   * Pass a manager to join a caller's transaction. It must belong to core's
   * own DataSource; a manager from another connection has no metadata for
   * these entities.
   */
  async createStaticLobbiesFromConfig(
    appId: string,
    lobbies: Array<{
      slug: string;
      name: string;
      description?: string;
      rooms?: string[];
    }>,
    createdRooms: Array<{ roomId: string; slug: string }>,
    manager?: EntityManager,
  ): Promise<LobbyEntity[]> {
    const run = async (m: EntityManager): Promise<LobbyEntity[]> => {
      const created = await this._service.createStaticLobbies(
        appId,
        lobbies,
        m,
      );

      const roomsBySlug = new Map(createdRooms.map((r) => [r.slug, r]));

      for (let i = 0; i < created.length; i++) {
        const lobby = created[i];
        for (const slug of lobbies[i]?.rooms ?? []) {
          const room = roomsBySlug.get(slug);
          if (!room) {
            this._logger.warn(
              `createStaticLobbiesFromConfig: lobby "${lobby.slug}" references unknown room slug "${slug}", skipping`,
            );
            continue;
          }
          await this._service.addRoomToLobby(lobby.lobbyId, room.roomId, m);
        }
      }

      return created;
    };

    return manager ? run(manager) : this._dataSource.transaction(run);
  }

  /**
   * Resolve a lobby slug to its id without app context. The broker reaches
   * the lobby by slug alone, so this searches across apps.
   */
  async resolveLobbySlug(slug: string): Promise<string | null> {
    const lobby = await this._service.findBySlug(slug);
    return lobby?.lobbyId ?? null;
  }

  private _generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
