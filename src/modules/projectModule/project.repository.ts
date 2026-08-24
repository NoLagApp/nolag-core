import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { ProjectEntity } from "./project.entity";

@Injectable()
export class ProjectRepository extends Repository<ProjectEntity> {
  // Three-arg super, not `new Repository(entity, dataSource.createEntityManager())`.
  // EntityManager.withRepository re-invokes this constructor as
  // (target, manager, queryRunner), so a DataSource-shaped constructor breaks
  // the moment a facade wants this repository inside a transaction.
  constructor(
    @InjectRepository(ProjectEntity)
    repository: Repository<ProjectEntity>,
  ) {
    super(repository.target, repository.manager, repository.queryRunner);
  }

  findById(projectId: string): Promise<ProjectEntity | null> {
    return this.findOne({ where: { projectId, deletedAt: IsNull() } });
  }

  findByOrganizationId(organizationId: string): Promise<ProjectEntity[]> {
    return this.find({
      where: { organizationId, deletedAt: IsNull() },
      order: { createdAt: "ASC" },
    });
  }
}
