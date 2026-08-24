import { Injectable } from "@nestjs/common";
import {
  BasePaginationService,
  PaginatedResult,
} from "../../../common/pagination";
import { ProjectEntity } from "../project.entity";
import { ProjectRepository } from "../project.repository";
import { ProjectQuery } from "./project.query";

@Injectable()
export class ProjectQueryService extends BasePaginationService {
  constructor(private readonly _repository: ProjectRepository) {
    super();
  }

  findPaginated(query: ProjectQuery): Promise<PaginatedResult<ProjectEntity>> {
    const alias = ProjectEntity.entityName();
    const qb = this._repository.createQueryBuilder(alias);

    qb.where(`${alias}.deletedAt IS NULL`);

    if (query.name) {
      qb.andWhere(`${alias}.name ILIKE :name`, { name: `%${query.name}%` });
    }

    if (query.organizationId) {
      qb.andWhere(`${alias}.organizationId = :organizationId`, {
        organizationId: query.organizationId,
      });
    }

    qb.orderBy(`${alias}.createdAt`, "DESC");

    return this.paginate(qb, query);
  }
}
