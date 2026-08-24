import * as jwt from "jsonwebtoken";
import {
  accessTokenFor,
  actorKeyIdFor,
  client,
  connected,
  deleteProject,
  disconnectAll,
  ImportedProject,
  importFixtureProject,
  signingKeyFor,
  StackClient,
  subscribe,
  waitFor,
} from "./stackClient";

/**
 * The acceptance test for the self-hosted stack.
 *
 * Everything here runs over the real wire: a published `@nolag/js-sdk` client
 * talks to kraken, kraken asks core, core reads Postgres. Nothing is stubbed.
 *
 * ## Why the negatives come first
 *
 * Kraken ships a static auth backend with an `auth_allow_all` switch, and it is
 * the default backend. A stack wired to it accepts every token and grants every
 * topic, so a happy-path suite passes green while proving nothing at all.
 *
 * The `beforeAll` below refuses to let that happen: if a token core has never
 * seen can open a connection, the whole file fails immediately rather than
 * reporting a mostly-passing run.
 *
 * The strongest evidence that core is genuinely in the loop is the scoped
 * actor. Its patterns (`chat/acme/general/messages`) are computed by joining
 * project rows at request time. No static file could produce them, and no
 * cached answer could keep up with a project imported seconds earlier.
 */

const NONSENSE_TOKEN =
  "at_live_000000000000.notarealsecretnotarealsecretnotarealse";

let project: ImportedProject;

beforeAll(async () => {
  project = await importFixtureProject(String(process.pid));

  // The gate. A throw here fails every test in the file.
  const impostor = client(NONSENSE_TOKEN);
  let admitted = false;
  try {
    await impostor.connect();
    admitted = true;
  } catch {
    // Correct: refused.
  } finally {
    try {
      impostor.disconnect();
    } catch {
      // Nothing to close.
    }
  }

  if (admitted) {
    throw new Error(
      "A token core has never issued was admitted. The broker is not " +
        "consulting core (check AUTH_BACKEND=http and AUTH_ALLOW_ALL), so " +
        "every other result in this file would be meaningless.",
    );
  }
}, 60000);

afterAll(async () => {
  disconnectAll();
  if (project) {
    await deleteProject(project.projectId);
  }
});

