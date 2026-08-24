import { Module } from "@nestjs/common";
import { SigningKeyModule } from "../signingKeyModule/signingKey.module";
import { ProjectConfigFacade } from "./projectConfig.facade";
import { ProjectConfigService } from "./projectConfig.service";

@Module({
  imports: [SigningKeyModule],
  providers: [ProjectConfigService, ProjectConfigFacade],
  exports: [ProjectConfigFacade],
})
export class ProjectConfigModule {}
