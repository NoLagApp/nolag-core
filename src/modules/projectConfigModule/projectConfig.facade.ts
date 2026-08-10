import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, IsNull } from "typeorm";
import { notFoundException } from "../../utils/exceptions";
import { ActorTokenEntity } from "../actorTokenModule/actorToken.entity";
import { ProjectEntity } from "../projectModule/project.entity";
import {
  ImportedCredentials,
  ProjectConfigDocDto,
} from "./dto/projectConfig.dto";
import { ProjectConfigService } from "./projectConfig.service";

@Injectable()
export class ProjectConfigFacade {
  private readonly _logger = new Logger(ProjectConfigFacade.name);

  constructor(
    private readonly _service: ProjectConfigService,
    @InjectDataSource() private readonly _dataSource: DataSource,
  ) {}

  /** One transaction: a half-imported authorization model is worse than none. */
  importProject(doc: ProjectConfigDocDto): Promise<ImportedCredentials> {
    return this._dataSource.transaction((manager) =>
      this._service.importProject(doc, manager),
    );
  }

  exportProject(projectId: string): Promise<ProjectConfigDocDto> {
    return this._service.exportProject(projectId, this._dataSource.manager);
  }

  async listProjects(): Promise<
    { projectId: string; name: string; createdAt: Date }[]
  > {
    const projects = await this._dataSource.manager.find(ProjectEntity, {
      where: { deletedAt: IsNull() },
      order: { createdAt: "ASC" },
    });
    return projects.map((p) => ({
      projectId: p.projectId,
      name: p.name,
      createdAt: p.createdAt,
    }));
  }

  /**
   * Hard delete, cascading to everything under the project.
   *
   * Actors are removed first so the intent is visible: actor_token.access_scope_id
   * is ON DELETE RESTRICT to stop a scope delete from silently unscoping actors,
   * and doing this explicitly documents the ordering rather than relying on the
   * reader knowing Postgres resolves it.
   */
  async deleteProject(projectId: string): Promise<void> {
    await this._dataSource.transaction(async (manager) => {
      const project = await manager.findOne(ProjectEntity, {
        where: { projectId },
      });
      if (!project) {
        throw notFoundException(this._logger, {
          errorMsgUser: "Project not found",
        });
      }

      await manager.delete(ActorTokenEntity, { projectId });
      await manager.delete(ProjectEntity, { projectId });
    });

    this._logger.warn(`Deleted project ${projectId} and all of its config`);
  }
}
