import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBetaAccess } from "../src/lib/auth/access";
import { resolveAuthConfig } from "../src/lib/auth/config";
import { GET, POST } from "../src/app/api/aadi/route";

const state = vi.hoisted(() => ({ session: null as string | null, metadata: {} as Record<string, unknown>, steps: [] as Request[], principals: [] as (string | undefined)[], places: {} as Record<string, number>, gatewayOptions: {} as Record<string, unknown>, identityReads: 0, unavailable: false, failLookup: false }));
const guardFakes = vi.hoisted(() => ({ queue: { position: (principal: string) => state.places[principal] ?? null }, limits: { marker: "limits" } }));
const fixtureConfig = () => resolveAuthConfig({ NODE_ENV: "test", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("auth.example.test$").toString("base64")}`, CLERK_SECRET_KEY: "sk_test_fixture_not_a_real_key" });
vi.mock("../src/lib/auth/server", () => ({ getAuthConfig: () => fixtureConfig(), getBetaAccess: () => createBetaAccess({
  config: state.unavailable ? { mode: "unavailable" } : fixtureConfig(),
  session: async () => { state.identityReads++; return state.session; },
  user: async (id) => { if (state.failLookup) throw new Error("Private provider error"); return { id, emailVerified: true, privateMetadata: state.metadata }; },
  writeConsent: async (_id, consent, profile) => { state.metadata = { ...state.metadata, sentrapediaBetaConsent: consent, sentrapediaBetaProfile: profile }; },
}) }));
vi.mock("../src/lib/aadi/gateway", () => ({ createAadiGateway: (options: Record<string, unknown>) => { state.gatewayOptions = options; return gatewayFake; } }));
const gatewayFake = vi.hoisted(() => ({
  health: async () => Response.json({ reachable: true, modelReady: true, groundingReady: true, configured: true, model: "mock", maxCostUsd: 0 }),
  step: async (request: Request, principal?: string) => { state.steps.push(request); state.principals.push(principal); return Response.json({ status: "ok", marker: "analysis-boundary" }); },
}));
// The guards open a database pool and are server-only; their own rules are in aadi-guardrails.test.ts.
vi.mock("../src/lib/aadi/server-guards", () => ({ analysisQueue: guardFakes.queue, analysisLimits: (targeted: boolean) => ({ ...guardFakes.limits, targeted }) }));
vi.mock("../src/lib/theoracle-grounding", () => ({ retrieveTheOracleGrounding: async () => undefined, retrieveTheOracleTherapyGrounding: async () => undefined, warmTheOracleGrounding: async () => false }));

const incoming = () => new Request("http://127.0.0.1:3101/api/aadi", { method: "POST", headers: { Origin: "http://127.0.0.1:3101", "Content-Type": "application/json" }, body: JSON.stringify({ case: "fixture" }) });
const accepted = { version: "sentrapedia-beta-v3", acceptedAt: "2026-10-24T00:00:00.000Z" };
const profile = { profession: "Dokter", registration: "STR-0001-TEST", practice: "Puskesmas Contoh, Kota Fiktif" };
beforeEach(() => { state.session = null; state.metadata = {}; state.steps = []; state.principals = []; state.places = {}; state.identityReads = 0; state.unavailable = false; state.failLookup = false; });

describe("analysis route authorization", () => {
  it("rejects a signed-out direct POST before any gateway work", async () => {
    const response = await POST(incoming());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", error: { code: "AUTH_REQUIRED" } });
    expect(state.steps).toEqual([]);
  });
  it("requires the current acknowledgement and rejects disabled accounts, both before any gateway work", async () => {
    state.session = "user_a";
    const owed = await POST(incoming());
    expect(owed.status).toBe(403);
    expect(await owed.json()).toMatchObject({ error: { code: "CONSENT_REQUIRED" } });
    state.metadata = { sentrapediaBetaConsent: { ...accepted, version: "sentrapedia-beta-v2" } };
    expect((await POST(incoming())).status).toBe(403);
    state.metadata = { sentrapediaBetaConsent: accepted, sentrapediaBetaProfile: profile };
    expect((await POST(incoming())).status).toBe(200);
    state.steps = [];
    state.metadata = { sentrapediaBetaConsent: accepted, sentrapediaBetaProfile: profile, sentrapediaBetaAccess: { disabled: true } };
    expect((await POST(incoming())).status).toBe(403);
    expect(state.steps).toEqual([]);
  });
  it("forwards an authorized request unmodified to the existing gateway", async () => {
    state.session = "user_a"; state.metadata = { sentrapediaBetaConsent: accepted, sentrapediaBetaProfile: profile };
    const request = incoming(); const response = await POST(request);
    expect(response.status).toBe(200);
    expect(state.steps).toEqual([request]);
    expect(await state.steps[0].json()).toEqual({ case: "fixture" });
  });
  it("returns a generic unavailable error, never clinical work, when identity is unavailable", async () => {
    state.unavailable = true;
    expect((await POST(incoming())).status).toBe(503);
    state.unavailable = false; state.session = "user_a"; state.failLookup = true;
    const response = await POST(incoming());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("Private provider error");
    expect(state.steps).toEqual([]);
  });
  it("keeps readiness available without an identity session or analysis call", async () => {
    state.unavailable = true;
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reachable: true, configured: true });
    expect(state.identityReads).toBe(0);
    expect(state.steps).toEqual([]);
  });
  it("the onboarding route retains body/origin validation and cannot accept a forged subject", async () => {
    const { POST: consentPost } = await import("../src/app/api/onboarding/consent/route");
    state.session = "user_a";
    const body = { version: "sentrapedia-beta-v3", accepted: true, profile, userId: "user_b" };
    const request = new Request("http://127.0.0.1:3101/api/onboarding/consent", { method: "POST", headers: { Origin: "http://127.0.0.1:3101", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await consentPost(request)).status).toBe(400);
    expect(state.metadata).toEqual({});
  });
});

describe("analysis guards at the route", () => {
  it("builds the gateway with the shared line and the limits, holding two step caps for the targeted analysis", () => {
    // Without these two options the gateway runs unguarded, and no other test would notice.
    expect(state.gatewayOptions.queue).toBe(guardFakes.queue);
    expect(state.gatewayOptions.limits).toEqual({ marker: "limits", targeted: true });
  });
  it("hands the gateway the session's principal, never one from the body", async () => {
    state.session = "user_a"; state.metadata = { sentrapediaBetaConsent: accepted, sentrapediaBetaProfile: profile };
    await POST(incoming());
    expect(state.principals).toEqual(["user_a"]);
  });
  it("tells a signed-in person their own place in line and nobody else's", async () => {
    const { GET: queueGet } = await import("../src/app/api/aadi/queue/route");
    state.places = { user_a: 3, user_b: 1 };
    expect((await queueGet()).status).toBe(401);
    state.session = "user_a"; state.metadata = { sentrapediaBetaConsent: accepted, sentrapediaBetaProfile: profile };
    const response = await queueGet();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ position: 3 });
    state.session = "user_c";
    expect(await (await queueGet()).json()).toEqual({ position: null });
  });
  it("refuses the place of a disabled account", async () => {
    const { GET: queueGet } = await import("../src/app/api/aadi/queue/route");
    state.session = "user_a"; state.metadata = { sentrapediaBetaConsent: accepted, sentrapediaBetaProfile: profile, sentrapediaBetaAccess: { disabled: true } };
    expect((await queueGet()).status).toBe(403);
  });
});
