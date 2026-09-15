import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager, IsNull, UpdateResult } from "typeorm";
import { PaginatedResult } from "../../common/pagination";
import { GeneratedCredential } from "../../common/utils/secretHash";
import { badRequestException, notFoundException } from "../../utils/exceptions";
import { AccessScopeEntity } from "../accessScopeModule/accessScope.entity";
import { ActorTokenEntity } from "./actorToken.entity";
import { ActorTokenService } from "./actorToken.service";
import {
  ActorTokenStateEntity,
  IConnectionState,
} from "./actorTokenState.entity";
import { ActorTokenStateRepository } from "./actorTokenState.repository";
import {
  ActorTokenCreateDto,
  ActorTokenPatchDto,
  CreatedActorToken,
} from "./dto/actorToken.dto";
import { EActorTokenPrefix } from "./enum/EActorTokenPrefix.enum";
import { ActorTokenQuery } from "./query/actorToken.query";
import { ActorTokenQueryService } from "./query/actorToken.query.service";

/**
 * Actors: who may connect at all.
 *
 * Ported from Titus's `actorTokenModule/actorToken.facade.ts`, without its
 * audit log, project facade and access scope facade. A scope named on create
 * or update is checked against the project here, by entity rather than through
 * the scope module (the scope module already depends on this one), because no
 * caller was doing it and an actor bound to another project's scope was
 * accepted silently.
 */
@Injectable()
export class ActorTokenFacade {
  private readonly _logger = new Logger(ActorTokenFacade.name);

  constructor(
    private readonly _actorTokenService: ActorTokenService,
    private readonly _queryService: ActorTokenQueryService,
    private readonly _stateRepository: ActorTokenStateRepository,
    @InjectDataSource()
    private readonly _dataSource: DataSource,
  ) {}

  generateActorToken(
    environmentPrefix?: EActorTokenPrefix,
  ): GeneratedCredential {
    return this._actorTokenService.generateActorToken(environmentPrefix);
  }

  authenticateActorToken(
    accessToken: string,
  ): Promise<ActorTokenEntity | null> {
    return this._actorTokenService.authenticateActorToken(accessToken);
  }

  getActiveActorByKeyId(keyId: string): Promise<ActorTokenEntity | null> {
    return this._actorTokenService.getActiveActorByKeyId(keyId);
  }

  findByKeyIdAndProject(
    keyId: string,
    projectId: string,
  ): Promise<ActorTokenEntity | null> {
    return this._actorTokenService.findByKeyIdAndProject(keyId, projectId);
  }

  /* ── CRUD ───────────────────────────────────────────────────────────── */

  listActorTokens(
    projectId: string,
    query: ActorTokenQuery,
  ): Promise<PaginatedResult<ActorTokenEntity>> {
    return this._queryService.findPaginated(query, projectId);
  }

  /**
   * Accept either the UUID or the public key id.
   *
   * A browser-flow customer only ever sees the `at_…` key id, so requiring the
   * UUID would mean they could mint an actor and then not manage it.
   */
  async resolveActorTokenId(
    actorIdOrKeyId: string,
    projectId: string,
  ): Promise<string> {
    if (!actorIdOrKeyId.startsWith("at_")) {
      return actorIdOrKeyId;
    }

    const token = await this._actorTokenService.findByKeyIdAndProject(
      actorIdOrKeyId,
      projectId,
    );
    if (!token) {
      throw notFoundException(this._logger, {
        errorMsgUser: `Actor token ${actorIdOrKeyId} not found`,
      });
    }
    return token.actorTokenId;
  }

  async getActorToken(
    actorTokenId: string,
    projectId: string,
  ): Promise<ActorTokenEntity> {
    const token = await this._actorTokenService.findByIdAndProject(
      actorTokenId,
      projectId,
    );
    if (!token) {
      throw notFoundException(this._logger, {
        errorMsgUser: `Actor token ${actorTokenId} not found`,
      });
    }
    return token;
  }

  /**
   * Look one up without throwing.
   *
   * `getActorToken` raises a 404, which is right on an HTTP path. A caller
   * deciding what to do about an absent actor wants the null.
   */
  findActorToken(
    actorTokenId: string,
    projectId: string,
  ): Promise<ActorTokenEntity | null> {
    return this._actorTokenService.findByIdAndProject(actorTokenId, projectId);
  }

  listByProjectId(projectId: string): Promise<ActorTokenEntity[]> {
    return this._actorTokenService.listByProjectId(projectId);
  }

  /** The credential comes back once. Only its hash is stored. */
  createActorToken(
    projectId: string,
    data: ActorTokenCreateDto,
  ): Promise<CreatedActorToken> {
    return this._dataSource.transaction(async (manager) => {
      await this._assertScopeInProject(projectId, data.accessScopeId, manager);
      return this._actorTokenService.createActorToken(projectId, data, manager);
    });
  }

  updateActorToken(
    actorTokenId: string,
    projectId: string,
    data: ActorTokenPatchDto,
  ): Promise<ActorTokenEntity> {
    return this._dataSource.transaction(async (manager) => {
      const existing = await this._actorTokenService.updateLock(
        actorTokenId,
        projectId,
        manager,
      );
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Actor token ${actorTokenId} not found`,
        });
      }

      await this._assertScopeInProject(projectId, data.accessScopeId, manager);

      return this._actorTokenService.patchActorToken(
        actorTokenId,
        projectId,
        data,
        manager,
      );
    });
  }

  deleteActorToken(
    actorTokenId: string,
    projectId: string,
  ): Promise<UpdateResult> {
    return this._dataSource.transaction(async (manager) => {
      const existing = await this._actorTokenService.updateLock(
        actorTokenId,
        projectId,
        manager,
      );
      if (!existing) {
        throw notFoundException(this._logger, {
          errorMsgUser: `Actor token ${actorTokenId} not found`,
        });
      }

      // Session state goes with it. Leaving it would restore subscriptions to
      // an actor that no longer exists if the id were ever reused.
      await manager.delete(ActorTokenStateEntity, { actorTokenId });

      return this._actorTokenService.removeActorToken(
        actorTokenId,
        projectId,
        manager,
      );
    });
  }

  /* ── Session state ──────────────────────────────────────────────────── */

  updateActorState(
    actorTokenId: string,
    connectionState: IConnectionState,
    krakenNodeId?: string,
  ): Promise<ActorTokenStateEntity> {
    return this._stateRepository.upsertState(
      actorTokenId,
      connectionState,
      krakenNodeId,
    );
  }

  getActorState(actorTokenId: string): Promise<ActorTokenStateEntity | null> {
    return this._stateRepository.findByActorTokenId(actorTokenId);
  }

  clearActorState(actorTokenId: string): Promise<void> {
    return this._stateRepository.clearState(actorTokenId);
  }

  /**
   * `undefined` means "not mentioned" and `null` means "clear the scope"; only
   * a string names a scope, and that scope must be live in this project.
   */
  private async _assertScopeInProject(
    projectId: string,
    accessScopeId: string | null | undefined,
    manager: EntityManager,
  ): Promise<void> {
    if (typeof accessScopeId !== "string") {
      return;
    }

    const count = await manager.count(AccessScopeEntity, {
      where: { accessScopeId, projectId, deletedAt: IsNull() },
    });

    if (count === 0) {
      throw badRequestException(this._logger, {
        errorMsgUser: `Access scope ${accessScopeId} does not belong to this project`,
      });
    }
  }
}
