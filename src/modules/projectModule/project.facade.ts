import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager, UpdateResult } from "typeorm";
import { PaginatedResult } from "../../common/pagination";
import { CORE_AUDIT_SINK, CORE_DATA_SOURCE } from "../../core.options";
import type { CoreAuditSink } from "../../core.options";
import { notFoundException } from "../../utils/exceptions";
import {
  ProjectCreateDto,
  ProjectLimitsDto,
  ProjectPatchDto,
} from "./dto/project.dto";
import { ProjectEntity } from "./project.entity";
import { ProjectRepository } from "./project.repository";
import { ProjectQuery } from "./query/project.query";
import { ProjectQueryService } from "./query/project.query.service";

/**
 * Projects: the outermost boundary, and where limits live.
 *
 * Ported from Titus's `projectModule/project.facade.ts`, minus everything to do
 * with organizations, members, roles and subscription plans. Core keeps
 * `organizationId` as an opaque reference it stores and returns but never
 * interprets, which is what lets a self-hosted deployment ignore it entirely.
 */
@Injectable()
export class ProjectFacade {
  private readonly _logger = new Logger(ProjectFacade.name);

  constructor(
    private readonly _repository: ProjectRepository,
    private readonly _queryService: ProjectQueryService,
    @InjectDataSource(CORE_DATA_SOURCE)
    private readonly _dataSource: DataSource,
    @Inject(CORE_AUDIT_SINK) private readonly _audit: CoreAuditSink,
  ) {}

  listProjects(query: ProjectQuery): Promise<PaginatedResult<ProjectEntity>> {
    return this._queryService.findPaginated(query);
  }

  listByOrganization(organizationId: string): Promise<ProjectEntity[]> {
    return this._repository.findByOrganizationId(organizationId);
  }

  /**
   * How many projects a tenant holds. Whatever enforces a plan limit needs
   * this before it decides; core does not enforce one itself.
   */
  countByOrganization(organizationId: string): Promise<number> {
    return this._repository.countByOrganizationId(organizationId);
  }

  /** Nullable lookup, for callers that treat "not there" as an answer. */
  findProjectById(projectId: string): Promise<ProjectEntity | null> {
    return this._repository.findById(projectId);
  }

  async getProjectById(projectId: string): Promise<ProjectEntity> {
    const project = await this._repository.findById(projectId);
    if (!project) {
      throw notFoundException(this._logger, {
        errorMsgUser: `Project ${projectId} not found`,
      });
    }
    return project;
  }

  async createProject(dto: ProjectCreateDto): Promise<ProjectEntity> {
    const project = await this._dataSource.transaction(async (manager) => {
      const entity = new ProjectEntity();
      entity.name = dto.name;
      entity.description = dto.description ?? null;
      entity.organizationId = dto.organizationId ?? null;

      // Limits stay null until something syncs them. `limitsSyncedAt` is what
      // distinguishes "never configured" from "deliberately unlimited", since
      // null already means unlimited on the wire.
      entity.limitsSyncedAt = null;

      return manager.save(ProjectEntity, entity);
    });

    this._audit.record({
      action: "project.created",
      resourceType: "project",
      resourceId: project.projectId,
      projectId: project.projectId,
    });

    return project;
  }

  updateProject(
    projectId: string,
    dto: ProjectPatchDto,
  ): Promise<ProjectEntity> {
    return this._dataSource.transaction(async (manager) => {
      const existing = await this._lock(projectId, manager);

      if (dto.name !== undefined) existing.name = dto.name;
      if (dto.description !== undefined) existing.description = dto.description;

      return manager.save(ProjectEntity, existing);
    });
  }

  /**
   * Write the limits this project runs under.
   *
   * This is the inversion that lets core have no billing dependency at all.
   * Whatever decides limits calls this; core stores the numbers and stops
   * caring. Titus's subscription facade is one caller, a self-hoster's shell
   * script is another, and core cannot tell them apart.
   *
   * Setting anything at all stamps `limitsSyncedAt`, which is how resolution
   * knows to use these rather than the host's defaults.
   */
  async syncLimits(
    projectId: string,
    limits: ProjectLimitsDto,
  ): Promise<ProjectEntity> {
    const project = await this._dataSource.transaction(async (manager) => {
      const existing = await this._lock(projectId, manager);

      if (limits.maxConnections !== undefined) {
        existing.maxConnections = limits.maxConnections;
      }
      if (limits.maxMessageSizeBytes !== undefined) {
        existing.maxMessageSizeBytes = limits.maxMessageSizeBytes;
      }
      if (limits.sessionExpirySeconds !== undefined) {
        existing.sessionExpirySeconds = limits.sessionExpirySeconds;
      }

      existing.limitsSyncedAt = new Date();

      return manager.save(ProjectEntity, existing);
    });

    this._audit.record({
      action: "project.limits_synced",
      resourceType: "project",
      resourceId: projectId,
      projectId,
      details: {
        maxConnections: project.maxConnections,
        maxMessageSizeBytes: project.maxMessageSizeBytes,
        sessionExpirySeconds: project.sessionExpirySeconds,
      },
    });

    return project;
  }

  async deleteProject(projectId: string): Promise<UpdateResult> {
    const result = await this._dataSource.transaction(async (manager) => {
      await this._lock(projectId, manager);
      return manager.softDelete(ProjectEntity, { projectId });
    });

    this._audit.record({
      action: "project.deleted",
      resourceType: "project",
      resourceId: projectId,
      projectId,
    });

    return result;
  }

  /** Locked read inside a transaction, or 404. */
  private async _lock(
    projectId: string,
    manager: EntityManager,
  ): Promise<ProjectEntity> {
    const alias = ProjectEntity.entityName();
    const existing = await manager
      .createQueryBuilder(ProjectEntity, alias)
      .where(`${alias}.projectId = :projectId`, { projectId })
      .andWhere(`${alias}.deletedAt IS NULL`)
      .setLock("pessimistic_read")
      .getOne();

    if (!existing) {
      throw notFoundException(this._logger, {
        errorMsgUser: `Project ${projectId} not found`,
      });
    }
    return existing;
  }
}
