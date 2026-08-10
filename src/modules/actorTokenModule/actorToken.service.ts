import { Injectable, Logger } from "@nestjs/common";
import { TtlCache } from "../../common/utils/ttlCache";
import {
  DUMMY_SECRET_HASH,
  generateCredential,
  GeneratedCredential,
  splitCredential,
  verifySecretHash,
} from "../../common/utils/secretHash";
import { ActorTokenEntity } from "./actorToken.entity";
import { ActorTokenRepository } from "./actorToken.repository";
import { EActorTokenPrefix } from "./enum/EActorTokenPrefix.enum";
import { EActorTokenStatus } from "./enum/EActorTokenStatus.enum";

/**
 * Actor Token Service
 *
 * Authenticates opaque actor tokens of the form at_{live|sandbox}_{keyId}.{secret}.
 */
@Injectable()
export class ActorTokenService {
  private readonly _logger = new Logger(ActorTokenService.name);

  /**
   * Keyed on the FULL credential, never on the key id alone.
   *
   * Caching by key id would return a previously authenticated entity for any
   * secret presented with a known key id, which is an authentication bypass.
   * The cache key must include the thing being verified.
   */
  private readonly _authCache = new TtlCache<ActorTokenEntity>(60_000);

  constructor(private readonly _actorTokenRepository: ActorTokenRepository) {}

  generateActorToken(
    environmentPrefix: EActorTokenPrefix = EActorTokenPrefix.Live,
  ): GeneratedCredential {
    return generateCredential(environmentPrefix);
  }

  /**
   * Authenticate a presented access token.
   *
   * Constant-time by construction: a lookup miss still performs a comparison
   * against a dummy hash, so an unknown key id costs the same as a known one
   * with a wrong secret.
   */
  async authenticateActorToken(
    accessToken: string,
  ): Promise<ActorTokenEntity | null> {
    const parts = splitCredential(accessToken);
    if (!parts) {
      return null;
    }

    const cached = this._authCache.get(accessToken);
    if (cached) {
      return cached;
    }

    const actorToken = await this._actorTokenRepository.findByKeyId(
      parts.keyId,
    );

    // Always compare, whether or not the row exists.
    const isValid = verifySecretHash(
      actorToken?.secretHash ?? DUMMY_SECRET_HASH,
      parts.secret,
    );

    if (!actorToken || !isValid) {
      return null;
    }

    if (!this._isUsable(actorToken, parts.keyId)) {
      return null;
    }

    this._authCache.set(accessToken, actorToken);
    this._touch(actorToken.actorTokenId);

    return actorToken;
  }

  /**
   * Resolve an active actor by public key id WITHOUT verifying a secret.
   *
   * For the client-token path only, where possession is already proven by the
   * signing key signature. Never call this with caller-supplied input that has
   * not been through signature verification first.
   */
  async getActiveActorByKeyId(keyId: string): Promise<ActorTokenEntity | null> {
    const actorToken = await this._actorTokenRepository.findByKeyId(keyId);
    if (!actorToken) {
      return null;
    }

    if (!this._isUsable(actorToken, keyId)) {
      return null;
    }

    this._touch(actorToken.actorTokenId);

    return actorToken;
  }

  findByKeyIdAndProject(
    keyId: string,
    projectId: string,
  ): Promise<ActorTokenEntity | null> {
    return this._actorTokenRepository.findByKeyIdAndProject(keyId, projectId);
  }

  /** Active and not expired. Shared by both authentication paths. */
  private _isUsable(actorToken: ActorTokenEntity, keyId: string): boolean {
    if (actorToken.status !== EActorTokenStatus.Active) {
      this._logger.warn("Rejected non-active actor token", {
        keyId,
        projectId: actorToken.projectId,
        status: actorToken.status,
      });
      return false;
    }

    if (actorToken.expiresAt && new Date(actorToken.expiresAt) < new Date()) {
      this._logger.warn("Rejected expired actor token", {
        keyId,
        projectId: actorToken.projectId,
        expiresAt: actorToken.expiresAt,
      });
      return false;
    }

    return true;
  }

  /** Fire and forget. A failed usage stamp must not deny a valid connection. */
  private _touch(actorTokenId: string): void {
    void this._actorTokenRepository
      .updateLastUsed(actorTokenId)
      .catch((err) => this._logger.error("Failed to update lastUsedAt", err));
  }
}
