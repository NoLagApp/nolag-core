import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import request from "supertest";
import { ActorTokenEntity, CORE_DATA_SOURCE, ProjectEntity } from "@nolag/core";
import { getDataSourceToken } from "@nestjs/typeorm";
import { HostModule } from "../src/host.module";

const doc = () => ({
  version: 1,
  project: { name: "HTTP surface test" },
  accessScopes: [{ slug: "acme", name: "Acme" }],
  apps: [
    {
      slug: "chat",
      name: "Chat",
      accessMode: "open",
      topics: ["messages"],
      rooms: [
        { slug: "general", name: "General" },
        {
          slug: "vip",
          name: "VIP",
          typeGrants: [{ actorType: "user", permission: "subscribe" }],
        },
      ],
      lobbies: [{ slug: "online", name: "Online", rooms: ["general"] }],
    },
  ],
  actors: [
    { ref: "device-1", name: "Sensor", actorType: "device" },
    { ref: "user-1", name: "Alice", actorType: "user" },
    {
      ref: "scoped-1",
      name: "Acme dev",
      actorType: "device",
      scopeSlug: "acme",
    },
  ],
  signingKeys: [{ ref: "backend", name: "Backend" }],
});

/**
 * The example host's transport.
 *
 * These moved out of the library when core stopped having controllers. The
 * library's own e2e suite covers resolution by calling facades; this one covers
 * what a host adds on top: routing, validation, status codes, and the broker
 * envelopes going out over the wire.
 */
