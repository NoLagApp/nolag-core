# nolag-core

The authorization and configuration core of [NoLag](https://nolag.app), under Apache 2.0.

`nolag-core` answers one question: **may this actor touch this topic?**

It is a **library**, not a service. It owns projects, apps, rooms, lobbies, access scopes, actors,
tokens and signing keys, and it exposes facades that answer what a broker needs in order to accept a
connection and route a message. Nothing else.

There is no transport here, and no opinion about who is calling. Mounting it behind authentication is
the host's job: NoLag mounts these facades behind its own, and the example host in this repository
mounts them behind none. What core does keep is the authentication of **actors**, which is the
product: whether an access token is real, whether a client token was signed by the right key, and
what either may reach.

> **Status: early development.** Nothing is released yet, the schema and HTTP contract will change,
> and there is no stability guarantee. Do not run this in production.

## Why it exists

NoLag's data plane ([kraken](https://github.com/NoLagApp/kraken)) and every client SDK are already
open source. The piece missing from a self-hosted stack was the logic that decides who may do what.
This repository is that piece, so the whole system can be run without depending on NoLag's hosted
service.

Run your own broker, your own kraken, your own core, your own Postgres. NoLag runs the same container
image published from this repository. No fork, no separate proprietary build.

## Where it sits

```
        clients (js, react-native, go, python SDKs)
                          |
                      kraken                    <- data plane, Apache 2.0
                          |
          may this actor touch this topic?
                          |
    ┌─────────────────────────────────────────┐
    │  your host: routing + your auth         │  <- you write this, or use example/
    │  ┌───────────────────────────────────┐  │
    │  │  @nolag/core                      │  │  <- this repo, Apache 2.0
    │  └───────────────────────────────────┘  │
    └─────────────────────────────────────────┘
                          |
                     PostgreSQL
```

There is no external message broker in that picture, and none is required: kraken's default fan-out
is in-process, so a single node needs nothing but itself. Point it at MQTT instead when you want a
broker you already operate.

Kraken caches authorization decisions, so core is not in the path of every message. It is consulted
when a connection is established, periodically to confirm a session is still valid, and when an actor
subscribes to something it has not been granted yet.

## Mounting it

```ts
import { CoreModule, coreEntities, allCoreMigrations, AuthzFacade } from "@nolag/core";

@Module({
  imports: [
    TypeOrmModule.forRoot({
      // Explicit arrays, not a glob. A glob relative to your own source will
      // never reach node_modules, and core's tables would silently not exist.
      entities: [...coreEntities, ...myEntities],
      migrations: [...allCoreMigrations, ...myMigrations],
    }),
    CoreModule.forRoot({ signingKeyEncryptionKey: process.env.SIGNING_KEY }),
  ],
})
export class MyHostModule {}
```

Core binds to TypeORM's **default** connection. It does not open one of its own,
so its tables have to be on the DataSource you already have. If your host owns
entity classes for these same tables, register both: TypeORM maps two classes to
one table without complaint, and a write through one class only touches the
columns that class declares.

Then inject `AuthzFacade` behind whatever authentication you already have.

## The contract

Four questions the broker asks, and the facade methods that answer them:

| Broker calls | Facade |
| --- | --- |
| on connect | `validateActor(accessToken)` |
| periodically, for a live session | `revalidateActor(actorTokenId)` |
| on a subscribe it has not cached | `checkRoomAccess(actorTokenId, pattern)` |
| on subscribe and unsubscribe | `updateSubscription(...)` |

Responses must go through the exported `toBroker*` adapters rather than serialising a DTO. That file
is the wire contract, and routing everything through it is what stops a field rename from silently
changing what every deployed broker receives.

Plus configuration facades for project, app, room, lobby, access scope, actor token and signing key,
and whole-project export and import, so state can be moved in and out without a database dump.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the resolution model, the topic addressing scheme
and the schema.

## What it is not

Deliberately absent, and staying absent:

- billing, plans, subscriptions, metering, usage aggregation
- organizations, users, teams, invitations
- broker fleet management, version registries, upgrade orchestration
- NoLag's hosted portal and app builder
- **any authentication of its callers**, which is the host's job

The repository ships an example host and a small admin UI over it, both covered below. Neither is the
NoLag portal, and neither is meant for production.

Core enforces limits it is given as plain numbers. It has no concept of what they cost or where they
came from. Anything that only exists because someone runs this as a commercial service lives outside
this repository.

## Trying it

The compose stack exists so you can see the whole system working in a few minutes on your own
machine. **It is not a production deployment**, and it is not trying to be one. See
[what it is not](#what-the-quickstart-is-not) before you point anything real at it.

```sh
./quickstart/quickstart.sh
```

That generates `.env`, brings up Postgres, core, kraken and the admin UI, and imports a demo project.
The first run compiles kraken from source, which takes a few minutes; after that it is seconds.

When it finishes:

| | |
| --- | --- |
| Admin UI | http://localhost:3401 |
| Core API | http://localhost:3400, with OpenAPI at `/swagger` |
| Broker | ws://localhost:8410/ws |

The demo project's access tokens are written to `quickstart/credentials.json`. They are shown once,
because core stores only their hashes.

Nothing asks you for a credential, because the example host authenticates nobody. Every published
port binds to `127.0.0.1` for exactly that reason.

Connecting is then the same as against hosted NoLag:

```js
import { NoLag } from "@nolag/js-sdk";

const client = NoLag(accessToken, { url: "ws://localhost:8410/ws" });
await client.connect();
client.subscribe("chat/general/messages");
```

Stop with `docker compose down`, or `docker compose down -v` to discard the data too.

### The example host

`example/` is the shortest host that does anything useful: it owns the DataSource, mounts
`CoreModule`, and exposes the facades through thin controllers. About two hundred lines, and worth
reading before you write your own.

It installs `@nolag/core` from a packed tarball rather than compiling it alongside, so a missing
export or peer fails the build there instead of quietly working.

**It authenticates nobody**, and says so at every boot. That is not an omission: core has no opinion
about who may call it, and an example with a token check is an example people copy into production.

### The admin UI

A small browser surface over the example host: list projects, read one, create one from a
configuration document, and delete one.

**Do not expose it, or the host it talks to.** Anyone who reaches either can read and destroy every
project and mint credentials for any of them. Set `CORS_ORIGINS` if you serve the UI from somewhere
other than the compose default; `*` is rejected rather than honoured.

### Without any of it

The library is the deliverable. Drop `example/`, `ui/` and the compose file entirely, write your own
host, and nothing about the authorization path changes.

### What the quickstart is not

It is a demonstration, not a deployment. Everything below is a deliberate omission, not an oversight,
and the list is here so nobody has to discover them the hard way:

- **No authentication at all** on the example host, and **no TLS anywhere**. Everything is plaintext
  HTTP over loopback. Reaching the port is the same as owning every project behind it.
- **Secrets sit in a plaintext `.env`** that the script generates and chmods to 600. That is not
  secret management.
- **Postgres runs in a container** with a local volume and no backups, no replication and no tuning.
- **One node.** No clustering, no failover, no horizontal scale. Kraken's in-process fan-out means a
  restart drops every connection.
- **Message history is off**, and the store is in-memory. Anything kraken did record would die with
  the container.
- **The admin UI has no accounts and no login**, because the host behind it has none either.

The part worth keeping in a real deployment is the library and the shape of the wiring: the host owns
the DataSource, passes core's entities and migrations into it, and mounts the facades behind real
authentication. The rest belongs to whatever you already use to run things.

## Verifying a deployment

```sh
docker compose up -d --wait
npm run test:stack
```

19 tests drive the running stack with a real `@nolag/js-sdk` client: authentication, a pub/sub round
trip, restricted apps, private rooms, and isolation between two tenants.

The library has its own suites, which need Postgres but not the whole stack:

```sh
./scripts/test-db.sh     # create and migrate the test database
npm test                 # unit
npm run test:e2e         # against real Postgres
npm run test:package     # pack, install into a scratch project, boot it
```

`test:package` is the one that catches what nothing else can. Everything else tests the source; that
one tests the artefact, the way a consumer gets it. A NestJS library can compile, pass every test, and
still be broken on install: a peer shipped as a dependency gives the consumer two copies of TypeORM
and two metadata registries, a `files` omission makes an import resolve to nothing, and neither is
visible from inside the repository.

The suite starts by checking that a token core never issued is refused. Kraken's default auth backend
is a static token file with an allow-all switch, and a stack wired that way accepts everything, so a
happy-path test would pass green while proving nothing. If that first check fails, every test in the
file fails with the reason rather than reporting a mostly-passing run.

## Licence

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Contributing

Issues are welcome; code contributions are not accepted. See [CONTRIBUTING.md](CONTRIBUTING.md) for
why, and for what that does and does not mean for the licence on the code you already have.
