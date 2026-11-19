import { describe, expect, it } from "vitest";
import { createFeedbackHandler, parseFeedback } from "../src/lib/feedback";
import type { AccessResult } from "../src/lib/auth/policy";

// The sidebar's "Masukan" box (docs/FEATURE-IDEAS.md idea 4): it used to thank the user and drop the text. Now it is
// sent to the server, separate from the per-answer reports (db/migrations/0004 says so), with the same checks.
const request = (body: unknown, type = "application/json") => new Request("http://127.0.0.1:3101/api/feedback", { method: "POST", headers: { "Content-Type": type, Origin: "http://127.0.0.1:3101" }, body: typeof body === "string" ? body : JSON.stringify(body) });

function setup({ access = { status: "allowed", userId: "user_a" } as AccessResult, origin = true, store = true, fail = false } = {}) {
  const saved: { principal: string; note: string }[] = [];
  const handler = createFeedbackHandler({
    access: async () => access,
    trustedOrigin: () => origin,
    store: store ? { add: async (principal, note) => { if (fail) throw new Error("private database detail"); saved.push({ principal, note }); } } : undefined,
  });
  return { handler, saved };
}

describe("parseFeedback", () => {
  it("accepts a plain note and trims it", () => {
    expect(parseFeedback({ note: "  Tombol cetak sangat membantu.  " })).toBe("Tombol cetak sangat membantu.");
  });
  it("refuses an empty, over-long or extra-keyed note and a non-object", () => {
    for (const value of [{ note: "   " }, { note: "x".repeat(1001) }, { note: "ok", extra: 1 }, { note: 5 }, [], null, "ok"]) expect(parseFeedback(value)).toBeNull();
  });
  it("flags a note that carries an identity pattern", () => {
    expect(parseFeedback({ note: "NIK 3201234567890123" })).toBe("identity");
  });
});

describe("feedback handler", () => {
  it("stores the trimmed note under the session's principal", async () => {
    const { handler, saved } = setup();
    const response = await handler(request({ note: " Bagus. " }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(saved).toEqual([{ principal: "user_a", note: "Bagus." }]);
  });
  it("answers 503 FEEDBACK_UNAVAILABLE without a store", async () => {
    const response = await setup({ store: false }).handler(request({ note: "Bagus." }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("FEEDBACK_UNAVAILABLE");
  });
  it("refuses identity with 400 IDENTITY and never stores it", async () => {
    const { handler, saved } = setup();
    const response = await handler(request({ note: "pasien Tn. Budi" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("IDENTITY");
    expect(saved).toEqual([]);
  });
  it("refuses a foreign origin, a wrong shape and a failing store without leaking the error", async () => {
    expect((await setup({ origin: false }).handler(request({ note: "x" }))).status).toBe(403);
    expect((await setup().handler(request("{broken"))).status).toBe(400);
    expect((await setup().handler(request({ note: "x" }, "text/plain"))).status).toBe(400);
    const failed = await setup({ fail: true }).handler(request({ note: "x" }));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private database detail");
  });
});
