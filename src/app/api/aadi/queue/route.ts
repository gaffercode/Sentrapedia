import { getBetaAccess } from "../../../../lib/auth/server";
import { accessFailure } from "../../../../lib/auth/access";
import { syncPrincipal } from "../../../../lib/sync/principal";
import { analysisQueue } from "../../../../lib/aadi/server-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The caller's own place in the analysis line, read while their POST /api/aadi waits: 0 while it runs, 1 for the
// first in line, null when they hold no place. The principal comes from the session, so nobody reads another
// person's place, and the answer carries nothing but that number.
export async function GET() {
  const access = await getBetaAccess().resolve();
  if (access.status !== "allowed") return accessFailure(access);
  const principal = syncPrincipal(access.userId);
  return Response.json({ position: principal ? analysisQueue.position(principal) : null }, { headers: { "Cache-Control": "no-store" } });
}
