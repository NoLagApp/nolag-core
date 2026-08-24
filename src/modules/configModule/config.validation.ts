import { plainToInstance } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from "class-validator";

/**
 * Core configuration
 *
 * Deliberately small. Core must boot with nothing but a Postgres connection,
 * because a self-hosted deployment has no identity provider, no billing
 * processor and no hosted-only secrets to supply.
 *
 * Anything added here becomes something a self-hoster has to configure, so the
 * bar for a new required variable is high. Prefer an optional variable with a
 * working default.
 */
export class CoreConfigValidation {
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  /* ───────────── Postgres ───────────── */

  /**
   * Unix socket directory. When set, takes precedence over host and port.
   * Cloud SQL and similar use this form.
   */
  @IsOptional()
  @IsString()
  POSTGRES_SOCKET_PATH?: string;

  @IsOptional()
  @IsString()
  POSTGRES_HOST?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  POSTGRES_PORT?: number;

  @IsString()
  POSTGRES_USER: string;

  @IsString()
  POSTGRES_PASSWORD: string;

  @IsString()
  POSTGRES_DATABASE: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  POSTGRES_POOL_MIN?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  POSTGRES_POOL_MAX?: number;

  /* ───────────── Migrations ───────────── */

  /**
   * When "true", core will not run migrations on boot.
   *
   * This exists so core can be pointed at a database whose schema is owned by
   * something else. Guarding only one of the two TypeORM migration paths is a
   * known trap, so both are gated on this single value. See database.module.ts.
   */
  @IsOptional()
  @IsString()
  SKIP_MIGRATIONS?: string;

  /* ───────────── Browser access ───────────── */

  /**
   * Comma separated list of origins allowed to call core from a browser.
   *
   * Unset means CORS stays off, which is correct for the headless case: the
   * broker and any server-side caller are not subject to it, so a deployment
   * that runs no UI should not be relaxing browser policy at all. `*` is
   * rejected, because every endpoint here is behind a system key and a wildcard
   * would let any page on the internet drive the key a user pasted into a tab.
   */
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  /* ───────────── Client tokens ───────────── */

  /**
   * 32 bytes, base64 encoded. Required only to issue or verify client tokens,
   * because HS256 verification needs the original signing secret and so it is
   * stored encrypted rather than hashed.
   *
   * Optional: a deployment that only uses opaque actor tokens does not need it.
   * Without it, signing key operations are refused rather than degraded.
   */
  @IsOptional()
  @IsString()
  SIGNING_KEY_ENCRYPTION_KEY?: string;

  /* ───────────── Default limits ───────────── */

  /**
   * Used when a project row has no synced limits. Empty means unlimited, which
   * is the right default for a self-hosted deployment: limits are a commercial
   * concern and core has no opinion about them.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  DEFAULT_MAX_CONNECTIONS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  DEFAULT_MAX_MESSAGE_SIZE_BYTES?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  DEFAULT_SESSION_EXPIRY_SECONDS?: number;
}

/**
 * Validate at boot and fail loudly. A misconfigured authorization service
 * should refuse to start rather than serve decisions from bad configuration.
 */
export function validateCoreConfig(
  raw: Record<string, unknown>,
): CoreConfigValidation {
  const config = plainToInstance(CoreConfigValidation, raw, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false });

  if (errors.length > 0) {
    const detail = errors
      .map(
        (e) =>
          `  ${e.property}: ${Object.values(e.constraints ?? {}).join(", ")}`,
      )
      .join("\n");
    throw new Error(`Invalid core configuration:\n${detail}`);
  }

  return config;
}
