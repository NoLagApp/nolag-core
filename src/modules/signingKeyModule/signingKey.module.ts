import { Module } from "@nestjs/common";
import { TypeOrmModule, getDataSourceToken } from "@nestjs/typeorm";
import { CORE_DATA_SOURCE } from "../../core.options";
import { DataSource } from "typeorm";
import { SigningKeyEntity } from "./signingKey.entity";
import { SigningKeyFacade } from "./signingKey.facade";
import { SigningKeyRepository } from "./signingKey.repository";
import { SigningKeyService } from "./signingKey.service";
import { SigningKeyQueryService } from "./query/signingKey.query.service";

@Module({
  imports: [TypeOrmModule.forFeature([SigningKeyEntity], CORE_DATA_SOURCE)],
  providers: [
    SigningKeyService,
    SigningKeyQueryService,
    SigningKeyFacade,
    {
      provide: SigningKeyRepository,
      useFactory: (ds: DataSource) => new SigningKeyRepository(ds),
      inject: [getDataSourceToken(CORE_DATA_SOURCE)],
    },
  ],
  exports: [SigningKeyFacade],
})
export class SigningKeyModule {}
