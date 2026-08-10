import { Module } from "@nestjs/common";
import { CoreConfigModule } from "../configModule/config.module";
import { DatabaseModule } from "../databaseModule/database.module";
import { HealthModule } from "../healthModule/health.module";

@Module({
  imports: [CoreConfigModule, DatabaseModule, HealthModule],
})
export class AppModule {}
