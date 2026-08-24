import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CoreConfigValidation } from "./config.validation";

/**
 * Typed accessors over the validated core configuration.
 *
 * Boolean environment variables arrive as strings. Every boolean here is
 * opt-in (`=== "true"`) so that an unset or misspelled value lands on the safe
 * default rather than silently enabling behaviour.
 */
@Injectable()
export class CoreConfigService {
  constructor(
    private readonly cfg: ConfigService<CoreConfigValidation, true>,
  ) {}

  get nodeEnv(): string {
    return this.cfg.get("NODE_ENV", { infer: true }) ?? "development";
  }

  get isProduction(): boolean {
    return this.nodeEnv === "production";
  }

  get port(): number {
    return this.cfg.get("PORT", { infer: true }) ?? 3000;
  }

  /* ───────────── Postgres ───────────── */

  get pgSocketPath(): string | undefined {
    return this.cfg.get("POSTGRES_SOCKET_PATH", { infer: true });
  }

  get pgHost(): string {
    return this.cfg.get("POSTGRES_HOST", { infer: true }) ?? "localhost";
  }

  get pgPort(): number {
    return this.cfg.get("POSTGRES_PORT", { infer: true }) ?? 5432;
  }

  get pgUser(): string {
    return this.cfg.get("POSTGRES_USER", { infer: true });
  }

  get pgPassword(): string {
    return this.cfg.get("POSTGRES_PASSWORD", { infer: true });
  }

  get pgDatabase(): string {
    return this.cfg.get("POSTGRES_DATABASE", { infer: true });
  }

  get pgPoolMin(): number {
    return this.cfg.get("POSTGRES_POOL_MIN", { infer: true }) ?? 1;
  }

  get pgPoolMax(): number {
    return this.cfg.get("POSTGRES_POOL_MAX", { infer: true }) ?? 10;
  }

  /* ───────────── Migrations ───────────── */

  get skipMigrations(): boolean {
    return this.cfg.get("SKIP_MIGRATIONS", { infer: true }) === "true";
  }

  /* ───────────── Browser access ───────────── */

  /** Empty means CORS stays off. `*` is discarded rather than honoured. */
  get corsOrigins(): string[] {
    const raw = this.cfg.get("CORS_ORIGINS", { infer: true }) ?? "";

    return raw
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0 && origin !== "*");
  }

  /* ───────────── Client tokens ───────────── */

  get signingKeyEncryptionKey(): string | undefined {
    return this.cfg.get("SIGNING_KEY_ENCRYPTION_KEY", { infer: true });
  }

  /* ───────────── Default limits ───────────── */

  /** null means unlimited. */
  get defaultMaxConnections(): number | null {
    return this.cfg.get("DEFAULT_MAX_CONNECTIONS", { infer: true }) ?? null;
  }

  /** null means unlimited. */
  get defaultMaxMessageSizeBytes(): number | null {
    return (
      this.cfg.get("DEFAULT_MAX_MESSAGE_SIZE_BYTES", { infer: true }) ?? null
    );
  }

  get defaultSessionExpirySeconds(): number {
    return (
      this.cfg.get("DEFAULT_SESSION_EXPIRY_SECONDS", { infer: true }) ?? 3600
    );
  }
}
