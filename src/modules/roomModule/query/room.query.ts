import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { BaseQuery } from "../../../common/pagination";
import { ERoomStatus } from "../enum/ERoomStatus.enum";
import { RoomEntity } from "../room.entity";

/** `isStatic` is absent: blueprints, and the column, stay in the hosted product. */
export class RoomQuery extends BaseQuery<RoomEntity> {
  @ApiPropertyOptional({ description: "Partial match" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "Exact match" })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ enum: ERoomStatus })
  @IsOptional()
  @IsEnum(ERoomStatus)
  status?: ERoomStatus;
}
