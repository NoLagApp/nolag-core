import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { IsValidTopicName } from "../../../common/validators/isValidTopicName.validator";
import { EAppAccessMode } from "../enum/EAppAccessMode.enum";
import { EAppStatus } from "../enum/EAppStatus.enum";
import type { TopicConfigs } from "../platformApp.entity";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class WebhookConfigInputDto {
  @ApiProperty()
  @IsString()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}

export class PlatformAppCreateDto {
  @ApiPropertyOptional({
    description:
      "The first segment of every address in this app. Generated from the " +
      "name if absent, and used exactly as given: no suffix is appended.",
    example: "chat",
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(SLUG, {
    message: "slug must be lowercase alphanumeric with hyphens",
  })
  slug?: string;

  @ApiProperty({ example: "Chat", maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description:
      "The authoritative topic list. Authorization resolves against this, " +
      "never against a room's own list.",
    example: ["messages", "typing"],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsValidTopicName({ each: true })
  topics: string[];

  @ApiPropertyOptional({
    enum: EAppAccessMode,
    default: EAppAccessMode.Open,
    description:
      "Open means every active actor in the project reaches this app with no " +
      "stored grant. Restricted requires one.",
  })
  @IsOptional()
  @IsEnum(EAppAccessMode)
  accessMode?: EAppAccessMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  topicConfigs?: TopicConfigs | null;

  @ApiPropertyOptional({ type: WebhookConfigInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookConfigInputDto)
  hydrationWebhook?: WebhookConfigInputDto | null;

  @ApiPropertyOptional({ type: WebhookConfigInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookConfigInputDto)
  triggerWebhook?: WebhookConfigInputDto | null;
}

/** Slug is absent: it is the first segment of every address in the app. */
export class PlatformAppPatchDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: EAppStatus })
  @IsOptional()
  @IsEnum(EAppStatus)
  status?: EAppStatus;

  @ApiPropertyOptional({ enum: EAppAccessMode })
  @IsOptional()
  @IsEnum(EAppAccessMode)
  accessMode?: EAppAccessMode;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsValidTopicName({ each: true })
  topics?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  topicConfigs?: TopicConfigs | null;

  @ApiPropertyOptional({ type: WebhookConfigInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookConfigInputDto)
  hydrationWebhook?: WebhookConfigInputDto | null;

  @ApiPropertyOptional({ type: WebhookConfigInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookConfigInputDto)
  triggerWebhook?: WebhookConfigInputDto | null;
}
