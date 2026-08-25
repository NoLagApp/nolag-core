import { Injectable } from "@nestjs/common";
import {
  BasePaginationService,
  PaginatedResult,
} from "../../../common/pagination";
import { ActorTokenEntity } from "../actorToken.entity";
import { ActorTokenRepository } from "../actorToken.repository";
import { ActorTokenQuery } from "./actorToken.query";

@Injectable()
export class ActorTokenQueryService extends BasePaginationService {
  constructor(private readonly _repository: ActorTokenRepository) {
    super();
  }

  findPaginated(
    query: ActorTokenQuery,
    projectId: string,
  ): Promise<PaginatedResult<ActorTokenEntity>> {
    const alias = ActorTokenEntity.entityName();
    const qb = this._repository.createQueryBuilder(alias);

    qb.where(`${alias}.deletedAt IS NULL`);
    qb.andWhere(`${alias}.projectId = :projectId`, { projectId });

    if (query.name) {
      qb.andWhere(`${alias}.name ILIKE :name`, { name: `%${query.name}%` });
    }

    if (query.actorType) {
      qb.andWhere(`${alias}.actorType = :actorType`, {
        actorType: query.actorType,
      });
    }

    if (query.status) {
      qb.andWhere(`${alias}.status = :status`, { status: query.status });
    }

    qb.orderBy(`${alias}.createdAt`, "DESC");

    return this.paginate(qb, query);
  }
}
