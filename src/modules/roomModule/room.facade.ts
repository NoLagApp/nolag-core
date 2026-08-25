import { InjectDataSource } from "@nestjs/typeorm";
import { CORE_DATA_SOURCE } from "../../core.options";
import { Injectable, Logger } from "@nestjs/common";
import { DataSource, EntityManager, UpdateResult } from "typeorm";
import { PaginatedResult } from "../../common/pagination";
import {
  badRequestException,
  conflictException,
  notFoundException,
} from "../../utils/exceptions";
import { PlatformAppEntity } from "../platformAppModule/platformApp.entity";
import { RoomCreateDto, RoomPatchDto } from "./dto/room.dto";
import { RoomEntity } from "./room.entity";
import { RoomService } from "./room.service";
import { RoomQuery } from "./query/room.query";
import { RoomQueryService } from "./query/room.query.service";

/**
 * How many rooms one app may hold when they are being created at runtime.
 *
 * A guard against a typo'd slug in a loop, not a product limit. The caller can
 * raise it.
 */
const DEFAULT_ROOM_CAP = 1000;

/** WebRTC signalling, opt-in per room. Colons because a slash separates parts. */
const WEBRTC_TOPICS = [
  "webrtc:offer",
  "webrtc:answer",
  "webrtc:candidate",
  "webrtc:state",
];

/**
 * Ported from Titus's `roomModule/room.facade.ts`.
 *
 * Two of Titus's methods are absent, both deliberately:
 *
 * - the static-room helpers, which materialise a blueprint's declared rooms
 * - `ensureRoom`, which provisions a room on demand when `app.config
 *   .autoProvisionRooms` is set. Core's app has no `config` column, because
 *   that column belongs to the app builder.
 *
 * Rooms are otherwise never created implicitly. The broker refuses an unknown
 * room loudly rather than inventing one, which is what makes a typo'd slug a
 * visible error instead of a silently separate room nobody else can see.
 */
@Injectable()
export class RoomFacade {
  private readonly _logger = new Logger(RoomFacade.name);

  constructor(
    private readonly _service: RoomService,
    private readonly _queryService: RoomQueryService,
    @InjectDataSource(CORE_DATA_SOURCE)
    private readonly _dataSource: DataSource,
  ) {}

  list(appId: string, query: RoomQuery): Promise<PaginatedResult<RoomEntity>> {
    return this._queryService.findPaginated(query, appId);
  }

  listAll(appId: string): Promise<RoomEntity[]> {
    return this._service.listByAppId(appId);
  }

  async getRoom(roomId: string, appId: string): Promise<RoomEntity> {
    const room = await this._service.findByIdAndApp(roomId, appId);
    if (!room) {
      throw notFoundException(this._logger, {
        errorMsgUser: `Room ${roomId} not found`,
      });
    }
    return room;
  }

  async getRoomBySlug(slug: string, appId: string): Promise<RoomEntity> {
    const room = await this._service.findBySlugAndApp(slug, appId);
    if (!room) {
      throw notFoundException(this._logger, {
        errorMsgUser: `Room "${slug}" not found`,
      });
    }
    return room;
  }

  /**
   * Topics are inherited from the app when the caller does not name any.
   *
   * That inheritance is a convenience for the stored row only. Authorization
   * reads the app's topic list, never the room's, so a room whose list drifts
   * from its app does not widen or narrow what anyone can reach.
   */
  createRoom(appId: string, data: RoomCreateDto): Promise<RoomEntity> {
    return this._dataSource.transaction(async (manager) => {
      const slug = data.slug ?? this._generateSlug(data.name);

      const exists = await this._service.slugExists(slug, appId, manager);
      if (exists) {
        throw conflictException(this._logger, {
          errorMsgUser: `Room with slug "${slug}" already exists`,
        });
      }

      let topics = data.topics;
      if (!topics || topics.length === 0) {
        const app = await manager.findOne(PlatformAppEntity, {
          where: { appId },
          select: ["topics"],
        });
        topics = app?.topics ?? undefined;
      }

      if (data.enableWebRTC) {
        topics = [...new Set([...(topics ?? []), ...WEBRTC_TOPICS])];
      }

      return this._service.createRoom(
        appId,
        { ...data, slug, topics },
        manager,
      );
    });
  }

  /**
   * Create a room if it is not already there, under a cap.
   *
   * For per-entity rooms created at runtime: one per match, per device, per
   * order. The caller decides *whether* runtime provisioning is allowed for
   * this app, because that is deployment policy and core has no column for it.
   * What core owns is doing it safely: idempotent on the slug, capped so a
   * typo'd loop cannot fill the table, and racing safely against a concurrent
   * creator.
   *
   * Rooms are never created implicitly on the data path. The broker refuses an
   * unknown room loudly, which is what makes a typo a visible error rather than
   * a silently separate room nobody else can see.
   */
  async ensureRoom(
    appId: string,
    data: RoomCreateDto,
    maxRooms = DEFAULT_ROOM_CAP,
  ): Promise<RoomEntity> {
    const slug = data.slug ?? this._generateSlug(data.name);

    const existing = await this._service.findBySlugAndApp(slug, appId);
    if (existing) {
      return existing;
    }

    const count = await this._service.countByAppId(appId);
    if (count >= maxRooms) {
      throw badRequestException(this._logger, {
        errorMsgUser: `App ${appId} has reached its room cap (${maxRooms})`,
      });
    }

    try {
      return await this.createRoom(appId, { ...data, slug });
    } catch (error) {
      // Lost a creation race. The partial unique index rejected the insert, so
      // the room now exists and returning it is the idempotent answer.
      const raced = await this._service.findBySlugAndApp(slug, appId);
      if (raced) {
        return raced;
      }
      throw error;
    }
  }

  updateRoom(
    roomId: string,
    appId: string,
    data: RoomPatchDto,
  ): Promise<RoomEntity> {
    return this._dataSource.transaction(async (manager) => {
      const existing = await this._service.updateLock(roomId, appId, manager);
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Room ${roomId} not found`,
        });
      }

      return this._service.patchRoom(roomId, appId, data, manager);
    });
  }

  deleteRoom(roomId: string, appId: string): Promise<UpdateResult> {
    return this._dataSource.transaction(async (manager) => {
      const existing = await this._service.updateLock(roomId, appId, manager);
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Room ${roomId} not found`,
        });
      }

      return this._service.removeRoom(roomId, appId, manager);
    });
  }

  /**
   * Provision the rooms an app declares up front. No slug generation and no
   * room cap: the slugs come from a declaration, and the cap exists to bound
   * runtime creation by connected clients, not provisioning.
   *
   * Pass a manager to join a caller's transaction. It must belong to core's
   * own DataSource; a manager from another connection has no metadata for
   * these entities.
   */
  createStaticRoomsFromConfig(
    appId: string,
    rooms: Array<{
      slug: string;
      name: string;
      description?: string;
      topics?: string[];
    }>,
    manager?: EntityManager,
  ): Promise<RoomEntity[]> {
    if (manager) {
      return this._service.createStaticRooms(appId, rooms, manager);
    }
    return this._dataSource.transaction((m) =>
      this._service.createStaticRooms(appId, rooms, m),
    );
  }

  private _generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
