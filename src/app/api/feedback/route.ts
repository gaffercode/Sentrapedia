import { getAuthConfig, getBetaAccess } from "../../../lib/auth/server";
import { trustedConsentOrigin } from "../../../lib/auth/config";
import { createFeedbackHandler } from "../../../lib/feedback";
import { createPostgresFeedbackStore } from "../../../lib/feedback-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// General feedback from the sidebar. Same session and origin checks as the report endpoint; without the database the
// instance answers 503 rather than accept a note it cannot keep.
export async function POST(request: Request) {
  const config = getAuthConfig();
  return createFeedbackHandler({
    access: () => getBetaAccess().resolve(),
    trustedOrigin: candidate => trustedConsentOrigin(candidate, config.mode === "clerk" ? config.publicOrigin : null),
    store: process.env.SENTRAPEDIA_DATABASE_URL ? createPostgresFeedbackStore() : undefined,
  })(request);
}
