import { getBetaAccess } from "../../../lib/auth/server";
import { accessFailure, errorResponse } from "../../../lib/auth/access";
import { syncPrincipal } from "../../../lib/sync/principal";
import { syncConfigured } from "../../../lib/sync/db";
import { pullEncounters, pullTemplates, pushEncounters, pushTemplates } from "../../../lib/sync/store";
import type { Encounter } from "../../../lib/workspace";
import { validTemplate, type PersonalTemplate } from "../../../lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxBodyBytes = 1_000_000;
const unavailable = () => errorResponse(503, "SYNC_UNAVAILABLE", "Sinkronisasi server belum aktif di instance ini.");
// A store that fails mid-call is not "not active": the client then says the sync failed and to try again.
const failed = () => errorResponse(500, "SYNC_FAILED", "Sinkronisasi gagal. Coba kembali.");
const badInput = () => errorResponse(400, "INPUT", "Data sinkronisasi tidak valid. Muat ulang halaman dan coba kembali.");

// The principal always comes from the verified session, never from the request body: a client-supplied id would
// become the database principal and defeat every policy. An instance without sync answers before any identity lookup.
async function principalOf(): Promise<{ ok: true; principal: string } | { ok: false; response: Response }> {
  if (!syncConfigured()) return { ok: false, response: unavailable() };
  const access = await getBetaAccess().resolve();
  if (access.status !== "allowed") return { ok: false, response: accessFailure(access) };
  const principal = syncPrincipal(access.userId);
  return principal ? { ok: true, principal } : { ok: false, response: unavailable() };
}

export async function GET() {
  const resolved = await principalOf();
  if (!resolved.ok) return resolved.response;
  try {
    const [documents, templates] = [await pullEncounters(resolved.principal), await pullTemplates(resolved.principal)];
    return Response.json({ status: "ok", documents, templates }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Local state stays authoritative, so a failed pull is reported rather than raised.
    return failed();
  }
}

export async function POST(request: Request) {
  const resolved = await principalOf();
  if (!resolved.ok) return resolved.response;
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return badInput();
  let encounters: Encounter[];
  let templates: PersonalTemplate[];
  try {
    const text = await request.text();
    if (text.length > maxBodyBytes) return badInput();
    const parsed = JSON.parse(text) as { encounters?: unknown; templates?: unknown };
    if (!Array.isArray(parsed.encounters)) return badInput();
    encounters = parsed.encounters as Encounter[];
    // Templates are optional (an older browser sends none) and, like the workspace, at most 50, each a valid template.
    const sent = parsed.templates ?? [];
    if (!Array.isArray(sent) || sent.length > 50 || !sent.every(validTemplate)) return badInput();
    templates = sent;
  } catch { return badInput(); }
  try {
    // held lists the documents the guard refused; they stay in the browser and are never rewritten to fit.
    const outcome = await pushEncounters(resolved.principal, encounters);
    const templateOutcome = await pushTemplates(resolved.principal, templates);
    return Response.json({ status: "ok", ...outcome, templates: templateOutcome }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failed();
  }
}
