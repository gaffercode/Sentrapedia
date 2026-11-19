import { describe, expect, it } from "vitest";
import { createAnalysisLimits, createMemoryLimitsStore, type LimitsStore } from "../src/lib/aadi/limits";

// Gated beta (Gaffer, 2026-11-17): a daily quota per person and one shared daily budget that stops new analyses
// at 100% and raises an alert at 80%. The memory store used here follows the same rules as the SQL store
// (src/lib/aadi/limits-store.ts); that SQL is not executed by this suite.
const at = (iso: string) => () => new Date(iso);
const DAY1 = "2026-11-17T03:00:00Z";
const setup = (overrides: Partial<Parameters<typeof createAnalysisLimits>[0]> = {}) => {
  const events: Record<string, unknown>[] = [];
  const store = createMemoryLimitsStore();
  const limits = createAnalysisLimits({ store, quota: "2", dailyBudgetUsd: 1, holdUsd: 0.2, now: at(DAY1), log: entry => events.push(entry), ...overrides });
  return { limits, store, events };
};
const admitted = async (limits: ReturnType<typeof createAnalysisLimits>, principal = "user_a") => {
  const admission = await limits.admit(principal);
  if (!admission.ok) throw new Error(`refused: ${admission.code}`);
  return admission;
};

describe("per-person daily quota", () => {
  it("admits up to the quota and refuses the next analysis that day", async () => {
    const { limits } = setup();
    await (await admitted(limits)).settle(0.01, true);
    await (await admitted(limits)).settle(0.01, true);
    const third = await limits.admit("user_a");
    expect(third).toMatchObject({ ok: false, code: "QUOTA_EXCEEDED", status: 429 });
  });

  it("counts each person separately", async () => {
    const { limits } = setup({ quota: "1" });
    await (await admitted(limits, "user_a")).settle(0.01, true);
    expect((await limits.admit("user_a")).ok).toBe(false);
    expect((await limits.admit("user_b")).ok).toBe(true);
  });

  it("gives the place back when the analysis did not complete", async () => {
    const { limits } = setup({ quota: "1" });
    await (await admitted(limits)).settle(0, false);
    expect((await limits.admit("user_a")).ok).toBe(true);
  });

  it("starts again on the next UTC day", async () => {
    const store = createMemoryLimitsStore();
    const today = createAnalysisLimits({ store, quota: "1", dailyBudgetUsd: 1, holdUsd: 0.2, now: at("2026-11-17T23:59:00Z"), log: () => undefined });
    await (await admitted(today)).settle(0.01, true);
    expect((await today.admit("user_a")).ok).toBe(false);
    const tomorrow = createAnalysisLimits({ store, quota: "1", dailyBudgetUsd: 1, holdUsd: 0.2, now: at("2026-11-18T00:00:01Z"), log: () => undefined });
    expect((await tomorrow.admit("user_a")).ok).toBe(true);
  });

  it("survives a restart: a new limiter over the same store still sees today's count", async () => {
    const { store, limits } = setup({ quota: "1" });
    await (await admitted(limits)).settle(0.01, true);
    const restarted = createAnalysisLimits({ store, quota: "1", dailyBudgetUsd: 1, holdUsd: 0.2, now: at(DAY1), log: () => undefined });
    expect((await restarted.admit("user_a")).ok).toBe(false);
  });
});

describe("configuration that would switch the guard off refuses instead", () => {
  it.each([undefined, "", "0", "-3", "2.5", "abc", "100000"])("refuses when the quota setting is %j", async quota => {
    const { limits } = setup({ quota });
    expect(await limits.admit("user_a")).toMatchObject({ ok: false, code: "QUOTA_NOT_SET", status: 503 });
  });

  it("refuses when no store is configured", async () => {
    const { limits } = setup({ store: undefined });
    expect(await limits.admit("user_a")).toMatchObject({ ok: false, code: "LIMITS_UNAVAILABLE", status: 503 });
  });

  it("refuses when the store fails, and never runs the analysis unguarded", async () => {
    const broken: LimitsStore = { admit: async () => { throw new Error("connection refused"); }, settle: async () => ({ alert: false, spentUsd: 0 }), used: async () => 0 };
    const { limits, events } = setup({ store: broken });
    expect(await limits.admit("user_a")).toMatchObject({ ok: false, code: "LIMITS_UNAVAILABLE", status: 503 });
    expect(events).toEqual([{ event: "aadi.limits", level: "error", stage: "admit" }]);
  });

  it("refuses a caller without a principal", async () => {
    const { limits } = setup();
    expect(await limits.admit(undefined)).toMatchObject({ ok: false, code: "LIMITS_UNAVAILABLE" });
  });

  it("keeps the answer when settling fails, and logs it without any case text", async () => {
    const store = createMemoryLimitsStore();
    const flaky: LimitsStore = { admit: store.admit, settle: async () => { throw new Error("timeout"); }, used: store.used };
    const { limits, events } = setup({ store: flaky });
    await expect((await admitted(limits)).settle(0.01, true)).resolves.toBeUndefined();
    expect(events).toEqual([{ event: "aadi.limits", level: "error", stage: "settle" }]);
  });
});

