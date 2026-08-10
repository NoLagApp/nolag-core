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
import { PlatformAppEntity } from "../platformAppModule/platformApp.entity";
import { ERoomStatus } from "./enum/ERoomStatus.enum";

const entityName = "room";

/**
 * Room Entity
 *
 * An addressable destination within an app. Rooms are the middle segment of a
 * topic pattern: {appSlug}/{roomSlug}/{topic}.
 *
 * A room is public until someone grants access to it. Precisely: a room is
 * private if and only if at least one room_actor_access row exists for it. See
 * RoomActorAccessEntity.
 */
@Entity(entityName)
@Index(["appId", "slug"], { unique: true, where: '"deleted_at" IS NULL' })
@Index(["appId", "status"])
export class RoomEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "room_id" })
  roomId: string;

  @BeforeInsert()
  generateId() {
    this.roomId = generateDBUuid(); // UUID v7
  }

  @Column({ type: "uuid", name: "app_id" })
  @Index()
  appId: string;

  /** URL-safe identifier, used in the topic pattern. */
  @Column({ type: "varchar", length: 100, name: "slug" })
  slug: string;

  @Column({ type: "varchar", length: 255, name: "name" })
  name: string;

  @Column({ type: "text", nullable: true, name: "description" })
  description?: string | null;

  @Column({
    type: "varchar",
    length: 50,
    default: ERoomStatus.Active,
    name: "status",
  })
  status: ERoomStatus;

  /**
   * Retained for compatibility and for callers that want a per-room topic
   * list, but authorization does NOT read this. The topic vocabulary comes from
   * the app, or from the grant that overrides it. Populating this expecting it
   * to widen or narrow access will have no effect.
   */
  @Column({ type: "jsonb", nullable: true, name: "topics" })
  topics?: string[] | null;

  @Column({ type: "jsonb", nullable: true, name: "metadata" })
  metadata?: Record<string, unknown> | null;

  // Relations
  @ManyToOne(() => PlatformAppEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "app_id" })
  app!: PlatformAppEntity;
}
