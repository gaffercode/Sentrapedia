import { getBetaAccess } from "../../../../lib/auth/server";
import { accessFailure } from "../../../../lib/auth/access";
import { syncPrincipal } from "../../../../lib/sync/principal";
import { analysisLimits } from "../../../../lib/aadi/server-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The caller's own analyses today against their quota, for the account menu (docs/FEATURE-IDEAS.md idea 3). Like the
// queue route, the principal comes from the session, so nobody reads another person's count, and the shared budget
// is never part of the answer. null where no quota applies (local mode) or the count cannot be read.
export async function GET() {
  const access = await getBetaAccess().resolve();
  if (access.status !== "allowed") return accessFailure(access);
  const principal = syncPrincipal(access.userId) ?? undefined;
  const usage = (await analysisLimits(false)?.usage(principal)) ?? null;
  return Response.json({ usage }, { headers: { "Cache-Control": "no-store" } });
}
