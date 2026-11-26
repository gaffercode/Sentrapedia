# Sentrapedia testing

What tests exist, what they cover, what they do not cover, and how to run them. All commands run from the capsule root and need the capsule-owned Node and Python runtimes installed by `npm ci --workspaces=false` (see DEVELOPMENT (private, not in the public repository)). Acceptance gates and dated results are in VERIFICATION (private, not in the public repository). The tests use invented cases only, never real records, and none of them calls a live model or a live AADI service.

```powershell
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src, tests, scripts and vitest.config.ts, then the site's syntax lint
npm run test:all    # Vitest app tests, the site's node tests, supervisor checks and bundled AADI mocked tests
npm run build       # Next standalone output plus bundled engine/launcher
npm run deploy:dry-run
```

[project.contract.json](../project.contract.json) is the canonical lifecycle contract. `npm test` runs Vitest (exclusions in [vitest.config.ts](../vitest.config.ts): runtime backups and `apps/site`) and then the site's own `node --test` suite, described in [the site testing note](../apps/site/docs/testing.md). `npm run test:system` runs Node lifecycle, profile and script checks; `npm run test:aadi` runs the bundled Python service tests with mock provider clients, including source/snapshot hash and pinned dependency checks. The inherited optional Med Assist source-copy check remains skipped unless its source path is explicitly supplied; it is not required for capsule independence.

Tests import application code from `../src/`. `tests/theoracle-aadi.test.ts` reads the AADI schemas from `src/lib/aadi/` and checks their SHA-256 hashes, so a schema change also needs a hash update.

## Test taxonomy

| Layer | Runner and command | Files | Environment |
| --- | --- | --- | --- |
| App tests | Vitest 5 (`vitest run`, the first half of `npm test`) | 42 `*.test.ts[x]` files in `tests/` and 17 in `tests/ui/` | Node by default; jsdom where a file starts with the `@vitest-environment` docblock (all of `tests/ui/`, plus a few others) |
| System tests | `node --test`, `npm run test:system` | Nine `tests/*.node-test.mjs` files, named one by one in `package.json` | Plain Node; some build temporary capsules, local HTTP stubs or temporary git repositories |
| Site tests | `npm --prefix apps/site test` (second half of `npm test`): builds the site, then `node --test` in `apps/site` | 8 files in `apps/site/tests/`, 13 `*.test.mjs` files in `apps/site/scripts/` | Built-in Node modules only |
| Engine tests | `npm run test:aadi` runs `scripts/test-aadi.mjs`, which starts the venv Python on `aadi/test.py`, which runs pytest on `aadi/service/tests` | 9 files | Python 3.11 venv in `.runtime/aadi/venv`, model client always a fake |
| Static gates | `lint`, `typecheck`, ruff, `npm audit`, `deploy:dry-run`, `site:verify`, `site:docs` | not test files | see VERIFICATION (private, not in the public repository) |

Static declaration counts (a text search for `it(`/`test(` and `def test_`, not run results): about 600 declared blocks in the Vitest files and 150 in the Python files. Parametrised and generated cases make real counts higher. Use the runner's own totals when you need numbers.

## Inventory: Vitest app tests (`tests/`)

