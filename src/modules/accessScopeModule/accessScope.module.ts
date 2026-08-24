import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ActorTokenEntity } from "../actorTokenModule/actorToken.entity";
import { AccessScopeEntity } from "./accessScope.entity";
import { AccessScopeFacade } from "./accessScope.facade";
import { AccessScopeRepository } from "./accessScope.repository";
import { AccessScopeService } from "./accessScope.service";
import { AccessScopeQueryService } from "./query/accessScope.query.service";

@Module({
  imports: [TypeOrmModule.forFeature([AccessScopeEntity, ActorTokenEntity])],
  providers: [
    AccessScopeService,
    AccessScopeQueryService,
    AccessScopeFacade,
    AccessScopeRepository,
  ],
  exports: [AccessScopeFacade],
})
export class AccessScopeModule {}
