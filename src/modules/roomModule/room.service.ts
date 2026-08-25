import { Injectable, Logger } from "@nestjs/common";
import { EntityManager, IsNull, UpdateResult } from "typeorm";
import { badRequestException } from "../../utils/exceptions";
import { RoomCreateDto, RoomPatchDto } from "./dto/room.dto";
import { ERoomStatus } from "./enum/ERoomStatus.enum";
import { RoomEntity } from "./room.entity";
import { RoomRepository } from "./room.repository";

/**
 * Ported from Titus's `roomModule/room.service.ts`.
 *
 * Titus's static-room helpers are not here. They exist to materialise the rooms
 * declared in a blueprint, and blueprints are an app-builder feature that stays
 * in the hosted product. Core's room table has no `is_static` column for the
 * same reason.
 */
@Injectable()
export class RoomService {
  private readonly _logger = new Logger(RoomService.name);

  constructor(private readonly _repository: RoomRepository) {}

  private _repo(manager?: EntityManager) {
    return manager ? manager.getRepository(RoomEntity) : this._repository;
  }

  findByIdAndApp(
    roomId: string,
    appId: string,
    manager?: EntityManager,
  ): Promise<RoomEntity | null> {
    return this._repo(manager).findOne({
      where: { roomId, appId, deletedAt: IsNull() },
    });
  }

  findBySlugAndApp(
    slug: string,
    appId: string,
    manager?: EntityManager,
  ): Promise<RoomEntity | null> {
    return this._repo(manager).findOne({
      where: { slug, appId, deletedAt: IsNull() },
    });
  }

  listByAppId(appId: string): Promise<RoomEntity[]> {
    return this._repository.findByAppId(appId);
  }

  countByAppId(appId: string, manager?: EntityManager): Promise<number> {
    return this._repo(manager).count({
      where: { appId, deletedAt: IsNull() },
    });
  }

  async slugExists(
    slug: string,
    appId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const count = await this._repo(manager).count({
      where: { slug, appId, deletedAt: IsNull() },
    });
    return count > 0;
  }

  createRoom(
    appId: string,
    data: RoomCreateDto,
    manager?: EntityManager,
  ): Promise<RoomEntity> {
    if (!data.slug) {
      // The facade generates one from the name, so reaching here means a
      // caller bypassed it.
      throw badRequestException(this._logger, {
        errorMsgUser: "Room slug is required",
        errorMsgSystem: "RoomService:createRoom:slug_required",
      });
    }

    const entity = new RoomEntity();
    entity.appId = appId;
    entity.slug = data.slug;
    entity.name = data.name;
    entity.description = data.description ?? null;
    entity.status = ERoomStatus.Active;
    entity.topics = data.topics ?? null;
    entity.metadata = data.metadata ?? null;

    return this._repo(manager).save(entity);
  }

  /**
   * Bulk create with the slugs given rather than generated, and no conflict
   * check. Provisioning declares the slugs it wants and the app is new, so
   * there is nothing to collide with.
   */
  createStaticRooms(
    appId: string,
    rooms: Array<{
      slug: string;
      name: string;
      description?: string;
      topics?: string[];
    }>,
    manager: EntityManager,
  ): Promise<RoomEntity[]> {
    const entities = rooms.map((room) => {
      const entity = new RoomEntity();
      entity.appId = appId;
      entity.slug = room.slug;
      entity.name = room.name;
      entity.description = room.description ?? null;
      entity.status = ERoomStatus.Active;
      entity.topics = room.topics ?? null;
      return entity;
    });

    return this._repo(manager).save(entities);
  }

  updateLock(
    roomId: string,
    appId: string,
    manager: EntityManager,
  ): Promise<RoomEntity | null> {
    const alias = RoomEntity.entityName();
    return manager
      .createQueryBuilder(RoomEntity, alias)
      .where(`${alias}.roomId = :roomId AND ${alias}.appId = :appId`, {
        roomId,
        appId,
      })
      .andWhere(`${alias}.deletedAt IS NULL`)
      .setLock("pessimistic_read")
      .getOne();
  }

  async patchRoom(
    roomId: string,
    appId: string,
    data: RoomPatchDto,
    manager?: EntityManager,
  ): Promise<RoomEntity> {
    const repo = this._repo(manager);

    const entity = await repo.findOne({
      where: { roomId, appId, deletedAt: IsNull() },
    });

    if (!entity) {
      throw badRequestException(this._logger, {
        errorMsgUser: "Could not update room",
        errorMsgSystem: "RoomService:patchRoom:not_found",
      });
    }

    // `undefined` means absent, `null` means clear.
    if (data.name !== undefined) entity.name = data.name;
    if (data.description !== undefined) entity.description = data.description;
    if (data.status !== undefined) entity.status = data.status;
    if (data.topics !== undefined) entity.topics = data.topics;
    if (data.metadata !== undefined) entity.metadata = data.metadata;

    return repo.save(entity);
  }

  removeRoom(
    roomId: string,
    appId: string,
    manager?: EntityManager,
  ): Promise<UpdateResult> {
    return this._repo(manager).softDelete({
      roomId,
      appId,
      deletedAt: IsNull(),
    });
  }
}
