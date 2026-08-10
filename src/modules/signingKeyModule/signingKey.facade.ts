import { Injectable } from "@nestjs/common";
import { ESigningKeyPrefix } from "./enum/ESigningKeyPrefix.enum";
import {
  GeneratedSigningKey,
  SigningKeyService,
  VerifiedClientToken,
} from "./signingKey.service";

/**
 * Thin by design. See the note on ActorTokenFacade.
 */
@Injectable()
export class SigningKeyFacade {
  constructor(private readonly _signingKeyService: SigningKeyService) {}

  generateSigningKey(
    environmentPrefix?: ESigningKeyPrefix,
  ): GeneratedSigningKey {
    return this._signingKeyService.generateSigningKey(environmentPrefix);
  }

  encryptForStorage(secret: string): string {
    return this._signingKeyService.encryptForStorage(secret);
  }

  verifyClientToken(token: string): Promise<VerifiedClientToken | null> {
    return this._signingKeyService.verifyClientToken(token);
  }

  invalidateCache(keyId: string): void {
    this._signingKeyService.invalidateCache(keyId);
  }
}
