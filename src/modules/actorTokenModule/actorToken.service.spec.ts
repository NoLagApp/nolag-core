import { generateCredential } from "../../common/utils/secretHash";
import { ActorTokenEntity } from "./actorToken.entity";
import { ActorTokenRepository } from "./actorToken.repository";
import { ActorTokenService } from "./actorToken.service";
import { EActorTokenStatus } from "./enum/EActorTokenStatus.enum";
import { EActorType } from "./enum/EActorType.enum";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const TOKEN_ID = "22222222-2222-2222-2222-222222222222";

const credential = generateCredential("at_live");

function buildToken(
  overrides: Partial<ActorTokenEntity> = {},
): ActorTokenEntity {
  return {
    actorTokenId: TOKEN_ID,
    projectId: PROJECT_ID,
    keyId: credential.keyId,
    secretHash: credential.secretHash,
    name: "test actor",
    actorType: EActorType.Device,
    status: EActorTokenStatus.Active,
    expiresAt: null,
    lastUsedAt: null,
    accessScopeId: null,
    ...overrides,
  } as ActorTokenEntity;
}

describe("ActorTokenService", () => {
  let service: ActorTokenService;
  let repository: jest.Mocked<
    Pick<ActorTokenRepository, "findByKeyId" | "updateLastUsed">
  >;

  beforeEach(() => {
    repository = {
      findByKeyId: jest.fn().mockResolvedValue(buildToken()),
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    service = new ActorTokenService(
      repository as unknown as ActorTokenRepository,
    );
    jest.spyOn(service["_logger"], "warn").mockImplementation(() => undefined);
    jest.spyOn(service["_logger"], "error").mockImplementation(() => undefined);
  });

  describe("generateActorToken", () => {
    it("produces at_live_<12hex>.<43 base64url>", () => {
      const {
        keyId,
        secret,
        credential: combined,
      } = service.generateActorToken();
      expect(keyId).toMatch(/^at_live_[0-9a-f]{12}$/);
      expect(secret).toHaveLength(43);
      expect(combined).toBe(`${keyId}.${secret}`);
    });
  });

  describe("authenticateActorToken", () => {
    it("accepts the matching secret", async () => {
      const result = await service.authenticateActorToken(
        credential.credential,
      );
      expect(result?.actorTokenId).toBe(TOKEN_ID);
    });

    it("rejects a wrong secret for a known key id", async () => {
      const result = await service.authenticateActorToken(
        `${credential.keyId}.wrongsecret`,
      );
      expect(result).toBeNull();
    });

    it("rejects an unknown key id", async () => {
      repository.findByKeyId.mockResolvedValue(null);
      const result = await service.authenticateActorToken(
        credential.credential,
      );
      expect(result).toBeNull();
    });

    it("still compares a hash when the key id is unknown", async () => {
      // Constant time against enumeration: an unknown key id must not return
      // faster than a known one with a bad secret.
      repository.findByKeyId.mockResolvedValue(null);
      await service.authenticateActorToken(credential.credential);
      expect(repository.findByKeyId).toHaveBeenCalled();
    });

    it.each([
      ["no separator", "at_live_abc123def456"],
      ["empty secret", "at_live_abc123def456."],
      ["empty key id", ".secret"],
      ["trailing junk", "at_live_abc123def456.secret.extra"],
      ["empty string", ""],
    ])("rejects a malformed credential (%s)", async (_, token) => {
      await expect(service.authenticateActorToken(token)).resolves.toBeNull();
      expect(repository.findByKeyId).not.toHaveBeenCalled();
    });

    it("rejects a disabled token", async () => {
      repository.findByKeyId.mockResolvedValue(
        buildToken({ status: EActorTokenStatus.Disabled }),
      );
      await expect(
        service.authenticateActorToken(credential.credential),
      ).resolves.toBeNull();
    });

    it("rejects an expired token", async () => {
      repository.findByKeyId.mockResolvedValue(
        buildToken({ expiresAt: new Date(Date.now() - 60_000) }),
      );
      await expect(
        service.authenticateActorToken(credential.credential),
      ).resolves.toBeNull();
    });

    it("accepts a token whose expiry is in the future", async () => {
      repository.findByKeyId.mockResolvedValue(
        buildToken({ expiresAt: new Date(Date.now() + 60_000) }),
      );
      await expect(
        service.authenticateActorToken(credential.credential),
      ).resolves.not.toBeNull();
    });

    it("caches a successful authentication", async () => {
      await service.authenticateActorToken(credential.credential);
      await service.authenticateActorToken(credential.credential);
      expect(repository.findByKeyId).toHaveBeenCalledTimes(1);
    });

    it("does not let a cached entry authenticate a different secret", async () => {
      // The reason the cache is keyed on the whole credential rather than the
      // key id. Keying on the key id would make this succeed, which is a
      // straight authentication bypass.
      await service.authenticateActorToken(credential.credential);
      const result = await service.authenticateActorToken(
        `${credential.keyId}.someothersecret`,
      );
      expect(result).toBeNull();
    });

    it("authenticates even if recording usage fails", async () => {
      repository.updateLastUsed.mockRejectedValue(new Error("db down"));
      await expect(
        service.authenticateActorToken(credential.credential),
      ).resolves.not.toBeNull();
    });
  });

  describe("getActiveActorByKeyId", () => {
    it("resolves without verifying a secret", async () => {
      const result = await service.getActiveActorByKeyId(credential.keyId);
      expect(result?.actorTokenId).toBe(TOKEN_ID);
    });

    it("rejects an unknown key id", async () => {
      repository.findByKeyId.mockResolvedValue(null);
      await expect(
        service.getActiveActorByKeyId(credential.keyId),
      ).resolves.toBeNull();
    });

    it("rejects a disabled token", async () => {
      repository.findByKeyId.mockResolvedValue(
        buildToken({ status: EActorTokenStatus.Disabled }),
      );
      await expect(
        service.getActiveActorByKeyId(credential.keyId),
      ).resolves.toBeNull();
    });

    it("rejects an expired token", async () => {
      repository.findByKeyId.mockResolvedValue(
        buildToken({ expiresAt: new Date(Date.now() - 1) }),
      );
      await expect(
        service.getActiveActorByKeyId(credential.keyId),
      ).resolves.toBeNull();
    });
  });
});
