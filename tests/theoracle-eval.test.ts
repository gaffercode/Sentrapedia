// Public, reproducible TheOracle eval: a synthetic corpus and case set (tests/fixtures/theoracle-eval/) that CI can run on
// every pull request, because the real knowledge base is private and its tests skip in the public repository.
// Two layers:
//   1. Evidence gate on the case set with the evidence each case declares. No model; runs everywhere.
//   2. The production index builder embeds the synthetic corpus with the pinned EmbeddingGemma model into a temporary
//      folder; the production retriever answers every case from it and the gate reads what was retrieved. Needs the model
//      that postinstall downloads. SENTRAPEDIA_ORACLE_EVAL=required (CI) turns a missing model into a failure, not a skip.
// The passages are invented and not clinically reviewed: this measures retrieval and matching, never clinical correctness.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyCase, type AadiTherapy } from "../src/lib/aadi/contract";
import type { CaseState } from "../src/lib/aadi/types";
import { gateEvidence, gateTherapy } from "../src/lib/theoracle-evidence-gate";
import { retrieveTheOracleGrounding, retrieveTheOracleTherapyGrounding, type TheOracleGroundingBundle, type TheOracleManifest } from "../src/lib/theoracle-grounding";
import { validTheOracleGrounding } from "../src/lib/theoracle-grounding-types";
import { modelDir, profile } from "../scripts/theoracle-model.mjs";
import corpus from "./fixtures/theoracle-eval/corpus.json";
import cases from "./fixtures/theoracle-eval/cases.json";

// `knownGap` marks a case the current gate gets wrong: it runs as an expected failure (it.fails), so CI stays green while the
// gap is open and turns red the day it is fixed, when the marker must go.
type GateCase = (typeof cases.gate)[number] & { forDiagnosis?: { icd10: string; label: string }; retrievalDependent?: boolean; knownGap?: string };
type Expected = { status: string; evidence?: string[]; shown?: { drug: string; dose: string } };

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
// The same header the production chunk build writes (scripts/build-theoracle-chunks.mjs); retrieval strips it from the evidence.
const passages = corpus.documents.flatMap(doc => doc.passages.map(passage => {
  const text = `<document_metadata>\nsourceDocument: ${doc.title}\npublished: ${corpus.published}\n</document_metadata>\n\n${passage.text}`;
  return { id: passage.id, title: doc.title, docSource: corpus.docSource, origin: corpus.origin, text, textSha256: sha256(text), body: passage.text };
}));
const byId = new Map(passages.map(p => [p.id, p]));
const titles = new Set(corpus.documents.map(doc => doc.title));
const gateCases = cases.gate as GateCase[];

const caseFor = (item: { query: string; case?: Partial<Pick<CaseState, "anamnesis" | "physicalExam" | "results">> }): CaseState => ({ ...emptyCase(), chiefComplaint: item.query, ...(item.case as Partial<CaseState> | undefined) });
const therapyFor = (item: GateCase): AadiTherapy => ({ forDiagnosis: item.forDiagnosis ?? item.diagnosis, regimen: item.regimen, interactions: [], contraindications: [] });
const declaredBundle = (ids: string[]): TheOracleGroundingBundle => ({
  version: "theoracle-grounding-v2",
  corpus: { name: "TheOracle", indexSha256: "e".repeat(64), embeddingModel: { id: profile.id, revision: profile.revision, dtype: profile.dtype, dims: profile.dims }, retrievedAt: "2026-11-26T00:00:00.000Z", reviewProvenance: "Synthetic eval fixture." },
  queryDigest: "f".repeat(64),
  evidence: ids.map((id, index) => { const p = byId.get(id)!; return { evidenceId: p.id, text: p.body, retrievalRank: index + 1, similarity: 0.5, source: { title: p.title, docSource: p.docSource, origin: p.origin, textSha256: p.textSha256 } }; }),
});
function checkGate(item: GateCase, bundle: TheOracleGroundingBundle, withEvidence: boolean) {
  const { therapy, report } = gateTherapy(therapyFor(item), bundle, item.diagnosis);
  const expected = item.expected as Expected[];
  expect(report.drugs.map(d => d.status), `${item.id}: ${item.about}`).toEqual(expected.map(e => e.status));
  expected.forEach((e, i) => {
    if (withEvidence && e.evidence) expect(report.drugs[i].evidenceIds, `${item.id} evidence`).toEqual(e.evidence);
    if (e.shown) expect(therapy?.regimen[i], `${item.id} shown`).toMatchObject(e.shown);
  });
}