| Area | Files | Covers |
| --- | --- | --- |
| Gateway and AADI client | `aadi-client`, `aadi-pipeline`, `aadi-paid`, `aadi-beta-access`, `aadi-composer`, `theoracle-aadi` | `src/lib/aadi/`: the gateway as the trust boundary (origin and host checks, body size, single-flight and `maxConcurrent`, timeout, cancellation, grounding required before retrieval and inference, no inference after a no-match), the targeted therapy second step, client-side validation and identity checks, case assembly from the composer, contract and schema validation with the schema hashes, and the draft built from a result. Gateways get a fake `fetchFn` and fake retrievers, so nothing leaves the process. `aadi-paid` is named for the paid profile but is mocked |
| Evidence gate and presentation | `theoracle-evidence-gate` (the largest file), `diagnosis-presentation`, `analysis-view` | `applyTherapyGate`: dose forms (tablet and capsule counts, percent, per-kg, ranges, Unicode minus, unit stripping), cross-referenced SSOT doses, OAT abbreviations; the six-section document, doctor summary, copy and referral text, pipeline trace, and how stored results are re-gated for display |
| Retrieval | `theoracle-grounding`, `public-data`, `icd-name-match`, `guards`, `pii-parity` | Retrieval over a small index the test generates in a temporary folder with a fake embedder (two-per-document cap, dose-passage swap, relevance floor and its no-match answer, privacy filter, tampered or incomplete index refused, warm-up). One test uses the real index and the local model. The public build without the database, the eval ICD name matcher, shared shape guards, and the client side of the identity parity rows |
| Closed beta and auth | `beta-auth`, `beta-auth-routes`, `beta-auth-proxy`, `beta-auth-pages.test.tsx`, `auth-headers`, `clerk-webhook`, `user-access-flow.test.tsx` | Configuration resolution, server-owned access and consent decisions, `/api/aadi` authorization, proxy behaviour and browser hardening, the CSP, the `user.deleted` webhook, and the self-service access flow, including the `/apply` waitlist page. Clerk and Next modules are replaced with `vi.mock` |
| Workspace data | `workspace`, `workspace-session`, `workspace-storage`, `workspace-fixtures`, `workflow` | The reducer, validation, restore and the unreadable-backup path, principal-owned storage keys, frozen saved workspaces, personal templates, revisions and review guards, keyboard shortcuts |
| Sync | `sync-guard`, `sync-merge`, `sync-messages`, `sync-principal`, `sync-schema` | De-identified projection before upload, add-only merge on pull, Indonesian messages, the sync principal, and the SQL migrations read as text (forced row-level security, a non-owner runtime role, the exact table set). No database is contacted |
| Local database | `local-database` | `db/seed.dev.sql` writes only to tables the migrations create, seeds only the fictional account inside a transaction that names it as the principal and can run twice; `docs/data.md` keeps the step-by-step setup |
| Drafting and templates | `studio`, `hpi-draft`, `other-notes`, `normal-exam` | Modes and intent groups, template pack, local note builders, Indonesian wording, normal-exam templates |
| Layout and design | `document-pane`, `nav-tree`, `smooth`, `layout-constants`, `design-tokens`, `cabinet-figure`, `site-product-film` | Pane logic, keyboard movement, view-transition helpers, breakpoints shared by JS and CSS, WCAG contrast of the colour tokens, the cabinet figure, and the site promo film script (a root test of a site asset) |
| React components (`tests/ui/`, jsdom) | `agent-settings`, `analysis-document`, `analysis-mode-switch`, `auth-design`, `beta-auth`, `chip-row`, `composer-plain`, `document-pane`, `document-table`, `draft-actions`, `encounter-overview`, `guideline-citations`, `message-card`, `normal-exam`, `sidebar-menu`, `thinking-card`, `workspace-smoke` | Rendering and interaction of those components with Testing Library: the chip row, plain composer, sidebar and account menu, document pane and tables, message cards, idle lock and passkey nudge, local draft on analysis failure. `workspace-smoke` mounts the workspace page with mocks |

## Inventory: Node system tests

| File | Covers |
| --- | --- |
| `tests/system-runtime.node-test.mjs` | Launcher helpers in `scripts/aadi-runtime.mjs`: restart backoff and the five-crash limit, engine environment built from `scripts/aadi-profile.json` despite inherited settings, key required without echoing it, readiness check, preflight with an injected fetch, warm-up, venv stamp against the lock, model pin against the manifest, the install skip switches, the Windows guardian job (skipped off Windows) |
| `tests/scripts.node-test.mjs` | Scripts run for real in temporary capsules: `deploy-dry-run`, `build-system` (with a stub Next), `build-theoracle-index` (stub model: append, resume, hash refusal), the chunk build against its pinned hash, the index installer and publisher guards, the pipeline eval against a local HTTP stub, the npm wrapper, the benchmark's module list, SSOT dose-line rendering |
| `tests/export-split.node-test.mjs` | Private path list, the public and data trees, refusal of a non-empty or in-capsule output and of LFS pointers |
| `tests/leak-guard.node-test.mjs` | `scripts/leak-guard.mjs`: each planted leak in a temporary tree is found; a clean public tree and a clean private build pass |
| `tests/lfs-media.node-test.mjs` | Tracked MP4, WebM and WebP files are LFS pointers; `ci.yml` keeps its LFS cache and pointer check; `.gitattributes` rules |
| `tests/beta-access-operator.node-test.mjs` | `scripts/beta-access-core.mjs`: input validation, disable-then-revoke ordering, partial failure, secret redaction, with an injected provider |
| `tests/release-workflow.node-test.mjs` | `scripts/release-publication.mjs` and `split-release-artifact.mjs`; the `docker` job's `if` conditions evaluated in a JavaScript sandbox (not by GitHub Actions) for forks, public mirrors, case changes and main pushes |
| `tests/env-contract.node-test.mjs` | Every environment variable the Node side reads is named in `.env.example`, which holds no key, token, secret or password value; `.gitignore` blocks env files, local databases, dumps, backups and key files while the SQL migrations stay tracked. Judged from the capsule alone: files are read from disk and the ignore rules are tested in an empty temporary repository, so an enclosing repository cannot change the result |
| `tests/secret-scan.node-test.mjs` | `scripts/secret-scan.mjs` run for real in a temporary Git repository: 12 tests: tokens and provider keys, private keys, URLs with a password, filled secrets (also short, letters-only and lower-case), database dumps, env files, key files, databases and data exports are refused and never echoed; placeholders, templates, hashes and marked examples pass; the allow file must be tracked and exact; UTF-16 text is read and unread files are named; `--staged` reads only the index |

