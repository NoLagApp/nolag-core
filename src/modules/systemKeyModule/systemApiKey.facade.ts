import { Injectable } from "@nestjs/common";
import { GeneratedCredential } from "../../common/utils/secretHash";
import { SystemApiKeyEntity } from "./systemApiKey.entity";
import { SystemApiKeyService } from "./systemApiKey.service";

@Injectable()
export class SystemApiKeyFacade {
  constructor(private readonly _service: SystemApiKeyService) {}

  generateSystemApiKey(): GeneratedCredential {
    return this._service.generateSystemApiKey();
  }

  authenticate(apiKey: string): Promise<SystemApiKeyEntity | null> {
    return this._service.authenticate(apiKey);
  }
}
