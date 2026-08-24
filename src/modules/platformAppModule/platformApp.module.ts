import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PlatformAppEntity } from "./platformApp.entity";
import { PlatformAppFacade } from "./platformApp.facade";
import { PlatformAppRepository } from "./platformApp.repository";
import { PlatformAppQueryService } from "./query/platformApp.query.service";

@Module({
  imports: [TypeOrmModule.forFeature([PlatformAppEntity])],
  providers: [
    PlatformAppQueryService,
    PlatformAppFacade,
    PlatformAppRepository,
  ],
  exports: [PlatformAppFacade],
})
export class PlatformAppModule {}
