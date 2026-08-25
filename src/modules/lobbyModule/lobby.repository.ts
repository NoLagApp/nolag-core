import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { LobbyEntity } from "./lobby.entity";

@Injectable()
export class LobbyRepository extends Repository<LobbyEntity> {
  // Three-arg super, not `new Repository(entity, dataSource.createEntityManager())`.
  // EntityManager.withRepository re-invokes this constructor as
  // (target, manager, queryRunner), so a DataSource-shaped constructor breaks
  // the moment a facade wants this repository inside a transaction.
  constructor(
    @InjectRepository(LobbyEntity)
    repository: Repository<LobbyEntity>,
  ) {
    super(repository.target, repository.manager, repository.queryRunner);
  }

  findByAppId(appId: string): Promise<LobbyEntity[]> {
    return this.find({
      where: { appId, deletedAt: IsNull() },
      order: { createdAt: "ASC" },
    });
  }

  findByIdAndApp(lobbyId: string, appId: string): Promise<LobbyEntity | null> {
    return this.findOne({ where: { lobbyId, appId, deletedAt: IsNull() } });
  }

  findBySlugAndApp(slug: string, appId: string): Promise<LobbyEntity | null> {
    return this.findOne({ where: { slug, appId, deletedAt: IsNull() } });
  }
}
