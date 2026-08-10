import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from "typeorm";
import { BaseTimeEntity } from "../../common/entities/base.entity";
import { generateDBUuid } from "../../utils/guid";
import { PlatformAppEntity } from "../platformAppModule/platformApp.entity";
import { ActorTokenEntity } from "./actorToken.entity";
import { EAccessPermission } from "./enum/EAccessPermission.enum";

const entityName = "actor_app_access";

/**
 * Actor App Access Entity
 *
 * Grants a project-scoped actor access to one app, with a permission and an
 * optional topic restriction.
 *
 * Required only when the app's accessMode is `restricted`. For an `open` app,
 * resolution synthesises equivalent records in memory for every active actor in
 * the project and never persists them, so an open app has no rows here.
 */
@Entity(entityName)
@Unique(["actorTokenId", "appId"]) // one record per actor and app
@Index(["actorTokenId"])
@Index(["appId"])
export class ActorAppAccessEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "actor_app_access_id" })
  actorAppAccessId: string;

  @BeforeInsert()
  generateId() {
    this.actorAppAccessId = generateDBUuid(); // UUID v7
  }

  @Column({ type: "uuid", name: "actor_token_id" })
  actorTokenId: string;

  @Column({ type: "uuid", name: "app_id" })
  appId: string;

  @Column({ type: "varchar", length: 50, name: "permission" })
  permission: EAccessPermission;

  /**
   * Topic restriction within the app.
   * NULL inherits the app's topic list. An array restricts to those topics.
   */
  @Column({ type: "jsonb", nullable: true, name: "topics" })
  topics?: string[] | null;

  @Column({ type: "boolean", default: true, name: "is_active" })
  isActive: boolean;

  /** NULL means no expiry of its own; the actor token's expiry still applies. */
  @Column({ type: "timestamptz", nullable: true, name: "expires_at" })
  expiresAt: Date | null;

  @Column({ type: "jsonb", nullable: true, name: "metadata" })
  metadata?: Record<string, unknown> | null;

  // Relations
  @ManyToOne(() => ActorTokenEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "actor_token_id" })
  actorToken!: ActorTokenEntity;

  @ManyToOne(() => PlatformAppEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "app_id" })
  app!: PlatformAppEntity;
}
