export enum EActorType {
  Device = "device",
  Service = "service",
  Session = "session",
  User = "user",
  Agent = "agent",
  Orchestrator = "orchestrator",
  Observer = "observer",
}

/**
 * Actor types that hold a session across disconnects, and so are subject to
 * the session expiry limit. Every other type gets 0, meaning no persistence.
 */
export const PERSISTENT_SESSION_ACTOR_TYPES: readonly EActorType[] = [
  EActorType.Agent,
  EActorType.Orchestrator,
];
