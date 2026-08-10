import { Injectable } from "@nestjs/common";
import { DataSource, IsNull, Repository, UpdateResult } from "typeorm";
import { SigningKeyEntity } from "./signingKey.entity";

@Injectable()
export class SigningKeyRepository extends Repository<SigningKeyEntity> {
  constructor(private readonly dataSource: DataSource) {
    super(SigningKeyEntity, dataSource.createEntityManager());
  }

  /** Lookup by the JWT header kid. Soft-deleted keys never verify. */
  findByKeyId(keyId: string): Promise<SigningKeyEntity | null> {
    return this.findOne({ where: { keyId, deletedAt: IsNull() } });
  }

  findById(signingKeyId: string): Promise<SigningKeyEntity | null> {
    return this.findOne({ where: { signingKeyId, deletedAt: IsNull() } });
  }

  findByProject(projectId: string): Promise<SigningKeyEntity[]> {
    return this.find({ where: { projectId, deletedAt: IsNull() } });
  }

  updateLastUsed(signingKeyId: string): Promise<UpdateResult> {
    return this.update({ signingKeyId }, { lastUsedAt: new Date() });
  }
}
