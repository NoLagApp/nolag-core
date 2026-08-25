import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { EActorType } from "../actorTokenModule/enum/EActorType.enum";
import { RoomActorAccessEntity } from "./roomActorAccess.entity";

/**
 * Room-level grants.
 *
 * Every read filters `deletedAt IS NULL` explicitly rather than relying on
 * TypeORM's soft-delete default. The default only applies to some query paths,
 * and a resurrected grant here silently widens what an actor can reach.
 */
@Injectable()
export class RoomActorAccessRepository extends Repository<RoomActorAccessEntity> {
  // Three-arg super, not `new Repository(entity, dataSource.createEntityManager())`.
  // EntityManager.withRepository re-invokes this constructor as
  // (target, manager, queryRunner), so a DataSource-shaped constructor breaks
  // the moment a facade wants this repository inside a transaction.
  constructor(
    @InjectRepository(RoomActorAccessEntity)
    repository: Repository<RoomActorAccessEntity>,
  ) {
    super(repository.target, repository.manager, repository.queryRunner);
  }

  findByRoomId(roomId: string): Promise<RoomActorAccessEntity[]> {
    return this.find({
      where: { roomId, deletedAt: IsNull() },
      order: { createdAt: "DESC" },
    });
  }

  findByActorTokenId(actorTokenId: string): Promise<RoomActorAccessEntity[]> {
    return this.find({
      where: { actorTokenId, deletedAt: IsNull() },
      order: { createdAt: "DESC" },
    });
  }

  findByActorAndRoom(
    actorTokenId: string,
    roomId: string,
  ): Promise<RoomActorAccessEntity | null> {
    return this.findOne({
      where: { actorTokenId, roomId, deletedAt: IsNull() },
    });
  }

  findByActorTypeAndRoom(
    actorType: EActorType,
    roomId: string,
  ): Promise<RoomActorAccessEntity | null> {
    return this.findOne({
      where: { actorType, roomId, deletedAt: IsNull() },
    });
  }

  findById(roomActorAccessId: string): Promise<RoomActorAccessEntity | null> {
    return this.findOne({
      where: { roomActorAccessId, deletedAt: IsNull() },
    });
  }

  /**
   * Does the room carry any grant at all?
   *
   * This is the switch that makes a room private. A room with no grants is
   * reachable by anyone the app admits; adding a single grant restricts it to
   * grant holders. Counting inactive grants too is deliberate: disabling every
   * grant on a private room must not quietly reopen it to everyone.
   */
  async isPrivateRoom(roomId: string): Promise<boolean> {
    const count = await this.count({ where: { roomId, deletedAt: IsNull() } });
    return count > 0;
  }

  async hasAccess(
    actorTokenId: string,
    roomId: string,
    actorType?: EActorType,
  ): Promise<boolean> {
    const named = await this.count({
      where: { actorTokenId, roomId, isActive: true, deletedAt: IsNull() },
    });
    if (named > 0) {
      return true;
    }

    if (actorType) {
      const byType = await this.count({
        where: { actorType, roomId, isActive: true, deletedAt: IsNull() },
      });
      if (byType > 0) {
        return true;
      }
    }

    return false;
  }

  countByRoomId(roomId: string): Promise<number> {
    return this.count({ where: { roomId, deletedAt: IsNull() } });
  }
}
