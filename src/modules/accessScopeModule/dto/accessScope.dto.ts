import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

/** Slugs appear in topic addresses, so the character set is constrained. */
const SLUG = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export class AccessScopeCreateDto {
  @ApiProperty({
    description:
      "URL-safe identifier. Immutable after creation, because it " +
      "appears in every topic address the scope's actors resolve to.",
    example: "acme",
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  @Matches(SLUG, {
    message:
      "slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen",
  })
  slug: string;

  @ApiProperty({ example: "Acme Corporation", maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: { tenantId: "tenant-123" } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AccessScopePatchDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
