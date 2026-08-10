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
                          message broker
                                  |
                              kraken                 <- data plane, Apache 2.0
                                  |
                    may this actor touch this topic?
                                  |
                            nolag-core               <- this repo, Apache 2.0
                                  |
                             PostgreSQL
```

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
- the NoLag portal, admin console and app builder

Core enforces limits it is given as plain numbers. It has no concept of what they cost or where they
came from. Anything that only exists because someone runs this as a commercial service lives outside
this repository.

## Running it

A `docker compose` quickstart bringing up Postgres, core, kraken and a broker is in progress. Until
then there is nothing useful to run. This section will be replaced with real instructions once the
stack works end to end.

## Licence

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Contributing

Not open for external contributions yet. See [CONTRIBUTING.md](CONTRIBUTING.md) for why and for what
changes when that opens up.
