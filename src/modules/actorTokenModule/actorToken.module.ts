import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ActorAppAccessEntity } from "./actorAppAccess.entity";
import { ActorTokenEntity } from "./actorToken.entity";
import { ActorTokenFacade } from "./actorToken.facade";
import { ActorTokenRepository } from "./actorToken.repository";
import { ActorTokenService } from "./actorToken.service";
import { ActorTokenStateEntity } from "./actorTokenState.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ActorTokenEntity,
      ActorTokenStateEntity,
      ActorAppAccessEntity,
    ]),
  ],
  providers: [
    ActorTokenService,
    ActorTokenFacade,
    {
      provide: ActorTokenRepository,
      useFactory: (ds: DataSource) => new ActorTokenRepository(ds),
      inject: [DataSource],
    },
  ],
  exports: [ActorTokenFacade],
})
export class ActorTokenModule {}
