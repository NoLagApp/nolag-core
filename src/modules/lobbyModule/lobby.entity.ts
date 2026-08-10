import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from "typeorm";
import { BaseTimeEntity } from "../../common/entities/base.entity";
import { generateDBUuid } from "../../utils/guid";
import { PlatformAppEntity } from "../platformAppModule/platformApp.entity";
import { LobbyRoomEntity } from "./lobbyRoom.entity";

const entityName = "lobby";

/**
 * Lobby Entity
 *
 * A named group of rooms that share presence visibility. Setting presence on a
 * room propagates to every lobby that room belongs to, which is how an observer
 * watches many rooms at once without subscribing to each.
 *
 * Rooms are added to lobbies explicitly, via LobbyRoomEntity.
 */
@Entity(entityName)
// Partial, matching app and room. Without the predicate a soft-deleted lobby
// keeps its slug reserved forever and the slug can never be reused.
@Index(["appId", "slug"], { unique: true, where: '"deleted_at" IS NULL' })
export class LobbyEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "lobby_id" })
  lobbyId: string;

  @BeforeInsert()
  generateId() {
    this.lobbyId = generateDBUuid(); // UUID v7
  }

  @Column({ type: "uuid", name: "app_id" })
  @Index()
  appId: string;

  /** URL-safe identifier clients use to subscribe to the lobby. */
  @Column({ type: "varchar", length: 100, name: "slug" })
  slug: string;

  @Column({ type: "varchar", length: 255, name: "name" })
  name: string;

  @Column({ type: "text", nullable: true, name: "description" })
  description?: string | null;

  @Column({ type: "jsonb", nullable: true, name: "metadata" })
  metadata?: Record<string, unknown> | null;

  // Relations
  @ManyToOne(() => PlatformAppEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "app_id" })
  app!: PlatformAppEntity;

  @OneToMany(() => LobbyRoomEntity, (lobbyRoom) => lobbyRoom.lobby)
  lobbyRooms?: LobbyRoomEntity[];
}