## Inventory: site tests and engine tests

- **Site** (`apps/site`): `tests/` holds browser-assets, contact-api, homepage-render, login-access, migration-boundary, output-parity, site-build and site-tools (verify, install check, deploy dry-run, lint, SPDS check, manifest writer). `scripts/` holds the page and widget tests (capability anatomy and explorer, clinical video, contact, FAQ, hero, human anatomy, legal, ruang-kerja, sejarah-sentra, serve, system anatomy, workflow playback). The contact test's accepted response is mocked and does not establish delivery.
- **Engine** (`aadi/service/tests`): `test_step_api` (the step and therapy endpoints end to end with a fake client: budgets, deadlines, hang-ups, PII refusal, raced copies, grounding, ledger), `test_providers` (provider routing and the OpenRouter policy), `test_components` (schemas, ICD post-checks, sex rules, guard, startup refusals, PII parity rows), `test_data_policy`, `test_cors`, `test_fast_copies`, `test_gemini_route` and `test_local_pricing` (price table), `test_packaging` (pinned file hashes against `SOURCE.json`, installed packages against the lock, hashes in both locks). `conftest.py` supplies the fake client.

## Fixtures and mocks

- `tests/fixtures/pii-parity.json`: identity rows with a client and an engine verdict, read by `pii-parity`, `theoracle-grounding`, `sync-guard`, `test_components.py` and `test_step_api.py`. Tighten the client, never loosen the engine; add rows red first.
- `tests/fixtures/workspace/v1-workflow.json` and `v1-demo-seed-2026-10-08.json`: frozen saved workspaces; every one must keep parsing.
- Engine examples in `aadi/service/contract/examples/` feed `example_request` in `conftest.py`.
- Mocks: `FakeClient` for the model; a fake embedder and a generated index for retrieval; injected `fetchFn` for the gateway and launcher; `vi.mock` for Clerk and Next; stub `next` and `@huggingface/transformers` packages in temporary capsules; local HTTP servers on port 0.

## Skipping private data

Public code ships without the database (`docs/data.md`). Three skip mechanisms keep the suites green there:

1. Vitest: `tests/private-data.ts` exports `withCatalog` (true when the real catalog is installed) and `withIndex` (the manifest and `vectors.f32` both exist). Affected tests use `skipIf`: catalog tests in `theoracle-aadi`, `diagnosis-presentation` and `theoracle-evidence-gate`, and the real-index test in `theoracle-grounding`.
2. Node tests: `skip` options for the installed-index check, and the chunk-build tests when the SSOT or manifest is missing.
3. pytest: the Med Assist contract-copy test needs an environment variable pointing at that contract folder.

Never paste database passages into tests, fixtures or documents.

## What is not tested

- **Live model calls and real engine answers.** Every model client is a fake. `aadi/service/smoke_live.py` is the manual path, costs money and needs Gaffer's approval. `eval-theoracle-pipeline.mjs` is also paid when pointed at a real server; its test uses a stub.
- **Clinical correctness** of any answer. Gate tests prove how text is matched, not that a dose is right.
- **Browser end to end.** No Playwright, Cypress or similar appears in `package.json`, `tests/` or the workflow. UI tests run in jsdom.
- **Docker.** CI builds the image but never runs it; no test starts it.
- **Live Clerk, Neon, Resend, Cloudflare, GitHub Actions.** Replaced by mocks, text checks or a JavaScript evaluation of the workflow conditions.
- **Non-Windows launcher guardian**, and macOS entirely.
- **Retrieval quality** beyond fixtures: `npm run benchmark:oracle` scores recall locally but is not part of `test:all`. Its `relevanceFloor` section calibrates `THEORACLE_MIN_SIMILARITY`: the best passage's similarity for every eval query and for a fixed set of non-clinical queries, and for each candidate floor from 0.20 to 0.60 how many eval queries it would reject and how many non-clinical queries it would let through. Eval queries that answer no-match at the current floor are listed and count as misses.

