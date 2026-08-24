/**
 * Talking to core.
 *
 * The system key is the most privileged credential in the deployment, so it
 * lives in sessionStorage rather than localStorage: closing the tab forgets it.
 * It is never written into the bundle, never sent anywhere but the core URL
 * this build was pointed at, and never logged.
 */

const CORE_URL: string = (
  import.meta.env.VITE_CORE_URL ?? "http://localhost:3400"
).replace(/\/+$/, "");

export const KRAKEN_URL: string =
  import.meta.env.VITE_KRAKEN_URL ?? "ws://localhost:8410/ws";

export const coreUrl = CORE_URL;

const KEY_STORAGE = "nolag-core.system-key";

export function storedKey(): string {
  return sessionStorage.getItem(KEY_STORAGE) ?? "";
}

export function rememberKey(key: string): void {
  sessionStorage.setItem(KEY_STORAGE, key);
}

export function forgetKey(): void {
  sessionStorage.removeItem(KEY_STORAGE);
}

/** `nlg_system_ab12cd34ef56.…` shortened for display. Never the secret. */
export function keyLabel(key: string): string {
  const dot = key.indexOf(".");
  return dot === -1 ? key : key.slice(0, dot);
}

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
  const key = storedKey();

  let response: Response;
  try {
    response = await fetch(`${CORE_URL}${path}`, {
      method,
      headers: {
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
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

  if (response.status === 401) {
    throw new CoreError("That key was refused.", 401);
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
