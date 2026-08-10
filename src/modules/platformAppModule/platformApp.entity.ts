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
import { EAppAccessMode } from "./enum/EAppAccessMode.enum";
import { EAppStatus } from "./enum/EAppStatus.enum";

const entityName = "app";

/** A webhook target. Headers may carry credentials, so never log this whole object. */
export interface IWebhookConfig {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Per-topic configuration.
 *
 * Only `webhooks` is read during authorization. Other subtrees may be present
 * and are passed through untouched, so that a hosted control plane can keep its
 * own per-topic settings in the same column without core needing to know about
 * them.
 */
export type TopicConfigs = Record<
  string,
  {
    webhooks?: {
      onPublish?: IWebhookConfig;
      onSubscribe?: IWebhookConfig;
    };
    [key: string]: unknown;
  }
>;

/**
 * App Entity
 *
 * An app owns the topic vocabulary and decides whether actors need an explicit
 * grant to reach it. Rooms hang off an app; topics are defined here, not on the
 * room.
 *
 * Hierarchy: project -> app -> room
 *
 * Columns present in NoLag's hosted control plane but deliberately absent here:
 * blueprint_id, blueprint_version, pinned_blueprint_version, config, framework,
 * dependencies and files. Those belong to an app-builder product, not to
 * authorization, and one of them (files) is large enough that loading it on
 * every connection was a measurable cost.
 */
@Entity(entityName)
@Index("idx_app_project_slug", ["projectId", "slug"], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class PlatformAppEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "app_id" })
  appId: string;

  @BeforeInsert()
  generateId() {
    this.appId = generateDBUuid(); // UUID v7
  }

  @Column({ type: "uuid", name: "project_id" })
  @Index()
  projectId: string;

  /** Human-readable name. Emitted to the broker as app_name. */
  @Column({ type: "varchar", length: 255, name: "name" })
  name: string;

  /** URL-safe identifier. First segment of every topic pattern for this app. */
  @Column({ type: "varchar", length: 100, name: "slug" })
  slug: string;

  @Column({ type: "text", nullable: true, name: "description" })
  description?: string | null;

  @Column({
    type: "varchar",
    length: 50,
    default: EAppStatus.Active,
    name: "status",
  })
  status: EAppStatus;

  /** See EAppAccessMode. Governs whether a stored grant is required. */
  @Column({
    type: "varchar",
    length: 50,
    default: EAppAccessMode.Open,
    name: "access_mode",
  })
  accessMode: EAppAccessMode;

  /**
   * Topics this app supports, for example ["messages", "typing", "presence"].
   *
   * This is the authoritative topic list for resolution. A grant with a null
   * topic list inherits from here. Note that rooms also carry a `topics`
   * column, which resolution does not read.
   */
  @Column({ type: "jsonb", nullable: true, name: "topics", default: [] })
  topics?: string[] | null;

  @Column({ type: "jsonb", nullable: true, name: "topic_configs" })
  topicConfigs?: TopicConfigs | null;

  /**
   * Called when an actor subscribes, to pre-populate it with current state.
   */
  @Column({ type: "jsonb", nullable: true, name: "hydration_webhook" })
  hydrationWebhook?: IWebhookConfig | null;

  /**
   * Called when an actor publishes, so external systems can react.
   */
  @Column({ type: "jsonb", nullable: true, name: "trigger_webhook" })
  triggerWebhook?: IWebhookConfig | null;

  // Relations
  @ManyToOne(() => ProjectEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: ProjectEntity;
}
