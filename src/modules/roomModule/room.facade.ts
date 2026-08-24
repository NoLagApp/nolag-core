import { Injectable, Logger } from "@nestjs/common";
import { DataSource, UpdateResult } from "typeorm";
import { PaginatedResult } from "../../common/pagination";
import { conflictException, notFoundException } from "../../utils/exceptions";
import { PlatformAppEntity } from "../platformAppModule/platformApp.entity";
import { RoomCreateDto, RoomPatchDto } from "./dto/room.dto";
import { RoomEntity } from "./room.entity";
import { RoomService } from "./room.service";
import { RoomQuery } from "./query/room.query";
import { RoomQueryService } from "./query/room.query.service";

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

  private _generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
