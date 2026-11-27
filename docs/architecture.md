# Sentrapedia — Architecture

The only architecture document, written 2026-11-15 for a new solo maintainer and a non-programmer product owner. It replaces the 2026-10-18 version (in git history). It was built by four read-only investigations (web app, Python engine, knowledge data, build and deploy) and then spot-checked.

## How to read the evidence labels

| Label | Meaning |
| --- | --- |
| **Read** | An investigator opened the code and saw it. File and line are given where useful. About seven of these were re-checked by hand (see the end of section 9). |
| **Inferred** | Concluded from file names, comments, or documents, without reading the code that does it. Treat as a lead, not a fact. |
| **Not looked at** | Nobody opened it. Listed in section 10 so the gap is visible. |

Line numbers drift. Search by function name if a line is off.

---

## 1. What this product is (plain English)

Sentrapedia is a web workspace where a clinician types a patient case **without the patient's identity** and gets back a structured draft: a list of likely diagnoses, suggested work-up, and a suggested therapy. A human clinician must review it.

The key promise is safety around drug doses. Every AI answer is checked against a local library of medical reference text. If the AI names a drug or a dose that cannot be found in that text, the system removes or flags it before the clinician sees it. (Read)

Hard limits (Read unless noted):
- **No patient identity.** Real-looking identifiers (national ID, phone, email, titled names) are rejected in the browser, in the Node server, and again in the Python engine. Since Gaffer's decision of 2026-10-26 the product no longer declares its cases fictional: the case text goes to the model provider under standard retention (`dataPolicy` in `scripts/aadi-runtime.mjs`), so the identity check is the control. Several older documents (`README.md`, `LICENSE`, `docs/data.md`, `docs/auth-beta-access.md`, `capsule.json`) still say "synthetic only"; that wording awaits Gaffer's ruling.
- The Python engine **refuses to start** with `AADI_SERVICE_ENV=production`, because no verifier exists for production use (`aadi/service/settings.py`, `check_startup`).
- It is not an electronic health record, not a validated medical device, and not connected to Indonesian health systems (stated in the previous version of this document; Inferred as still true).

## 2. The big picture

Five moving parts:

| Part | What it is | Where |
| --- | --- | --- |
| **Cockpit** | The browser screen the clinician uses. Cases are saved in the browser itself. | `src/components/`, `src/app/` |
| **Web server** | A Next.js server. Checks who you are, screens the input, and orchestrates a request. | `src/app/api/`, `src/lib/` |
| **AADI** | A small Python (FastAPI) program on the same machine that talks to the AI model. | `aadi/` |
| **TheOracle** | A local searchable library of 17,871 medical passages. Runs on the CPU, no network. | `theoracle/`, `src/lib/theoracle-*.ts` |
| **Gemini** | Google's AI model, the only outside service that sees case text. Every call costs money. | called from `aadi/` |

Three more things hang off the side:
- **Neon Postgres**: optional manual "sync" of workspaces to a server database (Read).
- **Clerk**: sign-in and the beta allow-list (Read).
- **`apps/site/`**: a separate public marketing website in the same folder (section 7).

```
 Browser ──POST /api/aadi──► Next.js server ──► (local) TheOracle search
    ▲                              │                    │ passages
    │                              ▼                    ▼
    │                      AADI (Python, loopback only) ──► Gemini
    │                              │
    └──── result + evidence gate ◄─┘   (gate runs on the server, then again in the browser)
```

## 3. The main entry points

All **Read**.

- **Pages** (`src/app/`): `/` (the workspace), `/agent`, `/onboarding` (consent), `/apply` (the beta waitlist, Clerk `<Waitlist/>`), `/sign-in`, `/sign-up`, `/account`.
- **API routes**:
  - `GET /api/aadi`: health probe, no sign-in needed. It also starts loading TheOracle in the background.
  - `POST /api/aadi`: run an analysis. This is the heart of the product.
  - `GET/POST /api/sync`: pull and push workspaces to the database. Manual, never automatic.
  - `POST /api/onboarding/consent`: record consent.
  - `POST /api/webhooks/clerk`: when Clerk deletes a user, purge their data.
- **Proxy** (`src/proxy.ts`): Next 16's name for middleware. It only attaches the Clerk session and security headers. It does **not** block anyone; each page and route checks access itself.
- **Python engine** (`aadi/service/app.py`): `GET /healthz`, `POST /v1/diagnosis/step`, `POST /v1/therapy/step`.
- **Launcher** (`scripts/run-system.mjs`): starts everything (section 5).

## 4. How data flows: one analysis, start to finish

Read from `src/lib/aadi/client.ts`, `gateway.ts`, `aadi/service/app.py`, `engine.py`.

