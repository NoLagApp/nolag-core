import { InjectDataSource } from "@nestjs/typeorm";
import { CORE_DATA_SOURCE } from "../../core.options";
import { Injectable, Logger } from "@nestjs/common";
import { DataSource, UpdateResult } from "typeorm";
import { PaginatedResult } from "../../common/pagination";
import { CORE_AUDIT_SINK } from "../../core.options";
import { Inject } from "@nestjs/common";
import type { CoreAuditSink } from "../../core.options";
import { conflictException, notFoundException } from "../../utils/exceptions";
import {
  PlatformAppCreateDto,
  PlatformAppPatchDto,
} from "./dto/platformApp.dto";
import { EAppAccessMode } from "./enum/EAppAccessMode.enum";
import { EAppStatus } from "./enum/EAppStatus.enum";
import { PlatformAppEntity } from "./platformApp.entity";
import { PlatformAppRepository } from "./platformApp.repository";
import { PlatformAppQuery } from "./query/platformApp.query";
import { PlatformAppQueryService } from "./query/platformApp.query.service";

/**
 * Apps: the first segment of every address, and the authoritative topic list.
 *
 * Ported from Titus's `platformAppModule/platformApp.facade.ts`, minus
 * everything that belongs to the app builder: blueprints, app versions, the
 * preview cache, dependency and file blobs, and the subscription check on how
 * many apps a plan allows. Core's app row has no columns for any of it.
 *
 * **One deliberate behaviour change.** Titus appends a random suffix to every
 * app slug, so an app named `chat` is stored as `chat-a3f9`. That suffix lands
 * in the first segment of every address the app's actors resolve to, which is
 * a documented cold-start problem: the quickstart tells you to publish on
 * `chat/general/messages` and the broker refuses it. Core uses the slug as
 * given. Slugs are already unique per project, which is what the suffix was
 * standing in for.
 */
@Injectable()
export class PlatformAppFacade {
  private readonly _logger = new Logger(PlatformAppFacade.name);

  constructor(
    private readonly _repository: PlatformAppRepository,
    private readonly _queryService: PlatformAppQueryService,
    @InjectDataSource(CORE_DATA_SOURCE)
    private readonly _dataSource: DataSource,
    @Inject(CORE_AUDIT_SINK) private readonly _audit: CoreAuditSink,
  ) {}

  listApps(
    projectId: string,
    query: PlatformAppQuery,
  ): Promise<PaginatedResult<PlatformAppEntity>> {
    return this._queryService.findPaginated(query, projectId);
  }

  listAll(projectId: string): Promise<PlatformAppEntity[]> {
    return this._repository.findByProjectId(projectId);
  }

  async getAppById(
    appId: string,
    projectId: string,
  ): Promise<PlatformAppEntity> {
    const app = await this._repository.findByProjectAndId(projectId, appId);
    if (!app) {
      throw notFoundException(this._logger, {
        errorMsgUser: `App ${appId} not found`,
      });
    }
    return app;
  }

  async getAppBySlug(
    slug: string,
    projectId: string,
  ): Promise<PlatformAppEntity> {
    const app = await this._repository.findBySlugAndProject(slug, projectId);
    if (!app) {
      throw notFoundException(this._logger, {
        errorMsgUser: `App "${slug}" not found`,
      });
    }
    return app;
  }

  async createApp(
    projectId: string,
    dto: PlatformAppCreateDto,
  ): Promise<PlatformAppEntity> {
    const app = await this._dataSource.transaction(async (manager) => {
      const slug = dto.slug ?? this._generateSlug(dto.name);

      // Locked read, so two concurrent creates cannot both find it free. The
      // partial unique index on (project_id, slug) where deleted_at is null is
      // the backstop.
      const alias = PlatformAppEntity.entityName();
      const existing = await manager
        .createQueryBuilder(PlatformAppEntity, alias)
        .where(`${alias}.slug = :slug AND ${alias}.projectId = :projectId`, {
          slug,
          projectId,
        })
        .andWhere(`${alias}.deletedAt IS NULL`)
        .setLock("pessimistic_read")
        .getOne();

      if (existing) {
        throw conflictException(this._logger, {
          errorMsgUser: `An app with slug "${slug}" already exists in this project`,
        });
      }

      const entity = new PlatformAppEntity();
      entity.projectId = projectId;
      entity.slug = slug;
      entity.name = dto.name;
      entity.description = dto.description ?? null;
      entity.topics = dto.topics;
      entity.topicConfigs = dto.topicConfigs ?? null;
      entity.status = EAppStatus.Active;
      entity.accessMode = dto.accessMode ?? EAppAccessMode.Open;
      entity.hydrationWebhook = dto.hydrationWebhook ?? null;
      entity.triggerWebhook = dto.triggerWebhook ?? null;

      return manager.save(PlatformAppEntity, entity);
    });

    this._audit.record({
      action: "app.created",
      resourceType: "app",
      resourceId: app.appId,
      projectId,
      details: { slug: app.slug, accessMode: app.accessMode },
    });

    return app;
  }

  async updateApp(
    appId: string,
    projectId: string,
    dto: PlatformAppPatchDto,
  ): Promise<PlatformAppEntity> {
    const app = await this._dataSource.transaction(async (manager) => {
      const alias = PlatformAppEntity.entityName();
      const existing = await manager
        .createQueryBuilder(PlatformAppEntity, alias)
        .where(`${alias}.appId = :appId AND ${alias}.projectId = :projectId`, {
          appId,
          projectId,
        })
        .andWhere(`${alias}.deletedAt IS NULL`)
        .setLock("pessimistic_read")
        .getOne();

      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `App ${appId} not found`,
        });
      }

      // Field by field, never Object.assign. An app row decides what every
      // actor in it can reach, so mass assignment here is a privilege
      // escalation waiting for a caller to send an extra key.
      if (dto.name !== undefined) existing.name = dto.name;
      if (dto.description !== undefined) existing.description = dto.description;
      if (dto.status !== undefined) existing.status = dto.status;
      if (dto.accessMode !== undefined) existing.accessMode = dto.accessMode;
      if (dto.topics !== undefined) existing.topics = dto.topics;
      if (dto.topicConfigs !== undefined) {
        existing.topicConfigs = dto.topicConfigs;
      }
      if (dto.hydrationWebhook !== undefined) {
        existing.hydrationWebhook = dto.hydrationWebhook;
      }
      if (dto.triggerWebhook !== undefined) {
        existing.triggerWebhook = dto.triggerWebhook;
      }

      return manager.save(PlatformAppEntity, existing);
    });

    this._audit.record({
      action: "app.updated",
      resourceType: "app",
      resourceId: appId,
      projectId,
      // The two fields that change who can reach what.
      details: { accessMode: app.accessMode, status: app.status },
    });

    return app;
  }

  async deleteApp(appId: string, projectId: string): Promise<UpdateResult> {
    const result = await this._dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(PlatformAppEntity, {
        where: { appId, projectId },
      });
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `App ${appId} not found`,
        });
      }

      // Rooms, lobbies and grants beneath the app are left in place and become
      // unreachable with it, because resolution starts from the app and skips
      // a deleted one. Cascading here would destroy the audit trail of what
      // access existed.
      return manager.softDelete(PlatformAppEntity, { appId, projectId });
    });

    this._audit.record({
      action: "app.deleted",
      resourceType: "app",
      resourceId: appId,
      projectId,
    });

    return result;
  }

  private _generateSlug(name: string): string {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "app";
  }
}
