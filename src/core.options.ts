/**
 * What a host tells core when it mounts it.
 *
 * Deliberately small. Core reads no environment variables and opens no
 * connections of its own: the host owns the DataSource and passes core's
 * entities and migrations into it. Anything added here becomes something every
 * host has to understand, so the bar is high.
 */

/** Injection token for {@link CoreModuleOptions}. */
export const CORE_OPTIONS = Symbol("nolag-core:options");

/** Injection token for {@link CoreAuditSink}. */
export const CORE_AUDIT_SINK = Symbol("nolag-core:audit-sink");

/**
 * Something that happened, described in terms core actually knows about.
 *
 * Core cannot say who did it. It has no users, no organizations and no request
 * context, and it should stay that way. The host fills in the actor, the
 * request metadata and the destination.
 */
export interface CoreAuditEvent {
  /** Dotted verb, for example `actor_token.created`. */
  action: string;
  /** The kind of thing acted on, for example `actor_token`. */
  resourceType: string;
  resourceId?: string | null;
  projectId?: string | null;
  details?: Record<string, unknown> | null;
}

/**
 * Where audit events go.
 *
 * `record` is fire-and-forget and must not throw: a failure to write an audit
 * trail is not a reason to fail the operation that produced it. Core never
 * awaits it, so an implementation that needs to do IO should handle its own
 * errors, exactly as Titus's AuditLogFacade already does.
 */
export interface CoreAuditSink {
  record(event: CoreAuditEvent): void;
}

/** Falls back to these when a project has no synced limits. */
export interface CoreDefaultLimits {
  /** null means unlimited, which is the right default when nobody is billing. */
  maxConnections?: number | null;
  maxMessageSizeBytes?: number | null;
  sessionExpirySeconds?: number;
}

export interface CoreModuleOptions {
  /**
   * 32 bytes, base64 encoded. Needed only to issue or verify client tokens,
   * because HS256 verification needs the original secret and so it is stored
   * encrypted rather than hashed.
   *
   * Absent means signing key operations are refused rather than degraded. A
   * deployment that only uses opaque actor tokens does not need it.
   */
  signingKeyEncryptionKey?: string;

  defaultLimits?: CoreDefaultLimits;

  /** Defaults to discarding events. */
  auditSink?: CoreAuditSink;
}

/** Used when the host supplies no sink. */
export class NoopAuditSink implements CoreAuditSink {
  record(): void {
    // Nothing. A self-hosted deployment that wants an audit trail supplies one.
  }
}

