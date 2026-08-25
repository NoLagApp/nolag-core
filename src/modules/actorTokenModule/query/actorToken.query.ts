import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { BaseQuery } from "../../../common/pagination";
import { ActorTokenEntity } from "../actorToken.entity";
import { EActorTokenStatus } from "../enum/EActorTokenStatus.enum";
import { EActorType } from "../enum/EActorType.enum";

export class ActorTokenQuery extends BaseQuery<ActorTokenEntity> {
  @ApiPropertyOptional({ description: "Partial match" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: EActorType })
  @IsOptional()
  @IsEnum(EActorType)
  actorType?: EActorType;

  @ApiPropertyOptional({ enum: EActorTokenStatus })
  @IsOptional()
  @IsEnum(EActorTokenStatus)
  status?: EActorTokenStatus;
}
