import { describe, expect, it } from "vitest";
import { selectedAadiModel } from "../src/lib/aadi/model-profile";
import { createAadiGateway } from "../src/lib/aadi/gateway";
import { emptyCase } from "../src/lib/aadi/contract";
import { requestAadiAnalysis } from "../src/lib/aadi/client";
import { readAnalysisStream, streamAnalysis, stageStreamType, type StageEvent } from "../src/lib/aadi/stage-stream";
import { THEORACLE_GROUNDING_CAPABILITY, type TheOracleGroundingBundle } from "../src/lib/theoracle-grounding-types";

const version = `aadi-service/test+contract=1+provider=openai+data=synthetic-only+plan=${selectedAadiModel}+assess=${selectedAadiModel}+experimental`;
const meta = { version, model: `${selectedAadiModel}+${selectedAadiModel}`, costUsd: 0.01 };
const complaint = "Batuk demam fiktif";
const input = () => new Request("http://127.0.0.1:3104/api/aadi", { method: "POST", headers: { Origin: "http://127.0.0.1:3104", "Content-Type": "application/json" }, body: JSON.stringify({ case: { ...emptyCase(), chiefComplaint: complaint } }) });
const bundle = (text: string): TheOracleGroundingBundle => ({ version: THEORACLE_GROUNDING_CAPABILITY, corpus: { name: "TheOracle", indexSha256: "a".repeat(64), embeddingModel: { id: "onnx-community/embeddinggemma-300m-ONNX", revision: "e".repeat(40), dtype: "fp32", dims: 768 }, retrievedAt: "2026-10-11T12:00:00.000Z", reviewProvenance: "fixture" }, queryDigest: "b".repeat(64), evidence: [{ evidenceId: "E1", text, retrievalRank: 1, similarity: 0.6, source: { title: "ppk.pdf", docSource: "uji", origin: "fixture", textSha256: "c".repeat(64) } }] });
const therapy = { forDiagnosis: { icd10: "J18.9", label: "Pneumonia" }, regimen: [{ drug: "Amoxicillin", dose: "3x500mg", route: "PO", duration: "5 hari", note: "" }], interactions: [], contraindications: [] };
const engine: typeof fetch = async (url) => {
  const path = new URL(String(url)).pathname;
  if (path === "/healthz") return Response.json({ status: "ok", contractVersion: "1", version, capabilities: [THEORACLE_GROUNDING_CAPABILITY, "theoracle-targeted-therapy-v1"] });
  if (path === "/v1/therapy/step") return Response.json({ contractVersion: "1", status: "ok", therapy, meta });
  return Response.json({ contractVersion: "1", status: "ok", differential: { likely: [{ icd10: "J18.9", label: "Pneumonia", confidenceTier: "low" }], alternatives: [], cannotMiss: [] }, evidence: [], missingInformation: [], nextBestActions: [], disposition: null, unfilled: [], meta });
};
const gateway = () => createAadiGateway({ model: selectedAadiModel, maxCostUsd: 0.1, token: "test-only", fetchFn: engine, targetedTherapy: true, log: () => undefined,
  retrieveGrounding: async () => bundle("Batuk dan demam."), retrieveTherapyGrounding: async () => bundle("Pneumonia: amoksisilin 500 mg 3 kali sehari.") });
const lines = async (response: Response) => (await response.text()).trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
// traceId and createdAt differ per request; everything else in the reply must match.
const stable = (body: Record<string, unknown>) => ({ ...body, traceId: "", createdAt: "", pipeline: { ...(body.pipeline as object), stages: ((body.pipeline as { stages: { stage: string; ok: boolean }[] }).stages).map(s => [s.stage, s.ok]) } });

describe("analysis stage progress from the gateway", () => {
  it("reports each stage as it starts and ends, in pipeline order, without changing the reply", async () => {
    const events: StageEvent[] = [];
    const withProgress = await (await gateway().step(input(), undefined, event => events.push(event))).json();
    const plain = await (await gateway().step(input())).json();
    expect(events.map(e => `${e.stage}:${e.state}`)).toEqual(["retrieve_dx:running", "retrieve_dx:done", "aadi_dx:running", "aadi_dx:done", "retrieve_tx:running", "retrieve_tx:done", "aadi_tx:running", "aadi_tx:done", "gate:running", "gate:done"]);
    expect(stable(withProgress)).toEqual(stable(plain));
  });

  it("streams stage lines that carry only a stage name and state, then the same reply as its last line", async () => {
    const response = streamAnalysis(onStage => gateway().step(input(), undefined, onStage));
    expect(response.headers.get("content-type")).toContain(stageStreamType);
    expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
    const all = await lines(response);
    const stages = all.slice(0, -1);
    expect(stages).toHaveLength(10);
    for (const line of stages) expect(Object.keys(line).sort()).toEqual(["stage", "state", "type"]);
    expect(JSON.stringify(stages)).not.toMatch(/Batuk|Pneumonia|Amoxicillin|mg/);
    const final = all.at(-1)!;
    expect(final.type).toBe("final");
    expect(final.status).toBe(200);
    expect(stable(final.body as Record<string, unknown>)).toEqual(stable(await (await gateway().step(input())).json()));
  });

  it("carries a refusal as the final line with its status, before any stage", async () => {
    const refused = new Request("http://127.0.0.1:3104/api/aadi", { method: "POST", headers: { Origin: "http://evil.example", "Content-Type": "application/json" }, body: "{}" });
    const all = await lines(streamAnalysis(onStage => gateway().step(refused, undefined, onStage)));
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ type: "final", status: 403, body: { error: { code: "ORIGIN" } } });
  });
});

