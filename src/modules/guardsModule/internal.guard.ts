import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from "@nestjs/common";
import { unauthorizedException } from "../../utils/exceptions";
import { SystemApiKeyEntity } from "../systemKeyModule/systemApiKey.entity";
import { SystemApiKeyFacade } from "../systemKeyModule/systemApiKey.facade";

/** The shape this guard attaches to the request on success. */
export interface RequestWithSystemKey {
  headers: Record<string, string | string[] | undefined>;
  systemApiKey?: SystemApiKeyEntity;
}

/**
 * Internal API Guard
 *
 * Guards the endpoints the broker calls. Expects:
 *
 *   Authorization: Bearer nlg_system_{keyId}.{secret}
 *
 * Every rejection returns the same 401 shape whatever went wrong, so the guard
 * cannot be used to distinguish an unknown key from a wrong secret.
 */
@Injectable()
export class InternalGuard implements CanActivate {
  private readonly logger = new Logger(InternalGuard.name);

  constructor(private readonly _systemApiKeyFacade: SystemApiKeyFacade) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithSystemKey>();

    const authHeader = req.headers["authorization"];
    if (!authHeader || typeof authHeader !== "string") {
      throw unauthorizedException(this.logger, {
        errorMsgUser: "Unauthorized",
        errorMsgSystem: "Authorization header missing",
      });
    }

    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw unauthorizedException(this.logger, {
        errorMsgUser: "Unauthorized",
        errorMsgSystem: "Expected: Authorization: Bearer <token>",
      });
    }

    const systemApiKey = await this._systemApiKeyFacade.authenticate(token);

    if (!systemApiKey) {
      throw unauthorizedException(this.logger, {
        errorMsgUser: "Unauthorized",
        errorMsgSystem: "Invalid or expired system API key",
      });
    }

    req.systemApiKey = systemApiKey;

    return true;
  }
}
