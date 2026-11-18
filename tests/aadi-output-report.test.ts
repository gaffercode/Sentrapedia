import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createReportHandler, parseReport, type OutputReport } from "../src/lib/aadi/output-report";
import type { AccessResult } from "../src/lib/auth/policy";

const traceId = "021fad02-4f6c-49f3-8fa2-912add178074";
const request = (body: unknown, type = "application/json") => new Request("http://127.0.0.1:3101/api/aadi/report", { method: "POST", headers: { "Content-Type": type, Origin: "http://127.0.0.1:3101" }, body: typeof body === "string" ? body : JSON.stringify(body) });

function setup({ access = { status: "allowed", userId: "user_a" } as AccessResult, origin = true, store = true, fail = false } = {}) {
  const saved: { principal: string; report: OutputReport }[] = [];
  const handler = createReportHandler({
    access: async () => access,
    trustedOrigin: () => origin,
    store: store ? { add: async (principal, report) => { if (fail) throw new Error("private database detail"); saved.push({ principal, report }); } } : undefined,
  });
  return { handler, saved };
}

describe("report of problematic output", () => {
  it("stores the trace id, category and trimmed note under the session's principal", async () => {
    const { handler, saved } = setup();
    const response = await handler(request({ traceId: traceId.toUpperCase(), category: "unsafe", note: "  Dosis anak terlalu tinggi.  " }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(saved).toEqual([{ principal: "user_a", report: { traceId, category: "unsafe", note: "Dosis anak terlalu tinggi." } }]);
  });

  it("accepts each category and an absent note", async () => {
    for (const category of ["incorrect", "unsafe", "other"]) expect(parseReport({ traceId, category })).toEqual({ traceId, category, note: "" });
  });

  it("refuses a wrong shape before any write", async () => {
    const { handler, saved } = setup();
    const bodies = [{}, { traceId: "not-a-trace", category: "other" }, { traceId, category: "spam" }, { traceId, category: "other", note: 5 }, { traceId, category: "other", note: "x".repeat(1001) }, { traceId, category: "other", userId: "user_b" }, [traceId]];
    for (const body of bodies) expect((await handler(request(body))).status).toBe(400);
    expect((await handler(request("{broken"))).status).toBe(400);
    expect((await handler(request({ traceId, category: "other" }, "text/plain"))).status).toBe(400);
    expect(saved).toEqual([]);
  });

  it("refuses a note that carries an identity pattern and never stores it", async () => {
    const { handler, saved } = setup();
    for (const note of ["NIK 3201234567890123", "pasien Tn. Budi", "hubungi 081234567890", "no rm: 12345"]) {
      const response = await handler(request({ traceId, category: "other", note }));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("IDENTITY");
    }
    expect(saved).toEqual([]);
  });

  it("follows the beta access decision, the origin check and the store's presence", async () => {
    expect((await setup({ access: { status: "signed-out" } }).handler(request({ traceId, category: "other" }))).status).toBe(401);
    expect((await setup({ access: { status: "disabled" } }).handler(request({ traceId, category: "other" }))).status).toBe(403);
    expect((await setup({ origin: false }).handler(request({ traceId, category: "other" }))).status).toBe(403);
    const missing = await setup({ store: false }).handler(request({ traceId, category: "other" }));
    expect(missing.status).toBe(503);
    expect((await missing.json()).error.code).toBe("REPORT_UNAVAILABLE");
  });

  it("answers a store failure with a generic message", async () => {
    const response = await setup({ fail: true }).handler(request({ traceId, category: "other" }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private database detail");
  });
});

describe("output report migration", () => {
  const sql = readFileSync(resolve(import.meta.dirname, "../db/migrations/0004_output_reports.sql"), "utf8").replace(/--[^\n]*/g, "").toLowerCase();
  it("hangs reports off profile, limits category and note, and lets the runtime role only add and read", () => {
    expect(sql).toMatch(/user_id\s+text not null references profile \(user_id\) on delete cascade/);
    expect(sql).toContain("check (category in ('incorrect', 'unsafe', 'other'))");
    expect(sql).toContain("check (char_length(note) <= 1000)");
    expect(sql).toMatch(/create policy \w+ on output_report\s+using \(user_id = current_setting\('app\.user_id', true\)\)\s+with check \(user_id = current_setting\('app\.user_id', true\)\)/);
    expect(sql).toContain("grant select, insert on output_report to sentrapedia_runtime");
    expect(sql).not.toMatch(/grant [^;]*(update|delete)[^;]* on output_report/);
  });
});
