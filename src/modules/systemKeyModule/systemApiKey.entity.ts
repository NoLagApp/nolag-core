import { BeforeInsert, Column, Entity, Index, PrimaryColumn } from "typeorm";
import { BaseTimeEntity } from "../../common/entities/base.entity";
import { generateDBUuid } from "../../utils/guid";
import { ESystemKeyStatus } from "./enum/ESystemKeyStatus.enum";

const entityName = "system_api_key";

/**
 * System API Key Entity
 *
 * Authenticates callers of the internal endpoints, which in practice means the
 * broker. Not a tenant credential: a system key is not scoped to a project and
 * can ask about any actor, so it is as privileged as core itself.
 *
 * Credential format: nlg_system_{keyId}.{secret}, hashed the same way as actor
 * token secrets.
 *
 * Deliberately narrower than the equivalent table in NoLag's hosted control
 * plane, which multiplexes tenant keys, project keys and system keys into one
 * table and expresses "is a system key" as organization_id IS NULL AND
 * project_id IS NULL. Encoding a privilege level as a pair of null columns is
 * one missed predicate away from a tenant key authenticating as the broker.
 * Here, membership of this table *is* the privilege.
 */
@Entity(entityName)
@Index(["keyId"], { unique: true })
export class SystemApiKeyEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "system_api_key_id" })
  systemApiKeyId: string;

  @BeforeInsert()
  generateId() {
    this.systemApiKeyId = generateDBUuid(); // UUID v7
  }

  /** Public identifier, for example nlg_system_abc123def456. Unique index on the class. */
  @Column({ type: "varchar", length: 100, name: "key_id" })
  keyId: string;

  @Column({ type: "text", name: "secret_hash" })
  secretHash: string;

  @Column({ type: "varchar", length: 255, name: "name" })
  name: string;

  @Column({
    type: "varchar",
    length: 50,
    default: ESystemKeyStatus.Active,
    name: "status",
  })
  status: ESystemKeyStatus;

  /** NULL means never expires. */
  @Column({ type: "timestamptz", nullable: true, name: "expires_at" })
  expiresAt: Date | null;

  @Column({ type: "timestamptz", nullable: true, name: "last_used_at" })
  lastUsedAt: Date | null;
}
