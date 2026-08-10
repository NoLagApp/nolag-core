import { generateDBUuid, generateRandomUuid, validateUUID } from "./guid";

describe("guid", () => {
  describe("generateDBUuid", () => {
    it("produces a valid v7 uuid", () => {
      const id = generateDBUuid();
      expect(validateUUID(id)).toBe(true);
      // Version nibble is the first character of the third group.
      expect(id.split("-")[2][0]).toBe("7");
    });

    it("produces distinct values", () => {
      const ids = new Set(Array.from({ length: 500 }, () => generateDBUuid()));
      expect(ids.size).toBe(500);
    });

    it("sorts lexicographically in creation order", () => {
      // This is the reason for v7 over v4: primary keys cluster at the right
      // edge of the index instead of scattering.
      const ids = Array.from({ length: 50 }, () => generateDBUuid());
      expect([...ids].sort()).toEqual(ids);
    });
  });

  describe("generateRandomUuid", () => {
    it("produces a valid v4 uuid", () => {
      const id = generateRandomUuid();
      expect(validateUUID(id)).toBe(true);
      expect(id.split("-")[2][0]).toBe("4");
    });
  });

  describe("validateUUID", () => {
    it.each([
      ["", false],
      ["not-a-uuid", false],
      // Right shape, but the variant nibble must be 8, 9, a or b per RFC 4122,
      // so an all-ones uuid is rejected even though it looks well formed.
      ["11111111-1111-1111-1111-111111111111", false],
      ["11111111-1111-4111-8111-11111111111", false], // one char short
      ["11111111-1111-4111-8111-111111111111", true],
    ])("validateUUID(%p) is %p", (input, expected) => {
      expect(validateUUID(input)).toBe(expected);
    });
  });
});
