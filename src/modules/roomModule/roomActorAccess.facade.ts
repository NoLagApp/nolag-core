import { InjectDataSource } from "@nestjs/typeorm";
import { CORE_DATA_SOURCE } from "../../core.options";
import { Injectable, Logger } from "@nestjs/common";
import { DataSource, IsNull } from "typeorm";
import { EActorType } from "../actorTokenModule/enum/EActorType.enum";
import {
  badRequestException,
  conflictException,
  notFoundException,
} from "../../utils/exceptions";
import {
  RoomActorAccessCreateDto,
  RoomActorAccessUpdateDto,
} from "./dto/roomActorAccess.dto";
import { RoomActorAccessEntity } from "./roomActorAccess.entity";
import { RoomActorAccessRepository } from "./roomActorAccess.repository";

/**
 * Room-level grants: who may reach a room, and on which of its topics.
 *
 * Ported from Titus's `roomModule/roomActorAccess.facade.ts`. Titus keeps the
 * same duplicate checks in both its service and its facade; here they live in
 * the facade only, since that is where the transaction is and two copies of a
 * uniqueness rule is how they drift.
 */
@Injectable()
export class RoomActorAccessFacade {
  private readonly _logger = new Logger(RoomActorAccessFacade.name);

  constructor(
    private readonly _repository: RoomActorAccessRepository,
    @InjectDataSource(CORE_DATA_SOURCE)
    private readonly _dataSource: DataSource,
  ) {}

  listByRoomId(roomId: string): Promise<RoomActorAccessEntity[]> {
    return this._repository.findByRoomId(roomId);
  }

  listByActorTokenId(actorTokenId: string): Promise<RoomActorAccessEntity[]> {
    return this._repository.findByActorTokenId(actorTokenId);
  }

  async getById(roomActorAccessId: string): Promise<RoomActorAccessEntity> {
    const grant = await this._repository.findById(roomActorAccessId);
    if (!grant) {
      throw notFoundException(this._logger, {
        errorMsgUser: `Room grant ${roomActorAccessId} not found`,
      });
    }
    return grant;
  }

  // `async` matters: the validation below throws before the transaction
  // starts, and a synchronous throw from a Promise-returning method escapes
  // every caller that reasonably expects a rejection.
  async create(
    roomId: string,
    dto: RoomActorAccessCreateDto,
  ): Promise<RoomActorAccessEntity> {
    // Exactly one target. Neither means the grant applies to nobody; both
    // means it is ambiguous which rule wins during resolution.
    if (!dto.actorTokenId && !dto.actorType) {
      throw badRequestException(this._logger, {
        errorMsgUser: "Either actorTokenId or actorType must be provided.",
      });
    }
    if (dto.actorTokenId && dto.actorType) {
      throw badRequestException(this._logger, {
        errorMsgUser:
          "Provide actorTokenId or actorType, not both. A grant targets one " +
          "named actor or one type.",
      });
    }

    return this._dataSource.transaction(async (manager) => {
      // Queried through the manager rather than the repository: TypeORM's
      // withRepository re-invokes a custom repository's constructor as
      // (target, manager, queryRunner), which this one cannot absorb. Going
      // direct also keeps the read inside the transaction, which is the whole
      // point of the duplicate check.
      const existing = await manager.findOne(RoomActorAccessEntity, {
        where: dto.actorTokenId
          ? { actorTokenId: dto.actorTokenId, roomId, deletedAt: IsNull() }
          : { actorType: dto.actorType, roomId, deletedAt: IsNull() },
      });

      if (existing) {
        throw conflictException(this._logger, {
          errorMsgUser:
            "That actor already has a grant on this room. Update it instead.",
        });
      }

      const entity = new RoomActorAccessEntity();
      entity.roomId = roomId;
      entity.actorTokenId = dto.actorTokenId ?? null;
      entity.actorType = dto.actorType ?? null;
      entity.permission = dto.permission;
      entity.topics = dto.topics ?? null;
      entity.isActive = dto.isActive ?? true;
      entity.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
      entity.role = dto.role ?? null;
      entity.metadata = dto.metadata ?? null;

      return manager.save(RoomActorAccessEntity, entity);
    });
  }

  update(
    roomActorAccessId: string,
    dto: RoomActorAccessUpdateDto,
  ): Promise<RoomActorAccessEntity> {
    return this._dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(RoomActorAccessEntity, {
        where: { roomActorAccessId, deletedAt: IsNull() },
      });
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Room grant ${roomActorAccessId} not found`,
        });
      }

      // Field by field, never Object.assign: a grant is an authorization
      // record, and mass assignment here would let a caller set the target.
      if (dto.permission !== undefined) existing.permission = dto.permission;
      if (dto.topics !== undefined) existing.topics = dto.topics;
      if (dto.isActive !== undefined) existing.isActive = dto.isActive;
      if (dto.expiresAt !== undefined) {
        existing.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
      }
      if (dto.role !== undefined) existing.role = dto.role;
      if (dto.metadata !== undefined) existing.metadata = dto.metadata;

      return manager.save(RoomActorAccessEntity, existing);
    });
  }

  async delete(roomActorAccessId: string): Promise<void> {
    await this._dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(RoomActorAccessEntity, {
        where: { roomActorAccessId, deletedAt: IsNull() },
      });
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Room grant ${roomActorAccessId} not found`,
        });
      }

      // Soft delete, so a grant that mattered stays auditable.
      await manager.softDelete(RoomActorAccessEntity, { roomActorAccessId });
    });
  }

  hasAccess(
    actorTokenId: string,
    roomId: string,
    actorType?: EActorType,
  ): Promise<boolean> {
    return this._repository.hasAccess(actorTokenId, roomId, actorType);
  }

  /** A room with any grant at all is private to its grant holders. */
  isPrivateRoom(roomId: string): Promise<boolean> {
    return this._repository.isPrivateRoom(roomId);
  }
}
