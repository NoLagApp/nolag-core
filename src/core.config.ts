import { Inject, Injectable } from "@nestjs/common";
import { CORE_OPTIONS } from "./core.options";
// `import type` is required: with isolatedModules and emitDecoratorMetadata,
// a type named in a decorated constructor signature must not look like a value
// import, or TypeScript refuses to erase it.
import type { CoreModuleOptions } from "./core.options";

/**
 * Typed access to what the host supplied.
 *
 * This replaces the env-reading config service core had when it was a service
 * rather than a library. A library that reads `process.env` fights its host for
 * control of its own configuration, and makes itself untestable without one.
 */
@Injectable()
export class CoreConfig {
  constructor(
    @Inject(CORE_OPTIONS) private readonly _options: CoreModuleOptions,
  ) {}

  get signingKeyEncryptionKey(): string | undefined {
    return this._options.signingKeyEncryptionKey;
  }

  /** null means unlimited. */
  get defaultMaxConnections(): number | null {
    return this._options.defaultLimits?.maxConnections ?? null;
  }

  /** null means unlimited. */
  get defaultMaxMessageSizeBytes(): number | null {
    return this._options.defaultLimits?.maxMessageSizeBytes ?? null;
  }

  get defaultSessionExpirySeconds(): number {
    return this._options.defaultLimits?.sessionExpirySeconds ?? 3600;
  }
}