1. **Browser** validates the case and runs the identity check, then POSTs `{case}`.
2. **Route** checks the user is signed in, verified, and has consented (`getBetaAccess().resolve()`).
3. **Gateway** (`src/lib/aadi/gateway.ts`), in order: checks the request's origin and host; caps the body at 32 KB; re-runs the identity check; enforces a one-at-a-time limit by default; checks the engine is healthy.
4. **TheOracle search**: the case is turned into numbers (an embedding) on the local CPU and compared with all passages. Up to 6 passages come back, at most 2 per document; one of the six is swapped for a passage likely to contain a dose. A passage below the **relevance floor** (`THEORACLE_MIN_SIMILARITY`, cosine similarity, 0.35 since 2026-11-26, chosen by Gaffer from the real-index benchmark: weakest on-topic query 0.3725, strongest of 8 off-topic queries 0.2597; re-check after every index rebuild) is never sent, including the dose passage. When no passage clears it, the search answers `THEORACLE_NO_MATCH`: the gateway returns 422, makes no model call, and the composer shows "Tidak ada bukti di Oracle" with the local SOAP draft as the only offer (no "Coba lagi", since the same text gives the same answer).
5. **Engine call**: the gateway sends case + passages to AADI with a secret token. AADI checks the token, rate limit, size, and runs its own identity scan before any model call.
6. **Model call**: AADI makes up to three raced Gemini calls (diagnosis, work-up, therapy), under a 20-second deadline and a cost cap. It validates the answer against a fixed schema.
7. **Targeted therapy** (on by default): the gateway takes the top diagnosis, searches TheOracle again for treatment passages, and calls AADI a second time. The same floor applies; when no treatment passage clears it, the diagnosis is returned without therapy and the "Cek dosis obat" fold says no relevant therapy reference was found.
8. **Evidence gate** (`src/lib/theoracle-evidence-gate.ts`): removes any drug not named in the passages; flags a dose unless every strength appears in a passage about that diagnosis; drops the whole therapy if the disease codes do not match. It is an exact-text and pattern match, **not** a meaning check.
9. **Response** goes back to the browser, which re-validates it and applies the gate a **second time** before anything becomes a draft.

Where saved state lives (Read):
- **In the browser**: `localStorage` key `sentrapedia-workspace-v2:<userId>`. Not encrypted.
- **In Neon Postgres**, only if the user pushes: tables `profile`, `personal_template`, `workspace_sync`, with row-level security keyed to the signed-in user.
- **In Clerk**: consent and access flags in private metadata.

## 5. Build, test, run

All **Read** from `package.json`, `capsule.json`, `scripts/`, and `.github/workflows/ci.yml`. Nothing here was executed during this review.

**Prerequisites**: Node 24+, Python 3.11, Git LFS, and about 1.2 GB of disk for the embedding model. The search index vectors are *not* in git (section 6).

| Goal | Command | What it really does |
| --- | --- | --- |
| Install | `npm ci --workspaces=false` | Also builds the Python venv and downloads the 1.2 GB model (`postinstall`). `SENTRAPEDIA_SKIP_MODEL=1` and `SENTRAPEDIA_SKIP_AADI=1` skip those. |
| Private data | `SENTRAPEDIA_DATA_DIR` | Folder with `theoracle/index/`, `oracle/sentrapedia.json` and `aadi/service/data/icd10.json`, read at run time (default: the working folder). Not in the public repository. Without it, analysis fails with "Database Oracle belum terpasang di server ini". |
| Run locally | `npm run dev` | Starts the Python engine and Next together on port 3101. Needs `GEMINI_API_KEY` and an auth mode. |
| Unit tests | `npm test` | Vitest for the app, then the site's tests. |
| System tests | `npm run test:system` | Six `node --test` files in `tests/`. |
| Engine tests | `npm run test:aadi` | Python tests through the venv. |
| Everything | `npm run test:all` | All three above. |
| Lint / types | `npm run lint`, `npm run typecheck` | ESLint plus the site's linter; `tsc --noEmit`. |
| Build | `npm run build` | `next build`, copies engine and index into the standalone output, then builds the site. |
| Ship check | `npm run deploy:dry-run` | Read-only, publishes nothing. |

CI (standalone repo only) runs, in order: audit, lint, ruff (a Python linter, no npm script), typecheck, all tests, site checks, build, dry run. A `docker` job then publishes an image on pushes to `main`. The monorepo's own CI never touches `projects/` (Read, per the investigator).

## 6. The knowledge side (the part that is easiest to get wrong)

Read, from `docs/data.md`, `scripts/*theoracle*`, `scripts/knowledge-ssot.mjs`.

