import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "path";
import { CoreConfigService } from "./config.service";
import { validateCoreConfig } from "./config.validation";

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, "..", "..", "..", ".env"),
      validate: validateCoreConfig,
    }),
  ],
  providers: [CoreConfigService],
  exports: [CoreConfigService],
})
export class CoreConfigModule {}
