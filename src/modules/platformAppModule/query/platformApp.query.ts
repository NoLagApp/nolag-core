import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { BaseQuery } from "../../../common/pagination";
import { EAppStatus } from "../enum/EAppStatus.enum";
import { PlatformAppEntity } from "../platformApp.entity";

export class PlatformAppQuery extends BaseQuery<PlatformAppEntity> {
  @ApiPropertyOptional({ description: "Partial match" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Exact match" })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ enum: EAppStatus })
  @IsOptional()
  @IsEnum(EAppStatus)
  status?: EAppStatus;
}
