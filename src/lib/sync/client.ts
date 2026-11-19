import type { SyncPull, SyncPushResult, SyncedDocument } from "./contract";
import type { PersonalTemplate } from "../workflow";
import type { Encounter } from "../workspace";

// Browser side of /api/sync. Every call can fail and none of them may disturb the workspace: the browser copy
// is authoritative, so a failure is reported to the doctor and nothing local changes. The route answers 503
// SYNC_UNAVAILABLE where the instance has no database or SENTRAPEDIA_SYNC_MODE=off, which is the normal state
// of a local install rather than an error worth alarming anyone about.

export type SyncOutcome<T> = { ok: true; value: T } | { ok: false; reason: "unavailable" | "signed-out" | "failed" };

const timeoutMs = 15000;

async function call(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(path, { ...init, signal: controller.signal, cache: "no-store" }); }
  finally { clearTimeout(timer); }
}

function reasonFor(status: number): "unavailable" | "signed-out" | "failed" {
  if (status === 503) return "unavailable";
  if (status === 401 || status === 403) return "signed-out";
  return "failed";
}

export async function pullSyncedDocuments(): Promise<SyncOutcome<SyncPull>> {
  try {
    const response = await call("/api/sync");
    if (!response.ok) return { ok: false, reason: reasonFor(response.status) };
    const body = await response.json() as { documents?: unknown; templates?: unknown };
    // Templates are checked one by one when merged (merge.ts); a server that sends none sends an empty list.
    return Array.isArray(body.documents) ? { ok: true, value: { documents: body.documents as SyncedDocument[], templates: Array.isArray(body.templates) ? body.templates : [] } } : { ok: false, reason: "failed" };
  } catch { return { ok: false, reason: "failed" }; }
}

// sourceText (the whole analysis, with its TheOracle passages and since 2026-11-18 the catalogue records it cites)
// never syncs (guard.ts), so it does not travel either: it would only fill the route's 1 MB body limit.
const withoutSourceText = (encounter: Encounter): Encounter => ({ ...encounter, messages: encounter.messages?.map(message => { const sent = { ...message }; delete sent.sourceText; return sent; }) });

export async function pushEncountersToServer(encounters: Encounter[], templates: PersonalTemplate[] = []): Promise<SyncOutcome<SyncPushResult>> {
  try {
    const response = await call("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ encounters: encounters.map(withoutSourceText), templates }) });
    if (!response.ok) return { ok: false, reason: reasonFor(response.status) };
    const body = await response.json() as Partial<SyncPushResult>;
    if (!Array.isArray(body.saved) || !Array.isArray(body.held)) return { ok: false, reason: "failed" };
    const t = body.templates;
    return { ok: true, value: { saved: body.saved, held: body.held, ...(t && Array.isArray(t.saved) && Array.isArray(t.held) ? { templates: { saved: t.saved, held: t.held } } : {}) } };
  } catch { return { ok: false, reason: "failed" }; }
}
