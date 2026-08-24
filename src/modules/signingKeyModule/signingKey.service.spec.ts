import { generateKeyPairSync, randomBytes } from "crypto";
import * as jwt from "jsonwebtoken";
import { encryptSecret } from "../../common/utils/secretCipher";
import { CoreConfig } from "../../core.config";
import { ESigningKeyStatus } from "./enum/ESigningKeyStatus.enum";
import { SigningKeyEntity } from "./signingKey.entity";
import { SigningKeyRepository } from "./signingKey.repository";
import { SigningKeyService } from "./signingKey.service";

const ENCRYPTION_KEY = randomBytes(32).toString("base64");
const KID = "sk_live_abc123def456";
const SUB = "at_live_0123456789ab";
const SECRET = randomBytes(32).toString("base64url");
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

function buildKey(overrides: Partial<SigningKeyEntity> = {}): SigningKeyEntity {
  return {
    signingKeyId: "22222222-2222-2222-2222-222222222222",
    projectId: PROJECT_ID,
    keyId: KID,
    secretEncrypted: encryptSecret(SECRET, ENCRYPTION_KEY),
    name: "test key",
    status: ESigningKeyStatus.Active,
    lastUsedAt: null,
    ...overrides,
  } as SigningKeyEntity;
}

function mint(
  claims: Record<string, unknown>,
  opts: {
    secret?: string;
    kid?: string;
    /** Omit the kid header entirely. Distinct from passing kid: undefined,
     *  which a default parameter would silently turn back into the real kid. */
    noKid?: boolean;
    alg?: jwt.Algorithm;
  } = {},
): string {
  const { secret = SECRET, kid = KID, noKid = false, alg = "HS256" } = opts;
  return jwt.sign(claims, secret, {
    algorithm: alg,
    ...(noKid ? {} : { keyid: kid }),
  });
}

const inSeconds = (n: number) => Math.floor(Date.now() / 1000) + n;

