import { readFileSync } from "fs";
import { resolve } from "path";

/* eslint-disable @typescript-eslint/no-require-imports */
// The SDK ships CJS and ESM. Required rather than imported so this file stays
// CommonJS like the rest of the suite.
const { NoLag } = require("@nolag/js-sdk");
/* eslint-enable @typescript-eslint/no-require-imports */

export const CORE_URL = process.env.STACK_CORE_URL as string;
export const KRAKEN_URL = process.env.STACK_KRAKEN_URL as string;
const SYSTEM_KEY = process.env.NOLAG_SYSTEM_KEY as string;

export interface ImportedProject {
  projectId: string;
  actors: { ref: string; keyId: string; accessToken: string }[];
  signingKeys: { ref: string; keyId: string; signingKey: string }[];
}

/* ───────────────────────── core, over HTTP ───────────────────────── */

async function coreRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${CORE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SYSTEM_KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

/**
 * Import the shipped quickstart document under a unique name.
 *
 * Using the same document the quickstart seeds means these tests also check
 * that the document a first-time user runs is valid, rather than testing a
 * fixture that only exists here.
 */
export async function importFixtureProject(
  nameSuffix: string,
): Promise<ImportedProject> {
  const doc = JSON.parse(
    readFileSync(
      resolve(__dirname, "../../quickstart/demo-project.json"),
      "utf8",
    ),
  );

  doc.project.name = `stack-test-${nameSuffix}`;

  const { status, body } = await coreRequest(
    "POST",
    "/v1/projects/import",
    doc,
  );
  if (status !== 201) {
    throw new Error(
      `Fixture import failed with ${status}: ${JSON.stringify(body)}`,
    );
  }

  return body as ImportedProject;
}

export async function deleteProject(projectId: string): Promise<void> {
  await coreRequest("DELETE", `/v1/projects/${projectId}`);
}

export function accessTokenFor(project: ImportedProject, ref: string): string {
  const actor = project.actors.find((a) => a.ref === ref);
  if (!actor) {
    throw new Error(`No actor "${ref}" in the fixture`);
  }
  return actor.accessToken;
}

export function actorKeyIdFor(project: ImportedProject, ref: string): string {
  const actor = project.actors.find((a) => a.ref === ref);
  if (!actor) {
    throw new Error(`No actor "${ref}" in the fixture`);
  }
  return actor.keyId;
}

export function signingKeyFor(
  project: ImportedProject,
  ref: string,
): { kid: string; secret: string } {
  const key = project.signingKeys.find((k) => k.ref === ref);
  if (!key) {
    throw new Error(`No signing key "${ref}" in the fixture`);
  }

  // The credential is `keyId.secret`; only the secret signs the token.
  const separator = key.signingKey.indexOf(".");
  return {
    kid: key.keyId,
    secret: key.signingKey.slice(separator + 1),
  };
}

/* ───────────────────────── kraken, over WebSocket ───────────────────────── */

export interface StackClient {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(
    topic: string,
    options?: Record<string, unknown>,
    callback?: (err: Error | null) => void,
  ): void;
  emit(topic: string, data: unknown, options?: Record<string, unknown>): void;
  on(event: string, handler: (data: any) => void): void;
}

export function client(token: string): StackClient {
  return NoLag(token, {
    url: KRAKEN_URL,
    // A reconnect loop turns a refused connection into a hang, and a heartbeat
    // keeps the process alive past the end of the suite.
    reconnect: false,
    heartbeatInterval: 0,
    debug: false,
  }) as StackClient;
}

/** Connect, and keep a handle so the suite can close everything it opened. */
const opened: StackClient[] = [];

export async function connected(token: string): Promise<StackClient> {
  const c = client(token);
  opened.push(c);
  await c.connect();
  return c;
}

export function disconnectAll(): void {
  for (const c of opened) {
    try {
      c.disconnect();
    } catch {
      // Already gone. Nothing to do.
    }
  }
  opened.length = 0;
}

/**
 * Subscribe and wait for the broker's answer.
 *
 * The SDK settles this callback on the `subscribed` frame or on a topic-matched
 * error frame, so a denial rejects rather than silently doing nothing. That is
 * what makes a negative assertion possible at all.
 */
export function subscribe(c: StackClient, topic: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    c.subscribe(topic, {}, (err: Error | null) =>
      err ? rejectPromise(err) : resolvePromise(),
    );
  });
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Poll to a deadline. Never a fixed sleep, so a slow machine does not flake. */
export async function waitFor(
  condition: () => boolean,
  timeoutMs = 5000,
  stepMs = 25,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await sleep(stepMs);
  }
  return condition();
}
