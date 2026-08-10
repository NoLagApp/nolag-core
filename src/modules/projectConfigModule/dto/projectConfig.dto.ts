import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { EAccessPermission } from "../../actorTokenModule/enum/EAccessPermission.enum";
import { EActorTokenStatus } from "../../actorTokenModule/enum/EActorTokenStatus.enum";
import { EActorType } from "../../actorTokenModule/enum/EActorType.enum";
import { EAppAccessMode } from "../../platformAppModule/enum/EAppAccessMode.enum";
import { EAppStatus } from "../../platformAppModule/enum/EAppStatus.enum";
import { ERoomStatus } from "../../roomModule/enum/ERoomStatus.enum";

/** Slugs appear in topic patterns, so the character set is constrained. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$|^[a-z0-9]$/;

export class WebhookDocDto {
  @ApiProperty()
  @IsString()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}

export class LimitsDocDto {
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

export class AccessScopeDocDto {
  @ApiProperty()
  @Matches(SLUG)
  slug: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * A room grant that applies to an actor *type* rather than a named actor. Named
 * grants live under the actor that holds them, so that removing an actor removes
 * its grants with it.
 */
export class RoomTypeGrantDocDto {
  @ApiProperty({ enum: EActorType })
  @IsEnum(EActorType)
  actorType: EActorType;

  @ApiProperty({ enum: EAccessPermission })
  @IsEnum(EAccessPermission)
  permission: EAccessPermission;

  @ApiPropertyOptional({ type: [String], description: "null inherits the app" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topics?: string[] | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RoomDocDto {
  @ApiProperty()
  @Matches(SLUG)
  slug: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: ERoomStatus })
  @IsOptional()
  @IsEnum(ERoomStatus)
  status?: ERoomStatus;

  @ApiPropertyOptional({
    type: [String],
    description:
      "Not read during authorization. The app's topic list is authoritative.",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topics?: string[] | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    type: [RoomTypeGrantDocDto],
    description:
      "Adding any grant makes the room private to grant holders only.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoomTypeGrantDocDto)
  typeGrants?: RoomTypeGrantDocDto[];
}

export class LobbyDocDto {
  @ApiProperty()
  @Matches(SLUG)
  slug: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @ApiProperty({ type: [String], description: "Room slugs within this app" })
  @IsArray()
  @IsString({ each: true })
  rooms: string[];
}

export class AppDocDto {
  @ApiProperty()
  @Matches(SLUG)
  slug: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: EAppStatus })
  @IsOptional()
  @IsEnum(EAppStatus)
  status?: EAppStatus;

  @ApiPropertyOptional({ enum: EAppAccessMode, default: EAppAccessMode.Open })
  @IsOptional()
  @IsEnum(EAppAccessMode)
  accessMode?: EAppAccessMode;

  @ApiProperty({ type: [String], description: "The authoritative topic list" })
  @IsArray()
  @IsString({ each: true })
  topics: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  topicConfigs?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: WebhookDocDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookDocDto)
  hydrationWebhook?: WebhookDocDto | null;

  @ApiPropertyOptional({ type: WebhookDocDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookDocDto)
  triggerWebhook?: WebhookDocDto | null;

  @ApiPropertyOptional({ type: [RoomDocDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoomDocDto)
  rooms?: RoomDocDto[];

  @ApiPropertyOptional({ type: [LobbyDocDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LobbyDocDto)
  lobbies?: LobbyDocDto[];
}

export class ActorAppGrantDocDto {
  @ApiProperty()
  @IsString()
  appSlug: string;

  @ApiProperty({ enum: EAccessPermission })
  @IsEnum(EAccessPermission)
  permission: EAccessPermission;

  @ApiPropertyOptional({ type: [String], description: "null inherits the app" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topics?: string[] | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string | null;
}

export class ActorRoomGrantDocDto {
  @ApiProperty()
  @IsString()
  appSlug: string;

  @ApiProperty()
  @IsString()
  roomSlug: string;

  @ApiProperty({ enum: EAccessPermission })
  @IsEnum(EAccessPermission)
  permission: EAccessPermission;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topics?: string[] | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string | null;

  @ApiPropertyOptional({ description: "Display label only" })
  @IsOptional()
  @IsString()
  role?: string | null;
}

export class ActorDocDto {
  /**
   * A stable handle for this actor within the document. Not stored: it exists so
   * that an import can report which minted credential belongs to which actor.
   */
  @ApiProperty({ description: "Handle used to report the minted credential" })
  @IsString()
  ref: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: EActorType })
  @IsEnum(EActorType)
  actorType: EActorType;

  @ApiPropertyOptional({ enum: EActorTokenStatus })
  @IsOptional()
  @IsEnum(EActorTokenStatus)
  status?: EActorTokenStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: "Access scope slug, for tenant isolation",
  })
  @IsOptional()
  @IsString()
  scopeSlug?: string | null;

  @ApiPropertyOptional({ type: [ActorAppGrantDocDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActorAppGrantDocDto)
  appAccess?: ActorAppGrantDocDto[];

  @ApiPropertyOptional({ type: [ActorRoomGrantDocDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActorRoomGrantDocDto)
  roomAccess?: ActorRoomGrantDocDto[];
}

export class SigningKeyDocDto {
  @ApiProperty({ description: "Handle used to report the minted secret" })
  @IsString()
  ref: string;

  @ApiProperty()
  @IsString()
  name: string;
}

export class ProjectDocDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    description:
      "Opaque tenant reference. Stored and returned, never interpreted.",
  })
  @IsOptional()
  @IsString()
  organizationId?: string | null;

  @ApiPropertyOptional({ type: LimitsDocDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LimitsDocDto)
  limits?: LimitsDocDto;
}

/**
 * A whole project as one document.
 *
 * Everything is addressed by slug rather than by id, so a document exported from
 * one deployment imports cleanly into another.
 *
 * **Credentials are not included.** Actor secrets are stored as hashes and
 * signing key secrets are encrypted with a key that is deployment-specific, so
 * neither can be exported. An import mints fresh credentials and returns them
 * once. Moving a project therefore means reissuing credentials to clients, which
 * is a deliberate property: an export is safe to keep in version control.
 */
export class ProjectConfigDocDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  version: number;

  @ApiProperty({ type: ProjectDocDto })
  @ValidateNested()
  @Type(() => ProjectDocDto)
  project: ProjectDocDto;

  @ApiPropertyOptional({ type: [AccessScopeDocDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccessScopeDocDto)
  accessScopes?: AccessScopeDocDto[];

  @ApiPropertyOptional({ type: [AppDocDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppDocDto)
  apps?: AppDocDto[];

  @ApiPropertyOptional({ type: [ActorDocDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActorDocDto)
  actors?: ActorDocDto[];

  @ApiPropertyOptional({ type: [SigningKeyDocDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SigningKeyDocDto)
  signingKeys?: SigningKeyDocDto[];
}

/** Credentials minted during an import. Returned once and never recoverable. */
export interface ImportedCredentials {
  projectId: string;
  actors: { ref: string; keyId: string; accessToken: string }[];
  signingKeys: { ref: string; keyId: string; signingKey: string }[];
}
