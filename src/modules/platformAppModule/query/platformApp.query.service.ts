import { Injectable } from "@nestjs/common";
import {
  BasePaginationService,
  PaginatedResult,
} from "../../../common/pagination";
import { PlatformAppEntity } from "../platformApp.entity";
import { PlatformAppRepository } from "../platformApp.repository";
import { PlatformAppQuery } from "./platformApp.query";

@Injectable()
export class PlatformAppQueryService extends BasePaginationService {
  constructor(private readonly _repository: PlatformAppRepository) {
    super();
  }

  findPaginated(
    query: PlatformAppQuery,
    projectId: string,
  ): Promise<PaginatedResult<PlatformAppEntity>> {
    const alias = PlatformAppEntity.entityName();
    const qb = this._repository.createQueryBuilder(alias);

    qb.where(`${alias}.deletedAt IS NULL`);
    qb.andWhere(`${alias}.projectId = :projectId`, { projectId });

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
