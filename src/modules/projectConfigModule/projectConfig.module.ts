import { Module } from "@nestjs/common";
import { GuardsModule } from "../guardsModule/guards.module";
import { SigningKeyModule } from "../signingKeyModule/signingKey.module";
import { ProjectConfigController } from "./projectConfig.controller";
import { ProjectConfigFacade } from "./projectConfig.facade";
import { ProjectConfigService } from "./projectConfig.service";

@Module({
  imports: [SigningKeyModule, GuardsModule],
  controllers: [ProjectConfigController],
  providers: [ProjectConfigService, ProjectConfigFacade],
  exports: [ProjectConfigFacade],
})
export class ProjectConfigModule {}
