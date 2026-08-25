import { Injectable, Logger } from "@nestjs/common";
import { TtlCache } from "../../common/utils/ttlCache";
import {
  DUMMY_SECRET_HASH,
  generateCredential,
  GeneratedCredential,
  splitCredential,
  verifySecretHash,
} from "../../common/utils/secretHash";
import { EntityManager, IsNull, UpdateResult } from "typeorm";
import { badRequestException } from "../../utils/exceptions";
import { ActorTokenEntity } from "./actorToken.entity";
import {
  ActorTokenCreateDto,
  ActorTokenPatchDto,
  CreatedActorToken,
} from "./dto/actorToken.dto";
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

  /* ── CRUD ─────────────────────────────────────────────────────────────
   *
   * Ported from Titus's `actorTokenModule/actorToken.service.ts`. Every read
   * filters `deletedAt IS NULL` explicitly: a resurrected actor is an actor
   * somebody revoked.
   */

  private _repo(manager?: EntityManager) {
    return manager
      ? manager.getRepository(ActorTokenEntity)
      : this._actorTokenRepository;
  }

  findByIdAndProject(
    actorTokenId: string,
    projectId: string,
    manager?: EntityManager,
  ): Promise<ActorTokenEntity | null> {
    return this._repo(manager).findOne({
      where: { actorTokenId, projectId, deletedAt: IsNull() },
    });
  }

  listByProjectId(projectId: string): Promise<ActorTokenEntity[]> {
    return this._actorTokenRepository.find({
      where: { projectId, deletedAt: IsNull() },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Mint an actor and return its credential once.
   *
   * Only the hash is stored, so the caller either hands `accessToken` to
   * whoever needs it now or it is gone.
   */
  async createActorToken(
    projectId: string,
    data: ActorTokenCreateDto,
    manager?: EntityManager,
  ): Promise<CreatedActorToken> {
    const generated = this.generateActorToken();

    const entity = new ActorTokenEntity();
    entity.projectId = projectId;
    entity.keyId = generated.keyId;
    entity.secretHash = generated.secretHash;
    entity.name = data.name;
    entity.actorType = data.actorType;
    entity.status = EActorTokenStatus.Active;
    entity.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    entity.metadata = data.metadata ?? null;
    entity.accessScopeId = data.accessScopeId ?? null;

    const saved = await this._repo(manager).save(entity);

    return { entity: saved, accessToken: generated.credential };
  }

  updateLock(
    actorTokenId: string,
    projectId: string,
    manager: EntityManager,
  ): Promise<ActorTokenEntity | null> {
    const alias = ActorTokenEntity.entityName();
    return manager
      .createQueryBuilder(ActorTokenEntity, alias)
      .where(
        `${alias}.actorTokenId = :actorTokenId AND ${alias}.projectId = :projectId`,
        { actorTokenId, projectId },
      )
      .andWhere(`${alias}.deletedAt IS NULL`)
      .setLock("pessimistic_read")
      .getOne();
  }

  async patchActorToken(
    actorTokenId: string,
    projectId: string,
    data: ActorTokenPatchDto,
    manager?: EntityManager,
  ): Promise<ActorTokenEntity> {
    const repo = this._repo(manager);

    const entity = await repo.findOne({
      where: { actorTokenId, projectId, deletedAt: IsNull() },
    });

    if (!entity) {
      throw badRequestException(this._logger, {
        errorMsgUser: "Could not update actor token",
        errorMsgSystem: "ActorTokenService:patchActorToken:not_found",
      });
    }

    // Field by field. `keyId`, `secretHash` and `actorType` are absent from the
    // DTO and must stay that way: the first two are the credential and the
    // third decides which grants apply.
    if (data.name !== undefined) entity.name = data.name;
    if (data.status !== undefined) entity.status = data.status;
    if (data.expiresAt !== undefined) {
      entity.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    }
    if (data.metadata !== undefined) entity.metadata = data.metadata;
    if (data.accessScopeId !== undefined) {
      entity.accessScopeId = data.accessScopeId;
    }

    return repo.save(entity);
  }

  removeActorToken(
    actorTokenId: string,
    projectId: string,
    manager?: EntityManager,
  ): Promise<UpdateResult> {
    return this._repo(manager).softDelete({
      actorTokenId,
      projectId,
      deletedAt: IsNull(),
    });
  }
}
