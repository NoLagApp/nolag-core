import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID } from "class-validator";
import { BaseQuery } from "../../../common/pagination";
import { ProjectEntity } from "../project.entity";

export class ProjectQuery extends BaseQuery<ProjectEntity> {
  @ApiPropertyOptional({ description: "Partial match" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Opaque tenant reference, exact match" })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
