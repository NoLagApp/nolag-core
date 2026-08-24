import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { IsValidTopicName } from "../../../common/validators/isValidTopicName.validator";
import { EAccessPermission } from "../../actorTokenModule/enum/EAccessPermission.enum";
import { EActorType } from "../../actorTokenModule/enum/EActorType.enum";

/**
 * A grant on a room.
 *
 * Two kinds, and exactly one per grant: named (`actorTokenId`) or by type
 * (`actorType`). The first grant of either kind makes the room private to
 * grant holders, which is the only way a room inside an open app becomes
 * restricted.
 */
export class RoomActorAccessCreateDto {
  @ApiPropertyOptional({
    description: "Grant to one named actor. Mutually exclusive with actorType.",
  })
  @IsOptional()
  @IsUUID()
  actorTokenId?: string;

  @ApiPropertyOptional({
    description:
      "Grant to every actor of this type. Mutually exclusive with actorTokenId.",
    enum: EActorType,
  })
  @IsOptional()
  @IsEnum(EActorType)
  actorType?: EActorType;

  @ApiProperty({ enum: EAccessPermission })
  @IsEnum(EAccessPermission)
  permission: EAccessPermission;

  @ApiPropertyOptional({
    description: "Absent means every topic the app defines.",
    example: ["messages", "typing"],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsValidTopicName({ each: true })
  topics?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: "2026-12-31T23:59:59Z" })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string | null;

  @ApiPropertyOptional({ description: "Display label only. Not enforced." })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/** The target cannot move: a grant is rewritten by deleting and recreating. */
export class RoomActorAccessUpdateDto {
  @ApiPropertyOptional({ enum: EAccessPermission })
  @IsOptional()
  @IsEnum(EAccessPermission)
  permission?: EAccessPermission;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsValidTopicName({ each: true })
  topics?: string[] | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
