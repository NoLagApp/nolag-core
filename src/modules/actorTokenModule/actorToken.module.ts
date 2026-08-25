import { Module } from "@nestjs/common";
import { TypeOrmModule, getDataSourceToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ActorAppAccessEntity } from "./actorAppAccess.entity";
import { ActorTokenEntity } from "./actorToken.entity";
import { ActorTokenFacade } from "./actorToken.facade";
import { ActorTokenRepository } from "./actorToken.repository";
import { ActorTokenService } from "./actorToken.service";
import { ActorTokenStateRepository } from "./actorTokenState.repository";
import { ActorTokenQueryService } from "./query/actorToken.query.service";
import { ActorTokenStateEntity } from "./actorTokenState.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [ActorTokenEntity, ActorTokenStateEntity, ActorAppAccessEntity]),
  ],
  providers: [
    ActorTokenService,
    ActorTokenQueryService,
    ActorTokenStateRepository,
    ActorTokenFacade,
    {
      provide: ActorTokenRepository,
      useFactory: (ds: DataSource) => new ActorTokenRepository(ds),
      inject: [getDataSourceToken()],
    },
  ],
  exports: [ActorTokenFacade],
})
export class ActorTokenModule {}
