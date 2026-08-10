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
import { ActorTokenEntity } from "./actorToken.entity";

const entityName = "actor_token_state";

/**
 * One live subscription held by a session.
 */
export interface ITopicSubscription {
  name: string;
  topicId?: string;
  roomId?: string;
  /** Legacy filter form. Superseded by `filters`. */
  identifiers?: string[];
  /** Whether the broker should treat this as a shared subscription. */
  loadBalance?: boolean;
  /** Load balance group name. Defaults to the actor token id. */
  loadBalanceGroup?: string;
  /** Active filters. Each filter becomes a broker sub-topic. */
  filters?: string[];
}

export interface IConnectionState {
  topics?: ITopicSubscription[];
  presence?: {
    isOnline: boolean;
    lastSeen?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Actor Token State Entity
 *
 * Live session state: what this actor is currently subscribed to. Written by
 * the broker as actors subscribe and unsubscribe, and read back on revalidation
 * so a reconnecting session can be restored.
 *
 * This is the one hot-write table in core. Treat it as ephemeral: losing it
 * costs subscription tracking until clients resubscribe, not correctness.
 */
@Entity(entityName)
@Index(["actorTokenId"])
export class ActorTokenStateEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "actor_token_state_id" })
  actorTokenStateId: string;

  @BeforeInsert()
  generateId() {
    this.actorTokenStateId = generateDBUuid(); // UUID v7
  }

  @Column({ type: "uuid", name: "actor_token_id" })
  actorTokenId: string;

  @Column({ type: "jsonb", nullable: true, name: "connection_state" })
  connectionState?: IConnectionState | null;

  /** Which broker node holds this session. Useful for routing and debugging. */
  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
    name: "kraken_node_id",
  })
  krakenNodeId?: string | null;

  @Column({ type: "timestamptz", nullable: true, name: "connected_at" })
  connectedAt: Date | null;

  @Column({ type: "timestamptz", nullable: true, name: "last_activity_at" })
  lastActivityAt: Date | null;

  // Relations
  @ManyToOne(() => ActorTokenEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "actor_token_id" })
  actorToken!: ActorTokenEntity;
}
