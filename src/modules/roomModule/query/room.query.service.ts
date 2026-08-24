import { Injectable } from "@nestjs/common";
import {
  BasePaginationService,
  PaginatedResult,
} from "../../../common/pagination";
import { RoomEntity } from "../room.entity";
import { RoomRepository } from "../room.repository";
import { RoomQuery } from "./room.query";

@Injectable()
export class RoomQueryService extends BasePaginationService {
  constructor(private readonly _repository: RoomRepository) {
    super();
  }

  findPaginated(
    query: RoomQuery,
    appId: string,
  ): Promise<PaginatedResult<RoomEntity>> {
    const alias = RoomEntity.entityName();
    const qb = this._repository.createQueryBuilder(alias);

    qb.where(`${alias}.deletedAt IS NULL`);
    qb.andWhere(`${alias}.appId = :appId`, { appId });

    if (query.name) {
      qb.andWhere(`${alias}.name ILIKE :name`, { name: `%${query.name}%` });
    }

    if (query.slug) {
      qb.andWhere(`${alias}.slug = :slug`, { slug: query.slug });
    }

    if (query.status) {
      qb.andWhere(`${alias}.status = :status`, { status: query.status });
    }

    qb.orderBy(`${alias}.createdAt`, "ASC");

    return this.paginate(qb, query);
  }
}
