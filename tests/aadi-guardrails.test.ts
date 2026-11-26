import { describe, expect, it } from "vitest";
import { createAadiGateway } from "../src/lib/aadi/gateway";
import { createAnalysisQueue } from "../src/lib/aadi/queue";
import { createAnalysisLimits, createMemoryLimitsStore } from "../src/lib/aadi/limits";
import type { AadiResult } from "../src/lib/aadi/contract";

// The gated beta's guards as the gateway applies them (Gaffer, 2026-11-17): the line, one analysis per person,
// the daily quota and the shared budget. Their own rules are in aadi-queue.test.ts and aadi-limits.test.ts.
const caseData = { demographics: { ageYears: 30, sex: "unknown" }, chiefComplaint: "Keluhan fiktif untuk uji beta", anamnesis: { freeText: "Contoh sintetis" }, vitals: {}, physicalExam: [], results: [], currentMedications: [], knownConditions: [], allergies: [], facilityCapabilities: [] };
const result = (costUsd: number, status: "ok" | "unavailable" = "ok"): AadiResult => ({ contractVersion: "1", status, differential: { likely: [{ icd10: "J00", label: "Nama keluaran uji", confidenceTier: "low" }], alternatives: [], cannotMiss: [] }, evidence: [], missingInformation: [], nextBestActions: [], disposition: null, unfilled: [], meta: { version: "test-only", model: "mock", costUsd }, ...(status === "ok" ? {} : { error: { code: "MODEL_ERROR", message: "x" } }) } as AadiResult);
const post = (signal?: AbortSignal) => new Request("http://localhost:3104/api/aadi", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3104" }, body: JSON.stringify({ case: caseData }), signal });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const code = async (response: Response) => (await response.json()).error.code as string;
// An engine whose answers wait until the test lets them go, one call at a time.
function hanging(costUsd = 0.01) {
  const releases: (() => void)[] = [];
  let calls = 0;
  const fetchFn: typeof fetch = async () => { calls++; await new Promise<void>(resolve => releases.push(resolve)); return Response.json(result(costUsd)); };
  return { fetchFn, releases, calls: () => calls };
}
const limitsOf = (overrides: Partial<Parameters<typeof createAnalysisLimits>[0]> = {}) => {
  const events: Record<string, unknown>[] = [];
  const store = createMemoryLimitsStore();
  return { store, events, limits: createAnalysisLimits({ store, quota: "2", dailyBudgetUsd: 1, holdUsd: 0.2, now: () => new Date("2026-11-17T03:00:00Z"), log: entry => events.push(entry), ...overrides }) };
};

describe("one analysis per person, others wait in line", () => {
  it("refuses a second analysis from the person whose first is still running", async () => {
    const { fetchFn, releases } = hanging();
    const gateway = createAadiGateway({ log: () => undefined, token: "test", fetchFn, queue: createAnalysisQueue({ maxConcurrent: 3 }) });
    const first = gateway.step(post(), "user_a"); await tick();
    const second = await gateway.step(post(), "user_a");
    expect(second.status).toBe(429); expect(await code(second)).toBe("USER_BUSY");
    releases[0](); expect((await first).status).toBe(200);
    // Finished: the same person may analyse again.
    const third = gateway.step(post(), "user_a"); await tick(); releases[1]();
    expect((await third).status).toBe(200);
  });

  it("makes the next person wait instead of refusing, shows their place, and runs them when the slot frees", async () => {
    const { fetchFn, releases, calls } = hanging();
    const queue = createAnalysisQueue({ maxConcurrent: 1 });
    const gateway = createAadiGateway({ log: () => undefined, token: "test", fetchFn, queue });
    const first = gateway.step(post(), "user_a"); await tick();
    const second = gateway.step(post(), "user_b"); await tick();
    expect(queue.position("user_a")).toBe(0);
    expect(queue.position("user_b")).toBe(1);
    expect(calls()).toBe(1);
    releases[0](); expect((await first).status).toBe(200); await tick();
    expect(queue.position("user_b")).toBe(0);
    releases[1](); expect((await second).status).toBe(200);
    expect(queue.position("user_b")).toBeNull();
  });

  it("answers busy when the line is full or the wait runs out, and never calls the engine for them", async () => {
    const { fetchFn, calls } = hanging();
    const gateway = createAadiGateway({ log: () => undefined, token: "test", fetchFn, queue: createAnalysisQueue({ maxConcurrent: 1, maxQueued: 1, maxWaitMs: 20 }) });
    void gateway.step(post(), "user_a"); await tick();
    const waiting = gateway.step(post(), "user_b"); await tick();
    const full = await gateway.step(post(), "user_c");
    expect(full.status).toBe(429); expect(await code(full)).toBe("BUSY");
    const timedOut = await waiting;
    expect(timedOut.status).toBe(429); expect(await code(timedOut)).toBe("BUSY");
    expect(calls()).toBe(1);
  });

  it("frees the slot when the engine fails", async () => {
    const queue = createAnalysisQueue({ maxConcurrent: 1 });
    const gateway = createAadiGateway({ log: () => undefined, token: "test", queue, fetchFn: async () => { throw new Error("down"); } });
    expect((await gateway.step(post(), "user_a")).status).toBe(502);
    expect(queue.position("user_a")).toBeNull();
    expect((await gateway.step(post(), "user_a")).status).toBe(502);
  });
});

describe("daily quota and shared budget at the gateway", () => {
  it("refuses the analysis over the quota without calling the engine", async () => {
    let calls = 0;
    const { limits } = limitsOf({ quota: "1" });
    const gateway = createAadiGateway({ log: () => undefined, token: "test", limits, fetchFn: async () => { calls++; return Response.json(result(0.01)); } });
    expect((await gateway.step(post(), "user_a")).status).toBe(200);
    const second = await gateway.step(post(), "user_a");
    expect(second.status).toBe(429); expect(await code(second)).toBe("QUOTA_EXCEEDED");
    expect(calls).toBe(1);
  });

  it("does not use up the quota when the engine fails or refuses", async () => {
    const { limits } = limitsOf({ quota: "1" });
    let fail = true;
    const gateway = createAadiGateway({ log: () => undefined, token: "test", limits, fetchFn: async () => { if (fail) throw new Error("down"); return Response.json(result(0.01)); } });
    expect((await gateway.step(post(), "user_a")).status).toBe(502);
    fail = false;
    expect((await gateway.step(post(), "user_a")).status).toBe(200);
  });

  it("charges what the engine reports, stops at 100% and alerts at 80%", async () => {
    const { limits, events } = limitsOf({ quota: "100", dailyBudgetUsd: 0.5, holdUsd: 0.1 });
    const gateway = createAadiGateway({ log: () => undefined, token: "test", maxCostUsd: 0.5, limits, fetchFn: async () => Response.json(result(0.2)) });
    expect((await gateway.step(post(), "user_a")).status).toBe(200);
    expect(events).toEqual([]);
    expect((await gateway.step(post(), "user_b")).status).toBe(200);
    expect(events).toEqual([{ event: "aadi.budget", level: "alert", day: "2026-11-17", spentUsd: 0.4, limitUsd: 0.5 }]);
    // 0.4 spent: one more hold of 0.1 still fits, and takes spend to 0.6.
    expect((await gateway.step(post(), "user_c")).status).toBe(200);
    const stopped = await gateway.step(post(), "user_d");
    expect(stopped.status).toBe(429); expect(await code(stopped)).toBe("BUDGET_EXHAUSTED");
  });

  it("charges the cost of a step the engine refused, and gives the quota place back", async () => {
    const { limits, store } = limitsOf({ quota: "1", dailyBudgetUsd: 0.5, holdUsd: 0.1 });
    const gateway = createAadiGateway({ log: () => undefined, token: "test", limits, fetchFn: async () => Response.json(result(0.05, "unavailable")) });
    expect((await gateway.step(post(), "user_a")).status).toBe(502);
    // The person's place is back, with a quota of one.
    const again = await limits.admit("user_a");
    expect(again.ok).toBe(true);
    if (again.ok) await again.settle(0, false);
    // 0.05 is on the day and no hold is left: 0.45 more fits, a cent beyond that does not.
    expect(await store.admit("user_x", "2026-11-17", 5, 0.45, 0.5)).toBe("admitted");
    expect(await store.admit("user_y", "2026-11-17", 5, 0.01, 0.5)).toBe("budget");
  });

  it("runs nothing when the limits cannot be checked", async () => {
    let calls = 0;
    const fetchFn: typeof fetch = async () => { calls++; return Response.json(result(0.01)); };
    for (const [overrides, expected] of [[{ store: undefined }, "LIMITS_UNAVAILABLE"], [{ quota: undefined }, "QUOTA_NOT_SET"]] as const) {
      const gateway = createAadiGateway({ log: () => undefined, token: "test", limits: limitsOf(overrides).limits, fetchFn });
      const response = await gateway.step(post(), "user_a");
      expect(response.status).toBe(503); expect(await code(response)).toBe(expected);
    }
    // No principal: the limits have nobody to count against, so they refuse.
    const anonymous = await createAadiGateway({ log: () => undefined, token: "test", limits: limitsOf().limits, fetchFn }).step(post());
    expect(anonymous.status).toBe(503);
    expect(calls).toBe(0);
  });

  it("frees the line when the limits refuse", async () => {
    const queue = createAnalysisQueue({ maxConcurrent: 1 });
    const gateway = createAadiGateway({ log: () => undefined, token: "test", queue, limits: limitsOf({ quota: undefined }).limits, fetchFn: async () => Response.json(result(0.01)) });
    expect((await gateway.step(post(), "user_a")).status).toBe(503);
    expect(queue.position("user_a")).toBeNull();
  });

  it("does not charge a person who cancels while waiting in line", async () => {
    const { fetchFn, releases } = hanging();
    const { limits } = limitsOf({ quota: "1" });
    const gateway = createAadiGateway({ log: () => undefined, token: "test", fetchFn, limits, queue: createAnalysisQueue({ maxConcurrent: 1 }) });
    const first = gateway.step(post(), "user_a"); await tick();
    const abort = new AbortController();
    const waiting = gateway.step(post(abort.signal), "user_b"); await tick();
    abort.abort();
    expect((await waiting).status).toBe(499);
    releases[0](); await first;
    const again = gateway.step(post(), "user_b"); await tick(); releases[1]();
    expect((await again).status).toBe(200);
  });
});

describe("without the new options", () => {
  it("keeps the one-at-a-time refusal the local workspace has always had", async () => {
    const { fetchFn, releases } = hanging();
    const gateway = createAadiGateway({ log: () => undefined, token: "test", fetchFn });
    const first = gateway.step(post()); await tick();
    const second = await gateway.step(post());
    expect(second.status).toBe(429); expect(await code(second)).toBe("BUSY");
    releases[0](); expect((await first).status).toBe(200);
  });
});

describe("an unconfigured engine, in the words a doctor reads (design audit H3)", () => {
  it("answers 503 NOT_CONFIGURED without infrastructure terms and says the question is kept", async () => {
    const gateway = createAadiGateway({ log: () => undefined, token: "", fetchFn: async () => Response.json(result(0.01)) });
    const response = await gateway.step(post());
    expect(response.status).toBe(503);
    const { error } = await response.json();
    expect(error.code).toBe("NOT_CONFIGURED");
    expect(error.message).not.toMatch(/token|server|konfigurasi/i);
    expect(error.message).toBe("Layanan analisis belum tersambung. Pertanyaan Anda tetap tersimpan; coba lagi nanti atau hubungi pengelola workspace.");
  });
});
