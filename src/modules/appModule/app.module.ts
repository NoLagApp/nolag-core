import { Module } from "@nestjs/common";
import { ActorTokenModule } from "../actorTokenModule/actorToken.module";
import { CoreConfigModule } from "../configModule/config.module";
import { DatabaseModule } from "../databaseModule/database.module";
import { GuardsModule } from "../guardsModule/guards.module";
import { HealthModule } from "../healthModule/health.module";
import { SigningKeyModule } from "../signingKeyModule/signingKey.module";
import { SystemApiKeyModule } from "../systemKeyModule/systemApiKey.module";

@Module({
  imports: [
    CoreConfigModule,
    DatabaseModule,
    HealthModule,
    ActorTokenModule,
    SigningKeyModule,
    SystemApiKeyModule,
    GuardsModule,
  ],
})
export class AppModule {}
