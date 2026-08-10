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
import { ESigningKeyStatus } from "./enum/ESigningKeyStatus.enum";

const entityName = "signing_key";

/**
 * Signing Key Entity
 *
 * A project-level HS256 secret used to mint short-lived client tokens on your
 * own backend, so a browser never holds a long-lived credential.
 *
 * The JWT header `kid` names this key. The payload `sub` names an actor token.
 * All grants resolve from the actor, never from the signing key: the key only
 * proves the token was issued by someone holding the project's secret.
 *
 * Credential format: sk_{live|sandbox}_{keyId}.{secret}
 *
 * Unlike actor token secrets, this one is stored encrypted rather than hashed,
 * because HS256 verification needs the original value. See
 * common/utils/secretCipher.ts. That makes SIGNING_KEY_ENCRYPTION_KEY a
 * genuinely sensitive secret: it decrypts every signing key in the database.
 */
@Entity(entityName)
@Index(["projectId", "status"])
@Index(["keyId"], { unique: true })
export class SigningKeyEntity extends BaseTimeEntity {
  static entityName() {
    return entityName;
  }

  @PrimaryColumn({ type: "uuid", name: "signing_key_id" })
  signingKeyId: string;

  @BeforeInsert()
  generateId() {
    this.signingKeyId = generateDBUuid(); // UUID v7
  }

  /**
   * A client token signed with this key may only name actors in this project.
   * Enforced at verification time, and it is the load-bearing tenant check for
   * the client token path.
   */
  @Column({ type: "uuid", name: "project_id" })
  @Index()
  projectId: string;

  /** Public identifier, used as the JWT header kid. Unique index on the class. */
  @Column({ type: "varchar", length: 100, name: "key_id" })
  keyId: string;

  /** AES-256-GCM blob. See common/utils/secretCipher.ts for the format. */
  @Column({ type: "text", name: "secret_encrypted" })
  secretEncrypted: string;

  @Column({ type: "varchar", length: 255, name: "name" })
  name: string;

  /**
   * A disabled key stops verifying new client tokens. Sessions already
   * established run until their JWT expires, so disabling is not a kill switch
   * for live connections.
   */
  @Column({
    type: "varchar",
    length: 50,
    default: ESigningKeyStatus.Active,
    name: "status",
  })
  status: ESigningKeyStatus;

  @Column({ type: "timestamptz", nullable: true, name: "last_used_at" })
  lastUsedAt: Date | null;

  // Relations
  @ManyToOne(() => ProjectEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: ProjectEntity;
}
