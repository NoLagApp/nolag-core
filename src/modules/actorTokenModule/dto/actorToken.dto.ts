import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { EActorTokenStatus } from "../enum/EActorTokenStatus.enum";
import { EActorType } from "../enum/EActorType.enum";

export class ActorTokenCreateDto {
  @ApiProperty({ example: "Mobile client", maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    enum: EActorType,
    description:
      "Decides which type grants apply to this actor, and whether it holds a " +
      "session across disconnects.",
  })
  @IsEnum(EActorType)
  actorType: EActorType;

  @ApiPropertyOptional({ example: "2026-12-31T23:59:59Z" })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      "Bind this actor to a tenant. Its addresses gain the scope's slug as a " +
      "segment, and it can no longer reach the project-wide address space.",
  })
  @IsOptional()
  @IsUUID()
  accessScopeId?: string | null;
}

/**
 * `actorType` is absent on purpose: changing it would silently re-evaluate
 * every type grant the actor is subject to, which is a different actor. Delete
 * and recreate instead.
 */
export class ActorTokenPatchDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

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
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "null unscopes the actor." })
  @IsOptional()
  @IsUUID()
  accessScopeId?: string | null;
}

/** Returned once on create. The secret is never recoverable afterwards. */
export interface CreatedActorToken {
  entity: import("../actorToken.entity").ActorTokenEntity;
  accessToken: string;
}
