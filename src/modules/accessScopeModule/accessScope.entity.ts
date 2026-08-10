import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { BaseTimeEntity } from "../../common/entities/base.entity";
import { generateDBUuid } from "../../utils/guid";
import { ProjectEntity } from "../projectModule/project.entity";

const entityName = "access_scope";

/**
 * Access Scope Entity
 *
 * Optional tenant isolation inside a project. When an actor carries a scope,
 * every topic it resolves gains a scope segment:
 *
 *   pattern  {appSlug}/{scopeSlug}/{roomSlug}/{topic}
 *   topic    {scopeId}/{roomId}/{topic}
 *
 * Because the scope id is part of the internal topic, a scoped actor is
 * physically unable to address another scope's rooms even if a grant were
 * misconfigured. That is the point: isolation is structural, not just checked.
 */
@Entity(entityName)
// Slugs appear in topic patterns, so a duplicate within a project would make
// two scopes indistinguishable on the wire. The hosted control plane is missing
// this constraint; core enforces it.
@Index(["projectId", "slug"], { unique: true, where: '"deleted_at" IS NULL' })
export class AccessScopeEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "access_scope_id" })
  accessScopeId: string;

  @BeforeInsert()
  generateId() {
    this.accessScopeId = generateDBUuid(); // UUID v7
  }

  @Column({ type: "uuid", name: "project_id" })
  @Index()
  projectId: string;

  /** URL-safe identifier, used as the scope segment of a topic pattern. */
  @Column({ type: "varchar", length: 100, name: "slug" })
  slug: string;

  @Column({ type: "varchar", length: 255, name: "name" })
  name: string;

  @Column({ type: "varchar", length: 500, nullable: true, name: "description" })
  description: string | null;

  @Column({ type: "jsonb", nullable: true, name: "metadata" })
  metadata: Record<string, unknown> | null;

  /** An inactive scope resolves as though the actor had no scope at all. */
  @Column({ type: "boolean", default: true, name: "is_active" })
  isActive: boolean;

  // Relations
  @ManyToOne(() => ProjectEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: ProjectEntity;
}
