import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";

export class ProjectCreateDto {
  @ApiProperty({ example: "Demo", maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      "Opaque tenant reference. Stored and returned, never interpreted. " +
      "NoLag puts an organization id here; a self-hoster can leave it unset.",
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class ProjectPatchDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;
}

/**
 * Limits, pushed in by whatever decides them.
 *
 * Core stores plain numbers and has no idea what they cost or where they came
 * from. NoLag's billing writes them here; a self-hosted deployment either sets
 * them once or never touches them and gets the host's defaults.
 *
 * `null` means unlimited. Absent means leave as-is.
 */
export class ProjectLimitsDto {
  @ApiPropertyOptional({ description: "null means unlimited" })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxConnections?: number | null;

  @ApiPropertyOptional({ description: "null means unlimited" })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxMessageSizeBytes?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  sessionExpirySeconds?: number | null;
}