const ndjson = (text: string) => new Response(text, { headers: { "Content-Type": `${stageStreamType}; charset=utf-8` } });

describe("reading the stage stream in the browser", () => {
  it("reports valid stage lines, skips unknown or malformed ones, and returns the final reply", async () => {
    const seen: StageEvent[] = [];
    const text = [
      JSON.stringify({ type: "stage", stage: "retrieve_dx", state: "running" }),
      "not json",
      JSON.stringify({ type: "stage", stage: "route", state: "failed" }),
      JSON.stringify({ type: "stage", stage: "aadi_dx", state: "thinking" }),
      JSON.stringify({ type: "stage", stage: "retrieve_dx", state: "done" }),
      JSON.stringify({ type: "final", status: 200, body: { ok: true } }),
    ].join("\n");
    const final = await readAnalysisStream(ndjson(text), event => seen.push(event));
    expect(seen).toEqual([{ stage: "retrieve_dx", state: "running" }, { stage: "retrieve_dx", state: "done" }]);
    expect(final).toEqual({ status: 200, body: { ok: true } });
  });
  it("throws when the stream ends without a final line", async () => {
    await expect(readAnalysisStream(ndjson(JSON.stringify({ type: "stage", stage: "aadi_dx", state: "running" })), () => undefined)).rejects.toThrow();
  });
});

describe("the workspace client with stage progress", () => {
  const caseData = { ...emptyCase(), chiefComplaint: "Kasus fiktif untuk pengujian" };
  const grounding = bundle("Kutipan TheOracle");
  const reply = { traceId: "test-trace", createdAt: "2026-10-09T00:00:00Z", grounding, result: { contractVersion: "1", status: "ok", differential: { likely: [{ icd10: "R51", label: "Hipotesis uji fiktif", confidenceTier: "low" }], alternatives: [], cannotMiss: [] }, evidence: [], missingInformation: [], nextBestActions: [], disposition: null, unfilled: [], meta: { version: "test", model: "test", costUsd: 0.01 } } };
  it("asks for progress, reports the stages and returns the same analysis as the JSON reply", async () => {
    const seen: StageEvent[] = [];
    let accept = "";
    const streamed = await requestAadiAnalysis(caseData, { onStage: event => seen.push(event), fetchFn: async (url, init) => {
      if (url !== "/api/aadi") return Response.json(reply);
      accept = new Headers(init?.headers).get("accept") ?? "";
      return ndjson(`${JSON.stringify({ type: "stage", stage: "aadi_dx", state: "running" })}\n${JSON.stringify({ type: "final", status: 200, body: reply })}\n`);
    } });
    const plain = await requestAadiAnalysis(caseData, { fetchFn: async () => Response.json(reply) });
    expect(accept).toContain(stageStreamType);
    expect(seen).toEqual([{ stage: "aadi_dx", state: "running" }]);
    expect(streamed).toEqual(plain);
  });
  it("reports a streamed refusal with the server's message and code", async () => {
    const refusal = { error: { code: "BUSY", message: "Antrean analisis sedang penuh. Coba kembali sebentar lagi." } };
    await expect(requestAadiAnalysis(caseData, { onStage: () => undefined, fetchFn: async () => ndjson(`${JSON.stringify({ type: "final", status: 429, body: refusal })}\n`) })).rejects.toMatchObject({ message: refusal.error.message, code: "BUSY" });
  });
  it("still works with a gateway that answers in plain JSON", async () => {
    const seen: StageEvent[] = [];
    const analysis = await requestAadiAnalysis(caseData, { onStage: event => seen.push(event), fetchFn: async () => Response.json(reply) });
    expect(seen).toEqual([]);
    expect(analysis.traceId).toBe("test-trace");
  });
});
