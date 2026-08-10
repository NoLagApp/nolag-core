import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { SystemApiKeyEntity } from "../systemKeyModule/systemApiKey.entity";
import { SystemApiKeyFacade } from "../systemKeyModule/systemApiKey.facade";
import { InternalGuard, RequestWithSystemKey } from "./internal.guard";

const KEY = {
  systemApiKeyId: "abc",
  keyId: "nlg_system_abc123def456",
} as SystemApiKeyEntity;

function contextFor(request: RequestWithSystemKey): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("InternalGuard", () => {
  let guard: InternalGuard;
  let facade: jest.Mocked<Pick<SystemApiKeyFacade, "authenticate">>;

  beforeEach(() => {
    facade = { authenticate: jest.fn().mockResolvedValue(KEY) };
    guard = new InternalGuard(facade as unknown as SystemApiKeyFacade);
    jest.spyOn(guard["logger"], "warn").mockImplementation(() => undefined);
  });

  it("allows a valid system key and attaches it to the request", async () => {
    const request: RequestWithSystemKey = {
      headers: { authorization: "Bearer nlg_system_abc123def456.secret" },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.systemApiKey).toBe(KEY);
    expect(facade.authenticate).toHaveBeenCalledWith(
      "nlg_system_abc123def456.secret",
    );
  });

  it("accepts the scheme case-insensitively", async () => {
    const request: RequestWithSystemKey = {
      headers: { authorization: "bearer nlg_system_abc123def456.secret" },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  it("rejects a missing authorization header", async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it.each([
    ["no scheme", "nlg_system_abc123def456.secret"],
    ["wrong scheme", "Basic nlg_system_abc123def456.secret"],
    ["scheme only", "Bearer"],
    ["empty token", "Bearer "],
  ])("rejects a malformed header (%s)", async (_, authorization) => {
    await expect(
      guard.canActivate(contextFor({ headers: { authorization } })),
    ).rejects.toThrow(UnauthorizedException);
    expect(facade.authenticate).not.toHaveBeenCalled();
  });

  it("rejects a header sent as an array", async () => {
    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: ["Bearer a.b"] } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejects when the key does not authenticate", async () => {
    facade.authenticate.mockResolvedValue(null);
    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: "Bearer nope.nope" } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("does not leak the reason for the refusal", async () => {
    // Every rejection returns the same message, so the guard cannot be used to
    // distinguish an unknown key from a wrong secret.
    facade.authenticate.mockResolvedValue(null);
    const messages: string[] = [];

    for (const authorization of ["Bearer a.b", "Basic a.b"]) {
      try {
        await guard.canActivate(contextFor({ headers: { authorization } }));
      } catch (error) {
        messages.push(
          (error as UnauthorizedException).getResponse()["message"] as string,
        );
      }
    }

    try {
      await guard.canActivate(contextFor({ headers: {} }));
    } catch (error) {
      messages.push(
        (error as UnauthorizedException).getResponse()["message"] as string,
      );
    }

    expect(new Set(messages)).toEqual(new Set(["Unauthorized"]));
  });
});
