// The line in front of the analysis engine. It lives in memory: the workspace is one long-lived Next process
// (src/lib/sync/db.ts says the same), so a restart empties the line and every waiting browser simply asks again.
// What must survive a restart - the daily quota and the daily budget - is in src/lib/aadi/limits.ts, not here.

export type QueueRefusal = "USER_BUSY" | "QUEUE_FULL" | "QUEUE_TIMEOUT" | "ABORTED";
export type QueuePlace = { ok: true; release: () => void } | { ok: false; code: QueueRefusal };
export interface AnalysisQueue {
  /** Resolves when the caller may run. Without a principal the per-person rule does not apply. */
  enter(principal: string | undefined, signal: AbortSignal): Promise<QueuePlace>;
  /** 0 while that person's analysis runs, 1 for the first in line, null when they hold no place. */
  position(principal: string): number | null;
}

// The whole request must answer before the proxy in front of beta gives up. Cloudflare answers 524 when an origin
// has sent nothing for 100 s (its default, taken from Cloudflare's description of that error; not measured on
// this tunnel). The slowest path is this wait, then the limits check (one database round trip, 5 s connect
// timeout in src/lib/sync/db.ts), then the targeted analysis (65 s, model-profile.ts), then the settle round
// trip: 20 + 5 + 65 + 5 = 95 s.
export const QUEUE_MAX_WAIT_MS = 20_000;
export const QUEUE_MAX_QUEUED = 8;

export function createAnalysisQueue(options: { maxConcurrent: number; maxQueued?: number; maxWaitMs?: number }): AnalysisQueue {
  const maxConcurrent = Number.isInteger(options.maxConcurrent) && options.maxConcurrent >= 1 && options.maxConcurrent <= 8 ? options.maxConcurrent : 1;
  const maxQueued = options.maxQueued ?? QUEUE_MAX_QUEUED;
  const maxWaitMs = options.maxWaitMs ?? QUEUE_MAX_WAIT_MS;
  let running = 0;
  const runners = new Set<string>();
  const waiting: { principal: string | undefined; grant: () => void }[] = [];

  const place = (principal: string | undefined): QueuePlace => {
    running++;
    if (principal) runners.add(principal);
    let released = false;
    return { ok: true, release: () => {
      if (released) return;
      released = true; running--;
      if (principal) runners.delete(principal);
      while (running < maxConcurrent && waiting.length) waiting.shift()!.grant();
    } };
  };

  return {
    async enter(principal, signal) {
      if (signal.aborted) return { ok: false, code: "ABORTED" };
      if (principal && (runners.has(principal) || waiting.some(entry => entry.principal === principal))) return { ok: false, code: "USER_BUSY" };
      if (running < maxConcurrent && !waiting.length) return place(principal);
      if (waiting.length >= maxQueued) return { ok: false, code: "QUEUE_FULL" };
      return new Promise<QueuePlace>(resolve => {
        const leave = (code: QueueRefusal) => { const at = waiting.indexOf(entry); if (at < 0) return; waiting.splice(at, 1); done(); resolve({ ok: false, code }); };
        const timer = setTimeout(() => leave("QUEUE_TIMEOUT"), maxWaitMs);
        const onAbort = () => leave("ABORTED");
        const done = () => { clearTimeout(timer); signal.removeEventListener("abort", onAbort); };
        // grant() is called by release() after it has taken this entry off the line, so the slot passes straight on.
        const entry = { principal, grant: () => { done(); resolve(place(principal)); } };
        signal.addEventListener("abort", onAbort, { once: true });
        waiting.push(entry);
      });
    },
    position(principal) {
      if (runners.has(principal)) return 0;
      const at = waiting.findIndex(entry => entry.principal === principal);
      return at < 0 ? null : at + 1;
    },
  };
}
