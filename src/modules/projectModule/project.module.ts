import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CORE_DATA_SOURCE } from "../../core.options";
import { ProjectEntity } from "./project.entity";
import { ProjectFacade } from "./project.facade";
import { ProjectRepository } from "./project.repository";
import { ProjectQueryService } from "./query/project.query.service";

@Module({
  imports: [TypeOrmModule.forFeature([ProjectEntity], CORE_DATA_SOURCE)],
  providers: [ProjectQueryService, ProjectFacade, ProjectRepository],
  exports: [ProjectFacade],
})
export class ProjectModule {}
