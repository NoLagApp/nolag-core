import { randomBytes } from "crypto";
import { decryptSecret, encryptSecret } from "./secretCipher";

const key = () => randomBytes(32).toString("base64");

describe("secretCipher", () => {
  it("round-trips a secret", () => {
    const k = key();
    const secret = "s3cr3t-value";
    expect(decryptSecret(encryptSecret(secret, k), k)).toBe(secret);
  });

  it("round-trips unicode and empty strings", () => {
    const k = key();
    for (const secret of ["", "ünïcødé ✓", "a".repeat(5000)]) {
      expect(decryptSecret(encryptSecret(secret, k), k)).toBe(secret);
    }
  });

  it("produces a different ciphertext each time for the same input", () => {
    // A fresh random IV per call. Identical ciphertexts would leak that two
    // projects share a signing secret.
    const k = key();
    const a = encryptSecret("same", k);
    const b = encryptSecret("same", k);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, k)).toBe(decryptSecret(b, k));
  });

  it("emits the v1 envelope with three base64url parts", () => {
    const encoded = encryptSecret("x", key());
    expect(encoded.startsWith("v1:")).toBe(true);
    expect(encoded.slice(3).split(".")).toHaveLength(3);
  });

  it("refuses a key that is not 32 bytes", () => {
    const short = randomBytes(16).toString("base64");
    expect(() => encryptSecret("x", short)).toThrow(/must be 32 bytes/);
    const long = randomBytes(64).toString("base64");
    expect(() => encryptSecret("x", long)).toThrow(/must be 32 bytes/);
  });

  it("refuses to decrypt with the wrong key", () => {
    const encoded = encryptSecret("x", key());
    expect(() => decryptSecret(encoded, key())).toThrow();
  });

  it("refuses an unknown version prefix", () => {
    const encoded = encryptSecret("x", key());
    const tampered = encoded.replace("v1:", "v2:");
    expect(() => decryptSecret(tampered, key())).toThrow(/unknown ciphertext/);
  });

  it("refuses a malformed envelope", () => {
    expect(() => decryptSecret("v1:only.two", key())).toThrow(/malformed/);
  });

  it("detects a tampered ciphertext", () => {
    // GCM authenticates. Flipping a byte must fail rather than decrypt to junk.
    const k = key();
    const encoded = encryptSecret("original", k);
    const [prefixAndIv, tag, ct] = encoded.split(".");
    const bytes = Buffer.from(ct, "base64url");
    bytes[0] ^= 0xff;
    const tampered = `${prefixAndIv}.${tag}.${bytes.toString("base64url")}`;
    expect(() => decryptSecret(tampered, k)).toThrow();
  });

  it("detects a tampered auth tag", () => {
    const k = key();
    const encoded = encryptSecret("original", k);
    const [prefixAndIv, tag, ct] = encoded.split(".");
    const bytes = Buffer.from(tag, "base64url");
    bytes[0] ^= 0xff;
    const tampered = `${prefixAndIv}.${bytes.toString("base64url")}.${ct}`;
    expect(() => decryptSecret(tampered, k)).toThrow();
  });
});
