# nolag-core

The authorization and configuration core of [NoLag](https://nolag.app), under Apache 2.0.

`nolag-core` answers one question: **may this actor touch this topic?**

It owns projects, apps, rooms, lobbies, access scopes, actors, tokens and signing keys, and it serves
the authorization decisions that a broker needs in order to accept a connection and route a message.
Nothing else.

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
                              kraken                 <- data plane, Apache 2.0
                                  |
                    may this actor touch this topic?
                                  |
                            nolag-core               <- this repo, Apache 2.0
                                  |
                             PostgreSQL
```

There is no external message broker in that picture, and none is required: kraken's default fan-out
is in-process, so a single node needs nothing but itself. Point it at MQTT instead when you want a
broker you already operate.

Kraken caches authorization decisions, so core is not in the path of every message. It is consulted
when a connection is established, periodically to confirm a session is still valid, and when an actor
subscribes to something it has not been granted yet.

## The contract

Four endpoints, called by kraken:

| Endpoint | Question it answers |
| --- | --- |
| `POST /v1/internal/actors/validate` | May this token connect, and what may it reach? |
| `POST /v1/internal/actors/revalidate` | Is this session still valid? |
| `POST /v1/internal/actors/check-room-access` | May this actor use this topic pattern? |
| `POST /v1/internal/subscriptions/update` | Record what this session is subscribed to. |

Plus configuration CRUD and whole-project export and import, so state can be moved in and out without
a database dump.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the resolution model, the topic addressing scheme
and the schema.

## What it is not

Deliberately absent, and staying absent:

- billing, plans, subscriptions, metering, usage aggregation
- organizations, users, teams, invitations
- broker fleet management, version registries, upgrade orchestration
- NoLag's hosted portal and app builder

Core does ship a small admin UI, covered below, for the configuration this repository owns. It is not
the NoLag portal: there is no sign-up, no team, no billing screen, and it authenticates with the same
system key the broker uses rather than with user accounts.

Core enforces limits it is given as plain numbers. It has no concept of what they cost or where they
came from. Anything that only exists because someone runs this as a commercial service lives outside
this repository.

## Running it

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
because core stores only their hashes. The admin UI asks for a system key: it is `NOLAG_SYSTEM_KEY`
in `.env`.

Connecting is then the same as against hosted NoLag:

```js
import { NoLag } from "@nolag/js-sdk";

const client = NoLag(accessToken, { url: "ws://localhost:8410/ws" });
await client.connect();
client.subscribe("chat/general/messages");
```

Stop with `docker compose down`, or `docker compose down -v` to discard the data too.

### The admin UI

A small browser surface over the configuration endpoints: list projects, read one, create one from a
configuration document, and delete one. It holds the system key in the tab and forgets it on close.

**Do not expose it publicly.** The system key it holds can read and destroy every project in the
deployment, and there are no user accounts behind it. Keep it on localhost or behind whatever
authenticating proxy you already trust.

Set `CORS_ORIGINS` on core to the UI's origin if you serve it from somewhere other than the compose
default. `*` is rejected rather than honoured.

### Without the UI

Core is headless by default. Drop the `ui` service and leave `CORS_ORIGINS` empty, and nothing about
the authorization path changes.

## Verifying a deployment

```sh
docker compose up -d --wait
npm run test:stack
```

19 tests drive the running stack with a real `@nolag/js-sdk` client: authentication, a pub/sub round
trip, restricted apps, private rooms, and isolation between two tenants.

The suite starts by checking that a token core never issued is refused. Kraken's default auth backend
is a static token file with an allow-all switch, and a stack wired that way accepts everything, so a
happy-path test would pass green while proving nothing. If that first check fails, every test in the
file fails with the reason rather than reporting a mostly-passing run.

## Licence

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Contributing

Not open for external contributions yet. See [CONTRIBUTING.md](CONTRIBUTING.md) for why and for what
changes when that opens up.
