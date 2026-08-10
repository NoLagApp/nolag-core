import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { CoreConfigModule } from "../configModule/config.module";
import { SigningKeyEntity } from "./signingKey.entity";
import { SigningKeyFacade } from "./signingKey.facade";
import { SigningKeyRepository } from "./signingKey.repository";
import { SigningKeyService } from "./signingKey.service";

@Module({
  imports: [TypeOrmModule.forFeature([SigningKeyEntity]), CoreConfigModule],
  providers: [
    SigningKeyService,
    SigningKeyFacade,
    {
      provide: SigningKeyRepository,
      useFactory: (ds: DataSource) => new SigningKeyRepository(ds),
      inject: [DataSource],
    },
  ],
  exports: [SigningKeyFacade],
})
export class SigningKeyModule {}
