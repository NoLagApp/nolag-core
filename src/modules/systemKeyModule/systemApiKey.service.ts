import { Injectable, Logger } from "@nestjs/common";
import {
  DUMMY_SECRET_HASH,
  generateCredential,
  GeneratedCredential,
  splitCredential,
  verifySecretHash,
} from "../../common/utils/secretHash";
import { TtlCache } from "../../common/utils/ttlCache";
import { ESystemKeyPrefix } from "./enum/ESystemKeyPrefix.enum";
import { ESystemKeyStatus } from "./enum/ESystemKeyStatus.enum";
import { SystemApiKeyEntity } from "./systemApiKey.entity";
import { SystemApiKeyRepository } from "./systemApiKey.repository";

/**
 * System API Key Service
 *
 * Authenticates callers of the internal endpoints, which in practice means the
 * broker. A system key is not scoped to a project and can ask about any actor,
 * so holding one is equivalent to being core itself.
 *
 * Membership of the system_api_key table *is* the privilege. There is no
 * further predicate to get wrong.
 */
@Injectable()
export class SystemApiKeyService {
  private readonly _logger = new Logger(SystemApiKeyService.name);

  /** Keyed on the full credential, never the key id. See ActorTokenService. */
  private readonly _authCache = new TtlCache<SystemApiKeyEntity>(30_000);

  constructor(private readonly _repository: SystemApiKeyRepository) {}

  generateSystemApiKey(): GeneratedCredential {
    return generateCredential(ESystemKeyPrefix.System);
  }

  /**
   * Authenticate a presented system key. Constant-time against unknown key ids.
   */
  async authenticate(apiKey: string): Promise<SystemApiKeyEntity | null> {
    const parts = splitCredential(apiKey);
    if (!parts) {
      return null;
    }

    if (!parts.keyId.startsWith(ESystemKeyPrefix.System)) {
      return null;
    }

    const cached = this._authCache.get(apiKey);
    if (cached) {
      return cached;
    }

    const key = await this._repository.findByKeyId(parts.keyId);

    // Always compare, whether or not the row exists.
    const isValid = verifySecretHash(
      key?.secretHash ?? DUMMY_SECRET_HASH,
      parts.secret,
    );

    if (!key || !isValid) {
      return null;
    }

    if (key.status !== ESystemKeyStatus.Active) {
      this._logger.warn("Rejected non-active system key", {
        keyId: parts.keyId,
        status: key.status,
      });
      return null;
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      this._logger.warn("Rejected expired system key", {
        keyId: parts.keyId,
        expiresAt: key.expiresAt,
      });
      return null;
    }

    this._authCache.set(apiKey, key);

    void this._repository
      .updateLastUsed(key.systemApiKeyId)
      .catch((err) => this._logger.error("Failed to update lastUsedAt", err));

    return key;
  }
}
