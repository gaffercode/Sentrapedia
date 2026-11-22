# Sentrapedia data

Sentrapedia's local workspace needs no database server to run. Its data comes from four places. Neon Postgres holds two further things when `SENTRAPEDIA_DATABASE_URL` is set: the optional sync of the workspace (`src/lib/sync/`), and the analysis limits of the gated beta (`src/lib/aadi/limits-store.ts`: a count per person per day and the day's spend, no case text). A deployed instance in Clerk mode refuses analyses without that database.

## Browser storage

- `sentrapedia-workspace-v2:<userId>` (localStorage, one key per signed-in account): patients, encounters, drafts and settings for the workspace.
- The sidebar "Masukan" box keeps nothing in the browser: since 2026-11-19 the note is sent to the `workspace_feedback` table (`db/migrations/0005_workspace_feedback.sql`) and the box empties only once the server keeps it.

The storage is unencrypted. Record cases without patient identity: no names, identity numbers or contact details. The account dialog can export a backup or clear all local records.

### Format changes

A saved workspace that fails validation is kept under `sentrapedia-workspace-v2:<userId>:unreadable` and offered as a download, never discarded. A change to the stored format must not rely on that:

- A new format gets a new key (the version after the current `sentrapedia-workspace-v2:<userId>`) and reads the previous blob through `parseWorkspace`, then migrates it in memory. The previous blob stays untouched, so rolling back to an older build still finds its data.
- A renamed mode maps the old id to the new one before validation instead of rejecting the message.
- Every file in `tests/fixtures/workspace/` must keep parsing (`tests/workspace-fixtures.test.ts`); add a fixture for each shape a release writes.
- Ship the reader before the writer: one release reads the new format while still writing the old one.

The full plan is `docs/plans/active/2026-10-19-workspace-v2-migration.md`.

## Bundled reference data

- `oracle/sentrapedia.json`: the disease catalogue (`metadata`, `categories`, `diseases`), read on the server by `src/lib/theoracle-catalogue.ts` from the data folder (`SENTRAPEDIA_DATA_DIR`, 2026-11-18) and never bundled into browser code. The browser gets the id, name, code and category of every entry from `/api/theoracle/index` (for the evidence gate and the names in a draft), at most 20 entries per search from `/api/theoracle/search`, one full record per click from `/api/theoracle/disease/<id>` (300 per person per Asia/Jakarta day), and the full records an analysis cites with the `/api/aadi` answer. All four routes require a signed-in session. It is derived from the knowledge SSOT by `scripts/build-oracle-catalog.mjs`, which also writes its SHA-256 into `src/lib/theoracle.ts`; do not edit it by hand. Each disease's `kategori` is the ICD-10 (WHO 2010) chapter of its first code, 21 categories (SSOT, 2026-10-24); the source category is kept in `kategori_sumber_lama`.
- Earlier forms of the same data (`oracle/diseases.json`, `oracle/diseases-data.ts`, `oracle/data.ts`) were removed on 2026-10-17 (tech-debt row 20); git history keeps them.

- `aadi/service/data/icd10.json`: the ICD-10 code list the AADI engine checks codes against. Private since 2026-11-18 (its redistribution licence is unverified, see `aadi/service/data/SOURCE.md`); the engine reads it from the data folder and refuses a step with "Daftar ICD-10 belum terpasang di server ini" without it.

The reference data is read at run time and never copied into a build or an image. The app does not change it.

## TheOracle

Structured clinical facts live only in `theoracle/ssot/sentrapedia-knowledge-ssot.json` (the SSOT); guideline PDF texts are the citation library. Both feed one index through `npm run knowledge:build`, which runs `scripts/build-theoracle-chunks.mjs`, `scripts/build-theoracle-index.mjs` and `scripts/build-oracle-catalog.mjs` in that order (2026-10-21). Nothing clinical is edited anywhere else.

