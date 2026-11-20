import { createAadiGateway } from "../../../lib/aadi/gateway";
import { selectedAadiModel, aadiStepBudgetUsd, aadiGatewayTimeoutMs, aadiTargetedGatewayTimeoutMs } from "../../../lib/aadi/model-profile";
import { retrieveTheOracleGrounding, retrieveTheOracleTherapyGrounding, warmTheOracleGrounding } from "../../../lib/theoracle-grounding";
import { getAuthConfig, getBetaAccess } from "../../../lib/auth/server";
import { accessFailure } from "../../../lib/auth/access";
import { syncPrincipal } from "../../../lib/sync/principal";
import { analysisLimits, analysisQueue } from "../../../lib/aadi/server-guards";
import { parseDailyQuota } from "../../../lib/aadi/limits";
import { loadCatalogue } from "../../../lib/theoracle-catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Targeted therapy is the default since the 2026-10-11 evaluation; AADI_TARGETED_THERAPY=false keeps the legacy path.
const targetedTherapy = process.env.AADI_TARGETED_THERAPY !== "false";
// Closed beta: SENTRAPEDIA_PUBLIC_ORIGIN admits one https origin behind Cloudflare Access; AADI_MAX_CONCURRENT (1-8) lets several
// analyses run at once. Both unset keep the local-only, one-at-a-time workspace.
const gateway = createAadiGateway({ baseUrl: process.env.AADI_SERVICE_URL, token: process.env.AADI_SERVICE_TOKEN, model: selectedAadiModel, maxCostUsd: aadiStepBudgetUsd, timeoutMs: targetedTherapy ? aadiTargetedGatewayTimeoutMs : aadiGatewayTimeoutMs, retrieveGrounding: retrieveTheOracleGrounding, retrieveTherapyGrounding: retrieveTheOracleTherapyGrounding, targetedTherapy, publicOrigin: process.env.SENTRAPEDIA_PUBLIC_ORIGIN, maxConcurrent: Number(process.env.AADI_MAX_CONCURRENT || 1), queue: analysisQueue, limits: analysisLimits(targetedTherapy), catalogue: () => loadCatalogue().diseases });
// Keep the public health probe fast. Run one warm-up at a time and cool down retries after a failure.
let oracleReady = false;
let warming = false;
let retryWarmAfter = 0;
export async function GET() {
  if (!oracleReady && !warming && Date.now() >= retryWarmAfter) {
    warming = true;
    void warmTheOracleGrounding().then(ready => {
      oracleReady = ready;
      warming = false;
      retryWarmAfter = Date.now() + 10_000;
    });
  }
  const health = await (await gateway.health()).json();
  const authMode = getAuthConfig().mode;
  const quotaConfigured = authMode === "local" || (authMode === "clerk"
    && !!process.env.SENTRAPEDIA_DATABASE_URL?.trim()
    && parseDailyQuota(process.env.SENTRAPEDIA_USER_DAILY_ANALYSES) !== null);
  const ready = health.configured === true && health.reachable === true && health.modelReady === true
    && health.groundingReady === true && oracleReady && quotaConfigured && loadCatalogue().installed;
  return Response.json({ ...health, ready }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const access = await getBetaAccess().resolve();
  if (access.status !== "allowed") return accessFailure(access);
  // The evidence gate reads the catalogue index; loading it here keeps a broken data folder from failing silently later.
  loadCatalogue();
  // The verified session is the principal the line, the daily quota and the budget count against.
  return gateway.step(request, syncPrincipal(access.userId) ?? undefined);
}