There are **three similar names** and they are different things:

| Folder | What it is |
| --- | --- |
| `theoracle/` | The search machinery: the single source of clinical facts (`ssot/`, 335 entries), the guideline-library passages (`theoracle/library/library-chunks.jsonl`, read-only source for the chunk build), the passages (`index/chunks.jsonl`, 17,871), and the embedding model (`model/`, 1.2 GB, gitignored). |
| `oracle/` | The disease catalogue shown in the library screen (329 diseases, derived from the source of facts). Not a search index. |
| `oracle-ii/` | A dead leftover. Two untracked scratch files. Still listed in the private-paths list. |

Rule: **clinical facts are edited only in the SSOT** (`theoracle/ssot/sentrapedia-knowledge-ssot.json`). Everything else is regenerated.

Rebuild order (`npm run knowledge:build`): passages, then vectors, then catalogue. Three hashes must stay in step: the passages file against the manifest, the vectors file against the manifest, and the catalogue against a constant inside `src/lib/theoracle.ts`. The catalogue build **rewrites that source file** as a side effect.

## 7. The five files to read first

1. **`src/lib/aadi/gateway.ts`** (207 lines). The orchestrator for every analysis. Reading it gives you the whole request story and every error code.
2. **`src/lib/theoracle-evidence-gate.ts`** (421 lines). The safety promise lives here. Any dose-related change starts here. It is one function, `applyTherapyGate`, with four callers (section 9).
3. **`aadi/service/engine.py`** (404 lines) with **`app.py`**. The model calls, the cost and time limits, the schema check.
4. **`scripts/run-system.mjs`** (128 lines). Explains how the Python and Node halves are started, wired by a random token, and restarted. Windows needs a special guardian process (`aadi/managed_child.py`).
5. **`src/lib/theoracle-grounding.ts`** (262 lines). How a case becomes passages. The investigators read only parts of it for retrieval details, so confirm before relying on specifics.

Honourable mention (Inferred, only its size was checked): `src/components/workspace.tsx`, the browser coordinator.

## 8. Conventions

- **Naming and folders** (Read): kebab-case files; `src/lib/<domain>/` with `contract.ts`, `types.ts`, `client.ts`; flat `src/components/`; flat `tests/` with `ui/*.test.tsx` and `*.node-test.mjs`. Python: `aadi/service/`, `aadi/common/`.
- **Errors** (Read): codes are UPPER_SNAKE (`PII_DETECTED`, `BUDGET_EXHAUSTED`, `CONTRACT_MISMATCH`). Failures return a `Response` instead of throwing. User-facing text is Indonesian. Validators are hand-written, not a schema library. The Python engine reports failures as HTTP 200 with `status:"unavailable"`; the gateway translates them.
- **Style** (Read): dense one-line functions with long dated comments. Comments often cite "row N" of `docs/TECH-DEBT.md` or a decision "by Gaffer, date".
- **Commits** (Read from git log): `type(scope): message (R#)`, for example `feat(starkes): ... (R2)`. This capsule is risk tier R2. The tier definitions live at the monorepo root and were not read.
- **Handoff rules** (Read, `AGENTS.md`): `.agents/HANDOFF.md` keeps the newest five entries; older ones move verbatim to the archive. Cite only evidence tracked in git.
- **Next.js warning** (Read, `AGENTS.md`): this Next version differs from older ones. Read `node_modules/next/dist/docs/` before changing framework-level code.

## 9. Fragile, undocumented, or surprising

### Things you need owner approval for (Read)
Pushing the split to the standalone repo, opening PRs, sending the private data to the server (`knowledge:push-server -- --yes`), Clerk production changes, Cloudflare Access changes, and `npm run beta:access` (changes live accounts; the approval requirement for this one is Inferred).

### Documentation that is out of date
- `docs/TECH-DEBT.md` was formally closed on 2026-10-19. Several rows (3, 4, 16) describe problems fixed later. New open items live in `.agents/HANDOFF.md`, which was only skimmed.
- `docs/data.md` chunk counts were confirmed on 2026-11-15: the chunk build reports 2,285 SSOT chunks and 15,586 library chunks, 17,871 in total.

