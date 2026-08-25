import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { CORE_DATA_SOURCE } from "../../core.options";
import { IsNull, Repository } from "typeorm";
import { PlatformAppEntity } from "./platformApp.entity";

@Injectable()
export class PlatformAppRepository extends Repository<PlatformAppEntity> {
  // Three-arg super, not `new Repository(entity, dataSource.createEntityManager())`.
  // EntityManager.withRepository re-invokes this constructor as
  // (target, manager, queryRunner), so a DataSource-shaped constructor breaks
  // the moment a facade wants this repository inside a transaction.
  constructor(
    @InjectRepository(PlatformAppEntity, CORE_DATA_SOURCE)
    repository: Repository<PlatformAppEntity>,
  ) {
    super(repository.target, repository.manager, repository.queryRunner);
  }

  findById(appId: string): Promise<PlatformAppEntity | null> {
    return this.findOne({ where: { appId, deletedAt: IsNull() } });
  }

  findByProjectAndId(
    projectId: string,
    appId: string,
  ): Promise<PlatformAppEntity | null> {
    return this.findOne({ where: { projectId, appId, deletedAt: IsNull() } });
  }

  findBySlugAndProject(
    slug: string,
    projectId: string,
  ): Promise<PlatformAppEntity | null> {
    return this.findOne({ where: { slug, projectId, deletedAt: IsNull() } });
  }

  findByProjectId(projectId: string): Promise<PlatformAppEntity[]> {
    return this.find({
      where: { projectId, deletedAt: IsNull() },
      order: { createdAt: "ASC" },
    });
  }
}
