import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  AuthzFacade,
  CheckRoomAccessRequestDto,
  RevalidateActorRequestDto,
  SubscriptionUpdateRequestDto,
  ValidateActorRequestDto,
  toBrokerCheckRoomAccessResponse,
  toBrokerRevalidateResponse,
  toBrokerValidateResponse,
} from "@nolag/core";

/**
 * The endpoints the broker calls.
 *
 * Every response goes through an adapter in adapters/brokerResponse.adapter.ts
 * rather than serialising a DTO directly. That file is the wire contract, and
 * routing everything through it is what stops a field rename here from silently
 * changing what a deployed broker receives.
 *
 * All routes return 200 even for a denial. A denial is a valid answer to the
 * question asked, not a transport error, and HTTP status codes are not
 * expressive enough to distinguish "this actor may not connect" from "core is
 * broken". The broker fails closed on a transport error, so conflating the two
 * would turn a core outage into a mass disconnection.
 */
@ApiTags("internal")
@Controller({ path: "internal", version: "1" })
export class AuthzController {
  constructor(private readonly _authzFacade: AuthzFacade) {}

  @Post("actors/validate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "May this token connect, and what may it reach?",
    description:
      "Called on connect. Returns the complete set of topics the actor may " +
      "reach, which the broker caches for the life of the session.",
  })
  @ApiResponse({ status: 200, description: "allow or deny envelope" })
  async validateActor(@Body() body: ValidateActorRequestDto) {
    return toBrokerValidateResponse(
      await this._authzFacade.validateActor(body.accessToken),
    );
  }

  @Post("actors/revalidate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Is this session still valid?",
    description:
      "Called periodically for a live session. Also re-hydrates the session " +
      "with any access that changed since connect.",
  })
  @ApiResponse({ status: 200, description: "valid or invalid with a reason" })
  async revalidateActor(@Body() body: RevalidateActorRequestDto) {
    return toBrokerRevalidateResponse(
      await this._authzFacade.revalidateActor(body.actorTokenId),
    );
  }

  @Post("actors/check-room-access")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "May this actor use this topic pattern?",
    description:
      "Called when an actor subscribes to a pattern the broker has not cached, " +
      "typically a room created or a grant added after the actor connected.",
  })
  @ApiResponse({ status: 200, description: "allow with topics, or deny" })
  async checkRoomAccess(@Body() body: CheckRoomAccessRequestDto) {
    return toBrokerCheckRoomAccessResponse(
      await this._authzFacade.checkRoomAccess(body.actorTokenId, body.pattern),
    );
  }

  @Post("subscriptions/update")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Record a subscribe or unsubscribe",
    description:
      "Session state, so a reconnecting actor can be restored. Not an " +
      "authorization decision: the broker has already made that.",
  })
  @ApiResponse({ status: 204, description: "Recorded" })
  async updateSubscription(
    @Body() body: SubscriptionUpdateRequestDto,
  ): Promise<void> {
    await this._authzFacade.updateSubscription(body);
  }
}
