import { Injectable } from "@nestjs/common";
import { DataSource, IsNull, Repository, UpdateResult } from "typeorm";
import { SystemApiKeyEntity } from "./systemApiKey.entity";

@Injectable()
export class SystemApiKeyRepository extends Repository<SystemApiKeyEntity> {
  constructor(private readonly dataSource: DataSource) {
    super(SystemApiKeyEntity, dataSource.createEntityManager());
  }

  findByKeyId(keyId: string): Promise<SystemApiKeyEntity | null> {
    return this.findOne({ where: { keyId, deletedAt: IsNull() } });
  }

  updateLastUsed(systemApiKeyId: string): Promise<UpdateResult> {
    return this.update({ systemApiKeyId }, { lastUsedAt: new Date() });
  }
}
