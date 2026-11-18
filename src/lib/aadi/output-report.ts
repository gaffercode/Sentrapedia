import { accessFailure, errorResponse } from "../auth/access";
import type { AccessResult } from "../auth/policy";
import { syncPrincipal } from "../sync/principal";
import { containsIdentity } from "./contract";

// "Laporkan output bermasalah" (Gaffer, 2026-11-17): a clinician flags one AADI answer for Gaffer's review. The report
// names the analysis by its trace id and carries a category and an optional note, never the case or the answer. The
// reporter and the time come from the server: the session's principal and the database clock.
export const reportCategories = ["incorrect", "unsafe", "other"] as const;
export type ReportCategory = (typeof reportCategories)[number];
export type OutputReport = { traceId: string; category: ReportCategory; note: string };
export interface ReportStore { add(principal: string, report: OutputReport): Promise<void> }

export const maxReportNoteLength = 1000;
const maxBodyChars = 4000;
// The gateway names every analysis with crypto.randomUUID() (gateway.ts).
const traceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The report, "identity" when the note carries an identity pattern, or null when the shape is wrong. */
export function parseReport(value: unknown): OutputReport | "identity" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["traceId", "category", "note"].includes(key))) return null;
  const { traceId, category, note = "" } = body;
  if (typeof traceId !== "string" || !traceIdPattern.test(traceId)) return null;
  if (typeof category !== "string" || !(reportCategories as readonly string[]).includes(category)) return null;
  if (typeof note !== "string" || note.length > maxReportNoteLength) return null;
  // The first clinician free text that reaches the server database, so it meets the same identity check as a case.
  if (containsIdentity(note)) return "identity";
  return { traceId: traceId.toLowerCase(), category: category as ReportCategory, note: note.trim() };
}

type Dependencies = { access: () => Promise<AccessResult>; trustedOrigin: (request: Request) => boolean; store?: ReportStore };

export function createReportHandler(deps: Dependencies) {
  return async function report(request: Request): Promise<Response> {
    const access = await deps.access();
    if (access.status !== "allowed") return accessFailure(access);
    if (!deps.trustedOrigin(request)) return errorResponse(403, "ORIGIN", "Laporan tidak valid. Muat ulang halaman dan coba kembali.");
    const principal = syncPrincipal(access.userId);
    if (!deps.store || !principal) return errorResponse(503, "REPORT_UNAVAILABLE", "Penyimpanan laporan belum aktif di instance ini.");
    let parsed: ReturnType<typeof parseReport> = null;
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json") {
      try { const text = await request.text(); if (text.length <= maxBodyChars) parsed = parseReport(JSON.parse(text)); } catch { parsed = null; }
    }
    if (parsed === "identity") return errorResponse(400, "IDENTITY", "Catatan mengandung pola identitas. Hapus nama, nomor identitas, kontak dan alamat.");
    if (!parsed) return errorResponse(400, "INPUT", "Laporan tidak valid. Muat ulang halaman dan coba kembali.");
    try { await deps.store.add(principal, parsed); }
    catch { return errorResponse(503, "REPORT_UNAVAILABLE", "Laporan belum tersimpan. Coba kembali."); }
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  };
}
