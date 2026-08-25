import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  ActorTokenStateEntity,
  IConnectionState,
} from "./actorTokenState.entity";

/**
 * Live session state: what an actor is subscribed to, and where.
 *
 * Not soft-deleted. This is ephemeral session data, and a tombstone here would
 * be restored to a reconnecting actor as if it were still subscribed.
 */
@Injectable()
export class ActorTokenStateRepository extends Repository<ActorTokenStateEntity> {
  constructor(
    @InjectRepository(ActorTokenStateEntity)
    repository: Repository<ActorTokenStateEntity>,
  ) {
    super(repository.target, repository.manager, repository.queryRunner);
  }

  findByActorTokenId(
    actorTokenId: string,
  ): Promise<ActorTokenStateEntity | null> {
    return this.findOne({ where: { actorTokenId } });
  }

  /** One row per actor, created on first write. */
  async upsertState(
    actorTokenId: string,
    connectionState: IConnectionState,
    krakenNodeId?: string,
  ): Promise<ActorTokenStateEntity> {
    const existing = await this.findByActorTokenId(actorTokenId);

    if (existing) {
      existing.connectionState = connectionState;
      if (krakenNodeId !== undefined) {
        existing.krakenNodeId = krakenNodeId;
      }
      return this.save(existing);
    }

    const entity = new ActorTokenStateEntity();
    entity.actorTokenId = actorTokenId;
    entity.connectionState = connectionState;
    entity.krakenNodeId = krakenNodeId ?? null;
    return this.save(entity);
  }

  /** Called when an actor disconnects. Hard delete, see the note above. */
  async clearState(actorTokenId: string): Promise<void> {
    await this.delete({ actorTokenId });
  }

  async deleteByActorTokenId(actorTokenId: string): Promise<void> {
    await this.delete({ actorTokenId });
  }
}
