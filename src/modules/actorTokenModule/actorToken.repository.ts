import { Injectable } from "@nestjs/common";
import { DataSource, IsNull, Repository, UpdateResult } from "typeorm";
import { ActorTokenEntity } from "./actorToken.entity";

@Injectable()
export class ActorTokenRepository extends Repository<ActorTokenEntity> {
  constructor(private readonly dataSource: DataSource) {
    super(ActorTokenEntity, dataSource.createEntityManager());
  }

  /**
   * Look up by public key id. Soft-deleted rows are excluded explicitly as well
   * as by TypeORM's own filter, because this is an authentication path and the
   * predicate should be visible at the call site.
   */
  findByKeyId(keyId: string): Promise<ActorTokenEntity | null> {
    return this.findOne({ where: { keyId, deletedAt: IsNull() } });
  }

  findByKeyIdAndProject(
    keyId: string,
    projectId: string,
  ): Promise<ActorTokenEntity | null> {
    return this.findOne({
      where: { keyId, projectId, deletedAt: IsNull() },
    });
  }

  findById(actorTokenId: string): Promise<ActorTokenEntity | null> {
    return this.findOne({ where: { actorTokenId, deletedAt: IsNull() } });
  }

  /**
   * Best-effort usage stamp. Callers fire and forget: failing to record that a
   * token was used must never deny a connection that is otherwise valid.
   */
  updateLastUsed(actorTokenId: string): Promise<UpdateResult> {
    return this.update({ actorTokenId }, { lastUsedAt: new Date() });
  }
}
