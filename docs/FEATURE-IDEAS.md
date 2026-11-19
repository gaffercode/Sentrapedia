# Sentrapedia — Feature ideas

Written 2026-11-19 as a proposal only. Nothing here is implemented or approved. Any idea that changes clinical content, a pinned AADI file or a live service needs the owner's explicit approval.

## How this was built

- Read `docs/architecture.md`, `AGENTS.md` and the code of `gaffercode/Sentrapedia` `main` at `07ab892`, and checked each idea against the maintainers' recorded owner decisions, so none silently contradicts one.
- `TODO`/`FIXME` grep over the code (excluding `node_modules`, data and build output): no real hits, so the evidence below comes from code gaps, not comments.
- Issues: the GitHub API returned no open issues on 2026-11-19.
- Already built, so left out: per-answer problem reports ("Laporkan output bermasalah", `src/lib/aadi/output-report.ts`), the per-person daily quota (`src/lib/aadi/limits.ts`) and the analysis queue (`src/lib/aadi/queue.ts`).
- Evidence labels follow `docs/architecture.md`: **Read** means the code or data was opened; **Inferred** means it was concluded without reading the code that does it.

## Ranking (value to effort)

| # | Idea | Effort |
| --- | --- | --- |
| 1 ★ | SKDI competency level and referral cue on the working diagnosis | S–M |
| 2 | Print layout for a single document | S |
| 3 | Remaining daily quota shown in the account menu | S |
| 4 | Sidebar feedback that is actually kept | S |
| 5 | Body weight in the case form | M |
| 6 | Server sync for personal templates | M |
| 7 | Passphrase-encrypted browser workspace | M–L |

---

## 1. ★ SKDI competency level and referral cue on the working diagnosis

**What it is.** Show next to the working diagnosis whether a GP manages the disease fully at the Puskesmas (SKDI 4A) or must refer after first handling (3A/3B), from data the knowledge source already holds.

**Why it matters.** "Treat here or refer?" is the first decision a primary-care doctor makes, and today the answer is buried, if anywhere, in free-text passages.

**Evidence.**
- Read: the knowledge source carries a `kompetensi` value (an SKDI level such as 4A, 3B or 3A) on almost every entry.
- Read: `scripts/build-theoracle-chunks.mjs` puts it into chunk text as `Kompetensi: …`, but `scripts/build-oracle-catalog.mjs` drops it, and the `Disease` interface in `src/lib/theoracle.ts` carries `rujukan` but no level.
- Read: the case form already collects "Kemampuan fasilitas" (`facilityCapabilities` in `src/components/aadi-case-form.tsx`), so a cue can set the level beside what the facility says it can do.
- Read: the product is calibrated to Puskesmas/FKTP primary care (`AGENTS.md`, `docs/architecture.md`).

**Effort.** S–M: add the field to the catalogue build, normalise it to a level, render one line in the diagnosis section, test it.

**Risk / trade-off.**
- The values are inconsistent strings (several spellings of the same level, some source labels instead of a level, a few empty). Only a clean level may be shown; everything else must show nothing, never a guess.
- Showing it is a clinical-content change and needs the owner's approval.
- `npm run knowledge:build` rewrites the catalogue hash inside `src/lib/theoracle.ts`, and the public sample catalogue needs the field too.
- A competency level is not a referral order; the wording must stay advisory.

**Files it would touch.** `scripts/build-oracle-catalog.mjs`, `oracle/sentrapedia.json` and `oracle/sentrapedia.sample.json` (regenerated), `src/lib/theoracle.ts`, `src/lib/aadi/presentation.ts`, `tests/diagnosis-presentation.test.ts`.

## 2. Print layout for a single document

**What it is.** Make "Cetak" print only the selected document (referral letter, education sheet, visit summary) on clean A4, not the whole workspace screen.

