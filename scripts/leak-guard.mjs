// Leak guard (Gaffer, 2026-11-18): proves a tree and its build hold none of the private Sentrapedia data.
// Run by scripts/deploy-dry-run.mjs. Two modes, chosen by the catalogue the tree holds:
//   public   oracle/sentrapedia.json is the marked sample (an export-split public tree or a clone of the public repo).
//            Fails on any PRIVATE_PATHS file, any .json/.jsonl over 1 MB, and any line of the real SSOT or catalogue.
//   private  the capsule itself, which holds the data on purpose; only the build is checked.
// Both modes fail when the build (.next/static, .next/standalone) carries a private file or catalogue text.
// The real data to compare with is SENTRAPEDIA_LEAK_REFERENCE (a data folder such as the backup), or the capsule itself
// in private mode. A public tree without a reference runs the structural checks only and says so.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { isPrivate, SAMPLES } from "./private-data.mjs";

const MAX_JSON_BYTES = 1024 * 1024;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".runtime", "coverage", "__pycache__", ".pytest_cache"]);
const TEXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".jsonl", ".md", ".txt", ".html", ".css", ".py", ".sh", ".yml", ".yaml", ".toml", ".sql", ".svg", ".map", ".rsc", ".body", ""]);
const CATALOGUE = "oracle/sentrapedia.json", SSOT = "theoracle/ssot/sentrapedia-knowledge-ssot.json";
const posix = path => path.split(sep).join("/");

function walk(root, folder = root, skip = SKIP_DIRS, files = []) {
  if (!existsSync(folder)) return files;
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) { if (!skip.has(name) && posix(relative(root, path)) !== "theoracle/model") walk(root, path, skip, files); }
    else files.push(posix(relative(root, path)));
  }
  return files;
}
const isSampleCopy = (root, file) => SAMPLES.some(sample => sample.to === file && existsSync(join(root, sample.from)) && readFileSync(join(root, sample.from)).equals(readFileSync(join(root, file))));
const sampleCatalogue = root => { try { return JSON.parse(readFileSync(join(root, CATALOGUE), "utf8")).metadata?.sample === true; } catch { return !existsSync(join(root, CATALOGUE)); } };

// Substantive lines only: a line of braces or a short key/value says nothing about the content.
const referenceLines = reference => new Set([SSOT, CATALOGUE].flatMap(file => readFileSync(join(reference, file), "utf8").split("\n").map(line => line.trim()).filter(line => line.length >= 40)));
// The opening words of each disease's definition and therapy, cut before the first character a bundler would escape.
function catalogueNeedles(reference) {
  const diseases = JSON.parse(readFileSync(join(reference, CATALOGUE), "utf8")).diseases ?? [];
  return diseases.flatMap(d => [d.definisi, d.terapi]).filter(text => typeof text === "string").map(text => text.split(/["'\\\n\r`]/)[0].slice(0, 60).trim()).filter(text => text.length >= 30);
}

export function checkLeaks({ root, reference = process.env.SENTRAPEDIA_LEAK_REFERENCE || undefined }) {
  const mode = sampleCatalogue(root) ? "public" : "private";
  const ref = reference ?? (mode === "private" ? root : undefined);
  const findings = [], skipped = [];
  if (ref && ![CATALOGUE, SSOT].every(file => existsSync(join(ref, file)))) findings.push(`reference ${ref} lacks ${CATALOGUE} or ${SSOT}`);
  const usable = ref && !findings.length;
  if (mode === "public") {
    const files = walk(root);
    for (const file of files) {
      if (isPrivate(file) && !isSampleCopy(root, file)) findings.push(`private file in the public tree: ${file}`);
      if ([".json", ".jsonl"].includes(extname(file)) && statSync(join(root, file)).size > MAX_JSON_BYTES) findings.push(`JSON file over 1 MB in the public tree: ${file}`);
    }
    if (usable) {
      const lines = referenceLines(ref);
      for (const file of files.filter(file => TEXT.has(extname(file)) && !isSampleCopy(root, file))) {
        const hits = readFileSync(join(root, file), "utf8").split("\n").filter(line => lines.has(line.trim())).length;
        if (hits) findings.push(`${hits} line(s) of the real SSOT or catalogue in ${file}`);
      }
    } else skipped.push("content lines (set SENTRAPEDIA_LEAK_REFERENCE to the private data folder)");
  }
  // The standalone output nests its own .next (the server code), which is checked too; only node_modules is left out.
  const built = [".next/static", ".next/standalone"].flatMap(folder => walk(join(root, folder), join(root, folder), new Set(["node_modules"])).map(file => `${folder}/${file}`));
  for (const file of built) {
    const inner = file.replace(/^\.next\/standalone\//, "");
    if (file.startsWith(".next/standalone/") && isPrivate(inner) && !isSampleCopy(join(root, ".next/standalone"), inner) && !isSampleCopy(root, inner)) findings.push(`private file in the build: ${file}`);
  }
  if (usable) {
    const needles = catalogueNeedles(ref);
    for (const file of built.filter(file => TEXT.has(extname(file)))) {
      const body = readFileSync(join(root, file), "utf8");
      const hits = needles.filter(needle => body.includes(needle)).length;
      if (hits) findings.push(`${hits} catalogue passage(s) in the build: ${file}`);
    }
  } else skipped.push("catalogue text in the build (no reference)");
  return { mode, reference: ref ?? null, findings, skipped };
}
