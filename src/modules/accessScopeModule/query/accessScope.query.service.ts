import { Injectable } from "@nestjs/common";
import {
  BasePaginationService,
  PaginatedResult,
} from "../../../common/pagination";
import { AccessScopeEntity } from "../accessScope.entity";
import { AccessScopeRepository } from "../accessScope.repository";
import { AccessScopeQuery } from "./accessScope.query";

@Injectable()
export class AccessScopeQueryService extends BasePaginationService {
  constructor(private readonly _repository: AccessScopeRepository) {
    super();
  }

  findPaginated(
    query: AccessScopeQuery,
    projectId: string,
  ): Promise<PaginatedResult<AccessScopeEntity>> {
    const alias = AccessScopeEntity.entityName();
    const qb = this._repository.createQueryBuilder(alias);

    qb.where(`${alias}.deletedAt IS NULL`);
    qb.andWhere(`${alias}.projectId = :projectId`, { projectId });

    if (query.slug) {
      qb.andWhere(`${alias}.slug = :slug`, { slug: query.slug });
    }

    if (query.name) {
      qb.andWhere(`${alias}.name ILIKE :name`, { name: `%${query.name}%` });
    }

    if (query.isActive !== undefined) {
      qb.andWhere(`${alias}.isActive = :isActive`, {
        isActive: query.isActive === "true",
      });
    }

    qb.orderBy(`${alias}.createdAt`, "DESC");

    return this.paginate(qb, query);
  }
}
