import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { EAccessPermission } from "../../actorTokenModule/enum/EAccessPermission.enum";
import { EActorType } from "../../actorTokenModule/enum/EActorType.enum";

/* ── Shared shapes ───────────────────────────────────────────────────────── */

export class WebhookConfigDto {
  @ApiProperty({ example: "https://api.example.com/hook" })
  url: string;

  @ApiPropertyOptional({ description: "Headers. May carry credentials." })
  headers?: Record<string, string>;
}

export class AllowedTopicDto {
  /** Human-readable address: {appSlug}/[{scopeSlug}/]{roomSlug}/{topic} */
  @ApiProperty({ example: "my-chat-app/general/messages" })
  pattern: string;

  /** Internal broker topic: [{scopeId}/]{roomId}/{topic} */
  @ApiProperty({ example: "01939f83-8b57-7c3e-a456-426614174001/messages" })
  topic: string;

  @ApiProperty({ enum: EAccessPermission })
  permission: EAccessPermission;

  @ApiProperty()
  roomId: string;

  @ApiProperty()
  roomSlug: string;

  @ApiPropertyOptional()
  scopeId?: string;

  @ApiPropertyOptional()
  scopeSlug?: string;
}

export class AllowedLobbyDto {
  @ApiProperty()
  lobbyId: string;

  @ApiProperty()
  lobbySlug: string;
}

export class ActiveSubscriptionDto {
  @ApiProperty()
  pattern: string;

  @ApiProperty()
  topic: string;

  @ApiPropertyOptional()
  loadBalance?: boolean;

  @ApiPropertyOptional()
  loadBalanceGroup?: string;

  @ApiPropertyOptional({ type: [String] })
  filters?: string[];
}

export type TopicWebhooksMap = Record<
  string,
  {
    on_publish?: WebhookConfigDto;
    on_subscribe?: WebhookConfigDto;
  }
>;

export class ActorAppAccessDto {
  @ApiProperty()
  appId: string;

  @ApiProperty()
  appName: string;

  @ApiProperty()
  appSlug: string;

  @ApiProperty({ type: [AllowedTopicDto] })
  allowedTopics: AllowedTopicDto[];

  @ApiPropertyOptional({ type: [AllowedLobbyDto] })
  allowedLobbies?: AllowedLobbyDto[];

  @ApiPropertyOptional({ type: [ActiveSubscriptionDto] })
  activeSubscriptions?: ActiveSubscriptionDto[];

  @ApiPropertyOptional({ type: WebhookConfigDto })
  hydrationWebhook?: WebhookConfigDto | null;

  @ApiPropertyOptional({ type: WebhookConfigDto })
  triggerWebhook?: WebhookConfigDto | null;

  @ApiPropertyOptional()
  topicWebhooks?: TopicWebhooksMap;
}

/* ── Requests ────────────────────────────────────────────────────────────── */

export class ValidateActorRequestDto {
  @ApiProperty({
    description:
      "An opaque actor token (at_live_...) or a client token JWT. Never logged.",
  })
  @IsString()
  accessToken: string;
}

export class RevalidateActorRequestDto {
  @ApiProperty()
  @IsUUID()
  actorTokenId: string;
}

export class CheckRoomAccessRequestDto {
  @ApiProperty()
  @IsUUID()
  actorTokenId: string;

  @ApiProperty({
    description: "{appSlug}/[{scopeSlug}/]{roomSlug}/{topic}",
    example: "my-chat-app/new-room/messages",
  })
  @IsString()
  pattern: string;
}

export class SubscriptionUpdateRequestDto {
  @ApiProperty()
  @IsUUID()
  actorTokenId: string;

  @ApiProperty({ description: "The topic pattern being subscribed to" })
  @IsString()
  topic: string;

  @ApiProperty({ enum: ["subscribe", "unsubscribe"] })
  @IsIn(["subscribe", "unsubscribe"])
  action: "subscribe" | "unsubscribe";

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  loadBalance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  loadBalanceGroup?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  filters?: string[];
}

/* ── Responses ───────────────────────────────────────────────────────────── */

/**
 * Why the error strings are coarse: they are returned to the broker, which may
 * surface them to a client. `token_invalid` covers a missing actor, a bad
 * secret, a bad signature and a cross-project attempt on purpose, so the
 * endpoint cannot be used to work out which of those it was.
 */
export type AuthzDenyReason =
  | "token_invalid"
  | "token_suspended"
  | "token_expired"
  | "token_not_found"
  | "project_not_found";

export interface ActorSessionPayload {
  actorTokenId: string;
  organizationId: string | null;
  projectId: string;
  projectName: string;
  actorType: EActorType;
  scopeId?: string;
  scopeSlug?: string;
  scopeName?: string;
  apps: ActorAppAccessDto[];
  maxConnections: number | null;
  maxMessageSizeBytes: number | null;
  persistentSession: boolean;
  sessionExpirySeconds: number;
}

export interface ValidateActorSuccessResponseDto extends ActorSessionPayload {
  valid: true;
  /** Unix seconds, from a client token's exp. Absent for opaque tokens. */
  authExpiresAt?: number;
}

export interface ValidateActorErrorResponseDto {
  valid: false;
  error: AuthzDenyReason;
}

export type ValidateActorResponseDto =
  ValidateActorSuccessResponseDto | ValidateActorErrorResponseDto;

export interface RevalidateActorSuccessResponseDto extends ActorSessionPayload {
  valid: true;
}

export interface RevalidateActorErrorResponseDto {
  valid: false;
  error: AuthzDenyReason;
  disconnectReason: string;
}

export type RevalidateActorResponseDto =
  RevalidateActorSuccessResponseDto | RevalidateActorErrorResponseDto;

export interface CheckRoomAccessResult {
  allow: boolean;
  appId?: string;
  allowedTopics: AllowedTopicDto[];
}
