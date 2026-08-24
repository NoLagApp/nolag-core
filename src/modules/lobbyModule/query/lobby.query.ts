import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { BaseQuery } from "../../../common/pagination";
import { LobbyEntity } from "../lobby.entity";

export class LobbyQuery extends BaseQuery<LobbyEntity> {
  @ApiPropertyOptional({ description: "Partial match" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Exact match" })
  @IsOptional()
  @IsString()
  slug?: string;
}