describe("SigningKeyService", () => {
  let service: SigningKeyService;
  let repository: jest.Mocked<
    Pick<SigningKeyRepository, "findByKeyId" | "updateLastUsed">
  >;
  let encryptionKey: string | undefined;

  beforeEach(() => {
    encryptionKey = ENCRYPTION_KEY;
    repository = {
      findByKeyId: jest.fn().mockResolvedValue(buildKey()),
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      get signingKeyEncryptionKey() {
        return encryptionKey;
      },
    } as CoreConfig;

    service = new SigningKeyService(
      repository as unknown as SigningKeyRepository,
      config,
    );
    jest.spyOn(service["_logger"], "warn").mockImplementation(() => undefined);
    jest.spyOn(service["_logger"], "error").mockImplementation(() => undefined);
  });

  describe("generateSigningKey", () => {
    it("produces sk_live_<12hex>.<43 base64url> by default", () => {
      const { keyId, secret, signingKey } = service.generateSigningKey();
      expect(keyId).toMatch(/^sk_live_[0-9a-f]{12}$/);
      expect(secret).toHaveLength(43);
      expect(signingKey).toBe(`${keyId}.${secret}`);
    });

    it("honours the sandbox prefix", () => {
      const { keyId } = service.generateSigningKey("sk_sandbox" as never);
      expect(keyId).toMatch(/^sk_sandbox_[0-9a-f]{12}$/);
    });
  });

  describe("verifyClientToken", () => {
    it("accepts a well-formed token and returns sub and exp", async () => {
      const exp = inSeconds(600);
      const result = await service.verifyClientToken(mint({ sub: SUB, exp }));

      expect(result).not.toBeNull();
      expect(result!.payload.sub).toBe(SUB);
      expect(result!.payload.exp).toBe(exp);
      expect(result!.signingKey.projectId).toBe(PROJECT_ID);
    });

    it("records usage without blocking the result", async () => {
      await service.verifyClientToken(mint({ sub: SUB, exp: inSeconds(600) }));
      expect(repository.updateLastUsed).toHaveBeenCalledWith(
        "22222222-2222-2222-2222-222222222222",
      );
    });

    it.each([
      ["an opaque actor token", "at_live_abc123def456.somesecret"],
      ["an empty string", ""],
      ["two segments", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0"],
      ["four segments", "eyJa.eyJb.sig.extra"],
      ["a non-eyJ prefix", "abc.def.ghi"],
    ])("rejects %s", async (_, token) => {
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
      expect(repository.findByKeyId).not.toHaveBeenCalled();
    });

    it("rejects alg=none", async () => {
      // The classic forgery: strip the signature and claim no algorithm.
      const token = jwt.sign({ sub: SUB, exp: inSeconds(600) }, "", {
        algorithm: "none",
        keyid: KID,
      });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
    });

    it("rejects RS256, so a public key cannot be used as an HMAC secret", async () => {
      // Algorithm confusion: sign with RSA and hope the verifier treats the
      // public key as a shared secret. Pinning alg to HS256 before any lookup
      // is what prevents it.
      const { privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const token = jwt.sign({ sub: SUB, exp: inSeconds(600) }, privateKey, {
        algorithm: "RS256",
        keyid: KID,
      });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
      expect(repository.findByKeyId).not.toHaveBeenCalled();
    });

    it("rejects a missing kid", async () => {
      const token = mint({ sub: SUB, exp: inSeconds(600) }, { noKid: true });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
      expect(repository.findByKeyId).not.toHaveBeenCalled();
    });

    it.each([
      ["wrong prefix", "at_live_abc123def456"],
      ["uppercase hex", "sk_live_ABC123DEF456"],
      ["too short", "sk_live_abc123"],
      ["unknown environment", "sk_staging_abc123def456"],
    ])("rejects a malformed kid (%s)", async (_, kid) => {
      const token = mint({ sub: SUB, exp: inSeconds(600) }, { kid });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
      expect(repository.findByKeyId).not.toHaveBeenCalled();
    });

    it("rejects an unknown signing key", async () => {
      repository.findByKeyId.mockResolvedValue(null);
      const token = mint({ sub: SUB, exp: inSeconds(600) });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
    });

    it("rejects a disabled signing key", async () => {
      repository.findByKeyId.mockResolvedValue(
        buildKey({ status: ESigningKeyStatus.Disabled }),
      );
      const token = mint({ sub: SUB, exp: inSeconds(600) });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
    });

    it("rejects a token signed with the wrong secret", async () => {
      const token = mint(
        { sub: SUB, exp: inSeconds(600) },
        { secret: randomBytes(32).toString("base64url") },
      );
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
    });

    it("rejects an expired token", async () => {
      const token = mint({ sub: SUB, exp: inSeconds(-600) });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
    });

    it("accepts a token just expired but inside the clock skew grace", async () => {
      // 60s tolerance, so a slightly fast client clock does not lock users out.
      const token = mint({ sub: SUB, exp: inSeconds(-30) });
      await expect(service.verifyClientToken(token)).resolves.not.toBeNull();
    });

    it("rejects a token expired beyond the clock skew grace", async () => {
      const token = mint({ sub: SUB, exp: inSeconds(-120) });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
    });

    it("rejects a token with no exp claim", async () => {
      // jsonwebtoken does not require exp, so this has to be checked explicitly.
      // Without it a token would be valid forever.
      const token = mint({ sub: SUB });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
    });

    it("rejects an exp beyond the one hour cap", async () => {
      const token = mint({ sub: SUB, exp: inSeconds(7200) });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
    });

    it("accepts an exp just inside the cap", async () => {
      const token = mint({ sub: SUB, exp: inSeconds(3600) });
      await expect(service.verifyClientToken(token)).resolves.not.toBeNull();
    });

    it.each([
      ["missing", undefined],
      ["not a string", 12345],
      ["a signing key id", "sk_live_abc123def456"],
      ["uppercase hex", "at_live_ABC123DEF456"],
      ["truncated", "at_live_abc"],
    ])("rejects a sub that is %s", async (_, sub) => {
      const token = mint({
        ...(sub === undefined ? {} : { sub }),
        exp: inSeconds(600),
      });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
    });

    it("rejects everything when no encryption key is configured", async () => {
      // Fails closed. Without the key the stored secret cannot be decrypted, so
      // no signature can be checked and nothing may be trusted.
      encryptionKey = undefined;
      const token = mint({ sub: SUB, exp: inSeconds(600) });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
    });

    it("rejects when the stored secret cannot be decrypted", async () => {
      repository.findByKeyId.mockResolvedValue(
        buildKey({ secretEncrypted: "v1:garbage.garbage.garbage" }),
      );
      const token = mint({ sub: SUB, exp: inSeconds(600) });
      await expect(service.verifyClientToken(token)).resolves.toBeNull();
    });

    it("caches by kid so a second verify does not hit the database", async () => {
      const token = mint({ sub: SUB, exp: inSeconds(600) });
      await service.verifyClientToken(token);
      await service.verifyClientToken(token);
      expect(repository.findByKeyId).toHaveBeenCalledTimes(1);
    });

    it("re-reads after the cache is invalidated", async () => {
      const token = mint({ sub: SUB, exp: inSeconds(600) });
      await service.verifyClientToken(token);
      service.invalidateCache(KID);
      await service.verifyClientToken(token);
      expect(repository.findByKeyId).toHaveBeenCalledTimes(2);
    });
  });
});
