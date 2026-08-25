import { InjectDataSource } from "@nestjs/typeorm";
import { CORE_DATA_SOURCE } from "../../core.options";
import { Injectable, Logger } from "@nestjs/common";
import { DataSource, IsNull, UpdateResult } from "typeorm";
import { PaginatedResult } from "../../common/pagination";
import { conflictException, notFoundException } from "../../utils/exceptions";
import { ActorTokenEntity } from "../actorTokenModule/actorToken.entity";
import { AccessScopeEntity } from "./accessScope.entity";
import { AccessScopeService } from "./accessScope.service";
import {
  AccessScopeCreateDto,
  AccessScopePatchDto,
} from "./dto/accessScope.dto";
import { AccessScopeQuery } from "./query/accessScope.query";
import { AccessScopeQueryService } from "./query/accessScope.query.service";

/**
 * Access scopes: the tenant boundary.
 *
 * A scope slug becomes a segment of every topic address its actors resolve to,
 * which is what keeps two customers on one deployment from reaching each
 * other. That makes deleting one more consequential than it looks, hence the
 * guard below.
 *
 * Ported from Titus's `accessScopeModule/accessScope.facade.ts`. The
 * `organizationId` argument on create is gone: core has no organizations, and
 * it was unused there too.
 */
@Injectable()
export class AccessScopeFacade {
  private readonly _logger = new Logger(AccessScopeFacade.name);

  constructor(
    private readonly _service: AccessScopeService,
    private readonly _queryService: AccessScopeQueryService,
    @InjectDataSource(CORE_DATA_SOURCE)
    private readonly _dataSource: DataSource,
  ) {}

  list(
    projectId: string,
    query: AccessScopeQuery,
  ): Promise<PaginatedResult<AccessScopeEntity>> {
    return this._queryService.findPaginated(query, projectId);
  }

  async getById(
    accessScopeId: string,
    projectId: string,
  ): Promise<AccessScopeEntity> {
    const scope = await this._service.findByIdAndProject(
      accessScopeId,
      projectId,
    );
    if (!scope) {
      throw notFoundException(this._logger, {
        errorMsgUser: `Access scope ${accessScopeId} not found`,
      });
    }
    return scope;
  }

  create(
    projectId: string,
    dto: AccessScopeCreateDto,
  ): Promise<AccessScopeEntity> {
    return this._dataSource.transaction(async (manager) => {
      // Locked read inside the transaction, so two concurrent creates cannot
      // both find the slug free.
      const existing = await this._service.findBySlugAndProject(
        dto.slug,
        projectId,
        manager,
      );
      if (existing) {
        throw conflictException(this._logger, {
          errorMsgUser: `A scope with slug "${dto.slug}" already exists in this project`,
        });
      }

      return this._service.create(projectId, dto, manager);
    });
  }

  update(
    accessScopeId: string,
    projectId: string,
    dto: AccessScopePatchDto,
  ): Promise<AccessScopeEntity> {
    return this._dataSource.transaction(async (manager) => {
      const existing = await this._service.updateLock(
        accessScopeId,
        projectId,
        manager,
      );
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Access scope ${accessScopeId} not found`,
        });
      }

      return this._service.patchRecord(existing, dto, manager);
    });
  }

  /**
   * Refuses while any actor is still bound to the scope.
   *
   * Deleting it out from under them would not orphan the actors; it would
   * silently *widen* what they can reach, because an actor with no scope
   * resolves to the project-wide address space. That is the wrong direction to
   * fail in, so this fails closed instead.
   */
  delete(accessScopeId: string, projectId: string): Promise<UpdateResult> {
    return this._dataSource.transaction(async (manager) => {
      const existing = await this._service.updateLock(
        accessScopeId,
        projectId,
        manager,
      );
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Access scope ${accessScopeId} not found`,
        });
      }

      const actorCount = await manager.count(ActorTokenEntity, {
        where: { accessScopeId, deletedAt: IsNull() },
      });
      if (actorCount > 0) {
        throw conflictException(this._logger, {
          errorMsgUser:
            `Cannot delete scope: ${actorCount} actor(s) are still assigned ` +
            `to it. Unscope them first.`,
        });
      }

      return this._service.remove(accessScopeId, projectId, manager);
    });
  }

  async listActorsInScope(
    accessScopeId: string,
    projectId: string,
  ): Promise<ActorTokenEntity[]> {
    // Scoped by project first, so an id from another project 404s rather than
    // listing its actors.
    await this.getById(accessScopeId, projectId);

    return this._dataSource.manager.find(ActorTokenEntity, {
      where: { accessScopeId, deletedAt: IsNull() },
      order: { createdAt: "DESC" },
    });
  }
}
