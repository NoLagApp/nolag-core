import {
  ActorAppAccessDto,
  AllowedTopicDto,
  CheckRoomAccessResult,
  RevalidateActorResponseDto,
  ValidateActorResponseDto,
} from "../dto/authz.dto";

/**
 * Broker response adapters.
 *
 * Pure functions that reshape the internal result objects into the exact
 * snake_case envelopes the broker consumes. **This file is the wire contract.**
 * Changing a key name here changes what every deployed broker sees, so treat it
 * as a versioned interface rather than as internal plumbing.
 *
 * Permission values pass through unchanged, because they are what the broker's
 * ACL enforces directly.
 */

function toBrokerApps(apps: ActorAppAccessDto[]) {
  return apps.map((app) => ({
    app_id: app.appId,
    app_name: app.appName,
    app_slug: app.appSlug,
    allowed_topics: app.allowedTopics.map((t) => ({
      pattern: t.pattern,
      topic: t.topic,
      permission: t.permission,
      room_id: t.roomId,
      room_slug: t.roomSlug,
      scope_id: t.scopeId,
      scope_slug: t.scopeSlug,
    })),
    allowed_lobbies: (app.allowedLobbies || []).map((l) => ({
      lobby_id: l.lobbyId,
      lobby_slug: l.lobbySlug,
    })),
    active_subscriptions: (app.activeSubscriptions || []).map((s) => ({
      pattern: s.pattern,
      topic: s.topic,
      load_balance: s.loadBalance,
      load_balance_group: s.loadBalanceGroup,
      filters: s.filters,
    })),
    hydration_webhook: app.hydrationWebhook || null,
    trigger_webhook: app.triggerWebhook || null,
    topic_webhooks: app.topicWebhooks || {},
  }));
}

/**
 * validate envelope: `{ result: "allow" | "deny", client_attrs }`.
 *
 * A denial carries no reason. The broker only needs to know it must refuse, and
 * the reason would travel onward to the client.
 */
export function toBrokerValidateResponse(result: ValidateActorResponseDto) {
  if (!result.valid) {
    return {
      result: "deny",
      is_superuser: false,
    };
  }

  return {
    result: "allow",
    is_superuser: false,
    client_attrs: {
      actor_token_id: result.actorTokenId,
      organization_id: result.organizationId,
      project_id: result.projectId,
      project_name: result.projectName,
      actor_type: result.actorType,
      scope_id: result.scopeId,
      scope_slug: result.scopeSlug,
      scope_name: result.scopeName,
      apps: toBrokerApps(result.apps),
      max_connections: result.maxConnections,
      max_message_size_bytes: result.maxMessageSizeBytes,
      persistent_session: result.persistentSession,
      session_expiry_seconds: result.sessionExpirySeconds,
      auth_expires_at: result.authExpiresAt ?? null,
    },
  };
}

/**
 * revalidate envelope: attributes are flattened to the top level next to
 * `{ valid: true }`, which is where the broker reads them.
 */
export function toBrokerRevalidateResponse(result: RevalidateActorResponseDto) {
  if (!result.valid) {
    return {
      valid: false,
      error: result.error,
      disconnect_reason: result.disconnectReason,
    };
  }

  return {
    valid: true,
    actor_token_id: result.actorTokenId,
    organization_id: result.organizationId,
    project_id: result.projectId,
    project_name: result.projectName,
    actor_type: result.actorType,
    scope_id: result.scopeId,
    scope_slug: result.scopeSlug,
    scope_name: result.scopeName,
    apps: toBrokerApps(result.apps),
    max_connections: result.maxConnections,
    max_message_size_bytes: result.maxMessageSizeBytes,
    persistent_session: result.persistentSession,
    session_expiry_seconds: result.sessionExpirySeconds,
  };
}

/**
 * check-room-access envelope: `{ allow, allowed_topics }`.
 *
 * `app_id` is injected onto every topic, matching the app wrapper the broker
 * flattens away on the validate path. Without it the broker cannot attribute the
 * topic to an app.
 */
export function toBrokerCheckRoomAccessResponse(result: CheckRoomAccessResult) {
  return {
    allow: result.allow,
    allowed_topics: result.allowedTopics.map((t: AllowedTopicDto) => ({
      pattern: t.pattern,
      topic: t.topic,
      permission: t.permission,
      app_id: result.appId,
      room_id: t.roomId,
      room_slug: t.roomSlug,
      scope_id: t.scopeId,
      scope_slug: t.scopeSlug,
    })),
  };
}
