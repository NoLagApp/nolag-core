import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CORE_DATA_SOURCE } from "../../core.options";
import { ActorTokenEntity } from "../actorTokenModule/actorToken.entity";
import { AccessScopeEntity } from "./accessScope.entity";
import { AccessScopeFacade } from "./accessScope.facade";
import { AccessScopeRepository } from "./accessScope.repository";
import { AccessScopeService } from "./accessScope.service";
import { AccessScopeQueryService } from "./query/accessScope.query.service";

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [AccessScopeEntity, ActorTokenEntity],
      CORE_DATA_SOURCE,
    ),
  ],
  providers: [
    AccessScopeService,
    AccessScopeQueryService,
    AccessScopeFacade,
    AccessScopeRepository,
  ],
  exports: [AccessScopeFacade],
})
export class AccessScopeModule {}
