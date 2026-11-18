// scripts/leak-guard.mjs (Gaffer, 2026-11-18): each of the four leaks the plan names is planted in a temporary tree
// and must be found; a clean public tree and a clean private build must pass.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkLeaks } from "../scripts/leak-guard.mjs";

const SAMPLE = JSON.stringify({ metadata: { sample: true }, diseases: [{ id: 1, nama: "Contoh", definisi: "Entri contoh.", terapi: "Tidak ada." }] }, null, 2);
const DEFINISI = "Penyakit rahasia uji adalah peradangan saluran yang hanya ada di katalog privat";
const TERAPI = "Obat rahasia uji 500 mg tiga kali sehari selama tujuh hari menurut pedoman";
const REAL = JSON.stringify({ metadata: { version: "1.0.0" }, diseases: [{ id: 7, nama: "Penyakit rahasia", definisi: DEFINISI, terapi: TERAPI }] }, null, 2);
const SSOT_LINE = '"teks": "Paragraf SSOT rahasia yang cukup panjang untuk dihitung sebagai isi asli"';
const SSOT = `{\n  ${SSOT_LINE}\n}\n`;
const write = (root, file, content = "") => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), content); };
function trees() {
  const base = mkdtempSync(join(tmpdir(), "sentrapedia-leak-"));
  const pub = join(base, "public"), ref = join(base, "data");
  write(ref, "oracle/sentrapedia.json", REAL);
  write(ref, "theoracle/ssot/sentrapedia-knowledge-ssot.json", SSOT);
  write(pub, "oracle/sentrapedia.sample.json", SAMPLE);
  write(pub, "oracle/sentrapedia.json", SAMPLE);
  write(pub, "src/app.ts", "export const app = 1;\n");
  write(pub, "docs/data.md", "Public notes.\n");
  write(pub, ".next/static/chunks/app.js", "console.log('sample');\n");
  write(pub, ".next/standalone/server.js", "");
  return { base, pub, ref };
}
const run = (body) => () => { const t = trees(); try { body(t); } finally { rmSync(t.base, { recursive: true, force: true }); } };

test("a clean public tree passes with the reference and says which checks it skipped without one", run(({ pub, ref }) => {
  assert.deepEqual(checkLeaks({ root: pub, reference: ref }), { mode: "public", reference: ref, findings: [], skipped: [] });
  const bare = checkLeaks({ root: pub, reference: undefined });
  assert.deepEqual(bare.findings, []);
  assert.equal(bare.skipped.length, 2);
}));

test("a PRIVATE_PATHS file in the public tree fails", run(({ pub, ref }) => {
  write(pub, "docs/security/SECURITY.md", "weaknesses\n");
  write(pub, "theoracle/index/chunks.jsonl", "{}\n");
  assert.deepEqual(checkLeaks({ root: pub, reference: ref }).findings, ["private file in the public tree: docs/security/SECURITY.md", "private file in the public tree: theoracle/index/chunks.jsonl"]);
}));

test("a JSON or JSONL file over 1 MB in the public tree fails", run(({ pub, ref }) => {
  write(pub, "data/big.jsonl", "x".repeat(1024 * 1024 + 1));
  assert.deepEqual(checkLeaks({ root: pub, reference: ref }).findings, ["JSON file over 1 MB in the public tree: data/big.jsonl"]);
}));

test("a line of the real SSOT or catalogue anywhere in the public tree fails", run(({ pub, ref }) => {
  write(pub, "docs/notes.md", `Copied by mistake:\n  ${SSOT_LINE}\n`);
  write(pub, "src/fixture.json", `{\n  "definisi": "${DEFINISI}",\n}\n`);
  assert.deepEqual(checkLeaks({ root: pub, reference: ref }).findings, ["1 line(s) of the real SSOT or catalogue in docs/notes.md", "1 line(s) of the real SSOT or catalogue in src/fixture.json"]);
}));

test("catalogue text or a private file in the built output fails, in a public tree and in the private capsule", run(({ pub, ref }) => {
  write(pub, ".next/static/chunks/leak.js", `var d={definisi:"${DEFINISI}",terapi:"${TERAPI}"};`);
  assert.deepEqual(checkLeaks({ root: pub, reference: ref }).findings, ["2 catalogue passage(s) in the build: .next/static/chunks/leak.js"]);
  // The capsule holds the data on purpose: its own files pass, its build must still be clean.
  write(ref, ".next/static/chunks/app.js", "console.log('clean');\n");
  write(ref, ".next/standalone/oracle/sentrapedia.sample.json", SAMPLE);
  assert.deepEqual(checkLeaks({ root: ref, reference: undefined }), { mode: "private", reference: ref, findings: [], skipped: [] });
  write(ref, ".next/standalone/.next/server/chunks/route.js", `module.exports={t:"${TERAPI}"}`);
  write(ref, ".next/standalone/theoracle/index/chunks.jsonl", "{}\n");
  assert.deepEqual(checkLeaks({ root: ref, reference: undefined }).findings, ["private file in the build: .next/standalone/theoracle/index/chunks.jsonl", "1 catalogue passage(s) in the build: .next/standalone/.next/server/chunks/route.js"]);
}));

test("a reference folder without the real data is an error, not a pass", run(({ pub, base }) => {
  assert.match(checkLeaks({ root: pub, reference: join(base, "nowhere") }).findings[0], /lacks oracle\/sentrapedia\.json/);
}));
