import { Injectable } from "@nestjs/common";
import { EntityManager, IsNull, UpdateResult } from "typeorm";
import { AccessScopeEntity } from "./accessScope.entity";
import { AccessScopeRepository } from "./accessScope.repository";
import {
  AccessScopeCreateDto,
  AccessScopePatchDto,
} from "./dto/accessScope.dto";

/**
 * Ported from Titus's `accessScopeModule/accessScope.service.ts`.
 *
 * Every read filters `deletedAt IS NULL` explicitly. TypeORM's soft-delete
 * handling does not apply to a QueryBuilder, so leaving it off silently
 * resurrects deleted rows into an authorization decision.
 */
@Injectable()
export class AccessScopeService {
  constructor(private readonly _repository: AccessScopeRepository) {}

  create(
    projectId: string,
    dto: AccessScopeCreateDto,
    manager: EntityManager,
  ): Promise<AccessScopeEntity> {
    const entity = new AccessScopeEntity();
    entity.projectId = projectId;
    entity.slug = dto.slug;
    entity.name = dto.name;
    entity.description = dto.description ?? null;
    entity.metadata = dto.metadata ?? null;
    entity.isActive = true;

    return manager.save(AccessScopeEntity, entity);
  }

  /**
   * Read the row for update inside a transaction.
   *
   * The pessimistic lock is what makes create-if-absent and patch safe against
   * a concurrent writer; without it two requests can both see no conflict.
   */
  updateLock(
    accessScopeId: string,
    projectId: string,
    manager: EntityManager,
  ): Promise<AccessScopeEntity | null> {
    const alias = AccessScopeEntity.entityName();
    return manager
      .createQueryBuilder(AccessScopeEntity, alias)
      .where(
        `${alias}.accessScopeId = :accessScopeId AND ${alias}.projectId = :projectId`,
        { accessScopeId, projectId },
      )
      .andWhere(`${alias}.deletedAt IS NULL`)
      .setLock("pessimistic_read")
      .getOne();
  }

  patchRecord(
    existing: AccessScopeEntity,
    dto: AccessScopePatchDto,
    manager: EntityManager,
  ): Promise<AccessScopeEntity> {
    // `undefined` means absent and `null` means clear it, so each field is
    // checked against undefined rather than for truthiness.
    if (dto.name !== undefined) existing.name = dto.name;
    if (dto.description !== undefined) existing.description = dto.description;
    if (dto.metadata !== undefined) existing.metadata = dto.metadata;
    if (dto.isActive !== undefined) existing.isActive = dto.isActive;

    return manager.save(AccessScopeEntity, existing);
  }

  remove(
    accessScopeId: string,
    projectId: string,
    manager: EntityManager,
  ): Promise<UpdateResult> {
    return manager.softDelete(AccessScopeEntity, {
      accessScopeId,
      projectId,
      deletedAt: IsNull(),
    });
  }

  findByIdAndProject(
    accessScopeId: string,
    projectId: string,
    manager?: EntityManager,
  ): Promise<AccessScopeEntity | null> {
    const repo = manager
      ? manager.getRepository(AccessScopeEntity)
      : this._repository;

    return repo.findOne({
      where: { accessScopeId, projectId, deletedAt: IsNull() },
    });
  }

  findBySlugAndProject(
    slug: string,
    projectId: string,
    manager?: EntityManager,
  ): Promise<AccessScopeEntity | null> {
    if (!manager) {
      return this._repository.findBySlugAndProject(slug, projectId);
    }

    const alias = AccessScopeEntity.entityName();
    return manager
      .createQueryBuilder(AccessScopeEntity, alias)
      .where(`${alias}.slug = :slug AND ${alias}.projectId = :projectId`, {
        slug,
        projectId,
      })
      .andWhere(`${alias}.deletedAt IS NULL`)
      .setLock("pessimistic_read")
      .getOne();
  }
}