**Why it matters.** A referral letter or patient-education sheet at a Puskesmas is still handed over on paper, and printing the full app with sidebar and chat is unusable.

**Evidence.**
- Read: `window.print()` is wired in `src/components/message-card.tsx:45` and `src/components/workspace.tsx:188`.
- Read: there is no `@media print` rule in any stylesheet under `src/`, so the browser prints the live layout.
- Read: 13 local modes produce hand-over documents, including `referral`, `education` and `avs` (`src/lib/drafts.ts`).

**Effort.** S: one print stylesheet plus a "print this document" class toggle.

**Risk / trade-off.**
- A printed draft looks official. The print must carry the document's status (Draf/Ditinjau/Final) and the "draft for physician review" line, and printing a Draf may need a confirmation.
- The design-token check applies to the new CSS.

**Files it would touch.** `src/app/globals.css`, `src/components/message-card.tsx`, `src/components/workspace.tsx`, a new UI test under `tests/ui/`.

## 3. Remaining daily quota shown in the account menu

**What it is.** Show "today: N of M analyses left" in the account menu, read from the quota store that already enforces the limit.

**Why it matters.** A clinician learns about the quota only when an analysis is refused with "Kuota analisis harian Anda sudah habis", often in the middle of a consultation.

**Evidence.**
- Read: `src/components/account-menu.tsx:9,26` already accepts and renders an optional `usage` prop, but its only caller, `src/components/sidebar.tsx:56`, never passes it. The display is built; the data path is not.
- Read: `src/lib/aadi/limits.ts` holds the per-person quota and the shared budget (with `BUDGET_ALERT_FRACTION = 0.8`), backed by a Postgres store (`src/lib/aadi/limits-store.ts`).
- Read: `src/app/api/aadi/queue/route.ts` is a ready pattern: a signed-in, `no-store` GET that returns only the caller's own number.

**Effort.** S: a read method on the limits store, a small GET route modelled on the queue route, and the sidebar passing `usage`.

**Risk / trade-off.**
- The route must answer only for the session's own principal, as the queue route does, and never expose the shared budget in money to every user.
- A count read before the analysis can be stale by one when two tabs run at once; it is a hint, not a promise.

**Files it would touch.** `src/lib/aadi/limits.ts`, `src/lib/aadi/limits-store.ts`, a new `src/app/api/aadi/usage/route.ts`, `src/components/sidebar.tsx`, `src/components/account-menu.tsx`, `tests/aadi-limits.test.ts`.

## 4. Sidebar feedback that is actually kept

**What it is.** Send the general feedback box in the sidebar to the same server store as the per-answer problem reports, instead of discarding it.

**Why it matters.** The box tells the clinician their feedback was saved and helps develop the workspace, but the text is lost when the tab closes.

**Evidence.**
- Read: `src/components/sidebar.tsx:55` writes feedback to `sessionStorage`, overwrites the previous entry, and shows a thank-you toast; `docs/data.md` still lists it as `localStorage`.
- Read: `src/lib/aadi/output-report.ts` already has a server store, identity screening (`containsIdentity`), a 1,000-character note limit and an `other` category, but every report needs an answer's `traceId`.

**Effort.** S: allow a report without a trace id (or add a sibling table), and post the sidebar form to it.

**Risk / trade-off.**
- Free text can carry identity; it must go through the same identity check as reports.
- Without a database the store is off; the box must then say plainly that feedback was not sent, rather than thank the user.

**Files it would touch.** `src/components/sidebar.tsx`, `src/lib/aadi/output-report.ts`, `src/app/api/aadi/report/route.ts`, a migration under `db/migrations/`, `tests/aadi-output-report.test.ts`.

## 5. Body weight in the case form

**What it is.** Add an optional body-weight field to the case so the model and the document know the patient's weight when a guideline dose is per kilogram.

**Why it matters.** Paediatric and many emergency doses in Indonesian guidelines are written per kg, and without the weight the draft cannot even state the basis the clinician must calculate from.