## Running one file

```powershell
npx vitest run tests/studio.test.ts
node --test tests/scripts.node-test.mjs
node --test --test-name-pattern="deploy dry-run" tests/scripts.node-test.mjs
npx eslint tests/studio.test.ts
npx tsc --noEmit
```

`npm test -- <file>` does not reach Vitest: the script is a chain and npm appends arguments to its last command, the site suite. Use `npx vitest run`. A site test file runs from `apps/site` after `node scripts/transform.mjs`. For one pytest file, from `aadi/` use the venv interpreter: `..\.runtime\aadi\venv\Scripts\python.exe -m pytest service/tests/test_cors.py -q` (`bin/python` off Windows). `scripts/test-aadi.mjs` takes no path argument.

Prerequisites: `lfs-media` and `export-split` need `git`; `scripts.node-test` needs `npm` on the path; the engine tests and `test_packaging` need the venv; assertions read source text (`ci.yml`, the `required` list in `deploy-dry-run.mjs`, the schema hashes), so editing those files can fail tests.

## Reproducing CI locally

`.github/workflows/ci.yml` job `check`, in order, on Ubuntu with Node 24 and Python 3.11: pull LFS objects and fail on any pointer; `node scripts/secret-scan.mjs`; `npm ci`; `npm audit --omit=dev --audit-level=high`; `npm run lint`; `pipx run ruff==0.17.1 check aadi`; `npm run typecheck`; `npm run test:all`; `npm run site:verify`; `npm run site:docs`; `npm run build`; `npm run deploy:dry-run`. Job `docker` builds the image with the publishable key as a build argument and uses no model. Real secrets and registry publishing are out of reach locally by design.

## Not verified

- Per-test pass counts: none were run for this document.
- That the site's bare `node --test` discovers the 13 files under `apps/site/scripts/`; inferred from Node's default file patterns.
- The single-file pytest command above is derived from `aadi/test.py`, not run.
- That `theoracle-grounding`'s real-index test skips (rather than fails) when the vectors exist but the local model is missing.
- The product is for consultations without patient identity (`.agents/DECISIONS.md`, 2026-10-26; documents aligned 2026-11-16, except `LICENSE`, `capsule.json` and `project.contract.json`). The identity checks are covered by the parity fixture and the gate tests above.
- The missing-index message in code is "Database Oracle belum terpasang di server ini. Analisis tidak dijalankan." (`tests/public-data.test.ts`); it appears when `manifest.json` is missing.

## Secret scan before a commit

`scripts/secret-scan.mjs` needs only Node and Git and never prints the value it found.

- **Refuses:** known token formats (Gemini and Google, OpenAI and OpenRouter, Anthropic, Clerk and Stripe secret keys, Resend, Dify, Supabase, GitHub, npm, AWS, Slack, webhook signing secrets, JSON Web Tokens), private keys, URLs that carry a password, filled secrets in configuration files (a name ending in `KEY`, `TOKEN`, `SECRET`, `PASSWORD` or `PASSCODE`), database dumps by their header, and by name: env files, key files, databases and data exports (spreadsheets, CSV and similar).
- **Cannot do:** tell real data from sample data inside an ordinary text, JSON or SQL file, or recognise a secret that has no known shape. It is a net, not a proof; review still decides.
- **When it runs:** CI runs it over every tracked file on each push, which is after the push is already public. To stop a secret before it leaves your machine, activate the hook once per clone: `git config core.hooksPath .githooks`. The folder also holds the four Git LFS hooks, so LFS keeps working after that switch. Inside the monorepo, leave its own hooks path alone and call the script from there.
- **Exceptions are visible:** a line may end with a comment holding `secret-scan:allow`; a tracked `.secret-scan-allow` file may list exact paths or folders ending in `/`. Env files can never be listed. Every exception used is counted in the output.

For blocking at GitHub itself, turn on secret scanning push protection in the repository settings; that is the owner's switch and is independent of this script.
