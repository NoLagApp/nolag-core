import {
  DUMMY_SECRET_HASH,
  generateCredential,
  hashSecret,
  splitCredential,
  verifySecretHash,
} from "./secretHash";

describe("secretHash", () => {
  describe("generateCredential", () => {
    it("produces prefix_12hex.43base64url", () => {
      const { keyId, secret, credential, secretHash } =
        generateCredential("at_live");

      expect(keyId).toMatch(/^at_live_[0-9a-f]{12}$/);
      expect(secret).toHaveLength(43);
      expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(credential).toBe(`${keyId}.${secret}`);
      expect(secretHash).toBe(hashSecret(secret));
    });

    it("never repeats a key id", () => {
      const ids = new Set(
        Array.from({ length: 500 }, () => generateCredential("at_live").keyId),
      );
      expect(ids.size).toBe(500);
    });

    it("does not embed the secret in the stored hash", () => {
      const { secret, secretHash } = generateCredential("at_live");
      expect(secretHash).toMatch(/^[0-9a-f]{64}$/);
      expect(secretHash).not.toContain(secret);
    });
  });

  describe("verifySecretHash", () => {
    it("accepts the matching secret", () => {
      const { secret, secretHash } = generateCredential("at_live");
      expect(verifySecretHash(secretHash, secret)).toBe(true);
    });

    it("rejects a wrong secret", () => {
      const { secretHash } = generateCredential("at_live");
      expect(verifySecretHash(secretHash, "wrong")).toBe(false);
    });

    it("rejects rather than throws on the dummy hash", () => {
      // The lookup-miss path compares against this so that an unknown key id
      // costs the same as a known one. It must never match.
      expect(verifySecretHash(DUMMY_SECRET_HASH, "anything")).toBe(false);
      expect(DUMMY_SECRET_HASH).toHaveLength(64);
    });

    it.each([
      ["empty", ""],
      ["short", "abcd"],
      ["odd length", "abc"],
      ["not hex", "zzzz"],
      ["too long", "0".repeat(128)],
    ])(
      "returns false for a %s stored hash instead of throwing",
      (_, stored) => {
        // timingSafeEqual throws on a length mismatch. A corrupt stored hash must
        // deny access, not surface a 500 that distinguishes it from a bad secret.
        expect(() => verifySecretHash(stored, "x")).not.toThrow();
        expect(verifySecretHash(stored, "x")).toBe(false);
      },
    );
  });

  describe("splitCredential", () => {
    it("splits a well-formed credential", () => {
      expect(splitCredential("at_live_abc123def456.thesecret")).toEqual({
        keyId: "at_live_abc123def456",
        secret: "thesecret",
      });
    });

    it.each([
      ["no separator", "at_live_abc123def456"],
      ["empty key id", ".secret"],
      ["empty secret", "at_live_abc123def456."],
      ["empty string", ""],
      ["trailing junk", "at_live_abc123def456.secret.extra"],
      ["jwt shaped", "eyJhbGci.eyJzdWIi.sig"],
    ])("rejects %s", (_, input) => {
      expect(splitCredential(input)).toBeNull();
    });

    it("rejects trailing junk rather than truncating it", () => {
      // Accepting the first two segments would mean the same secret
      // authenticates with arbitrary junk appended.
      expect(splitCredential("at_live_abc.secret.ignored")).toBeNull();
    });
  });
});
