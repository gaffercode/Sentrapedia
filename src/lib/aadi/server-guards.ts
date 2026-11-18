import "server-only";
import { createAnalysisQueue, type AnalysisQueue } from "./queue";
import { createAnalysisLimits, type AnalysisLimits } from "./limits";
import { createPostgresLimitsStore } from "./limits-store";
import { aadiDailyBudgetUsd, aadiStepBudgetUsd } from "./model-profile";
import { resolveAuthConfig } from "../auth/config";

// The guards of the gated beta, built once from the server's settings and shared by the two routes that need
// them: POST /api/aadi takes a place in the line, GET /api/aadi/queue reads it. Next may load a route's modules
// more than once in one process, so the line is kept on globalThis; two lines would hide people from each other.
const shared = globalThis as typeof globalThis & { sentrapediaAnalysisQueue?: AnalysisQueue };
export const analysisQueue: AnalysisQueue = shared.sentrapediaAnalysisQueue ??= createAnalysisQueue({ maxConcurrent: Number(process.env.AADI_MAX_CONCURRENT || 1) });

// SENTRAPEDIA_USER_DAILY_ANALYSES is the daily quota per person. It has no default on purpose: the number is
// Gaffer's to set (quota = daily budget / (average cost per analysis x daily active users)), and while it is
// unset a deployed instance refuses analyses rather than run them uncounted (limits.ts).
//
// The local auth mode is the single-user workspace on loopback (auth/config.ts): it has no accounts to count and
// no shared budget to protect beyond the engine's own, so it runs without these limits. Every deployed instance
// is in Clerk mode and gets them. targeted: the two-step analysis may cost two step caps, so it holds two.
export function analysisLimits(targeted: boolean): AnalysisLimits | undefined {
  if (resolveAuthConfig(process.env).mode !== "clerk") return undefined;
  return createAnalysisLimits({
    store: process.env.SENTRAPEDIA_DATABASE_URL ? createPostgresLimitsStore() : undefined,
    quota: process.env.SENTRAPEDIA_USER_DAILY_ANALYSES,
    dailyBudgetUsd: aadiDailyBudgetUsd,
    holdUsd: (targeted ? 2 : 1) * aadiStepBudgetUsd,
  });
}
