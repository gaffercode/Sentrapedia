import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authMode: "clerk",
  installed: true,
  warm: vi.fn<() => Promise<boolean>>(),
  health: vi.fn<() => Promise<Response>>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/auth/server", () => ({ getAuthConfig: () => ({ mode: state.authMode }) }));
vi.mock("../src/lib/aadi/gateway", () => ({ createAadiGateway: () => ({ health: state.health }) }));
vi.mock("../src/lib/theoracle-grounding", () => ({
  retrieveTheOracleGrounding: vi.fn(),
  retrieveTheOracleTherapyGrounding: vi.fn(),
  warmTheOracleGrounding: state.warm,
}));
vi.mock("../src/lib/theoracle-catalogue", () => ({ loadCatalogue: () => ({ installed: state.installed }) }));

beforeEach(() => {
  vi.resetModules();
  state.authMode = "clerk";
  state.installed = true;
  state.warm.mockReset().mockResolvedValue(true);
  state.health.mockReset().mockImplementation(async () => Response.json({ configured: true, reachable: true, modelReady: true, groundingReady: true }));
  vi.stubEnv("SENTRAPEDIA_DATABASE_URL", "postgres://unused");
  vi.stubEnv("SENTRAPEDIA_USER_DAILY_ANALYSES", "5");
});
afterEach(() => vi.unstubAllEnvs());

describe("AADI deployment readiness", () => {
  it("refuses readiness when the engine is up but the local index or model fails to warm", async () => {
    state.warm.mockResolvedValue(false);
    const { GET } = await import("../src/app/api/aadi/route");
    expect(await (await GET()).json()).toMatchObject({ reachable: true, ready: false });
  });

  it("reports readiness only after a successful warm-up and reuses it", async () => {
    const { GET } = await import("../src/app/api/aadi/route");
    expect(await (await GET()).json()).toMatchObject({ reachable: true, ready: true });
    await GET();
    expect(state.warm).toHaveBeenCalledTimes(1);
  });

  it.each(["catalogue", "quota", "database", "identity", "engine"])("refuses readiness without %s", async missing => {
    if (missing === "catalogue") state.installed = false;
    if (missing === "quota") vi.stubEnv("SENTRAPEDIA_USER_DAILY_ANALYSES", "0");
    if (missing === "database") vi.stubEnv("SENTRAPEDIA_DATABASE_URL", "");
    if (missing === "identity") state.authMode = "unavailable";
    if (missing === "engine") state.health.mockImplementation(async () => Response.json({ configured: true, reachable: true, modelReady: false, groundingReady: true }));
    const { GET } = await import("../src/app/api/aadi/route");
    expect(await (await GET()).json()).toMatchObject({ ready: false });
  });
});
