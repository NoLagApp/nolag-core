import { IsIn, IsOptional, IsString } from "class-validator";
import { BaseQuery } from "../../../common/pagination";
import { AccessScopeEntity } from "../accessScope.entity";

export class AccessScopeQuery extends BaseQuery<AccessScopeEntity> {
  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  name?: string;

  /** A string, not a boolean: it arrives from a query string. */
  @IsIn(["true", "false"])
  @IsOptional()
  isActive?: string;
}
