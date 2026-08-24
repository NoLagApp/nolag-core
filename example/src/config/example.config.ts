import { Injectable } from "@nestjs/common";

/**
 * Configuration for the example host.
 *
 * This lives here rather than in `@nolag/core` because it is the host's
 * concern. A library that reads `process.env` fights its host for control of
 * its own configuration, so core takes what it needs through
 * `CoreModule.forRoot()` and reads no environment at all.
 */
@Injectable()
export class ExampleConfig {
  get nodeEnv(): string {
    return process.env.NODE_ENV ?? "development";
  }

  get isProduction(): boolean {
    return this.nodeEnv === "production";
  }

  get port(): number {
    return this._int(process.env.PORT) ?? 3000;
  }

  /* ── Postgres ───────────────────────────────────────────────────────── */

  get pgSocketPath(): string | undefined {
    return process.env.POSTGRES_SOCKET_PATH || undefined;
  }

  get pgHost(): string {
    return process.env.POSTGRES_HOST ?? "localhost";
  }

  get pgPort(): number {
    return this._int(process.env.POSTGRES_PORT) ?? 5432;
  }

  get pgUser(): string {
    return this._required("POSTGRES_USER");
  }

  get pgPassword(): string {
    return this._required("POSTGRES_PASSWORD");
  }

  get pgDatabase(): string {
    return this._required("POSTGRES_DATABASE");
  }

  get pgPoolMin(): number {
    return this._int(process.env.POSTGRES_POOL_MIN) ?? 1;
  }

  get pgPoolMax(): number {
    return this._int(process.env.POSTGRES_POOL_MAX) ?? 10;
  }

  /** Opt-in, so an unset or misspelled value lands on the safe default. */
  get skipMigrations(): boolean {
    return process.env.SKIP_MIGRATIONS === "true";
  }

  /* ── Browser access ─────────────────────────────────────────────────── */

  /**
   * Origins allowed to call this host from a browser. `*` is discarded: this
   * host authenticates nobody, so a wildcard would let any page on the internet
   * drive it from a visitor's machine.
   */
  get corsOrigins(): string[] {
    return (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0 && origin !== "*");
  }

  /* ── Passed through to core ─────────────────────────────────────────── */

  get signingKeyEncryptionKey(): string | undefined {
    return process.env.SIGNING_KEY_ENCRYPTION_KEY || undefined;
  }

  get defaultMaxConnections(): number | null {
    return this._int(process.env.DEFAULT_MAX_CONNECTIONS) ?? null;
  }

  get defaultMaxMessageSizeBytes(): number | null {
    return this._int(process.env.DEFAULT_MAX_MESSAGE_SIZE_BYTES) ?? null;
  }

  get defaultSessionExpirySeconds(): number {
    return this._int(process.env.DEFAULT_SESSION_EXPIRY_SECONDS) ?? 3600;
  }

  private _int(value: string | undefined): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private _required(name: string): string {
    const value = process.env[name];
    if (!value) {
      // Fail at boot rather than on the first query. A host that cannot reach
      // its database should refuse to start, not serve errors.
      throw new Error(`${name} is required`);
    }
    return value;
  }
}
