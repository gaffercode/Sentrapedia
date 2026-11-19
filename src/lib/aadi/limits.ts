// Per-person daily quota and the shared daily budget, checked before an analysis runs (Gaffer, 2026-11-17: the gated
// beta). The counts live in a store that outlives the process (limits-store.ts, Postgres). This file holds the rules.
//
// A setting that would switch the guard off refuses the analysis instead: no store, a failing store, a missing
// principal and an unset quota all answer 503 and run nothing. The engine's own daily budget (aadi/service/audit.py)
// stays in place behind this one; it lives in the container and restarts from zero on every rebuild.
//
// Days are UTC, like the engine's, so both budgets turn over together: 07.00 WIB.

export type LimitRefusal = { ok: false; code: "QUOTA_EXCEEDED" | "BUDGET_EXHAUSTED" | "QUOTA_NOT_SET" | "LIMITS_UNAVAILABLE"; status: number; message: string };
export type LimitAdmission = { ok: true; settle: (spentUsd: number, completed: boolean) => Promise<void> } | LimitRefusal;
/** The person's own count today against their quota, for the account menu. The shared budget is never exposed. */
export type DailyUsage = { used: number; quota: number };
export interface AnalysisLimits {
  admit(principal: string | undefined): Promise<LimitAdmission>;
  /** null whenever the guard could not admit anyone either: no store, no principal, no quota, or a failing store. */
  usage(principal: string | undefined): Promise<DailyUsage | null>;
}

export interface LimitsStore {
  /** One atomic step: count the analysis against the person's day and hold its cost cap against the shared day. */
  admit(principal: string, day: string, quota: number, holdUsd: number, budgetUsd: number): Promise<"admitted" | "quota" | "budget">;
  /** Releases the hold, charges what was spent, returns the place when the analysis did not complete. `alert` is true once per day. */
  settle(principal: string, day: string, holdUsd: number, spentUsd: number, completed: boolean, alertAtUsd: number): Promise<{ alert: boolean; spentUsd: number }>;
  /** The person's analyses counted on that day, 0 when there is no row. */
  used(principal: string, day: string): Promise<number>;
}

export const BUDGET_ALERT_FRACTION = 0.8;
const refusals = {
  QUOTA_EXCEEDED: [429, "Kuota analisis harian Anda sudah habis. Kuota kembali besok pukul 07.00 WIB."],
  BUDGET_EXHAUSTED: [429, "Batas biaya analisis harian tercapai. Analisis belum dijalankan; layanan kembali besok pukul 07.00 WIB."],
  QUOTA_NOT_SET: [503, "Kuota analisis harian belum ditetapkan oleh pengelola. Analisis belum dijalankan."],
  LIMITS_UNAVAILABLE: [503, "Pencatat batas pemakaian belum tersedia. Analisis belum dijalankan; coba kembali beberapa saat lagi."],
} as const;
const refuse = (code: keyof typeof refusals): LimitRefusal => ({ ok: false, code, status: refusals[code][0], message: refusals[code][1] });
const micro = (usd: number) => Math.round(usd * 1e6) / 1e6;

/** The daily quota as configured: a whole number from 1 to 9999, or null when it is unset or unusable. */
export function parseDailyQuota(value: string | undefined): number | null {
  return value !== undefined && /^[1-9]\d{0,3}$/.test(value.trim()) ? Number(value.trim()) : null;
}

export function createAnalysisLimits(options: { store?: LimitsStore; quota: string | undefined; dailyBudgetUsd: number; holdUsd: number; now?: () => Date; log?: (entry: Record<string, unknown>) => void }): AnalysisLimits {
  const now = options.now ?? (() => new Date());
  // Nothing logged here carries case text: only the event, the day and money.
  const log = options.log ?? (entry => console.warn(JSON.stringify(entry)));
  return {
    async usage(principal) {
      const quota = parseDailyQuota(options.quota);
      if (!options.store || !principal || quota === null) return null;
      try { return { used: await options.store.used(principal, now().toISOString().slice(0, 10)), quota }; }
      catch { log({ event: "aadi.limits", level: "error", stage: "usage" }); return null; }
    },
    async admit(principal) {
      const store = options.store;
      if (!store || !principal) return refuse("LIMITS_UNAVAILABLE");
      const quota = parseDailyQuota(options.quota);
      if (quota === null) return refuse("QUOTA_NOT_SET");
      if (!(options.dailyBudgetUsd > 0) || options.holdUsd > options.dailyBudgetUsd) return refuse("BUDGET_EXHAUSTED");
      const day = now().toISOString().slice(0, 10);
      let outcome: Awaited<ReturnType<LimitsStore["admit"]>>;
      try { outcome = await store.admit(principal, day, quota, options.holdUsd, options.dailyBudgetUsd); }
      catch { log({ event: "aadi.limits", level: "error", stage: "admit" }); return refuse("LIMITS_UNAVAILABLE"); }
      if (outcome !== "admitted") return refuse(outcome === "quota" ? "QUOTA_EXCEEDED" : "BUDGET_EXHAUSTED");
      let settled = false;
      return { ok: true, settle: async (spentUsd, completed) => {
        if (settled) return;
        settled = true;
        const spent = Number.isFinite(spentUsd) && spentUsd > 0 ? spentUsd : 0;
        try {
          const state = await store.settle(principal, day, options.holdUsd, spent, completed, micro(options.dailyBudgetUsd * BUDGET_ALERT_FRACTION));
          if (state.alert) log({ event: "aadi.budget", level: "alert", day, spentUsd: micro(state.spentUsd), limitUsd: options.dailyBudgetUsd });
        } catch {
          // The answer already exists and is returned. A hold that was not released keeps counting until the day
          // turns, so this failure can only make the budget stricter, never looser.
          log({ event: "aadi.limits", level: "error", stage: "settle" });
        }
      } };
    },
  };
}

/** The store's rules in memory, for tests and for nothing else: a deployed instance uses limits-store.ts. */
export function createMemoryLimitsStore(): LimitsStore {
  const used = new Map<string, number>();
  const days = new Map<string, { spent: number; held: number; alerted: boolean }>();
  return {
    async admit(principal, day, quota, holdUsd, budgetUsd) {
      const key = `${day} ${principal}`;
      if ((used.get(key) ?? 0) >= quota) return "quota";
      const state = days.get(day) ?? { spent: 0, held: 0, alerted: false };
      if (micro(state.spent + state.held + holdUsd) > budgetUsd) return "budget";
      used.set(key, (used.get(key) ?? 0) + 1);
      days.set(day, { ...state, held: micro(state.held + holdUsd) });
      return "admitted";
    },
    async settle(principal, day, holdUsd, spentUsd, completed, alertAtUsd) {
      const key = `${day} ${principal}`;
      if (!completed) used.set(key, Math.max((used.get(key) ?? 0) - 1, 0));
      const state = days.get(day) ?? { spent: 0, held: 0, alerted: false };
      const next = { spent: micro(state.spent + spentUsd), held: Math.max(micro(state.held - holdUsd), 0), alerted: state.alerted };
      const alert = !next.alerted && next.spent >= alertAtUsd;
      days.set(day, { ...next, alerted: next.alerted || alert });
      return { alert, spentUsd: next.spent };
    },
    async used(principal, day) { return used.get(`${day} ${principal}`) ?? 0; },
  };
}
