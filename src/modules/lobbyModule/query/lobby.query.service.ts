import { Injectable } from "@nestjs/common";
import {
  BasePaginationService,
  PaginatedResult,
} from "../../../common/pagination";
import { LobbyEntity } from "../lobby.entity";
import { LobbyRepository } from "../lobby.repository";
import { LobbyQuery } from "./lobby.query";

@Injectable()
export class LobbyQueryService extends BasePaginationService {
  constructor(private readonly _repository: LobbyRepository) {
    super();
  }

  findPaginated(
    query: LobbyQuery,
    appId: string,
  ): Promise<PaginatedResult<LobbyEntity>> {
    const alias = LobbyEntity.entityName();
    const qb = this._repository.createQueryBuilder(alias);

    qb.where(`${alias}.deletedAt IS NULL`);
    qb.andWhere(`${alias}.appId = :appId`, { appId });

    if (query.name) {
      qb.andWhere(`${alias}.name ILIKE :name`, { name: `%${query.name}%` });
    }

    if (query.slug) {
      qb.andWhere(`${alias}.slug = :slug`, { slug: query.slug });
    }

    qb.orderBy(`${alias}.createdAt`, "ASC");

    return this.paginate(qb, query);
  }
}