### Behaviour that may surprise you
- **Admission is gated by Clerk's Waitlist mode in the Dashboard, not by code.** The code treats a missing `sentrapediaBetaAccess` flag as allowed by design (`docs/specs/2026-10-23-clerk-beta-access-design.md` section 3), so the gate is only as good as the Dashboard setting, which the code cannot show.
- `GET /api/aadi` needs no sign-in and triggers a model warm-up. It returns configuration flags only (Read).
- The workspace page is rendered with `key={randomUUID()}`, so it remounts on every server render (Read, confirmed by hand).
- The engine URL must be loopback http. Engine, search index and model must live on **one machine**, so this cannot run on serverless hosting (Read).
- The concurrency limit is per process. Several server instances each get their own (Read).
- A saved browser workspace that fails validation is kept under `sentrapedia-workspace-v2:<userId>:unreadable` and offered as a download (`src/lib/workspace-session.ts` writes the copy, `src/components/workspace-hooks.ts` holds it, the account dialog in `src/components/workspace-dialogs.tsx` offers the download; Read). TECH-DEBT row 14, which says it is silently replaced, is stale.

### Money and time
- Cost caps: $0.10 per step and $5 per day, set by the launcher. The engine's own default is $0.50 per step. Cost is **estimated** from a price table because Gemini returns none, so the real bill can be higher; an unpriced model is billed at a pessimistic price and the app refuses to start with one (Read).
- Timeouts: 20 s per engine step; the gateway allows about 65 s with targeted therapy; 15 s for retrieval.
- Do not run the paid eval script (`eval-theoracle-pipeline.mjs`) casually; it spends real model money.

### Data and sync hazards
- Library passages now have their own source file, `theoracle/library/library-chunks.jsonl` (2026-11-15); the ten excluded PDFs were not restored.
- New vectors exist only on your machine until published. Pushing a commit whose manifest points at an unpublished asset breaks CI and the beta server (Read).
- `chunks.jsonl` is 27.9 MB of plain git; each rebuild grows history.
- The identity-detection patterns are duplicated in Node and Python, with a parity fixture. Drift risk (Read).
- TECH-DEBT row 18 is stale: there is one `applyTherapyGate` in `src/lib/theoracle-evidence-gate.ts`, called from `gateway.ts`, `client.ts`, `presentation.ts` and `analysis-view.ts`, so a stored draft is re-gated on read.
- `personal_template` and some `profile` fields have no readers or writers in `src/` (Read by grep); only `profile` is upserted, by sync.
- `tests/theoracle-aadi.test.ts` hashes the engine schemas, so a schema change also needs a hash update. The engine's prompts are kept byte-identical to upstream with hash tests, which makes edits awkward (Read).

### Deployment traps
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is baked in at build time. An image built without it returns 503 on every path (Read).
- Native binaries (onnxruntime, sharp) match the build platform. Build on Linux via Docker for deployment (Read).
- Docker's dependency stage must copy specific `apps/site` files because `postinstall` reads them. This broke once (Read).
- The Python install stamp hashes only `requirements.lock`; changing the test lock does not trigger a reinstall (Read).
- `.npmrc` sets `audit=false`; CI's audit is the only one.

### Leftovers and naming noise
- `.runtime/aadi-deepseek/audit` is from an older DeepSeek-era setup. The data-policy name `openai-standard-retention` is misleading; the provider is Google.
- The SSOT still carries an `oracle_ii` / "PNPK" source label for the dead `oracle-ii` data.
- 35 `.gz` files are in Git LFS but no pattern in the capsule's `.gitattributes` matches them (Inferred: a root rule).
- `gh` on the dev machine had an invalid token at last report, so PRs were opened by the owner.

### Open items recorded by earlier sessions (skimmed, not re-verified)
The live engine with `ageYears: null`; Clerk passkeys, webhook and account page against a live instance; the deletion webhook returns 503 without `CLERK_WEBHOOK_SIGNING_SECRET`; the beta server has no registry login so it builds locally; a real end-to-end registration test is pending.

### Hand re-checks done for this document
Storage key `-v2:<userId>`; `GET /api/aadi` warm-up without auth; `key={randomUUID()}` in `page.tsx`; the missing-flag-allowed rule in `policy.ts`; loopback-only engine URL in `gateway.ts`; file sizes quoted in section 7; one `applyTherapyGate` definition with four callers; the unreadable-workspace backup in `workspace-hooks.ts`.

## 10. What this review did not look at

- The contents of `tests/` and the engine's `aadi/service/tests/`, so test coverage and quality are unknown.
- `aadi/service/postchecks.py`, `contract.py`, `auth.py`, `common/providers.py`, and most of `managed_child.py`.
- The ICD-matching helpers in the evidence gate and `src/lib/sync/guard.ts` (how clinical data is screened before it is sent to Neon).
- `src/components/workspace.tsx` and the other UI components beyond file listings.
- `.env.local`, `.env.example` values, and any secrets: deliberately not opened.
- `apps/site/` internals beyond its guidance file; the monorepo root's R0-R3 definitions.
- Whether any command in section 5 actually succeeds today. None was run.
