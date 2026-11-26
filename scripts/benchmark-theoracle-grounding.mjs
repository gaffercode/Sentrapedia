import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Compile the actual retriever into a disposable directory and score it on the eval set: the
// production query embedding (local CPU), cosine search, per-document cap and privacy filter.
// Inside the capsule so the compiled module resolves @huggingface/transformers from node_modules.
const cache = path.resolve("node_modules/.cache"); mkdirSync(cache, { recursive: true });
const scratch = mkdtempSync(path.join(cache, "theoracle-grounding-benchmark-"));
const indexDir = path.resolve("theoracle/index");
// Usage: node scripts/benchmark-theoracle-grounding.mjs [eval-set folder] (default: the 2026-10-11 set).
const evalSet = path.resolve(process.argv[2] ?? "docs/verification/theoracle-eval-2026-10-11", "eval-set.json");
const hash = () => createHash("sha256").update(readFileSync(path.join(indexDir, "vectors.f32"))).update(readFileSync(path.join(indexDir, "chunks.jsonl"))).digest("hex");
const pct = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] * 10) / 10; };
try {
  for (const name of ["guards", "data-dir", "theoracle-grounding-types", "theoracle-grounding"]) {
    const source = readFileSync(path.resolve(`src/lib/${name}.ts`), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    writeFileSync(path.join(scratch, `${name}.mjs`), compiled.replace(/from "\.\/([\w-]+)"/g, 'from "./$1.mjs"'));
  }
  const { retrieveTheOracleGrounding, retrieveTheOracleTherapyGrounding, THEORACLE_MIN_SIMILARITY } = await import(pathToFileURL(path.join(scratch, "theoracle-grounding.mjs")).href);
  const caseFor = complaint => ({ demographics: { ageYears: null, sex: "unknown" }, chiefComplaint: complaint, anamnesis: {}, physicalExam: [], results: [], currentMedications: [], knownConditions: [] });
  const before = hash();
  const rssBefore = process.memoryUsage().rss;
  const coldStart = performance.now();
  const first = await retrieveTheOracleGrounding(caseFor("malaria demam"), { indexDir });
  const coldStartMs = Math.round(performance.now() - coldStart);
  const { queries } = JSON.parse(readFileSync(evalSet, "utf8"));
  const rows = [], latency = [], doseRows = [], targetedRows = [], targetedLatency = [], noMatch = [];
  // Under the relevance floor a query can find nothing; that counts as a miss, not a crash.
  const orNoMatch = (promise, id) => promise.catch(error => { if (error?.code !== "THEORACLE_NO_MATCH") throw error; noMatch.push(id); return { evidence: [] }; });
  const DOSE = /\d+(?:[.,]\d+)?\s?(?:mg|mcg|g|iu)\b(?!\s*\/\s*(?:dl|l)\b)/i; // a drug amount, not a lab value such as 126 mg/dL
  const STEM_FILLER = new Set(["dewasa", "remaja", "infeksi", "penyakit", "tahap", "akhir", "kronik", "tanpa", "dengan", "stadium", "tindakan", "perdoski", "dermatovenereologi"]);
  for (const item of queries) {
    const tick = performance.now();
    const bundle = await orNoMatch(retrieveTheOracleGrounding(caseFor(item.query), { indexDir, limit: 5 }), item.id);
    latency.push(performance.now() - tick);
    const hit = item.term ? bundle.evidence.some(e => e.text.toLowerCase().includes(item.term.toLowerCase())) : bundle.evidence.some(e => item.gold.includes(e.source.title));
    rows.push({ category: item.category, subtype: item.subtype, hit });
    // Dose recall: with the production evidence limit, does a chunk that states a dose for the gold disease reach the
    // model? The disease markdowns carry no doses, so a dose chunk from any guideline counts when it names the disease.
    if (item.gold?.length && !item.term) {
      const full = await orNoMatch(retrieveTheOracleGrounding(caseFor(item.query), { indexDir }), item.id);
      const stems = item.gold.flatMap(title => title.replace(/\.\w+$/, "").split("-")).filter(word => word.length >= 5 && !STEM_FILLER.has(word));
      const dose = full.evidence.filter(e => DOSE.test(e.text));
      doseRows.push({ id: item.id, hit: dose.some(e => item.gold.includes(e.source.title) || stems.some(stem => e.text.toLowerCase().includes(stem))), doseTitles: dose.map(e => e.source.title) });
      const label = item.gold[0].replace(/\.\w+$/, "").replace(/-\d{4}$/, "").replaceAll("-", " ");
      const tick2 = performance.now();
      const targeted = await orNoMatch(retrieveTheOracleTherapyGrounding(caseFor(item.query), { icd10: "", label }, { indexDir }), `${item.id}:therapy`);
      targetedLatency.push(performance.now() - tick2);
      const tdose = targeted.evidence.filter(e => DOSE.test(e.text));
      targetedRows.push({ id: item.id, label, hit: tdose.some(e => item.gold.includes(e.source.title) || stems.some(stem => e.text.toLowerCase().includes(stem))), doseTitles: tdose.map(e => e.source.title) });
    }
  }
  const recall = {};
  for (const key of [...new Set(rows.map(r => r.category)), ...new Set(rows.filter(r => r.subtype).map(r => `exact_terms.${r.subtype}`)), "overall"]) {
    const group = rows.filter(r => key === "overall" || r.category === key || `exact_terms.${r.subtype}` === key);
    recall[key] = { hits: group.filter(r => r.hit).length, total: group.length, recallAt5: Math.round(group.filter(r => r.hit).length / group.length * 1000) / 1000 };
  }
  // Relevance floor calibration: the best passage's similarity with the floor off, for every eval query (all clinical,
  // so each should clear the floor) and for queries with no clinical content (each should fall below it).
  const OFF_TOPIC = ["resep kue bolu pandan", "jadwal kereta Jakarta Bandung", "harga saham hari ini", "cara mengganti ban mobil", "lirik lagu kebangsaan", "skor pertandingan sepak bola semalam", "asdf qwer zxcv", "tips menanam cabai di pot"];
  const best = async query => (await retrieveTheOracleGrounding(caseFor(query), { indexDir, minSimilarity: -1 })).evidence[0]?.similarity ?? -1;
  const onTopicBest = [], offTopicBest = [];
  for (const item of queries) onTopicBest.push({ id: item.id, best: await best(item.query) });
  for (const query of OFF_TOPIC) offTopicBest.push({ query, best: await best(query) });
  const candidates = Array.from({ length: 9 }, (_, i) => Math.round((0.2 + i * 0.05) * 100) / 100);
  const relevanceFloor = {
    current: THEORACLE_MIN_SIMILARITY,
    noMatchAtCurrentFloor: noMatch,
    onTopicBest: { min: pct(onTopicBest.map(r => r.best * 1000), 0) / 1000, p05: pct(onTopicBest.map(r => r.best * 1000), 0.05) / 1000, median: pct(onTopicBest.map(r => r.best * 1000), 0.5) / 1000, lowest: [...onTopicBest].sort((a, b) => a.best - b.best).slice(0, 5) },
    offTopicBest,
    candidates: candidates.map(floor => ({ floor, onTopicRejected: onTopicBest.filter(r => r.best < floor).length, onTopicTotal: onTopicBest.length, offTopicAccepted: offTopicBest.filter(r => r.best >= floor).length, offTopicTotal: offTopicBest.length })),
  };
  const after = hash();
  if (after !== before) throw new Error("Index changed during benchmark");
  console.log(JSON.stringify({
    measuredAt: new Date().toISOString(), node: process.version,
    scope: "Actual TheOracle retrieval (local CPU query embedding + cosine search + caps); excludes AADI model inference and HTTP latency",
    indexSha256: first.corpus.indexSha256, embeddingModel: first.corpus.embeddingModel, indexUnchanged: true,
    coldStartMs, rssGrowthMb: Math.round((process.memoryUsage().rss - rssBefore) / 1048576),
    warmLatencyMs: { median: pct(latency, 0.5), p95: pct(latency, 0.95), max: pct(latency, 1) },
    recallAt5: recall,
    doseRecall: { hits: doseRows.filter(r => r.hit).length, total: doseRows.length, rate: Math.round(doseRows.filter(r => r.hit).length / doseRows.length * 1000) / 1000, rows: doseRows },
    relevanceFloor,
    targetedDoseRecall: { hits: targetedRows.filter(r => r.hit).length, total: targetedRows.length, rate: Math.round(targetedRows.filter(r => r.hit).length / targetedRows.length * 1000) / 1000, latencyMs: { median: pct(targetedLatency, 0.5), p95: pct(targetedLatency, 0.95) }, rows: targetedRows },
  }, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