describe("HTTP surface", () => {
  let app: INestApplication;
  let ds: DataSource;
  let createdProjectIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HostModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirrors main.ts. Without these the whitelist behaviour and the version
    // prefix differ from production and the tests prove the wrong thing.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken(CORE_DATA_SOURCE));
  });

  afterEach(async () => {
    for (const projectId of createdProjectIds) {
      await ds.manager.delete(ActorTokenEntity, { projectId });
      await ds.manager.delete(ProjectEntity, { projectId });
    }
    createdProjectIds = [];
  });

  afterAll(async () => {
    await app.close();
  });

  async function importDoc(body: object = doc()) {
    const res = await request(app.getHttpServer())
      .post("/v1/projects/import")
      .send(body)
      .expect(201);
    createdProjectIds.push(res.body.projectId);
    return res.body;
  }

  const tokenFor = (
    imported: { actors: { ref: string; accessToken: string }[] },
    ref: string,
  ) => imported.actors.find((a) => a.ref === ref)!.accessToken;

  /* ── import and export ─────────────────────────────────────────────────── */

  describe("project config", () => {
    it("imports and returns credentials once", async () => {
      const body = await importDoc();

      expect(body.projectId).toBeDefined();
      expect(body.actors).toHaveLength(3);
      expect(body.signingKeys).toHaveLength(1);
      for (const actor of body.actors) {
        expect(actor.accessToken).toMatch(/^at_live_[0-9a-f]{12}\.[\w-]{43}$/);
      }
    });

    it("rejects an unsupported document version", async () => {
      await request(app.getHttpServer())
        .post("/v1/projects/import")
        .send({ ...doc(), version: 99 })
        .expect(400);
    });

    it("rejects an unknown field rather than ignoring it", async () => {
      await request(app.getHttpServer())
        .post("/v1/projects/import")
        .send({ ...doc(), somethingElse: true })
        .expect(400);
    });

    it("rejects a lobby naming a room that does not exist", async () => {
      const bad = doc();
      bad.apps[0].lobbies[0].rooms = ["nosuchroom"];
      await request(app.getHttpServer())
        .post("/v1/projects/import")
        .send(bad)
        .expect(400);
    });

    it("rejects duplicate app slugs", async () => {
      const bad = doc();
      bad.apps.push({ ...bad.apps[0] });
      await request(app.getHttpServer())
        .post("/v1/projects/import")
        .send(bad)
        .expect(400);
    });

    it("leaves nothing behind when an import fails", async () => {
      // The whole import is one transaction. A half-created authorization model
      // is worse than none.
      //
      // Scoped to a unique name rather than counting every project: jest runs
      // spec files in parallel workers against the same database, so a global
      // count races whatever another file is creating.
      const name = `rollback-probe-${Date.now()}`;
      const bad = doc();
      bad.project.name = name;
      bad.apps[0].lobbies[0].rooms = ["nosuchroom"];

      await request(app.getHttpServer())
        .post("/v1/projects/import")
        .send(bad)
        .expect(400);

      expect(await ds.manager.count(ProjectEntity, { where: { name } })).toBe(
        0,
      );
    });

    it("exports without any secret material", async () => {
      const imported = await importDoc();
      const res = await request(app.getHttpServer())
        .get(`/v1/projects/${imported.projectId}/export`)
        .expect(200);

      const serialised = JSON.stringify(res.body);
      expect(serialised).not.toContain("secretHash");
      expect(serialised).not.toContain("secretEncrypted");
      expect(serialised).not.toContain("v1:"); // the cipher envelope prefix
      for (const actor of imported.actors) {
        expect(serialised).not.toContain(actor.accessToken.split(".")[1]);
      }
    });

    it("round-trips a project through export and import", async () => {
      const imported = await importDoc();
      const first = await request(app.getHttpServer())
        .get(`/v1/projects/${imported.projectId}/export`)
        .expect(200);

      const reimported = await request(app.getHttpServer())
        .post("/v1/projects/import")
        .send(first.body)
        .expect(201);
      createdProjectIds.push(reimported.body.projectId);

      const second = await request(app.getHttpServer())
        .get(`/v1/projects/${reimported.body.projectId}/export`)
        .expect(200);

      // Credentials are reissued on import by design, so refs differ. Everything
      // else must be identical, which is what makes a deployment portable.
      const normalise = (d: any) => {
        for (const a of d.actors ?? []) a.ref = "<reissued>";
        for (const k of d.signingKeys ?? []) k.ref = "<reissued>";
        d.actors = (d.actors ?? []).sort((x: any, y: any) =>
          x.name.localeCompare(y.name),
        );
        return d;
      };
      expect(normalise(second.body)).toEqual(normalise(first.body));
    });

    it("rejects a malformed project id", async () => {
      await request(app.getHttpServer())
        .get("/v1/projects/not-a-uuid/export")
        .expect(400);
    });

    it("404s an unknown project", async () => {
      await request(app.getHttpServer())
        .get("/v1/projects/99999999-9999-4999-8999-999999999999/export")
        .expect(404);
    });

    it("deletes a project and everything under it", async () => {
      const imported = await importDoc();
      await request(app.getHttpServer())
        .delete(`/v1/projects/${imported.projectId}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/v1/projects/${imported.projectId}/export`)
        .expect(404);

      createdProjectIds = [];
    });
  });

  /* ── broker endpoints ──────────────────────────────────────────────────── */

  describe("broker endpoints", () => {
    it("returns an allow envelope with snake_case attributes", async () => {
      const imported = await importDoc();
      const res = await request(app.getHttpServer())
        .post("/v1/internal/actors/validate")
        .send({ accessToken: tokenFor(imported, "device-1") })
        .expect(200);

      expect(res.body.result).toBe("allow");
      const attrs = res.body.client_attrs;
      expect(attrs.project_id).toBe(imported.projectId);
      expect(attrs.apps[0].app_slug).toBe("chat");
      expect(
        attrs.apps[0].allowed_topics.map((t: any) => t.pattern).sort(),
      ).toEqual(["chat/general/messages"]);
      expect(attrs.apps[0].allowed_lobbies[0].lobby_slug).toBe("online");
    });

    it("applies a type grant to the matching actor type only", async () => {
      const imported = await importDoc();

      const asUser = await request(app.getHttpServer())
        .post("/v1/internal/actors/validate")
        .send({ accessToken: tokenFor(imported, "user-1") })
        .expect(200);
      const patterns = asUser.body.client_attrs.apps[0].allowed_topics
        .map((t: any) => t.pattern)
        .sort();
      expect(patterns).toEqual(["chat/general/messages", "chat/vip/messages"]);

      const asDevice = await request(app.getHttpServer())
        .post("/v1/internal/actors/validate")
        .send({ accessToken: tokenFor(imported, "device-1") })
        .expect(200);
      expect(
        asDevice.body.client_attrs.apps[0].allowed_topics.map(
          (t: any) => t.pattern,
        ),
      ).not.toContain("chat/vip/messages");
    });

    it("prefixes a scoped actor's topics with its scope", async () => {
      const imported = await importDoc();
      const res = await request(app.getHttpServer())
        .post("/v1/internal/actors/validate")
        .send({ accessToken: tokenFor(imported, "scoped-1") })
        .expect(200);

      expect(res.body.client_attrs.scope_slug).toBe("acme");
      expect(res.body.client_attrs.apps[0].allowed_topics[0].pattern).toBe(
        "chat/acme/general/messages",
      );
    });

    it("denies with 200 and no reason, so a deny is not confused with an outage", async () => {
      const res = await request(app.getHttpServer())
        .post("/v1/internal/actors/validate")
        .send({ accessToken: "at_live_aaaaaaaaaaaa.nope" })
        .expect(200);

      expect(res.body).toEqual({ result: "deny", is_superuser: false });
    });

    it("checks a single room and injects app_id", async () => {
      const imported = await importDoc();
      const validated = await request(app.getHttpServer())
        .post("/v1/internal/actors/validate")
        .send({ accessToken: tokenFor(imported, "user-1") })
        .expect(200);
      const actorTokenId = validated.body.client_attrs.actor_token_id;

      const allowed = await request(app.getHttpServer())
        .post("/v1/internal/actors/check-room-access")
        .send({ actorTokenId, pattern: "chat/vip/messages" })
        .expect(200);
      expect(allowed.body.allow).toBe(true);
      expect(allowed.body.allowed_topics[0].app_id).toBeDefined();

      const denied = await request(app.getHttpServer())
        .post("/v1/internal/actors/check-room-access")
        .send({ actorTokenId, pattern: "chat/nosuch/messages" })
        .expect(200);
      expect(denied.body).toEqual({ allow: false, allowed_topics: [] });
    });

    it("records a subscription and hydrates it on the next validate", async () => {
      const imported = await importDoc();
      const token = tokenFor(imported, "user-1");
      const validated = await request(app.getHttpServer())
        .post("/v1/internal/actors/validate")
        .send({ accessToken: token })
        .expect(200);

      await request(app.getHttpServer())
        .post("/v1/internal/subscriptions/update")
        .send({
          actorTokenId: validated.body.client_attrs.actor_token_id,
          topic: "chat/general/messages",
          action: "subscribe",
          loadBalance: true,
          loadBalanceGroup: "g1",
        })
        .expect(204);

      const again = await request(app.getHttpServer())
        .post("/v1/internal/actors/validate")
        .send({ accessToken: token })
        .expect(200);

      const subs = again.body.client_attrs.apps[0].active_subscriptions;
      expect(subs).toHaveLength(1);
      expect(subs[0]).toMatchObject({
        pattern: "chat/general/messages",
        load_balance: true,
        load_balance_group: "g1",
      });
    });

    it("revalidates a live session", async () => {
      const imported = await importDoc();
      const validated = await request(app.getHttpServer())
        .post("/v1/internal/actors/validate")
        .send({ accessToken: tokenFor(imported, "user-1") })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post("/v1/internal/actors/revalidate")
        .send({ actorTokenId: validated.body.client_attrs.actor_token_id })
        .expect(200);

      expect(res.body.valid).toBe(true);
      expect(res.body.apps[0].allowed_topics).toHaveLength(2);
    });

    it("reports a disconnect reason for an unknown actor", async () => {
      const res = await request(app.getHttpServer())
        .post("/v1/internal/actors/revalidate")
        .send({ actorTokenId: "99999999-9999-4999-8999-999999999999" })
        .expect(200);

      expect(res.body).toEqual({
        valid: false,
        error: "token_not_found",
        disconnect_reason: "token_not_found",
      });
    });
  });
});