- `theoracle/index/chunks.jsonl`: 17,871 chunks. 2,285 come from the SSOT v0.6 (origin `ssot`, one document per entry: name, alias, ICD-10, competence, definition, symptoms, diagnosis, therapy text per source, one line per dose statement with context, source, page and the guideline quote (`kutipan`); a cross-referenced dose (`sumber` "rujukan silang") also carries its `catatan`, identical statements from several sources share one line, and auto-extracted rows whose "obat" is a statistic or lab value are left out; referral; split at 2048 characters with overlap 20, the disease name in every chunk). 15,586 are guideline-PDF chunks read from `theoracle/library/library-chunks.jsonl` (the TheOracle LanceDB export, kept as its own tracked private file since 2026-11-15; the builder only reads it); a title in `EXCLUDED_LIBRARY_PDFS` (10 PDFs that are not Indonesian clinical guidance) is left out of the index but stays in that file (none of the ten excluded titles is in it today). Each record has `origin` and `textSha256`.
- `theoracle/library/library-chunks.jsonl`: the guideline-library passages, one JSON record per line. Private data, read-only for `scripts/build-theoracle-chunks.mjs`; nothing rebuilds it, so a change to it is a change to the knowledge.
- `theoracle/index/manifest.json`: the model id, revision, file hashes, prefixes, chunk and vector hashes and `indexSha256`. Tracked in git, and it is what pins the index.
- `theoracle/index/vectors.f32`: one L2-normalised 768-dimension EmbeddingGemma-300m vector per chunk. **Not in git** since 2026-10-25: every rebuild stored a whole new 53 MB Git LFS object against a 10 GiB per-account quota. Since 2026-11-18 it no longer comes from a GitHub release either: it lives in the private data folder with the rest of the index, and `src/lib/theoracle-grounding.ts` accepts it only if its SHA-256 equals `manifest.vectors.sha256`.
- `theoracle/model/`: the pinned ONNX model, installed by `scripts/install-theoracle-model.mjs` (postinstall) and checked by SHA-256. Not in git.

`src/lib/theoracle-grounding.ts` verifies the manifest hashes, embeds the query locally with the same model and returns at most six passages (two per document). Rebuild everything with `npm run knowledge:build` after changing the SSOT (`node scripts/build-theoracle-index.mjs --device dml` embeds on the GPU when the chunks are already written).

