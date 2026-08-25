import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ESigningKeyStatus } from "../enum/ESigningKeyStatus.enum";

export class SigningKeyCreateDto {
  @ApiProperty({ example: "Browser client tokens", maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    enum: ["live", "sandbox"],
    default: "live",
    description: "Decides the key id prefix, which the JWT header carries.",
  })
  @IsOptional()
  @IsIn(["live", "sandbox"])
  environment?: "live" | "sandbox";
}

/** The secret cannot be changed. Rotate by creating a key and deleting this one. */
export class SigningKeyPatchDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    enum: ESigningKeyStatus,
    description: "Anything but active stops new client tokens verifying.",
  })
  @IsOptional()
  @IsEnum(ESigningKeyStatus)
  status?: ESigningKeyStatus;
}

/** Returned once on create. Only the encrypted secret is stored. */
export interface CreatedSigningKey {
  entity: import("../signingKey.entity").SigningKeyEntity;
  signingKey: string;
}
