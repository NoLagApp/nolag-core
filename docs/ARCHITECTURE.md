# Architecture

How `nolag-core` decides who may do what.

> Early development. The schema and contract described here will change.

## Domain model

```
project                       tenancy root, carries connection limits
  └── app                     accessMode: open | restricted, owns the topic list
        ├── room              addressable destination
        └── lobby             named group of rooms
  ├── access scope            optional tenant isolation inside a project
  └── actor token             an identity that connects
        ├── actor app access  grant: which app, which topics, which permission
        └── room actor access grant: which room, per token or per actor type
```

A project is the unit of isolation. Nothing in core reaches across projects, and the cross-project
check is applied on every authentication.

`organization_id` on a project is an opaque string. Core stores it and hands it back for attribution
but never interprets it, so a self-hosted deployment can leave it as whatever it likes.

## Topic addressing

Two forms of the same address. Clients use the readable one, the broker uses the internal one.

```
pattern = {appSlug}/{roomSlug}/{topic}                 unscoped actor
        = {appSlug}/{scopeSlug}/{roomSlug}/{topic}     scoped actor

topic   = {roomId}/{topic}                             unscoped actor
        = {scopeId}/{roomId}/{topic}                   scoped actor
```

The internal form uses ids rather than slugs so that renaming a room or an app cannot silently
redirect traffic, and so that a scoped actor is physically unable to address another scope's rooms.
Both forms are returned together for every topic an actor may reach.

## Resolution

Given an authenticated actor token, core computes the complete set of topics that actor may reach and
returns it in one payload. Kraken caches that set, which is why core is not consulted per message.

### App level

- **`accessMode: "open"`** grants every actor in the project access to the app without any stored
  grant. Access rows are synthesised in memory during resolution and never persisted.
- **`accessMode: "restricted"`** requires an `actor_app_access` row for that actor and app.

An `actor_app_access` row carries a permission (`subscribe`, `publish` or `pubSub`) and optionally a
topic list. **A null topic list means inherit the app's topics.** Resolution reads `app.topics`, never
`room.topics`.

### Room level

A room is public until someone grants access to it. Precisely: **a room is private if and only if at
least one `room_actor_access` row exists for it.** After that, only grants let an actor in.

Grants come in two shapes and a token grant wins over a type grant:

1. **Token grant**, `actor_token_id` set. Applies to that one actor.
2. **Type grant**, `actor_type` set. Applies to every actor of that type, for example every `device`
   or every `agent`.

Grants may carry their own topic list and an expiry. Expired and inactive grants are ignored.

### Permissions

`subscribe`, `publish`, `pubSub`. These strings are passed through to the broker ACL unchanged, so
they are part of the wire contract rather than an internal detail.

## Authentication

Three mechanisms. The first two identify an actor; the third protects the internal endpoints.

**Actor token.** Format `at_live_<12 hex>.<43 char base64url>`, or `at_sandbox_` for non-production.
The secret is stored as a SHA-256 hash and compared in constant time. A lookup miss still performs a
comparison against a fixed dummy hash so that timing does not reveal whether a key id exists.

**Client token.** A short-lived HS256 JWT, so a browser never holds a long-lived credential. Signed
with a project signing key (`sk_live_<12 hex>`), whose secret is stored encrypted rather than hashed
because HS256 verification needs the original value. Verification pins the algorithm to HS256,
requires `exp`, caps the lifetime at one hour, allows 60 seconds of clock skew, and requires `sub` to
name an actor token. The signing key's project must match the actor's project.

**System API key.** Format `nlg_system_<12 hex>.<43 char base64url>`, same hashing scheme as actor
tokens. Required on every `/v1/internal/*` endpoint.

Every authentication failure returns the same generic result. Reasons are logged, never returned, so
the endpoints cannot be used as an oracle.

## Limits

Three numbers live on the project row: `max_connections`, `max_message_size_bytes` and
`session_expiry_seconds`. Core returns them and the broker enforces them. Core does not know why they
hold the values they do, which is what keeps commercial concerns out of this repository entirely.

Null means unlimited. `limits_synced_at` records whether the values were ever set, since null alone
cannot distinguish "unlimited" from "never configured".

Session expiry only applies to actor types that hold a persistent session, currently `agent` and
`orchestrator`.

## Configuration and portability

Alongside the authorization endpoints, core serves CRUD over every entity above, plus:

```
GET  /v1/projects/{projectId}/export   whole project state as one document
POST /v1/projects/import               load it back
```

Export and import exist so that a deployment is genuinely portable. Configuration can be moved between
a hosted and a self-hosted stack without a database dump and without downtime, which is the point of
this repository existing.

## Schema

Physical table names, kept deliberately stable:

| Table | Holds |
| --- | --- |
| `project` | tenancy root, connection limits, opaque tenant reference |
| `app` | slug, access mode, topic list, topic configuration, webhooks |
| `room` | addressable destination within an app |
| `lobby`, `lobby_room` | named groups of rooms |
| `access_scope` | tenant isolation within a project |
| `actor_token` | identity, hashed secret, type, status, expiry |
| `actor_token_state` | live session state: current subscriptions and filters |
| `actor_app_access` | actor to app grant |
| `room_actor_access` | actor or actor type to room grant |
| `signing_key` | project signing keys for client tokens, secret encrypted |
| `system_api_key` | keys permitted to call the internal endpoints |

Enum-valued columns are `varchar`, not PostgreSQL enums, so that adding a value is a code change
rather than a migration. Timestamps are `timestamptz` throughout. Primary keys are UUID v7, so they
sort by creation time. Deletes are soft, via `deleted_at`.
