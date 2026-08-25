import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { AccessScopeEntity } from "./accessScope.entity";

@Injectable()
export class AccessScopeRepository extends Repository<AccessScopeEntity> {
  // Three-arg super, not `new Repository(entity, dataSource.createEntityManager())`.
  // EntityManager.withRepository re-invokes this constructor as
  // (target, manager, queryRunner), so a DataSource-shaped constructor breaks
  // the moment a facade wants this repository inside a transaction.
  constructor(
    @InjectRepository(AccessScopeEntity)
    repository: Repository<AccessScopeEntity>,
  ) {
    super(repository.target, repository.manager, repository.queryRunner);
  }

  findBySlugAndProject(
    slug: string,
    projectId: string,
  ): Promise<AccessScopeEntity | null> {
    return this.findOne({
      where: { slug, projectId, deletedAt: IsNull() },
    });
  }
}
