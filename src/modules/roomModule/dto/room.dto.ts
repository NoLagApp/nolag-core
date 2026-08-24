import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { IsValidTopicName } from "../../../common/validators/isValidTopicName.validator";
import { ERoomStatus } from "../enum/ERoomStatus.enum";

/** Appears in every address for this room, so the character set is constrained. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class RoomCreateDto {
  @ApiPropertyOptional({
    description:
      "URL-safe identifier, used in the address as {app}/{room}/{topic}. " +
      "Generated from the name if absent.",
    example: "support-team",
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(SLUG, {
    message: "slug must be lowercase alphanumeric with hyphens",
  })
  slug?: string;

  @ApiProperty({ example: "Support Team", maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      "Topics in this room. Inherited from the app when absent. Note that " +
      "authorization reads the app's list, not this one.",
    example: ["messages", "typing"],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsValidTopicName({ each: true })
  topics?: string[];

  @ApiPropertyOptional({ example: { maxMembers: 100 } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      "Add the WebRTC signalling topics: webrtc:offer, webrtc:answer, " +
      "webrtc:candidate, webrtc:state. Colons, not slashes, because a slash " +
      "separates the parts of an address.",
  })
  @IsOptional()
  @IsBoolean()
  enableWebRTC?: boolean;
}

/** Slug is absent on purpose: it cannot change once addresses reference it. */
export class RoomPatchDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: ERoomStatus })
  @IsOptional()
  @IsEnum(ERoomStatus)
  status?: ERoomStatus;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsValidTopicName({ each: true })
  topics?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
