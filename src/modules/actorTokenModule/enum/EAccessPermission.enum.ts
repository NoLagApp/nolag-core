/**
 * Permission granted on a topic.
 *
 * These string values are passed through to the broker ACL unchanged, so they
 * are part of the wire contract rather than an internal detail. Renaming a
 * value here silently changes what the broker enforces.
 */
export enum EAccessPermission {
  Subscribe = "subscribe",
  Publish = "publish",
  PubSub = "pubSub",
}
