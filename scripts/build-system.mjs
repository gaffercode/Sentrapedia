import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "build"], { cwd: root, stdio: "inherit", windowsHide: true });
if (result.error || result.status !== 0) process.exit(result.status || 1);
const output = resolve(root, ".next/standalone");
mkdirSync(resolve(output, "scripts"), { recursive: true });
// The private ICD-10 list and upstream's private design notes stay out (2026-11-18); the engine reads the list from
// SENTRAPEDIA_DATA_DIR at run time.
cpSync(resolve(root, "aadi"), resolve(output, "aadi"), { recursive: true, filter: file => !/[\\/](?:__pycache__|\.pytest_cache)(?:[\\/]|$)|[\\/]service[\\/](?:data[\\/]icd10\.json|DESIGN\.md)$/.test(file) });
for (const name of ["run-system.mjs", "aadi-runtime.mjs", "aadi-profile.json", "install-aadi.mjs"]) cpSync(resolve(root, "scripts", name), resolve(output, "scripts", name));
// The fictional catalogue the server falls back to when the data folder has none (src/lib/theoracle-catalogue.ts).
cpSync(resolve(root, "oracle/sentrapedia.sample.json"), resolve(output, "oracle/sentrapedia.sample.json"));
// TheOracle: only the pinned local embedding model the retriever loads from cwd. The index is private data and is
// never part of a build (2026-11-18); the server reads it from SENTRAPEDIA_DATA_DIR and answers
// "Database Oracle belum terpasang" without it. SENTRAPEDIA_SKIP_MODEL=1 installs leave the model out; such a build
// cannot run an analysis either.
const copied = [];
if (!existsSync(resolve(root, "theoracle/model"))) console.warn("Sentrapedia: model embedding TheOracle tidak terpasang; build ini tidak dapat menjalankan analisis.");
else {
  cpSync(resolve(root, "theoracle/model"), resolve(output, "theoracle/model"), { recursive: true, filter: file => !/\.partial$/.test(file) });
  copied.push("model");
}
cpSync(resolve(root, ".next/static"), resolve(output, ".next/static"), { recursive: true });
if (existsSync(resolve(root, "public"))) cpSync(resolve(root, "public"), resolve(output, "public"), { recursive: true });
console.log(`Sentrapedia: standalone output mencakup engine AADI${copied.length ? `, ${copied.join(" + ")} TheOracle` : ""}, dan unified launcher.`);
