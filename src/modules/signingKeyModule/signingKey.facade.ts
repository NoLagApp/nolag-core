import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, UpdateResult } from "typeorm";
import { PaginatedResult } from "../../common/pagination";
import { CORE_DATA_SOURCE } from "../../core.options";
import { notFoundException } from "../../utils/exceptions";
import { SigningKeyEntity } from "./signingKey.entity";
import {
  CreatedSigningKey,
  SigningKeyCreateDto,
  SigningKeyPatchDto,
} from "./dto/signingKey.dto";
import { SigningKeyQuery } from "./query/signingKey.query";
import { SigningKeyQueryService } from "./query/signingKey.query.service";
import { ESigningKeyPrefix } from "./enum/ESigningKeyPrefix.enum";
import {
  GeneratedSigningKey,
  SigningKeyService,
  VerifiedClientToken,
} from "./signingKey.service";

/**
 * Thin by design. See the note on ActorTokenFacade.
 */
@Injectable()
export class SigningKeyFacade {
  private readonly _logger = new Logger(SigningKeyFacade.name);

  constructor(
    private readonly _signingKeyService: SigningKeyService,
    private readonly _queryService: SigningKeyQueryService,
    @InjectDataSource(CORE_DATA_SOURCE)
    private readonly _dataSource: DataSource,
  ) {}

  generateSigningKey(
    environmentPrefix?: ESigningKeyPrefix,
  ): GeneratedSigningKey {
    return this._signingKeyService.generateSigningKey(environmentPrefix);
  }

  encryptForStorage(secret: string): string {
    return this._signingKeyService.encryptForStorage(secret);
  }

  verifyClientToken(token: string): Promise<VerifiedClientToken | null> {
    return this._signingKeyService.verifyClientToken(token);
  }

  invalidateCache(keyId: string): void {
    this._signingKeyService.invalidateCache(keyId);
  }

  /* ── CRUD ───────────────────────────────────────────────────────────── */

  listSigningKeys(
    projectId: string,
    query: SigningKeyQuery,
  ): Promise<PaginatedResult<SigningKeyEntity>> {
    return this._queryService.findPaginated(query, projectId);
  }

  async getSigningKey(
    signingKeyId: string,
    projectId: string,
  ): Promise<SigningKeyEntity> {
    const key = await this._signingKeyService.findByIdAndProject(
      signingKeyId,
      projectId,
    );
    if (!key) {
      throw notFoundException(this._logger, {
        errorMsgUser: `Signing key ${signingKeyId} not found`,
      });
    }
    return key;
  }

  /** The key comes back once. Only the encrypted secret is stored. */
  createSigningKey(
    projectId: string,
    data: SigningKeyCreateDto,
  ): Promise<CreatedSigningKey> {
    return this._dataSource.transaction((manager) =>
      this._signingKeyService.createSigningKey(projectId, data, manager),
    );
  }

  updateSigningKey(
    signingKeyId: string,
    projectId: string,
    data: SigningKeyPatchDto,
  ): Promise<SigningKeyEntity> {
    return this._dataSource.transaction(async (manager) => {
      const existing = await this._signingKeyService.updateLock(
        signingKeyId,
        projectId,
        manager,
      );
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Signing key ${signingKeyId} not found`,
        });
      }

      return this._signingKeyService.patchSigningKey(
        signingKeyId,
        projectId,
        data,
        manager,
      );
    });
  }

  /**
   * Deleting a key stops every client token signed by it from verifying, which
   * disconnects those actors at their next revalidate rather than immediately.
   */
  deleteSigningKey(
    signingKeyId: string,
    projectId: string,
  ): Promise<UpdateResult> {
    return this._dataSource.transaction(async (manager) => {
      const existing = await this._signingKeyService.updateLock(
        signingKeyId,
        projectId,
        manager,
      );
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Signing key ${signingKeyId} not found`,
        });
      }

      return this._signingKeyService.removeSigningKey(
        signingKeyId,
        projectId,
        manager,
      );
    });
  }
}