describe("authentication", () => {
  it("refuses a token core never issued", async () => {
    const impostor = client(NONSENSE_TOKEN);
    await expect(impostor.connect()).rejects.toBeDefined();
  });

  it("refuses a well-formed token from no project", async () => {
    // Correct shape, wrong secret. Exercises the hash comparison rather than
    // the format check.
    const keyId = actorKeyIdFor(project, "alice");
    const forged = client(`${keyId}.${"A".repeat(43)}`);
    await expect(forged.connect()).rejects.toBeDefined();
  });

  it("admits a minted actor token", async () => {
    const alice = await connected(accessTokenFor(project, "alice"));
    expect(alice).toBeDefined();
  });

  it("admits a browser client token", async () => {
    const { kid, secret } = signingKeyFor(project, "browser");

    const token = jwt.sign(
      {
        sub: actorKeyIdFor(project, "alice"),
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      secret,
      { algorithm: "HS256", keyid: kid },
    );

    const browser = await connected(token);
    expect(browser).toBeDefined();
  });

  it("refuses a client token signed with the wrong secret", async () => {
    const { kid } = signingKeyFor(project, "browser");

    const token = jwt.sign(
      {
        sub: actorKeyIdFor(project, "alice"),
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      "not-the-signing-secret",
      { algorithm: "HS256", keyid: kid },
    );

    await expect(client(token).connect()).rejects.toBeDefined();
  });
});

describe("pub/sub", () => {
  it("delivers a message from one client to another", async () => {
    const topic = "chat/general/messages";

    const alice = await connected(accessTokenFor(project, "alice"));
    const bob = await connected(accessTokenFor(project, "bob"));

    const received: any[] = [];
    await subscribe(bob, topic);
    bob.on(topic, (data) => received.push(data));

    await subscribe(alice, topic);
    alice.emit(topic, { text: "hello", n: 1 });

    expect(await waitFor(() => received.length >= 1)).toBe(true);
    expect(received[0]).toMatchObject({ text: "hello", n: 1 });
  });
});

describe("authorization", () => {
  /**
   * A restricted app needs an explicit grant. Alice has none, so the room is
   * unreachable even though it exists and she is a valid actor in the project.
   */
  it("refuses a room in a restricted app the actor has no grant for", async () => {
    const alice = await connected(accessTokenFor(project, "alice"));
    await expect(subscribe(alice, "ops/control/alerts")).rejects.toBeDefined();
  });

  it("allows that same room for the actor holding the grant", async () => {
    const opsbot = await connected(accessTokenFor(project, "opsbot"));
    await expect(
      subscribe(opsbot, "ops/control/alerts"),
    ).resolves.toBeUndefined();
  });

  /**
   * A type grant makes a room private to the types it names, even inside an
   * open app. Alice is a user; the grant names services.
   */
  it("refuses a room made private by a type grant", async () => {
    const alice = await connected(accessTokenFor(project, "alice"));
    await expect(subscribe(alice, "chat/vip/messages")).rejects.toBeDefined();
  });

  it("allows that room for an actor of the granted type", async () => {
    const opsbot = await connected(accessTokenFor(project, "opsbot"));
    await expect(
      subscribe(opsbot, "chat/vip/messages"),
    ).resolves.toBeUndefined();
  });

  it("allows the open app's other rooms for both", async () => {
    const alice = await connected(accessTokenFor(project, "alice"));
    await expect(
      subscribe(alice, "chat/random/messages"),
    ).resolves.toBeUndefined();
  });
});

describe("scope isolation", () => {
  it("gives a scoped actor scope-prefixed patterns", async () => {
    const device = await connected(accessTokenFor(project, "acme-device"));
    await expect(
      subscribe(device, "chat/acme/general/messages"),
    ).resolves.toBeUndefined();
  });

  /**
   * A scoped actor may use the plain room name, and the broker rewrites it
   * into that actor's scope. This is deliberate: a client should not have to
   * know which tenant it belongs to in order to address a room.
   *
   * It reads like a hole and is not one. The next two tests are what make that
   * safe, and they are the ones to watch if this behaviour ever changes.
   */
  it("maps the plain room name onto the actor's own scope", async () => {
    const device = await connected(accessTokenFor(project, "acme-device"));
    await expect(
      subscribe(device, "chat/general/messages"),
    ).resolves.toBeUndefined();
  });

  it("refuses another tenant's scope to a scoped actor", async () => {
    const globex = await connected(accessTokenFor(project, "globex-device"));
    await expect(
      subscribe(globex, "chat/acme/general/messages"),
    ).rejects.toBeDefined();
  });

  it("refuses a scoped pattern to an unscoped actor", async () => {
    const alice = await connected(accessTokenFor(project, "alice"));
    await expect(
      subscribe(alice, "chat/acme/general/messages"),
    ).rejects.toBeDefined();
  });

  /**
   * The claim a self-hoster is really buying: two tenants addressing the same
   * room name by the same string never see each other's traffic.
   */
  it("keeps two tenants apart when both use the plain room name", async () => {
    const acme = await connected(accessTokenFor(project, "acme-device"));
    const globex = await connected(accessTokenFor(project, "globex-device"));

    const acmeGot: any[] = [];
    const globexGot: any[] = [];

    await subscribe(acme, "chat/general/messages");
    acme.on("chat/general/messages", (d) => acmeGot.push(d));

    await subscribe(globex, "chat/general/messages");
    globex.on("chat/general/messages", (d) => globexGot.push(d));

    acme.emit("chat/general/messages", { from: "acme" });
    globex.emit("chat/general/messages", { from: "globex" });

    // Each hears its own publish, so both sides have definitely delivered
    // before anything is asserted about what did not arrive.
    expect(
      await waitFor(() => acmeGot.length >= 1 && globexGot.length >= 1),
    ).toBe(true);

    expect(acmeGot.every((m: any) => m.from === "acme")).toBe(true);
    expect(globexGot.every((m: any) => m.from === "globex")).toBe(true);
  });

  /**
   * The isolation claim at the data plane rather than the control plane. Two
   * actors subscribe to what a human would call "the same room", and nothing
   * crosses between them, because the scope is part of the address the broker
   * fans out on.
   */
  it("does not leak messages between a scope and the project at large", async () => {
    const alice = await connected(accessTokenFor(project, "alice"));
    const device = await connected(accessTokenFor(project, "acme-device"));

    const aliceGot: any[] = [];
    const deviceGot: any[] = [];

    await subscribe(alice, "chat/general/messages");
    alice.on("chat/general/messages", (d) => aliceGot.push(d));

    await subscribe(device, "chat/acme/general/messages");
    device.on("chat/acme/general/messages", (d) => deviceGot.push(d));

    device.emit("chat/acme/general/messages", { from: "acme" });
    alice.emit("chat/general/messages", { from: "project" });

    // Each sender hears itself, which is the default, so waiting on both
    // confirms delivery actually happened rather than nothing having run yet.
    expect(
      await waitFor(() => aliceGot.length >= 1 && deviceGot.length >= 1),
    ).toBe(true);

    expect(aliceGot.every((m: any) => m.from === "project")).toBe(true);
    expect(deviceGot.every((m: any) => m.from === "acme")).toBe(true);
  });
});

describe("the denial a self-hoster sees", () => {
  it("is legible ASCII, not a truncated codepoint", async () => {
    const alice = await connected(accessTokenFor(project, "alice"));

    let failure: any = null;
    try {
      await subscribe(alice, "chat/vip/messages");
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeTruthy();

    const message: string = String(failure.message ?? "");
    const hint: string = String(failure.hint ?? "");
    const text = `${message} ${hint}`;

    // A <<"...">> literal in Erlang truncates any codepoint above U+00FF to a
    // single byte, which is how an em dash once reached clients as \x14.
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f]/);
  });
});

/**
 * Guards against a client being counted as connected when it is not, which
 * would make every `resolves` assertion above vacuous.
 */
describe("the suite's own assumptions", () => {
  it("treats a refused connection as a rejection, not a silent no-op", async () => {
    const impostor: StackClient = client(NONSENSE_TOKEN);
    let threw = false;
    try {
      await impostor.connect();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
