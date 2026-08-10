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
import { AccessScopeEntity } from "../accessScopeModule/accessScope.entity";
import { ProjectEntity } from "../projectModule/project.entity";
import { EActorTokenStatus } from "./enum/EActorTokenStatus.enum";
import { EActorType } from "./enum/EActorType.enum";

const entityName = "actor_token";

/**
 * Actor Token Entity
 *
 * An identity that may connect and perform pub/sub. Scoped to a project: one
 * token reaches every app in its project that grants it access.
 *
 * Credential format: at_{live|sandbox}_{keyId}.{secret}
 * - keyId  public identifier, 12 hex characters, used for the lookup
 * - secret 32 random bytes, base64url encoded, shown once at creation
 * - secretHash  SHA-256 of the secret. The secret itself is never stored.
 */
@Entity(entityName)
@Index(["projectId", "status"])
@Index(["keyId"], { unique: true })
export class ActorTokenEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "actor_token_id" })
  actorTokenId: string;

  @BeforeInsert()
  generateId() {
    this.actorTokenId = generateDBUuid(); // UUID v7
  }

  @Column({ type: "uuid", name: "project_id" })
  @Index()
  projectId: string;

  /**
   * Public identifier, for example at_live_abc123def456.
   *
   * Uniqueness comes from the unique index declared on the class. Declaring
   * `unique: true` here as well would build a second b-tree over the same
   * column, doubling write cost on the hottest lookup column in the service.
   */
  @Column({ type: "varchar", length: 100, name: "key_id" })
  keyId: string;

  @Column({ type: "text", name: "secret_hash" })
  secretHash: string;

  @Column({ type: "varchar", length: 255, name: "name" })
  name: string;

  @Column({ type: "varchar", length: 50, name: "actor_type" })
  actorType: EActorType;

  @Column({
    type: "varchar",
    length: 50,
    default: EActorTokenStatus.Active,
    name: "status",
  })
  status: EActorTokenStatus;

  /** NULL means never expires. */
  @Column({ type: "timestamptz", nullable: true, name: "expires_at" })
  expiresAt: Date | null;

  @Column({ type: "timestamptz", nullable: true, name: "last_used_at" })
  lastUsedAt: Date | null;

  @Column({ type: "jsonb", nullable: true, name: "metadata" })
  metadata?: Record<string, unknown> | null;

  /**
   * Optional tenant isolation. When set, every resolved topic gains a scope
   * segment. See AccessScopeEntity.
   */
  @Column({ type: "uuid", nullable: true, name: "access_scope_id" })
  accessScopeId: string | null;

  // Relations
  @ManyToOne(() => ProjectEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: ProjectEntity;

  /**
   * RESTRICT, not SET NULL, and deliberately so.
   *
   * A scoped actor is confined to its scope's segment of the topic space.
   * Nulling the scope on delete would turn every affected actor into an
   * unscoped one, silently widening what it can reach. That is a privilege
   * escalation triggered by an unrelated delete, so removing a scope that still
   * has actors attached must fail loudly instead.
   */
  @ManyToOne(() => AccessScopeEntity, {
    lazy: true,
    nullable: true,
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "access_scope_id" })
  accessScope: Promise<AccessScopeEntity | null>;
}
