// Repository contract for environment and ignore rules. Everything here is judged from this capsule alone:
// files are read from disk, and the ignore rules are tested in an empty temporary repository, so the result
// is the same in a standalone clone, in an exported tree without `.git`, and inside a larger repository.
// 1. Every environment variable the Node side reads (the workspace in src/, the launcher and operator
//    scripts in scripts/, the marketing site in apps/site/) is named in .env.example, so a new setting cannot
//    ship undocumented. The Python engine's AADI_* settings are not listed there on purpose: the launcher
//    builds that environment (scripts/aadi-runtime.mjs, pinned by tests/system-runtime.node-test.mjs).
// 2. .env.example carries no value for a key, token, secret or password.
// 3. .gitignore keeps local env files, databases, dumps, backups and key files out of Git.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const NODE_SIDE_ROOTS = ["src", "scripts", "apps/site"];
const SOURCE_FILE = /\.(?:ts|tsx|mjs|js|cjs)$/;
// Dependencies, build output and caches: never the capsule's own source.
const NOT_SOURCE_DIR = /(?:^|\/)(?:node_modules|\.next|\.runtime|\.vercel|coverage|dist)$|^apps\/site\/site$/;
const NOT_RUNTIME = /(?:^|\/)(?:tests?|static|vendor|reference|refactor-evidence)\/|\.(?:test|spec)\.|node-test/;
// Set by Node, npm, the operating system or the CI host, never by a developer's env file.
const PLATFORM = /^(?:NODE_ENV|CI|PATH|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|SYSTEMROOT|TEMP|TMP|NEXT_RUNTIME|GITHUB_[A-Z_]+|VERCEL(?:_[A-Z_]+)?)$/;

function nodeSideFiles(relative) {
  if (NOT_SOURCE_DIR.test(relative) || !existsSync(join(root, relative))) return [];
  const found = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...nodeSideFiles(path));
    else if (SOURCE_FILE.test(entry.name) && !NOT_RUNTIME.test(path)) found.push(path);
  }
  return found;
}

function variablesReadByNodeSide() {
  const names = new Map();
  for (const file of NODE_SIDE_ROOTS.flatMap(nodeSideFiles).sort()) {
    const text = readFileSync(join(root, file), "utf8");
    for (const [, dotted, bracketed] of text.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\[["']([A-Z][A-Z0-9_]*)["']\])/g)) {
      const name = dotted ?? bracketed;
      if (!PLATFORM.test(name) && !names.has(name)) names.set(name, file);
    }
    // const { A, B: alias } = process.env
    for (const [, body] of text.matchAll(/\{([^{}]*)\}\s*=\s*process\.env\b/g)) {
      for (const part of body.split(",")) {
        const name = part.split(/[:=]/)[0].trim();
        if (/^[A-Z][A-Z0-9_]*$/.test(name) && !PLATFORM.test(name) && !names.has(name)) names.set(name, file);
      }
    }
  }
  return names;
}

const envExample = () => readFileSync(join(root, ".env.example"), "utf8");

// The capsule's own ignore files are judged alone. Asked in place, Git would also apply the rules of any
// repository that encloses this folder and the developer's global excludes; the capsule must not lean on either.
const IGNORE_FILES = [".gitignore", "apps/site/.gitignore"];
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
const skip = spawnSync("git", ["--version"], { env: gitEnv }).status !== 0 && "git is not installed";

function ignoredByThisCapsule(paths) {
  const sandbox = mkdtempSync(join(tmpdir(), "capsule-ignore-"));
  try {
    spawnSync("git", ["init", "--quiet"], { cwd: sandbox, env: gitEnv });
    for (const file of IGNORE_FILES) {
      if (!existsSync(join(root, file))) continue;
      mkdirSync(dirname(join(sandbox, file)), { recursive: true });
      copyFileSync(join(root, file), join(sandbox, file));
    }
    const ask = path =>
      spawnSync("git", ["-c", "core.excludesFile=", "check-ignore", "--quiet", "--no-index", path], { cwd: sandbox, env: gitEnv }).status === 0;
    return paths.filter(ask);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

test(".env.example names every environment variable the Node side reads", () => {
  const example = envExample();
  const read = variablesReadByNodeSide();
  assert.ok(read.size > 0, "no environment variable found: the scan is not looking at the Node side");
  const missing = [...read]
    .filter(([name]) => !new RegExp(`\\b${name}\\b`).test(example))
    .map(([name, file]) => `${name} (${file})`)
    .sort();
  assert.deepEqual(missing, []);
});

test(".env.example holds no value for keys, tokens, secrets or passwords", () => {
  const filled = [...envExample().matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=(.*)$/gm)]
    .filter(([, name, value]) => /KEY|TOKEN|SECRET|PASSWORD/.test(name) && value.trim() !== "")
    .map(([, name]) => name);
  assert.deepEqual(filled, []);
});

test(".gitignore keeps local env files, databases, dumps, backups and keys out of Git", { skip }, () => {
  const mustBeIgnored = [
    ".env",
    ".env.local",
    ".env.production",
    "apps/site/.env",
    ".neon",
    "data.sqlite",
    "local.db-wal",
    "local.sqlite-journal",
    ".envrc",
    "dump.sql",
    "prod-backup.sql",
    "local.sqlite3",
    "dev.db",
    "prod.dump",
    "db.bak",
    "backup.sql.gz",
    "backups/2026-11-21.sql",
    "server.pem",
    "private.key",
    "id_rsa",
    "service-account.json",
    ".vercel/project.json",
  ];
  const ignored = ignoredByThisCapsule(mustBeIgnored);
  assert.deepEqual(mustBeIgnored.filter(path => !ignored.includes(path)), []);
});

test(".gitignore still lets .env.example and the SQL migrations be committed", { skip }, () => {
  // A migration or a route whose name merely contains "backup" or "dump" must not vanish from Git.
  assert.deepEqual(ignoredByThisCapsule([".env.example", "db/migrations/0001_account_and_templates.sql", "db/migrations/0006_backup_codes.sql", "src/app/backups/page.tsx", "src/dumps/index.ts"]), []);
});
