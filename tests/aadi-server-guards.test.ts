import { afterEach, describe, expect, it, vi } from "vitest";
import { aadiStepBudgetUsd, aadiDailyBudgetUsd } from "../src/lib/aadi/model-profile";

// The switch that turns the gated beta's limits on (src/lib/aadi/server-guards.ts). The rules themselves are in
// aadi-limits.test.ts; this file pins that a deployed instance gets them from its settings, and that a missing
// setting refuses the analysis instead of leaving it unguarded.
const admits = vi.hoisted(() => [] as unknown[][]);
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/aadi/limits-store", () => ({ createPostgresLimitsStore: () => ({
  admit: async (...args: unknown[]) => { admits.push(args); return "admitted"; },
  settle: async () => ({ alert: false, spentUsd: 0 }),
}) }));

const clerk = { NODE_ENV: "test", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("auth.example.test$").toString("base64")}`, CLERK_SECRET_KEY: "sk_test_fixture_not_a_real_key" };
const database = { SENTRAPEDIA_DATABASE_URL: "postgres://sentrapedia_runtime@db.example.test/sentrapedia" };
// The guards read the settings when they are built, so each case loads the module fresh under its own settings.
async function guards(env: Record<string, string>) {
  vi.resetModules();
  for (const name of ["SENTRAPEDIA_AUTH_MODE", "SENTRAPEDIA_PUBLIC_ORIGIN", "SENTRAPEDIA_HOST", "SENTRAPEDIA_DATABASE_URL", "SENTRAPEDIA_USER_DAILY_ANALYSES", "SENTRAPEDIA_SYNC_MODE", "AADI_MAX_CONCURRENT", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]) vi.stubEnv(name, undefined);
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  delete (globalThis as { sentrapediaAnalysisQueue?: unknown }).sentrapediaAnalysisQueue;
  return import("../src/lib/aadi/server-guards");
}
afterEach(() => { vi.unstubAllEnvs(); admits.length = 0; delete (globalThis as { sentrapediaAnalysisQueue?: unknown }).sentrapediaAnalysisQueue; });

describe("analysis limits from the server's settings", () => {
  it("refuses in Clerk mode when no database is configured", async () => {
    const { analysisLimits } = await guards({ ...clerk, SENTRAPEDIA_USER_DAILY_ANALYSES: "20" });
    expect(await analysisLimits(true)?.admit("user_a")).toMatchObject({ ok: false, code: "LIMITS_UNAVAILABLE", status: 503 });
    expect(admits).toEqual([]);
  });

  it("refuses in Clerk mode while the quota is unset, whatever the database", async () => {
    const { analysisLimits } = await guards({ ...clerk, ...database });
    expect(await analysisLimits(true)?.admit("user_a")).toMatchObject({ ok: false, code: "QUOTA_NOT_SET", status: 503 });
    expect(admits).toEqual([]);
  });

  it("counts against the database with the configured quota, the profile's budget and two step caps for the targeted analysis", async () => {
    const { analysisLimits } = await guards({ ...clerk, ...database, SENTRAPEDIA_USER_DAILY_ANALYSES: "20" });
    expect((await analysisLimits(true)?.admit("user_a"))?.ok).toBe(true);
    expect((await analysisLimits(false)?.admit("user_a"))?.ok).toBe(true);
    expect(admits.map(([principal, , quota, holdUsd, budgetUsd]) => ({ principal, quota, holdUsd, budgetUsd }))).toEqual([
      { principal: "user_a", quota: 20, holdUsd: 2 * aadiStepBudgetUsd, budgetUsd: aadiDailyBudgetUsd },
      { principal: "user_a", quota: 20, holdUsd: aadiStepBudgetUsd, budgetUsd: aadiDailyBudgetUsd },
    ]);
  });

  it("keeps the limits on when workspace sync is switched off", async () => {
    const { analysisLimits } = await guards({ ...clerk, ...database, SENTRAPEDIA_USER_DAILY_ANALYSES: "20", SENTRAPEDIA_SYNC_MODE: "off" });
    expect((await analysisLimits(true)?.admit("user_a"))?.ok).toBe(true);
  });

  it("applies no limits in the local single-user mode, and none when identity is not configured at all", async () => {
    expect((await guards({ NODE_ENV: "test", SENTRAPEDIA_AUTH_MODE: "local" })).analysisLimits(true)).toBeUndefined();
    // Unconfigured Clerk resolves to "unavailable": every request is refused by the access check before the gateway.
    expect((await guards({ NODE_ENV: "test" })).analysisLimits(true)).toBeUndefined();
  });
});

describe("the shared line", () => {
  it("is one line per process, sized by AADI_MAX_CONCURRENT", async () => {
    const first = await guards({ AADI_MAX_CONCURRENT: "2" });
    const signal = new AbortController().signal;
    expect((await first.analysisQueue.enter("user_a", signal)).ok).toBe(true);
    expect((await first.analysisQueue.enter("user_b", signal)).ok).toBe(true);
    void first.analysisQueue.enter("user_c", signal);
    expect(first.analysisQueue.position("user_c")).toBe(1);
    // A second load of the module in the same process must see the same line.
    vi.resetModules();
    const second = await import("../src/lib/aadi/server-guards");
    expect(second.analysisQueue).toBe(first.analysisQueue);
    expect(second.analysisQueue.position("user_c")).toBe(1);
  });
});
