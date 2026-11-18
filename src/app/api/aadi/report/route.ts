import { getAuthConfig, getBetaAccess } from "../../../../lib/auth/server";
import { trustedConsentOrigin } from "../../../../lib/auth/config";
import { createReportHandler } from "../../../../lib/aadi/output-report";
import { createPostgresReportStore } from "../../../../lib/aadi/output-report-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A report of problematic AADI output. Same session and origin checks as the consent endpoint; without the database
// the instance answers 503 rather than accept a report it cannot keep.
export async function POST(request: Request) {
  const config = getAuthConfig();
  return createReportHandler({
    access: () => getBetaAccess().resolve(),
    trustedOrigin: candidate => trustedConsentOrigin(candidate, config.mode === "clerk" ? config.publicOrigin : null),
    store: process.env.SENTRAPEDIA_DATABASE_URL ? createPostgresReportStore() : undefined,
  })(request);
}