describe("TheOracle synthetic eval set", () => {
  it("is self-consistent: unique passage ids, every gold title and passage exists, every passage marked synthetic", () => {
    expect(byId.size).toBe(passages.length);
    expect(corpus.documents.every(doc => doc.title.startsWith("SINTETIS "))).toBe(true);
    for (const item of cases.retrieval) expect(titles.has(item.gold), item.id).toBe(true);
    for (const item of cases.therapy) expect(byId.has(item.dosePassage), item.id).toBe(true);
    for (const item of gateCases) expect(item.evidence.every(id => byId.has(id)), item.id).toBe(true);
    expect(byId.has(cases.privacy.trap)).toBe(true);
    expect(new Set([...cases.retrieval, ...cases.therapy, ...gateCases].map(item => item.id)).size).toBe(cases.retrieval.length + cases.therapy.length + gateCases.length);
  });
});

describe("evidence gate on the synthetic case set, with each case's declared evidence", () => {
  for (const item of gateCases) (item.knownGap ? it.fails : it)(`${item.id}: ${item.about}${item.knownGap ? " (known gap)" : ""}`, () => checkGate(item, declaredBundle(item.evidence), true));
});

// Layer 2: the pinned model. Present when postinstall downloaded it (CI caches it); the hashes are checked by the builder
// and by the retriever's own loader, so a size check is enough to decide whether to run.
const modelReady = Object.entries(profile.files).every(([name, file]) => { const target = path.join(modelDir, profile.id, name); return existsSync(target) && statSync(target).size === file.size; });
const required = process.env.SENTRAPEDIA_ORACLE_EVAL === "required";

it.runIf(required && !modelReady)("has the pinned embedding model that SENTRAPEDIA_ORACLE_EVAL=required asks for", () => {
  expect.fail(`The TheOracle model is missing from ${modelDir}; run node scripts/install-theoracle-model.mjs.`);
});

