import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { SystemApiKeyEntity } from "./systemApiKey.entity";
import { SystemApiKeyFacade } from "./systemApiKey.facade";
import { SystemApiKeyRepository } from "./systemApiKey.repository";
import { SystemApiKeyService } from "./systemApiKey.service";

@Module({
  imports: [TypeOrmModule.forFeature([SystemApiKeyEntity])],
  providers: [
    SystemApiKeyService,
    SystemApiKeyFacade,
    {
      provide: SystemApiKeyRepository,
      useFactory: (ds: DataSource) => new SystemApiKeyRepository(ds),
      inject: [DataSource],
    },
  ],
  exports: [SystemApiKeyFacade],
})
export class SystemApiKeyModule {}
