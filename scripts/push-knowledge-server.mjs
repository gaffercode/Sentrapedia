// Sends the private runtime data to the beta server (Gaffer, 2026-11-18): the folder the container mounts read-only
// at /data. It writes to the server, so it needs Gaffer's explicit go and refuses to run without --yes:
//   SENTRAPEDIA_SERVER=user@host npm run knowledge:push-server -- --yes
// The server address comes only from the environment. Sends the files the server reads at run time, nothing else
// (not the SSOT or the guideline library), checks them against the manifest first, and checks them again on the
// server after the copy. Data folder: SENTRAPEDIA_DATA_DIR, else this capsule. Target: SENTRAPEDIA_SERVER_DATA_DIR,
// else /opt/sentrapedia/data. Needs ssh and rsync on this machine.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const RUNTIME_FILES = ["theoracle/index/manifest.json", "theoracle/index/chunks.jsonl", "theoracle/index/vectors.f32", "oracle/sentrapedia.json", "aadi/service/data/icd10.json"];
const fail = message => { console.error(`knowledge:push-server: ${message}`); process.exit(1); };
const sha256 = file => new Promise((done, reject) => { const hash = createHash("sha256"); createReadStream(file).on("data", chunk => hash.update(chunk)).on("end", () => done(hash.digest("hex"))).on("error", reject); });

if (!process.argv.includes("--yes")) fail("this writes to the beta server; re-run with --yes once Gaffer has approved it.");
const server = process.env.SENTRAPEDIA_SERVER?.trim();
if (!server || !/^[\w.-]+@[\w.-]+$|^[\w.-]+$/.test(server)) fail("set SENTRAPEDIA_SERVER to the SSH target (user@host or a Host alias from ~/.ssh/config).");
const target = process.env.SENTRAPEDIA_SERVER_DATA_DIR?.trim() || "/opt/sentrapedia/data";
if (!/^\/[\w./-]+$/.test(target)) fail("SENTRAPEDIA_SERVER_DATA_DIR must be an absolute path of letters, digits, '.', '_', '-' and '/'.");
const data = resolve(process.env.SENTRAPEDIA_DATA_DIR?.trim() || process.cwd());

const missing = RUNTIME_FILES.filter(file => !existsSync(resolve(data, file)));
if (missing.length) fail(`${data} lacks ${missing.join(", ")}.`);
const manifest = JSON.parse(readFileSync(resolve(data, "theoracle/index/manifest.json"), "utf8"));
const expected = {};
for (const file of RUNTIME_FILES) expected[file] = await sha256(resolve(data, file));
if (expected["theoracle/index/vectors.f32"] !== manifest.vectors?.sha256) fail("vectors.f32 does not match manifest.vectors.sha256; nothing was sent.");
if (expected["theoracle/index/chunks.jsonl"] !== manifest.chunks?.sha256) fail("chunks.jsonl does not match manifest.chunks.sha256; nothing was sent.");

const run = (program, args) => { const result = spawnSync(program, args, { cwd: data, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", windowsHide: true }); if (result.error || result.status !== 0) fail(`${program} failed (${result.error?.code ?? result.status}).`); return result.stdout; };
run("ssh", [server, `mkdir -p '${target}'`]);
run("rsync", ["-a", "--relative", "--checksum", ...RUNTIME_FILES.map(file => `./${file}`), `${server}:${target}/`]);
const remote = Object.fromEntries(run("ssh", [server, `cd '${target}' && sha256sum ${RUNTIME_FILES.join(" ")}`]).trim().split("\n").map(line => line.trim().split(/\s+\*?/)).map(([hash, file]) => [file, hash]));
const wrong = RUNTIME_FILES.filter(file => remote[file] !== expected[file]);
if (wrong.length) fail(`the server's copy does not match for ${wrong.join(", ")}; the container must not be restarted on it.`);
console.log(`knowledge:push-server: ${RUNTIME_FILES.length} file(s) on ${server}:${target}, SHA-256 checked on the server against the manifest (vectors ${expected["theoracle/index/vectors.f32"].slice(0, 12)}…, chunks ${expected["theoracle/index/chunks.jsonl"].slice(0, 12)}…).`);
