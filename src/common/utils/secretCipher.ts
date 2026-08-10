import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Secret Cipher
 *
 * AES-256-GCM encryption for secrets that must be recoverable, unlike API keys
 * and actor tokens which are stored as one-way hashes.
 *
 * Used for signing key secrets: HS256 client-token verification needs the
 * original secret, so hash-only storage cannot apply.
 *
 * Encoded format: v1:{iv}.{authTag}.{ciphertext} (all base64url)
 *
 * The format is fixed. Anything that reads a signing key written by another
 * NoLag component has to agree on it byte for byte, so change it only by
 * adding a new version prefix alongside this one.
 */

const VERSION_PREFIX = "v1:";
const IV_LENGTH = 12; // 96-bit IV per NIST recommendation for GCM
const KEY_LENGTH = 32; // 256-bit key

function parseKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `secretCipher: encryption key must be ${KEY_LENGTH} bytes base64-encoded, got ${key.length} bytes`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string, keyBase64: string): string {
  const key = parseKey(keyBase64);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${VERSION_PREFIX}${iv.toString("base64url")}.${authTag.toString(
    "base64url",
  )}.${ciphertext.toString("base64url")}`;
}

export function decryptSecret(encoded: string, keyBase64: string): string {
  if (!encoded.startsWith(VERSION_PREFIX)) {
    throw new Error("secretCipher: unknown ciphertext version");
  }

  const parts = encoded.slice(VERSION_PREFIX.length).split(".");
  if (parts.length !== 3) {
    throw new Error("secretCipher: malformed ciphertext");
  }

  const key = parseKey(keyBase64);
  const iv = Buffer.from(parts[0], "base64url");
  const authTag = Buffer.from(parts[1], "base64url");
  const ciphertext = Buffer.from(parts[2], "base64url");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  // Throws on auth tag mismatch (tampered ciphertext or wrong key)
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
