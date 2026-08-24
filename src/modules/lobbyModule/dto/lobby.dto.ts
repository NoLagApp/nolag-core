import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class LobbyCreateDto {
  @ApiPropertyOptional({
    description: "Generated from the name if absent.",
    example: "online",
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(SLUG, {
    message: "slug must be lowercase alphanumeric with hyphens",
  })
  slug?: string;

  @ApiProperty({ example: "Online", maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/** Slug is absent on purpose: a lobby slug is referenced by connected clients. */
export class LobbyPatchDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
