import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { CORE_DATA_SOURCE } from "../../core.options";
import { DataSource } from "typeorm";
import { AuthzService } from "./authz.service";
import {
  CheckRoomAccessResult,
  RevalidateActorResponseDto,
  SubscriptionUpdateRequestDto,
  ValidateActorResponseDto,
} from "./dto/authz.dto";

@Injectable()
export class AuthzFacade {
  constructor(
    private readonly _authzService: AuthzService,
    @InjectDataSource(CORE_DATA_SOURCE)
    private readonly _dataSource: DataSource,
  ) {}

  validateActor(accessToken: string): Promise<ValidateActorResponseDto> {
    return this._authzService.validateActor(accessToken);
  }

  revalidateActor(actorTokenId: string): Promise<RevalidateActorResponseDto> {
    return this._authzService.revalidateActor(actorTokenId);
  }

  checkRoomAccess(
    actorTokenId: string,
    pattern: string,
  ): Promise<CheckRoomAccessResult> {
    return this._authzService.checkRoomAccess(actorTokenId, pattern);
  }

  getActorScope(
    actorTokenId: string,
  ): Promise<{ organizationId: string | null; projectId: string } | null> {
    return this._authzService.getActorScope(actorTokenId);
  }

  /**
   * The facade owns the transaction, because the service locks the state row for
   * update and that lock has to live inside one.
   */
  updateSubscription(dto: SubscriptionUpdateRequestDto): Promise<void> {
    return this._dataSource.transaction((manager) =>
      this._authzService.updateSubscription(
        dto.actorTokenId,
        dto.topic,
        dto.action,
        manager,
        dto.loadBalance,
        dto.loadBalanceGroup,
        dto.filters,
      ),
    );
  }

  clearSubscriptions(actorTokenId: string): Promise<void> {
    return this._authzService.clearSubscriptions(actorTokenId);
  }
}