describe.runIf(modelReady)("TheOracle retrieval on the synthetic index with the pinned model", () => {
  let indexDir = "";
  // The production floor is calibrated on the real index, which scores higher than this short-passage corpus; with it on,
  // genuine eval cases would answer no-match. The eval measures retrieval with the floor off.
  const FLOOR_OFF = -1;
  const report: Record<string, unknown> = { measuredAt: new Date().toISOString(), node: process.version, model: { id: profile.id, revision: profile.revision } };
  const rate = (hits: number, total: number) => Math.round(hits / total * 1000) / 1000;

  beforeAll(() => {
    indexDir = mkdtempSync(path.join(tmpdir(), "sentrapedia-theoracle-eval-"));
    writeFileSync(path.join(indexDir, "chunks.jsonl"), passages.map(({ id, title, docSource, origin, text, textSha256 }) => JSON.stringify({ id, title, docSource, origin, text, textSha256 })).join("\n") + "\n");
    const started = performance.now();
    const build = spawnSync(process.execPath, ["scripts/build-theoracle-index.mjs", "--index-dir", indexDir], { encoding: "utf8" });
    if (build.status !== 0) throw new Error(`Index build failed (${build.status}): ${build.stderr}`);
    report.indexBuildMs = Math.round(performance.now() - started);
  }, 600_000);

  afterAll(() => {
    if (indexDir) rmSync(indexDir, { recursive: true, force: true });
    const out = path.resolve("node_modules/.cache/theoracle-eval");
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(`TheOracle synthetic eval: ${JSON.stringify(report.summary ?? report)}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### TheOracle synthetic eval\n\n\`\`\`json\n${JSON.stringify(report.summary ?? report, null, 2)}\n\`\`\`\n`);
  });

  it("builds the index with the production builder and the pinned model, and retrieves a valid bundle from it", async () => {
    const manifest = JSON.parse(readFileSync(path.join(indexDir, "manifest.json"), "utf8")) as TheOracleManifest;
    expect(manifest.model).toMatchObject({ id: profile.id, revision: profile.revision, dtype: profile.dtype, dims: profile.dims });
    expect(manifest.chunks.count).toBe(passages.length);
    const bundle = await retrieveTheOracleGrounding(caseFor(cases.retrieval[0]), { indexDir, minSimilarity: FLOOR_OFF });
    expect(validTheOracleGrounding(bundle)).toBe(true);
    expect(bundle.corpus.indexSha256).toBe(manifest.indexSha256);
  }, 300_000);

  it("finds each case's gold document in the evidence the model receives (recall@6, MRR)", async () => {
    const rows: { id: string; category: string; rank: number; top: string; topSimilarity: number; ms: number }[] = [];
    for (const item of cases.retrieval) {
      const started = performance.now();
      const bundle = await retrieveTheOracleGrounding(caseFor(item), { indexDir, minSimilarity: FLOOR_OFF });
      const rank = bundle.evidence.findIndex(e => e.source.title === item.gold) + 1;
      rows.push({ id: item.id, category: item.category, rank, top: bundle.evidence[0].source.title, topSimilarity: bundle.evidence[0].similarity, ms: Math.round(performance.now() - started) });
    }
    const score = (category: string) => {
      const group = rows.filter(r => r.category === category);
      return { recallAt6: rate(group.filter(r => r.rank > 0).length, group.length), mrr: Math.round(group.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / group.length * 1000) / 1000, missed: group.filter(r => !r.rank).map(r => r.id) };
    };
    const clinical = score("clinical"), lay = score("lay");
    report.retrieval = { clinical, lay, rows };
    report.summary = { ...(report.summary as object), clinical: { recallAt6: clinical.recallAt6, mrr: clinical.mrr, missed: clinical.missed }, lay: { recallAt6: lay.recallAt6, mrr: lay.mrr, missed: lay.missed } };
    expect(clinical.recallAt6, `clinical misses: ${clinical.missed.join(", ")}`).toBeGreaterThanOrEqual(cases.thresholds.clinicalRecallAt6);
    expect(clinical.mrr).toBeGreaterThanOrEqual(cases.thresholds.clinicalMrr);
    expect(lay.recallAt6, `lay misses: ${lay.missed.join(", ")}`).toBeGreaterThanOrEqual(cases.thresholds.layRecallAt6);
  }, 300_000);

  it("brings the diagnosis's dose passage into the therapy step's evidence", async () => {
    const rows: { id: string; hit: boolean; rank: number }[] = [];
    for (const item of cases.therapy) {
      const bundle = await retrieveTheOracleTherapyGrounding(emptyCase(), item.diagnosis, { indexDir, minSimilarity: FLOOR_OFF });
      rows.push({ id: item.id, hit: bundle.evidence.some(e => e.evidenceId === item.dosePassage), rank: bundle.evidence.findIndex(e => e.evidenceId === item.dosePassage) + 1 });
    }
    const doseRecall = rate(rows.filter(r => r.hit).length, rows.length);
    report.therapy = { doseRecall, rows };
    report.summary = { ...(report.summary as object), therapyDoseRecall: doseRecall };
    expect(doseRecall, `missed: ${rows.filter(r => !r.hit).map(r => r.id).join(", ")}`).toBeGreaterThanOrEqual(cases.thresholds.therapyDoseRecall);
  }, 300_000);

  it("never returns a passage that trips the AADI privacy guard, however close it is to the query", async () => {
    for (const query of cases.privacy.queries) {
      const ids = [...(await retrieveTheOracleGrounding(caseFor({ query }), { indexDir, minSimilarity: FLOOR_OFF })).evidence, ...(await retrieveTheOracleTherapyGrounding(caseFor({ query }), { icd10: "J18.9", label: "Pneumonia komunitas" }, { indexDir, minSimilarity: FLOOR_OFF })).evidence].map(e => e.evidenceId);
      expect(ids).not.toContain(cases.privacy.trap);
    }
  }, 300_000);

  // The cases whose outcome does not depend on which other passages come back; known gaps are left to layer 1.
  const endToEnd = gateCases.filter(item => !item.retrievalDependent && !item.knownGap);
  for (const item of endToEnd) it(`gates ${item.id} against the evidence retrieval actually returned: ${item.about}`, async () => {
    const dx = await retrieveTheOracleGrounding(caseFor(item), { indexDir, minSimilarity: FLOOR_OFF });
    const tx = await retrieveTheOracleTherapyGrounding(caseFor(item), item.diagnosis, { indexDir, minSimilarity: FLOOR_OFF });
    checkGate(item, gateEvidence(tx, dx)!, false);
  }, 300_000);

  // The floor itself is not asserted here (see FLOOR_OFF); that on-topic and off-topic queries separate on this corpus is.
  it("scores every on-topic case above every off-topic query, and records both for the floor", async () => {
    const offTopic: { query: string; topSimilarity: number }[] = [];
    for (const query of cases.outOfDomain) offTopic.push({ query, topSimilarity: (await retrieveTheOracleGrounding(caseFor({ query }), { indexDir, minSimilarity: FLOOR_OFF })).evidence[0].similarity });
    const rows = (report.retrieval as { rows: { rank: number; topSimilarity: number }[] } | undefined)?.rows ?? [];
    report.summary = { ...(report.summary as object), offTopicMaxSimilarity: Math.max(...offTopic.map(r => r.topSimilarity)), onTopicMinTopSimilarity: rows.length ? Math.min(...rows.map(r => r.topSimilarity)) : null };
    report.outOfDomain = offTopic;
    // The retrieval rows come from the recall test above; run alone, this test only records.
    if (rows.length) expect(Math.min(...rows.map(r => r.topSimilarity))).toBeGreaterThan(Math.max(...offTopic.map(r => r.topSimilarity)));
  }, 300_000);
});