describe("shared daily budget", () => {
  it("stops new analyses once spend reaches 100% of the budget", async () => {
    const { limits } = setup({ quota: "100", dailyBudgetUsd: 0.5, holdUsd: 0.2 });
    await (await admitted(limits, "user_a")).settle(0.25, true);
    await (await admitted(limits, "user_b")).settle(0.25, true);
    expect(await limits.admit("user_c")).toMatchObject({ ok: false, code: "BUDGET_EXHAUSTED", status: 429 });
  });

  it("holds the cap of a running analysis, so analyses started together cannot pass the budget between them", async () => {
    const { limits } = setup({ quota: "100", dailyBudgetUsd: 0.5, holdUsd: 0.2 });
    const first = await admitted(limits, "user_a");
    const second = await admitted(limits, "user_b");
    // 0.4 is held; a third hold of 0.2 would pass 0.5.
    expect(await limits.admit("user_c")).toMatchObject({ ok: false, code: "BUDGET_EXHAUSTED" });
    await first.settle(0.01, true); await second.settle(0.01, true);
    expect((await limits.admit("user_c")).ok).toBe(true);
  });

  it("does not charge the quota of a person refused by the budget", async () => {
    const { limits, store } = setup({ quota: "1", dailyBudgetUsd: 0.3, holdUsd: 0.2 });
    const running = await admitted(limits, "user_a");
    expect((await limits.admit("user_b")).ok).toBe(false);
    await running.settle(0.01, true);
    expect((await limits.admit("user_b")).ok).toBe(true);
    void store;
  });

  it("refuses outright when one analysis could cost more than the whole budget", async () => {
    const { limits } = setup({ dailyBudgetUsd: 0.1, holdUsd: 0.2 });
    expect(await limits.admit("user_a")).toMatchObject({ ok: false, code: "BUDGET_EXHAUSTED" });
  });

  it("alerts once when spend crosses 80%, not before and not again", async () => {
    const { limits, events } = setup({ quota: "100", dailyBudgetUsd: 1, holdUsd: 0.1 });
    await (await admitted(limits)).settle(0.79, true);
    expect(events).toEqual([]);
    await (await admitted(limits)).settle(0.01, true);
    expect(events).toEqual([{ event: "aadi.budget", level: "alert", day: "2026-11-17", spentUsd: 0.8, limitUsd: 1 }]);
    await (await admitted(limits)).settle(0.05, true);
    expect(events).toHaveLength(1);
  });

  it("resets the budget and the alert on the next UTC day", async () => {
    const store = createMemoryLimitsStore();
    const events: Record<string, unknown>[] = [];
    const make = (iso: string) => createAnalysisLimits({ store, quota: "100", dailyBudgetUsd: 0.5, holdUsd: 0.2, now: at(iso), log: entry => events.push(entry) });
    await (await admitted(make("2026-11-17T10:00:00Z"))).settle(0.5, true);
    expect((await make("2026-11-17T11:00:00Z").admit("user_b")).ok).toBe(false);
    await (await admitted(make("2026-11-18T00:10:00Z"), "user_b")).settle(0.45, true);
    expect(events.map(entry => entry.day)).toEqual(["2026-11-17", "2026-11-18"]);
  });

  it("charges the day the analysis was admitted on, also when it settles after midnight", async () => {
    const store = createMemoryLimitsStore();
    let clock = "2026-11-17T23:59:58Z";
    const limits = createAnalysisLimits({ store, quota: "100", dailyBudgetUsd: 0.5, holdUsd: 0.2, now: () => new Date(clock), log: () => undefined });
    const admission = await admitted(limits);
    clock = "2026-11-18T00:00:03Z";
    await admission.settle(0.3, true);
    // Yesterday carries the 0.3 and no hold is left behind on either day.
    expect(await store.admit("user_b", "2026-11-17", 100, 0.2, 0.5)).toBe("admitted");
    expect(await store.admit("user_c", "2026-11-17", 100, 0.2, 0.5)).toBe("budget");
    expect(await store.admit("user_b", "2026-11-18", 100, 0.5, 0.5)).toBe("admitted");
  });
});

// The account menu shows the person's own count (docs/FEATURE-IDEAS.md idea 3); the shared budget in money is never shown.
describe("daily usage", () => {
  it("reports the person's own count and quota", async () => {
    const { limits } = setup({ quota: "3" });
    await (await admitted(limits)).settle(0.01, true);
    await (await admitted(limits)).settle(0.01, true);
    await (await admitted(limits)).settle(0, false);
    expect(await limits.usage("user_a")).toEqual({ used: 2, quota: 3 });
    expect(await limits.usage("user_b")).toEqual({ used: 0, quota: 3 });
  });

  it("has no usage when the guard cannot say", async () => {
    expect(await setup({ store: undefined }).limits.usage("user_a")).toBeNull();
    expect(await setup().limits.usage(undefined)).toBeNull();
    expect(await setup({ quota: undefined }).limits.usage("user_a")).toBeNull();
    const failing: LimitsStore = { ...createMemoryLimitsStore(), used: async () => { throw new Error("down"); } };
    expect(await setup({ store: failing }).limits.usage("user_a")).toBeNull();
  });
});
