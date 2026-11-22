import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /api/sync: 503 SYNC_UNAVAILABLE means the instance has no sync. A store that fails mid-call is a different state,
// and saying "not active" there would tell the doctor sync is off when a retry would work.
const store = vi.hoisted(() => ({
  pullEncounters: vi.fn(async () => []), pullTemplates: vi.fn(async () => []),
  pushEncounters: vi.fn(async () => ({ saved: [], held: [] })), pushTemplates: vi.fn(async () => ({ saved: [], held: [] })),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/sync/store", () => store);
vi.mock("../src/lib/auth/server", () => ({ getAuthConfig: () => ({ mode: "local" }), getBetaAccess: () => ({ resolve: async () => ({ status: "allowed", userId: "local-development" }) }) }));

import { GET, POST } from "../src/app/api/sync/route";

const push = (origin = "http://localhost") => POST(new Request("http://localhost/api/sync", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ encounters: [], templates: [] }) }));

beforeEach(() => { vi.stubEnv("SENTRAPEDIA_DATABASE_URL", "postgres://unused"); vi.stubEnv("SENTRAPEDIA_SYNC_MODE", ""); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("/api/sync failures", () => {
  it("answers 503 SYNC_UNAVAILABLE when the instance has no sync", async () => {
    vi.stubEnv("SENTRAPEDIA_DATABASE_URL", "");
    const response = await push();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SYNC_UNAVAILABLE");
  });
  it("answers SYNC_FAILED, not 'not active', when saving templates fails after the encounters were saved", async () => {
    store.pushTemplates.mockRejectedValueOnce(new Error("private database detail"));
    const response = await push();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text).error.code).toBe("SYNC_FAILED");
    expect(text).not.toContain("private database detail");
  });
  // The same origin check as /api/feedback and /api/aadi/report: a page on another site cannot write to the account.
  it("refuses a push from another origin before reading it", async () => {
    const response = await push("https://evil.example");
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("ORIGIN");
    expect(store.pushEncounters).not.toHaveBeenCalled();
  });
  it("answers SYNC_FAILED when a pull fails", async () => {
    store.pullTemplates.mockRejectedValueOnce(new Error("boom"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("SYNC_FAILED");
  });
});
