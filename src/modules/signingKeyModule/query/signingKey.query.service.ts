import { Injectable } from "@nestjs/common";
import {
  BasePaginationService,
  PaginatedResult,
} from "../../../common/pagination";
import { SigningKeyEntity } from "../signingKey.entity";
import { SigningKeyRepository } from "../signingKey.repository";
import { SigningKeyQuery } from "./signingKey.query";

@Injectable()
export class SigningKeyQueryService extends BasePaginationService {
  constructor(private readonly _repository: SigningKeyRepository) {
    super();
  }

  findPaginated(
    query: SigningKeyQuery,
    projectId: string,
  ): Promise<PaginatedResult<SigningKeyEntity>> {
    const alias = SigningKeyEntity.entityName();
    const qb = this._repository.createQueryBuilder(alias);

    qb.where(`${alias}.deletedAt IS NULL`);
    qb.andWhere(`${alias}.projectId = :projectId`, { projectId });

    if (query.name) {
      qb.andWhere(`${alias}.name ILIKE :name`, { name: `%${query.name}%` });
    }

    if (query.status) {
      qb.andWhere(`${alias}.status = :status`, { status: query.status });
    }

    qb.orderBy(`${alias}.createdAt`, "DESC");

    // The encrypted secret is never selected. It is only ever read by
    // verifyClientToken, which fetches the row it needs directly.
    qb.select([
      `${alias}.signingKeyId`,
      `${alias}.projectId`,
      `${alias}.keyId`,
      `${alias}.name`,
      `${alias}.status`,
      `${alias}.lastUsedAt`,
      `${alias}.createdAt`,
      `${alias}.updatedAt`,
    ]);

    return this.paginate(qb, query);
  }
}
