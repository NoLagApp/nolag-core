import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Credential hashing, shared by actor tokens, signing keys and system keys.
 *
 * One implementation on purpose. The hosted control plane carries two copies of
 * this comparison, and only one of them guards buffer length before calling
 * timingSafeEqual, which throws on a length mismatch. Two subtly different
 * implementations of a credential check is exactly the kind of drift worth
 * removing.
 */

/**
 * Returned when a credential is minted. The secret is shown once and never
 * stored; only `secretHash` is persisted.
 */
export interface GeneratedCredential {
  /** Public identifier, safe to log: `<prefix>_<12 hex>` */
  keyId: string;
  /** 43 base64url characters, 32 random bytes. Shown once. */
  secret: string;
  /** `keyId.secret`, the value the caller presents. Shown once. */
  credential: string;
  /** SHA-256 of the secret, hex encoded. The only part persisted. */
  secretHash: string;
}

/**
 * A valid-shaped hash that matches nothing.
 *
 * Compared against when a lookup misses, so that a request for an unknown key
 * costs the same as one for a known key. Without it, response time reveals
 * which key ids exist.
 */
export const DUMMY_SECRET_HASH = "0".repeat(64);

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Mint a credential: `<prefix>_<12 hex>.<43 base64url>`.
 *
 * 6 random bytes for the public id, which only has to be unique, and 32 for the
 * secret, which has to be unguessable.
 */
export function generateCredential(prefix: string): GeneratedCredential {
  const keyId = `${prefix}_${randomBytes(6).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");

  return {
    keyId,
    secret,
    credential: `${keyId}.${secret}`,
    secretHash: hashSecret(secret),
  };
}

/**
 * Constant-time comparison of a presented secret against a stored hash.
 *
 * Returns false rather than throwing on any malformed input, so a corrupt stored
 * hash denies access instead of surfacing a 500 that distinguishes it from a
 * wrong secret.
 */
export function verifySecretHash(
  storedHash: string,
  providedSecret: string,
): boolean {
  try {
    const storedBuf = Buffer.from(storedHash, "hex");
    const computedBuf = Buffer.from(hashSecret(providedSecret), "hex");

    // timingSafeEqual throws on unequal lengths. A stored hash of the wrong
    // length was written in some other format, so the credential cannot match.
    if (storedBuf.length !== computedBuf.length) {
      return false;
    }

    return timingSafeEqual(storedBuf, computedBuf);
  } catch {
    return false;
  }
}

/**
 * Split `keyId.secret`.
 *
 * Splits on the first separator only. Neither part can legitimately contain a
 * dot, so anything with extra separators is malformed and rejected rather than
 * silently truncated into a shorter secret.
 */
export function splitCredential(
  credential: string,
): { keyId: string; secret: string } | null {
  const parts = credential.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [keyId, secret] = parts;
  if (!keyId || !secret) {
    return null;
  }

  return { keyId, secret };
}
