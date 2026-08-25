import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { BaseQuery } from "../../../common/pagination";
import { ESigningKeyStatus } from "../enum/ESigningKeyStatus.enum";
import { SigningKeyEntity } from "../signingKey.entity";

export class SigningKeyQuery extends BaseQuery<SigningKeyEntity> {
  @ApiPropertyOptional({ description: "Partial match" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ESigningKeyStatus })
  @IsOptional()
  @IsEnum(ESigningKeyStatus)
  status?: ESigningKeyStatus;
}
