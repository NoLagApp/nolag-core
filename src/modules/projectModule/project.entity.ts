import { BeforeInsert, Column, Entity, PrimaryColumn } from "typeorm";
import { BaseTimeEntity } from "../../common/entities/base.entity";
import { generateDBUuid } from "../../utils/guid";

const entityName = "project";

/**
 * Project Entity
 *
 * The unit of isolation. Actors, apps, rooms, scopes and signing keys all
 * belong to exactly one project, and no resolution path crosses between them.
 *
 * Two deliberate differences from the same table in NoLag's hosted control
 * plane:
 *
 * 1. No `organization` or `members` relations. Declaring them would pull an
 *    organization entity, then project members, then users into TypeORM's
 *    metadata graph, and with them billing columns that have no business being
 *    in this service. `organizationId` stays as an opaque tenant reference that
 *    core stores and returns but never interprets or joins on.
 *
 * 2. Connection limits live here as plain numbers. Core enforces them without
 *    knowing where they came from, which is what keeps commercial concerns out
 *    of the authorization path entirely.
 */
@Entity(entityName)
export class ProjectEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "project_id" })
  projectId: string;

  @BeforeInsert()
  generateId() {
    this.projectId = generateDBUuid(); // UUID v7
  }

  /**
   * Opaque tenant reference. Returned for attribution, never interpreted.
   * Nullable because a self-hosted deployment has no organization concept.
   */
  @Column({ type: "uuid", nullable: true, name: "organization_id" })
  organizationId: string | null;

  @Column({ type: "varchar", length: 255, name: "name" })
  name: string;

  @Column({ type: "text", nullable: true, name: "description" })
  description?: string | null;

  /* ── Limits ──────────────────────────────────────────────────────────── */

  /**
   * Maximum concurrent connections. NULL means unlimited.
   *
   * A zero is never authoritative. Upstream systems can derive zero from a
   * lapsed subscription, and writing that here would silently cap a project at
   * no connections at all. Resolution treats zero as "unset" and falls back to
   * the configured default.
   */
  @Column({ type: "integer", nullable: true, name: "max_connections" })
  maxConnections: number | null;

  /** Maximum message size in bytes. NULL means unlimited. */
  @Column({ type: "integer", nullable: true, name: "max_message_size_bytes" })
  maxMessageSizeBytes: number | null;

  /** Session lifetime for persistent actor types. NULL means use the default. */
  @Column({ type: "integer", nullable: true, name: "session_expiry_seconds" })
  sessionExpirySeconds: number | null;

  /**
   * Presence marker for the limit columns above.
   *
   * Required because NULL already means "unlimited" on the wire, so a null
   * limit alone cannot distinguish an uncapped project from one that was never
   * configured. When this is null, resolution uses the configured defaults
   * rather than treating the nulls as authoritative.
   */
  @Column({ type: "timestamptz", nullable: true, name: "limits_synced_at" })
  limitsSyncedAt: Date | null;
}
