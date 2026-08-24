/**
 * Talking to the example host.
 *
 * There is no credential here, and that is not an omission. `@nolag/core` is a
 * library with no opinion about who is calling it, and the example host that
 * mounts it authenticates nobody. Both it and this page are bound to
 * 127.0.0.1 for exactly that reason.
 *
 * A real deployment mounts the same facades behind real authentication, and a
 * UI for that deployment would send whatever that expects.
 */

const CORE_URL: string = (
  import.meta.env.VITE_CORE_URL ?? "http://localhost:3400"
).replace(/\/+$/, "");

export const KRAKEN_URL: string =
  import.meta.env.VITE_KRAKEN_URL ?? "ws://localhost:8410/ws";

export const coreUrl = CORE_URL;

export class CoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${CORE_URL}${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    // fetch only rejects on a transport failure, which for a browser talking
    // to a container almost always means the wrong URL or a CORS refusal.
    throw new CoreError(
      `Cannot reach core at ${CORE_URL}. Check that the stack is running, ` +
        `and that CORS_ORIGINS names this page's origin.`,
      0,
    );
  }

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new CoreError(describe(parsed, response.status), response.status);
  }

  return parsed as T;
}

/** Turn core's validation envelope into one line a person can act on. */
function describe(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as {
      message?: unknown;
      errors?: { path?: string; message?: string }[];
    };

    if (Array.isArray(b.errors) && b.errors.length > 0) {
      return b.errors
        .slice(0, 4)
        .map((e) => `${e.path}: ${e.message}`)
        .join("\n");
    }

    if (typeof b.message === "string") {
      return b.message;
    }
  }

  return `Core answered ${status}.`;
}

/* ── Shapes ─────────────────────────────────────────────────────────── */

export interface ProjectSummary {
  projectId: string;
  name: string;
  description?: string | null;
  createdAt?: string;
}

export interface RoomDoc {
  slug: string;
  name: string;
  description?: string | null;
  topics?: string[] | null;
  typeGrants?: { actorType: string; permission: string }[];
}

export interface AppDoc {
  slug: string;
  name: string;
  description?: string | null;
  accessMode?: string;
  status?: string;
  topics: string[];
  rooms?: RoomDoc[];
  lobbies?: { slug: string; name: string; rooms: string[] }[];
}

export interface ActorDoc {
  ref?: string;
  name: string;
  actorType: string;
  status?: string;
  scopeSlug?: string | null;
  appAccess?: { appSlug: string; permission: string; topics?: string[] | null }[];
  roomAccess?: {
    appSlug: string;
    roomSlug: string;
    permission: string;
    topics?: string[] | null;
  }[];
}

export interface ProjectDoc {
  version: number;
  project: { name: string; description?: string | null };
  accessScopes?: { slug: string; name: string; description?: string | null }[];
  apps?: AppDoc[];
  actors?: ActorDoc[];
  signingKeys?: { ref?: string; name: string }[];
}

export interface ImportedCredentials {
  projectId: string;
  actors: { ref: string; keyId: string; accessToken: string }[];
  signingKeys: { ref: string; keyId: string; signingKey: string }[];
}

/* ── Calls ──────────────────────────────────────────────────────────── */

export const listProjects = () =>
  request<ProjectSummary[]>("GET", "/v1/projects");

export const exportProject = (projectId: string) =>
  request<ProjectDoc>("GET", `/v1/projects/${projectId}/export`);

export const importProject = (doc: unknown) =>
  request<ImportedCredentials>("POST", "/v1/projects/import", doc);

export const deleteProject = (projectId: string) =>
  request<null>("DELETE", `/v1/projects/${projectId}`);
