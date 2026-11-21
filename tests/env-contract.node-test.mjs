// Repository contract for environment and ignore rules.
// 1. Every environment variable the Node side reads (the workspace in src/, the launcher and operator
//    scripts in scripts/, the marketing site in apps/site/) is named in .env.example, so a new setting cannot
//    ship undocumented. The Python engine's AADI_* settings are not listed there on purpose: the launcher
//    builds that environment (scripts/aadi-runtime.mjs, pinned by tests/system-runtime.node-test.mjs).
// 2. .env.example carries no value for a key, token, secret or password.
// 3. .gitignore keeps local env files, databases, dumps, backups and key files out of Git.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
const insideGit = git("rev-parse", "--is-inside-work-tree").status === 0;
const skip = !insideGit && "not a Git checkout";

const NODE_SIDE = /^(?:src|scripts|apps\/site)\/.+\.(?:ts|tsx|mjs|js|cjs)$/;
const NOT_RUNTIME = /(?:^|\/)(?:tests?|static|vendor|reference|refactor-evidence)\/|\.(?:test|spec)\.|node-test/;
// Set by Node, npm, the operating system or the CI host, never by a developer's env file.
const PLATFORM = /^(?:NODE_ENV|CI|PATH|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|SYSTEMROOT|TEMP|TMP|NEXT_RUNTIME|GITHUB_[A-Z_]+|VERCEL(?:_[A-Z_]+)?)$/;

function variablesReadByNodeSide() {
  const names = new Map();
  for (const file of git("ls-files").stdout.split("\n")) {
    if (!NODE_SIDE.test(file) || NOT_RUNTIME.test(file)) continue;
    const text = readFileSync(join(root, file), "utf8");
    for (const [, dotted, bracketed] of text.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\[["']([A-Z][A-Z0-9_]*)["']\])/g)) {
      const name = dotted ?? bracketed;
      if (!PLATFORM.test(name) && !names.has(name)) names.set(name, file);
    }
  }
  return names;
}

const envExample = () => readFileSync(join(root, ".env.example"), "utf8");
const isIgnored = path => git("check-ignore", "--quiet", "--no-index", path).status === 0;

test(".env.example names every environment variable the Node side reads", { skip }, () => {
  const example = envExample();
  const missing = [...variablesReadByNodeSide()]
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
  assert.deepEqual(mustBeIgnored.filter(path => !isIgnored(path)), []);
});

test(".gitignore still lets .env.example and the SQL migrations be committed", { skip }, () => {
  assert.deepEqual([".env.example", "db/migrations/0001_account_and_templates.sql"].filter(isIgnored), []);
});
