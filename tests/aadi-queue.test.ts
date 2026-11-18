import { describe, expect, it } from "vitest";
import { createAnalysisQueue } from "../src/lib/aadi/queue";

// Gated beta (Gaffer, 2026-11-17): one running analysis per person, and a visible place in line instead of a refusal.
const signal = () => new AbortController().signal;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe("analysis queue", () => {
  it("runs at once while a slot is free and reports the runner at position 0", async () => {
    const queue = createAnalysisQueue({ maxConcurrent: 1 });
    const first = await queue.enter("user_a", signal());
    expect(first.ok).toBe(true);
    expect(queue.position("user_a")).toBe(0);
    expect(queue.position("user_b")).toBeNull();
  });

  it("refuses a second analysis from the same person, running or queued", async () => {
    const queue = createAnalysisQueue({ maxConcurrent: 1 });
    await queue.enter("user_a", signal());
    expect(await queue.enter("user_a", signal())).toEqual({ ok: false, code: "USER_BUSY" });
    void queue.enter("user_b", signal());
    expect(await queue.enter("user_b", signal())).toEqual({ ok: false, code: "USER_BUSY" });
  });

  it("queues other people in arrival order and shows each one their place", async () => {
    const queue = createAnalysisQueue({ maxConcurrent: 1 });
    const running = await queue.enter("user_a", signal());
    const order: string[] = [];
    const b = queue.enter("user_b", signal()).then(place => { order.push("b"); return place; });
    const c = queue.enter("user_c", signal()).then(place => { order.push("c"); return place; });
    await tick();
    expect(queue.position("user_b")).toBe(1);
    expect(queue.position("user_c")).toBe(2);
    if (running.ok) running.release();
    const second = await b;
    expect(order).toEqual(["b"]);
    expect(queue.position("user_b")).toBe(0);
    expect(queue.position("user_c")).toBe(1);
    if (second.ok) second.release();
    expect((await c).ok).toBe(true);
    expect(order).toEqual(["b", "c"]);
  });

  it("frees the person and the slot on release, and a second release changes nothing", async () => {
    const queue = createAnalysisQueue({ maxConcurrent: 1 });
    const first = await queue.enter("user_a", signal());
    if (!first.ok) throw new Error("expected a slot");
    first.release(); first.release();
    expect(queue.position("user_a")).toBeNull();
    const again = await queue.enter("user_a", signal());
    expect(again.ok).toBe(true);
    // The double release above must not have opened a second slot.
    const other = queue.enter("user_b", signal());
    await tick();
    expect(queue.position("user_b")).toBe(1);
    if (again.ok) again.release();
    expect((await other).ok).toBe(true);
  });

  it("refuses when the line is full", async () => {
    const queue = createAnalysisQueue({ maxConcurrent: 1, maxQueued: 1 });
    await queue.enter("user_a", signal());
    void queue.enter("user_b", signal());
    expect(await queue.enter("user_c", signal())).toEqual({ ok: false, code: "QUEUE_FULL" });
    expect(queue.position("user_c")).toBeNull();
  });

  it("gives up a place that waited too long, without disturbing the people behind it", async () => {
    const queue = createAnalysisQueue({ maxConcurrent: 1, maxWaitMs: 20 });
    const running = await queue.enter("user_a", signal());
    const b = queue.enter("user_b", signal());
    expect(await b).toEqual({ ok: false, code: "QUEUE_TIMEOUT" });
    expect(queue.position("user_b")).toBeNull();
    if (running.ok) running.release();
    expect((await queue.enter("user_b", signal())).ok).toBe(true);
  });

  it("frees the place of a person who cancels while waiting", async () => {
    const queue = createAnalysisQueue({ maxConcurrent: 1 });
    const running = await queue.enter("user_a", signal());
    const abort = new AbortController();
    const b = queue.enter("user_b", abort.signal);
    const c = queue.enter("user_c", signal());
    await tick();
    abort.abort();
    expect(await b).toEqual({ ok: false, code: "ABORTED" });
    expect(queue.position("user_c")).toBe(1);
    if (running.ok) running.release();
    expect((await c).ok).toBe(true);
  });

  it("lets several analyses run at once when configured, still one per person", async () => {
    const queue = createAnalysisQueue({ maxConcurrent: 2 });
    expect((await queue.enter("user_a", signal())).ok).toBe(true);
    expect((await queue.enter("user_b", signal())).ok).toBe(true);
    const c = queue.enter("user_c", signal());
    await tick();
    expect(queue.position("user_c")).toBe(1);
    void c;
  });
});
