import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QUEUE_POLL_MS, requestAadiAnalysis } from "../src/lib/aadi/client";
import { emptyCase } from "../src/lib/aadi/contract";
import { Conversation, QueueNotice } from "../src/components/workspace-views";

// The visible line (Gaffer, 2026-11-17): while an analysis waits for a slot the browser asks for its place and
// the conversation shows it, instead of a silent wait.
const caseData = { ...emptyCase(), chiefComplaint: "Kasus fiktif untuk pengujian" };
afterEach(() => { vi.useRealTimers(); });

describe("the browser reads its place while the analysis waits", () => {
  it("asks every poll interval, reports each place, and stops when the analysis answers", async () => {
    vi.useFakeTimers();
    const places = [3, 2, 0]; const seen: number[] = []; let polls = 0;
    let answer: (response: Response) => void = () => undefined;
    const fetchFn: typeof fetch = async url => {
      if (url === "/api/aadi/queue") { polls++; return Response.json({ position: places.shift() ?? null }); }
      return new Promise<Response>(resolve => { answer = resolve; });
    };
    const pending = requestAadiAnalysis(caseData, { fetchFn, onQueuePosition: place => seen.push(place) }).catch((error: unknown) => error);
    for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);
    expect(seen).toEqual([3, 2, 0]);
    answer(Response.json({ error: { code: "BUSY", message: "Antrean analisis sedang penuh. Coba kembali sebentar lagi." } }, { status: 429 }));
    expect(await pending).toMatchObject({ code: "BUSY" });
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS * 3);
    expect(polls).toBe(3);
  });

  it("does not ask at all when the caller did not want the place", async () => {
    vi.useFakeTimers();
    let polls = 0; let answer: (response: Response) => void = () => undefined;
    const fetchFn: typeof fetch = async url => { if (url === "/api/aadi/queue") polls++; return new Promise<Response>(resolve => { answer = resolve; }); };
    const pending = requestAadiAnalysis(caseData, { fetchFn }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS * 2);
    answer(Response.json({ error: { code: "BUSY", message: "x" } }, { status: 429 })); await pending;
    expect(polls).toBe(0);
  });

  it("ignores a failed or malformed reading without failing the analysis request", async () => {
    vi.useFakeTimers();
    const replies: (() => Response)[] = [() => { throw new Error("offline"); }, () => new Response("no", { status: 500 }), () => Response.json({ position: "3" }), () => Response.json({ position: -1 }), () => Response.json({ position: 2 })];
    const seen: number[] = []; let answer: (response: Response) => void = () => undefined;
    const fetchFn: typeof fetch = async url => { if (url === "/api/aadi/queue") return replies.shift()!(); return new Promise<Response>(resolve => { answer = resolve; }); };
    const pending = requestAadiAnalysis(caseData, { fetchFn, onQueuePosition: place => seen.push(place) }).catch((error: unknown) => error);
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);
    expect(seen).toEqual([2]);
    answer(Response.json({ error: { code: "QUOTA_EXCEEDED", message: "Kuota analisis harian Anda sudah habis." } }, { status: 429 }));
    expect(await pending).toMatchObject({ code: "QUOTA_EXCEEDED", message: "Kuota analisis harian Anda sudah habis." });
  });
});

describe("the place is shown where the person is waiting", () => {
  it("renders the place for someone in line and nothing once the analysis runs", () => {
    expect(renderToStaticMarkup(<QueueNotice position={3}/>)).toBe('<p class="panel-caption" role="status">Posisi antrean: 3</p>');
    for (const position of [0, null, undefined]) expect(renderToStaticMarkup(<QueueNotice position={position}/>)).toBe("");
  });

  it("shows it in the conversation under the pending question, and not when nothing is pending", () => {
    const props = { dispatch: () => undefined, onToast: () => undefined, onReuse: () => undefined, onCancel: () => undefined, onOpenDocument: () => undefined };
    const waiting = renderToStaticMarkup(<Conversation {...props} pendingQuestion="Kasus fiktif" queuePosition={3}/>);
    expect(waiting).toContain("Kasus fiktif");
    expect(waiting).toContain("Posisi antrean: 3");
    expect(renderToStaticMarkup(<Conversation {...props} pendingQuestion={null} queuePosition={3}/>)).not.toContain("Posisi antrean");
    expect(renderToStaticMarkup(<Conversation {...props} pendingQuestion="Kasus fiktif" queuePosition={0}/>)).not.toContain("Posisi antrean");
  });
});
