import { Injectable, Logger } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { encryptSecret, decryptSecret } from "../../common/utils/secretCipher";
import { generateCredential } from "../../common/utils/secretHash";
import { TtlCache } from "../../common/utils/ttlCache";
import { CoreConfigService } from "../configModule/config.service";
import { ESigningKeyPrefix } from "./enum/ESigningKeyPrefix.enum";
import { ESigningKeyStatus } from "./enum/ESigningKeyStatus.enum";
import { SigningKeyEntity } from "./signingKey.entity";
import { SigningKeyRepository } from "./signingKey.repository";

export interface GeneratedSigningKey {
  keyId: string;
  secret: string;
  /** `keyId.secret`. Shown once at creation. */
  signingKey: string;
}

export interface ClientTokenPayload {
  /** Actor token public key id, at_live_... */
  sub: string;
  /** Unix seconds */
  exp: number;
  iat?: number;
}

export interface VerifiedClientToken {
  signingKey: SigningKeyEntity;
  payload: ClientTokenPayload;
}

const KID_PATTERN = /^sk_(live|sandbox)_[0-9a-f]{12}$/;
const SUB_PATTERN = /^at_(live|sandbox)_[0-9a-f]{12}$/;

/** Client tokens are short-lived by contract. Anything longer is refused. */
const MAX_TTL_SECONDS = 3600;
const CLOCK_SKEW_SECONDS = 60;

/**
 * Signing Key Service
 *
 * Verifies client tokens: short-lived HS256 JWTs that a customer mints on their
 * own backend so a browser never holds a long-lived credential.
 *
 * The signing key proves the token was issued by someone holding the project's
 * secret. It grants nothing by itself. Every permission resolves from the actor
 * named in `sub`.
 */
@Injectable()
export class SigningKeyService {
  private readonly _logger = new Logger(SigningKeyService.name);

  /**
   * Entity plus decrypted secret, keyed by kid, so a connection burst does not
   * mean a database read and an AES decrypt each.
   *
   * Consequence worth knowing: disabling or deleting a signing key takes effect
   * for new connections only after this TTL expires.
   */
  private readonly _kidCache = new TtlCache<{
    entity: SigningKeyEntity;
    secret: string;
  }>(60_000);

  constructor(
    private readonly _signingKeyRepository: SigningKeyRepository,
    private readonly _config: CoreConfigService,
  ) {}

  private encryptionKey(): string {
    const key = this._config.signingKeyEncryptionKey;
    if (!key) {
      throw new Error(
        "SIGNING_KEY_ENCRYPTION_KEY is not configured; signing keys are unavailable",
      );
    }
    return key;
  }

  /**
   * Mint a signing key. The plaintext secret is returned once and then only the
   * encrypted form is retained.
   */
  generateSigningKey(
    environmentPrefix: ESigningKeyPrefix = ESigningKeyPrefix.Live,
  ): GeneratedSigningKey {
    const { keyId, secret, credential } = generateCredential(environmentPrefix);
    return { keyId, secret, signingKey: credential };
  }

  /** Encrypt a secret for storage. Throws if no encryption key is configured. */
  encryptForStorage(secret: string): string {
    return encryptSecret(secret, this.encryptionKey());
  }

  /**
   * Verify a client token.
   *
   * Checks run in this order, and the order matters: nothing touches the
   * database until the algorithm and kid are known-good, and nothing trusts a
   * claim until the signature has been verified.
   *
   *  1. three dot-segments and an "eyJ" prefix
   *  2. decodable
   *  3. alg is exactly HS256, which rules out alg=none and RS256 confusion
   *  4. kid matches sk_(live|sandbox)_<12 hex>
   *  5. the key exists, is not soft-deleted, and is active
   *  6. signature and expiry, algorithm pinned again at the verify call
   *  7. exp is present, because jsonwebtoken does not require it
   *  8. exp is within the one hour cap
   *  9. sub names an actor token
   * 10. record usage, best effort
   *
   * Every failure returns null and logs the reason. Nothing about which check
   * failed reaches the caller, so this cannot be used to probe which keys or
   * actors exist.
   *
   * Does NOT check that the actor belongs to the same project as the signing
   * key. That check is the caller's, because the actor is resolved separately,
   * and it is load-bearing for tenant isolation.
   */
  async verifyClientToken(token: string): Promise<VerifiedClientToken | null> {
    const segments = token.split(".");
    if (segments.length !== 3 || !token.startsWith("eyJ")) {
      return null;
    }

    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      return null;
    }

    const { alg, kid } = decoded.header;
    if (alg !== "HS256") {
      this._logger.warn("Client token rejected: disallowed algorithm", { alg });
      return null;
    }
    if (!kid || !KID_PATTERN.test(kid)) {
      this._logger.warn("Client token rejected: missing or malformed kid");
      return null;
    }

    const resolved = await this._resolveSigningKey(kid);
    if (!resolved) {
      return null;
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, resolved.secret, {
        algorithms: ["HS256"],
        clockTolerance: CLOCK_SKEW_SECONDS,
      }) as jwt.JwtPayload;
    } catch (error) {
      this._logger.warn("Client token rejected: verification failed", {
        kid,
        reason: error instanceof Error ? error.message : "unknown",
      });
      return null;
    }

    if (typeof payload.exp !== "number") {
      this._logger.warn("Client token rejected: missing exp claim", { kid });
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp > nowSeconds + MAX_TTL_SECONDS + CLOCK_SKEW_SECONDS) {
      this._logger.warn("Client token rejected: exp exceeds TTL cap", {
        kid,
        exp: payload.exp,
      });
      return null;
    }

    if (typeof payload.sub !== "string" || !SUB_PATTERN.test(payload.sub)) {
      this._logger.warn("Client token rejected: missing or malformed sub", {
        kid,
      });
      return null;
    }

    void this._signingKeyRepository
      .updateLastUsed(resolved.entity.signingKeyId)
      .catch((err) => this._logger.error("Failed to update lastUsedAt", err));

    return {
      signingKey: resolved.entity,
      payload: {
        sub: payload.sub,
        exp: payload.exp,
        iat: payload.iat,
      },
    };
  }

  private async _resolveSigningKey(
    kid: string,
  ): Promise<{ entity: SigningKeyEntity; secret: string } | null> {
    const cached = this._kidCache.get(kid);
    if (cached) {
      return cached;
    }

    const entity = await this._signingKeyRepository.findByKeyId(kid);
    if (!entity) {
      this._logger.warn("Client token rejected: unknown signing key", { kid });
      return null;
    }

    if (entity.status !== ESigningKeyStatus.Active) {
      this._logger.warn("Client token rejected: signing key not active", {
        kid,
        projectId: entity.projectId,
        status: entity.status,
      });
      return null;
    }

    let secret: string;
    try {
      // encryptionKey() is called inside the try on purpose: with no key
      // configured this throws, is caught here, and every client token is
      // refused. Failing closed is the correct outcome for a missing secret.
      secret = decryptSecret(entity.secretEncrypted, this.encryptionKey());
    } catch (error) {
      this._logger.error("Failed to decrypt signing key secret", {
        kid,
        projectId: entity.projectId,
        error: error instanceof Error ? error.message : "unknown",
      });
      return null;
    }

    const resolved = { entity, secret };
    this._kidCache.set(kid, resolved);
    return resolved;
  }

  /** Drop a key from the kid cache, so a revocation takes effect immediately. */
  invalidateCache(keyId: string): void {
    this._kidCache.delete(keyId);
  }
}
