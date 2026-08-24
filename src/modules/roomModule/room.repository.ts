import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { RoomEntity } from "./room.entity";

@Injectable()
export class RoomRepository extends Repository<RoomEntity> {
  // Three-arg super, not `new Repository(entity, dataSource.createEntityManager())`.
  // EntityManager.withRepository re-invokes this constructor as
  // (target, manager, queryRunner), so a DataSource-shaped constructor breaks
  // the moment a facade wants this repository inside a transaction.
  constructor(
    @InjectRepository(RoomEntity)
    repository: Repository<RoomEntity>,
  ) {
    super(repository.target, repository.manager, repository.queryRunner);
  }

  findByAppId(appId: string): Promise<RoomEntity[]> {
    return this.find({
      where: { appId, deletedAt: IsNull() },
      order: { createdAt: "ASC" },
    });
  }

  findByIdAndApp(roomId: string, appId: string): Promise<RoomEntity | null> {
    return this.findOne({ where: { roomId, appId, deletedAt: IsNull() } });
  }

  findBySlugAndApp(slug: string, appId: string): Promise<RoomEntity | null> {
    return this.findOne({ where: { slug, appId, deletedAt: IsNull() } });
  }

  async slugExists(slug: string, appId: string): Promise<boolean> {
    const count = await this.count({
      where: { slug, appId, deletedAt: IsNull() },
    });
    return count > 0;
  }
}