After a rebuild the new index exists only on the machine that built them. `npm run knowledge:push-server -- --yes` (Gaffer's go; `SENTRAPEDIA_SERVER` names the SSH target) sends the runtime files (the index, the catalogue and the ICD-10 list) to the beta server's data folder over SSH and checks their SHA-256 there against the manifest. It never sends the SSOT or the library.

## AADI service

`src/app/api/aadi/route.ts` forwards case reviews to the bundled `aadi/service` started by `scripts/run-system.mjs`. The supervisor supplies its private loopback URL and token to the server; the browser never sees the token. The request/response schemas remain in `src/lib/aadi/` and `aadi/service/contract/`. TheOracle retrieval validates index and model hashes before forwarding evidence. Since 2026-11-17 (Gaffer, as in Glass Health) the case is sent as typed: `containsIdentity()` in the app and `pii_kinds()` in the engine no longer screen it, and since 2026-10-26 no header declares a case synthetic. `.env.example` names the server-side provider key; no external AADI folder is needed. See `docs/aadi-integration.md`.

## Public code, private data

Gaffer's decision of 2026-10-19: the code may be published under the royalty licence in `LICENSE`; the database stays private.

- `scripts/private-data.mjs` lists what is private: the knowledge base (`theoracle/ssot/`, `theoracle/index/`, `theoracle/library/`, `oracle/sentrapedia.json`, `oracle-ii/`), the ICD-10 list (`aadi/service/data/icd10.json`), the verification evidence, the internal notes and the beta server setup, and since 2026-11-18 the internal documents (security, operations, architecture decisions, plans, specs, engineering, governance, product, integrations, the design audit and the tech-debt register).
- `npm run export:split -- <empty folder outside the capsule>` copies the tracked files into `<folder>/public` (code, with `oracle/sentrapedia.sample.json` and `aadi/service/data/icd10.sample.json` in place of the catalogue and the ICD-10 list) and `<folder>/data` (the private files at the same paths). `theoracle/index/vectors.f32` is untracked, so it is copied from the working tree instead; the script warns if it is not there. It stops if a file is still a Git LFS pointer. Daily work in the monorepo is unchanged.
- Without the data, the app builds and runs: the library shows the fictional sample, analyses answer "Database Oracle belum terpasang di server ini. Analisis tidak dijalankan.", and tests that need the real catalogue or index are skipped (`tests/private-data.ts`).
- With the data: the server reads it at run time from `SENTRAPEDIA_DATA_DIR` (default: the working folder, so a capsule checkout that holds the data works unchanged). The beta container mounts `/opt/sentrapedia/data` read-only at `/data`. The data is never copied into a build or a Docker image; `npm run deploy:dry-run` runs `scripts/leak-guard.mjs`, which fails on a private file or catalogue text in a public tree or in any build.

## Account database on your own machine

The local workspace runs without any database. The account database matters only when Clerk sign-in is on (analysis limits, feedback) or workspace sync is switched on. To build an empty copy of it on your own machine you need PostgreSQL 16 and `psql`. The commands below are written for a POSIX shell (Git Bash works on Windows) and were checked on PostgreSQL 16.

1. Create an empty database and name the owner connection. The owner runs migrations only:

   ```bash
   createdb -U postgres -h 127.0.0.1 sentrapedia_local
   export OWNER_URL=postgres://postgres@127.0.0.1:5432/sentrapedia_local
   ```

2. Apply every migration in name order:

   ```bash
   for file in db/migrations/*.sql; do psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q -f "$file"; done
   ```

   The first migration creates the role `sentrapedia_runtime`, which owns nothing and cannot bypass row-level security.

3. Give that role a password that exists only on this machine. Type it at the prompt; never write it in a tracked file:

   ```bash
   psql "$OWNER_URL" -c "\password sentrapedia_runtime"
   ```

4. Optional: add the dummy rows from `db/seed.dev.sql` (one fictional account with one template; safe to run twice). The seed stops when the database already holds other accounts and its name does not say local, test, qa, dev, review or sandbox:

   ```bash
   psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q -f db/seed.dev.sql
   ```

5. Point the app at the database as the runtime role, in `.env.local` (git-ignored). Replace the placeholder with the password from step 3:

   ```bash
   SENTRAPEDIA_DATABASE_URL=postgres://sentrapedia_runtime:<local-password>@127.0.0.1:5432/sentrapedia_local
   ```

6. Check the isolation. Connected as `sentrapedia_runtime`, an account sees only its own rows:

   ```sql
   begin; select set_config('app.user_id', 'user_seed0001', true); select count(*) from profile; commit;  -- 1
   begin; select set_config('app.user_id', 'user_other0001', true); select count(*) from profile; commit; -- 0
   ```

Never point `OWNER_URL` or the seed at the production database. `tests/local-database.test.ts` keeps this section and the seed in step with the migrations; it reads the files as text and needs no database server. What is not covered here: the app talking to this database end to end, which needs Clerk sign-in.

## When analyses answer "Pencatat batas pemakaian belum tersedia"

In Clerk mode every analysis first counts against the daily quota and the shared budget in the account database (`src/lib/aadi/limits.ts`). When that count cannot be made, the analysis is refused with 503 `LIMITS_UNAVAILABLE` and nothing runs. The readiness probe (`GET /api/aadi`) only checks that `SENTRAPEDIA_DATABASE_URL` and `SENTRAPEDIA_USER_DAILY_ANALYSES` are set, not that the database answers, so it can report `ready: true` while every analysis is refused.

Each refusal writes one log line `{"event":"aadi.limits","level":"error","stage":"admit","code":"…"}` with no case text. The code says what to fix:

| `code` | Meaning | Fix |
| --- | --- | --- |
| `NO_STORE` | `SENTRAPEDIA_DATABASE_URL` is not set in the running container. | Set it to the pooled URL of the `sentrapedia_runtime` role and restart. |
| `NO_PRINCIPAL` | The signed-in session has no usable account id. | Check the Clerk instance and keys; this should not happen with Clerk's own ids. |
| `42P01` | A table is missing: a migration was not applied to this database. | Apply the missing files of `db/migrations/` in name order as the owner role, never as the runtime role. |
| `42501` | The runtime role lacks a grant on a table. | Re-apply the migration that creates the table; its `grant` gives the role access. |
| `28P01`, `28000` | The runtime role's password or name is wrong. | Correct the URL, or reset the password as the owner. |
| `ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT` | The container cannot reach the database host. | Check the host in the URL and the server's outbound network. |
| `UNKNOWN` | Any other failure. | Read the database's own logs for the same minute. |

To check which tables exist, run this in the database's SQL editor. Every row should say `true`:

```sql
select t, to_regclass('public.' || t) is not null as present
from unnest(array['profile', 'personal_template', 'workspace_sync', 'analysis_usage', 'analysis_budget_day', 'output_report', 'workspace_feedback']) as t;
```
