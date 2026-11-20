import { accessFailure, errorResponse } from "./auth/access";
import type { AccessResult } from "./auth/policy";
import { syncPrincipal } from "./sync/principal";
import { containsIdentity } from "./aadi/contract";

// The sidebar's "Masukan" box (docs/FEATURE-IDEAS.md idea 4, built 2026-11-19 on Gaffer's choice). It used to thank the
// user and keep nothing; now the note reaches the server. It is general feedback, kept apart from the per-answer
// reports (db/migrations/0004 says so), and it meets the same checks as a report: session, origin, identity.
export interface FeedbackStore { add(principal: string, note: string): Promise<void> }

export const maxFeedbackLength = 1000;
const maxBodyChars = 4000;

/** The trimmed note, "identity" when it carries an identity pattern, or null when the shape is wrong. */
export function parseFeedback(value: unknown): string | "identity" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => key !== "note") || typeof body.note !== "string") return null;
  const note = body.note.trim();
  if (!note || body.note.length > maxFeedbackLength) return null;
  return containsIdentity(note) ? "identity" : note;
}

type Dependencies = { access: () => Promise<AccessResult>; trustedOrigin: (request: Request) => boolean; store?: FeedbackStore };

export function createFeedbackHandler(deps: Dependencies) {
  return async function feedback(request: Request): Promise<Response> {
    const access = await deps.access();
    if (access.status !== "allowed") return accessFailure(access);
    if (!deps.trustedOrigin(request)) return errorResponse(403, "ORIGIN", "Masukan tidak valid. Muat ulang halaman dan coba kembali.");
    const principal = syncPrincipal(access.userId);
    if (!deps.store || !principal) return errorResponse(503, "FEEDBACK_UNAVAILABLE", "Penyimpanan masukan belum aktif di instance ini.");
    let parsed: ReturnType<typeof parseFeedback> = null;
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json") {
      try { const text = await request.text(); if (text.length <= maxBodyChars) parsed = parseFeedback(JSON.parse(text)); } catch { parsed = null; }
    }
    if (parsed === "identity") return errorResponse(400, "IDENTITY", "Masukan memuat pola identitas. Hapus nama, nomor identitas, kontak dan alamat.");
    if (!parsed) return errorResponse(400, "INPUT", "Masukan tidak valid. Muat ulang halaman dan coba kembali.");
    try { await deps.store.add(principal, parsed); }
    catch { return errorResponse(503, "FEEDBACK_FAILED", "Masukan belum tersimpan. Coba kembali."); }
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  };
}