**Evidence.**
- Read: the evidence gate already parses per-kg strengths ("10 mg/kgBB, maks 500 mg", `src/lib/theoracle-evidence-gate.ts`).
- Read: the case has age, sex, vitals, allergies and pregnancy (`src/lib/aadi/contract.ts`, `src/components/aadi-case-form.tsx`) but no weight.

**Effort.** M: contract and form change, engine schema change (whose hash is pinned by `tests/theoracle-aadi.test.ts`), presentation line.

**Risk / trade-off.**
- The owner has ruled out hand-made dose tables and dose calculators. This idea is input only: the product must **not** multiply mg/kg by weight. If the owner reads it as a calculator in disguise, drop it.
- The engine's schema and prompts are kept byte-identical to upstream with hash tests, which makes the change awkward.

**Files it would touch.** `src/lib/aadi/contract.ts`, `src/lib/aadi/types.ts`, `src/components/aadi-case-form.tsx`, `src/lib/aadi/composer.ts`, `src/lib/aadi/presentation.ts`, the `aadi/` request schema, `tests/theoracle-aadi.test.ts`.

## 6. Server sync for personal templates

**What it is.** Let the existing manual sync also push and pull the clinician's personal templates, using the table that already exists for them.

**Why it matters.** A doctor who builds templates on the clinic PC has to rebuild them on a laptop or after clearing the browser.

**Evidence.**
- Read: `db/migrations/0001_account_and_templates.sql` creates `personal_template` with row-level security, but nothing in `src/` reads or writes it (also noted in `docs/architecture.md` section 9).
- Read: personal templates live only in browser storage (`src/lib/workflow.ts`).

**Effort.** M: extend the sync payload, guard and merge, plus tests.

**Risk / trade-off.**
- It pays off only where an instance turns the database on; without `SENTRAPEDIA_DATABASE_URL` sync answers 503.
- Templates must pass the same identity guard as synced documents.

**Files it would touch.** `src/lib/sync/` (schema, guard, merge), `src/app/api/sync/route.ts`, `src/lib/workflow.ts`, `tests/sync-*.test.ts`.

## 7. Passphrase-encrypted browser workspace

**What it is.** Offer an optional passphrase that encrypts the saved workspace in the browser, so someone else using the same clinic computer cannot read it.

**Why it matters.** Clinic computers are shared, and case text without identity is still sensitive clinical history.

**Evidence.**
- Read: the workspace lives in unencrypted browser storage, and `docs/auth-beta-access.md` states that namespacing by account is not isolation from the device owner.
- Read: no `crypto.subtle` use anywhere in `src/`.

**Effort.** M–L: Web Crypto key derivation, an unlock screen, migration of existing data, and the export/import and sync paths.

**Risk / trade-off.**
- A forgotten passphrase loses the data for good; there is no recovery without a server.
- Every read path (unreadable-backup copy, export, sync push) must handle the locked state, so the change is wider than it looks.
- It protects against another person at the device, not against malware in the browser.

**Files it would touch.** `src/lib/workspace.ts`, `src/lib/workspace-session.ts`, `src/components/workspace-hooks.ts`, `src/components/workspace-dialogs.tsx`, `src/lib/sync/`, workspace tests.

---

## Considered and left out

- **A demo app under `apps/demo/`** (reserved, not built). Useful for showing the product without opening sign-up, but it is a whole surface with synthetic data and its own deploy, and it adds little while the beta is closed.

## Strongest recommendation: idea 1

The SKDI level answers the question a Puskesmas doctor asks first, "treat here or refer?", and that is the product's stated setting. The data is already in almost every knowledge entry and already reaches the model through chunk text, so the work is a small catalogue and presentation change, not new knowledge. Its main risk, messy source strings, is contained by showing only clean levels and nothing otherwise, and the owner reviews the wording once as a clinical-content change.
