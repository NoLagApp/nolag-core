import { Injectable } from "@nestjs/common";
import { ActorTokenEntity } from "./actorToken.entity";
import { ActorTokenService } from "./actorToken.service";
import { EActorTokenPrefix } from "./enum/EActorTokenPrefix.enum";
import { GeneratedCredential } from "../../common/utils/secretHash";

/**
 * Deliberately thin.
 *
 * The equivalent facade in the hosted control plane injects an audit log, a
 * project facade and an access scope facade, none of which any authentication
 * path uses. Keeping those out means this module stays a leaf in the dependency
 * graph, which is what lets the authorization service run without the rest of a
 * SaaS control plane.
 */
@Injectable()
export class ActorTokenFacade {
  constructor(private readonly _actorTokenService: ActorTokenService) {}

  generateActorToken(
    environmentPrefix?: EActorTokenPrefix,
  ): GeneratedCredential {
    return this._actorTokenService.generateActorToken(environmentPrefix);
  }

  authenticateActorToken(
    accessToken: string,
  ): Promise<ActorTokenEntity | null> {
    return this._actorTokenService.authenticateActorToken(accessToken);
  }

  getActiveActorByKeyId(keyId: string): Promise<ActorTokenEntity | null> {
    return this._actorTokenService.getActiveActorByKeyId(keyId);
  }

  findByKeyIdAndProject(
    keyId: string,
    projectId: string,
  ): Promise<ActorTokenEntity | null> {
    return this._actorTokenService.findByKeyIdAndProject(keyId, projectId);
  }
}
