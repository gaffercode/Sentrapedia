// Progress of one analysis, sent while it runs (docs/aadi-integration.md, "Analysis progress").
// A stage line carries a stage name and its state only: never case text, model output, cost or timing. The answer itself
// travels once, in the final line, exactly as the JSON reply would carry it, and is validated and gated as before.

/** The gateway stages a doctor sees, in pipeline order (src/lib/aadi/gateway.ts). */
export const analysisStages = ["retrieve_dx", "aadi_dx", "retrieve_tx", "aadi_tx", "gate"] as const;
export type AnalysisStage = typeof analysisStages[number];
export type StageState = "running" | "done" | "failed";
export interface StageEvent { stage: AnalysisStage; state: StageState }

export const stageStreamType = "application/x-ndjson";
// The final line holds the whole reply (the gateway caps the engine body at 1 MiB); anything larger is refused.
const STREAM_LIMIT = 2 * 1048576;

export const isAnalysisStage = (value: unknown): value is AnalysisStage => typeof value === "string" && (analysisStages as readonly string[]).includes(value);
const isState = (value: unknown): value is StageState => value === "running" || value === "done" || value === "failed";

/** Server: runs one analysis and streams its stage events, then its reply (status and body) as the last line. */
export function streamAnalysis(run: (onStage: (event: StageEvent) => void) => Promise<Response>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (line: unknown) => { if (!open) return; try { controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`)); } catch { open = false; } };
      let final: { status: number; body: unknown };
      try {
        const reply = await run((event) => send({ type: "stage", stage: event.stage, state: event.state }));
        final = { status: reply.status, body: await reply.json().catch(() => null) };
      } catch {
        final = { status: 502, body: { error: { code: "NETWORK", message: "Layanan analisis tidak dapat dihubungi atau respons tidak dapat dibaca." } } };
      }
      send({ type: "final", ...final });
      if (open) { open = false; try { controller.close(); } catch { /* the reader already left */ } }
    },
  });
  // no-transform and X-Accel-Buffering ask proxies on the way not to hold the lines back until the end.
  return new Response(body, { status: 200, headers: { "Content-Type": `${stageStreamType}; charset=utf-8`, "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}

/** Browser: reads a stage stream, reporting each valid stage event, and returns the final reply. Lines it does not know
 *  are skipped; a stream that ends without a final line, or grows past the limit, throws. */
export async function readAnalysisStream(response: Response, onStage: (event: StageEvent) => void): Promise<{ status: number; body: unknown }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("STREAM");
  const decoder = new TextDecoder();
  let buffer = ""; let size = 0;
  let final: { status: number; body: unknown } | null = null;
  const take = (line: string) => {
    if (!line.trim()) return;
    let value: unknown;
    try { value = JSON.parse(line); } catch { return; }
    if (!value || typeof value !== "object" || !("type" in value)) return;
    if (value.type === "stage" && "stage" in value && isAnalysisStage(value.stage) && "state" in value && isState(value.state)) onStage({ stage: value.stage, state: value.state });
    else if (value.type === "final" && "status" in value && typeof value.status === "number" && Number.isInteger(value.status)) final = { status: value.status, body: "body" in value ? value.body : null };
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > STREAM_LIMIT) throw new Error("STREAM_LIMIT");
      buffer += decoder.decode(value, { stream: true });
      let at: number;
      while ((at = buffer.indexOf("\n")) >= 0) { take(buffer.slice(0, at)); buffer = buffer.slice(at + 1); }
    }
    take(buffer + decoder.decode());
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  if (!final) throw new Error("STREAM");
  return final;
}
