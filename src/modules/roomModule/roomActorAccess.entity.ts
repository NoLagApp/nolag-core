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
import { ActorTokenEntity } from "../actorTokenModule/actorToken.entity";
import { EAccessPermission } from "../actorTokenModule/enum/EAccessPermission.enum";
import { EActorType } from "../actorTokenModule/enum/EActorType.enum";
import { RoomEntity } from "./room.entity";

const entityName = "room_actor_access";

/**
 * Room Actor Access Entity
 *
 * Room-level access control, evaluated after app-level access.
 *
 * The rule that surprises people: **a room is private if and only if at least
 * one row exists for it.** A room with no rows is reachable by anyone with
 * access to its app. Adding the first row flips the room to invite-only, which
 * means creating a grant can revoke access for everyone you did not name.
 *
 * A row applies either to one actor or to an actor type:
 * - actorTokenId set: applies to that actor only
 * - actorType set:    applies to every actor of that type
 * A matching actor-specific row wins over a type row.
 */
@Entity(entityName)
@Index(["roomId"])
@Index(["actorTokenId"])
export class RoomActorAccessEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "room_actor_access_id" })
  roomActorAccessId: string;

  @BeforeInsert()
  generateId() {
    this.roomActorAccessId = generateDBUuid(); // UUID v7
  }

  @Column({ type: "uuid", name: "room_id" })
  roomId: string;

  /** NULL for a type-based rule. Either this or actorType must be set. */
  @Column({ type: "uuid", name: "actor_token_id", nullable: true })
  actorTokenId: string | null;

  /** NULL for an actor-specific rule. Either this or actorTokenId must be set. */
  @Column({ type: "varchar", length: 50, nullable: true, name: "actor_type" })
  actorType?: EActorType | null;

  @Column({ type: "varchar", length: 50, name: "permission" })
  permission: EAccessPermission;

  /**
   * Topic restriction within the room.
   * NULL inherits whatever the app-level grant resolved to.
   */
  @Column({ type: "jsonb", nullable: true, name: "topics" })
  topics?: string[] | null;

  @Column({ type: "boolean", default: true, name: "is_active" })
  isActive: boolean;

  @Column({ type: "timestamptz", nullable: true, name: "expires_at" })
  expiresAt: Date | null;

  /** Display label only. Carries no authorization meaning. */
  @Column({ type: "varchar", length: 50, nullable: true, name: "role" })
  role?: string | null;

  @Column({ type: "jsonb", nullable: true, name: "metadata" })
  metadata?: Record<string, unknown> | null;

  // Relations
  @ManyToOne(() => RoomEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "room_id" })
  room!: RoomEntity;

  @ManyToOne(() => ActorTokenEntity, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "actor_token_id" })
  actorToken?: ActorTokenEntity | null;
}
