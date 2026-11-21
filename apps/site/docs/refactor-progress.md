# SDD ledger — plan: docs/plans/active/2026-10-23-site-frontend-refactor.md

Base: 5044c7eb. Scope: apps/site only, plus capsule plan and handoff.

Pre-flight: tasks 1/2 share renderHomepage and the exact built-tree parity baseline. Runtime tasks consume the same asset-copy pipeline; script loading order must stay fixed. Task 7 cannot infer dead CSS from a single page or viewport.

Ruling: use the native app-managed worktree location rather than manually creating a second worktree — native registration owns checkout lifecycle — cost if wrong: worktree placement differs from repository preference, no product effect.

Ruling: refactor tests characterize existing behavior before extraction; their passing baseline is expected — refactoring does not introduce new behavior — cost if wrong: insufficient edge coverage, mitigated by output parity and browser checks. The new renderer interface test was observed failing before extraction and passing afterward.

Task 0: baseline site tests 49/49; lint exit 0; verify 22 protected files, 72 local targets, no errors; dry-run exit 0. Native checkout initially held LFS pointers; local git lfs checkout restored the assets and the suite passed. Desktop/mobile screenshots captured through the in-app browser at 1440x900 and 390x844; these early screenshots capture arrival, not stable animation checkpoints.

Task 1: complete — unsupported legacy figure fallback removed; missing/reordered fragments reject; checked-in source renders identically. node --test tests/homepage-render.test.mjs: 1/1.

Task 2: complete — renderer and declarative asset groups extracted. node --test tests/output-parity.test.mjs: all public output paths and SHA-256 identical. node --run test: 51/51. Protected presentation baseline unchanged.

Task 3: complete — menu/cards/contact/reveal moved into scripts/browser. Entry initialization order unchanged. Assembly-interface test observed missing-module failure then 1/1 pass. Browser invalid/pending/success/rejected/network contact states match baseline; Enter/Space expand workflow cards; mobile menu Escape closes and updates aria-expanded.

Task 4: complete — hero bindings and timeline extracted verbatim. Browser comparison from the same timeline origin matches labels, duration 38.2s and checkpoints 1.5/8/17/23.8/25/27/34s. Four checks precede Ditinjau at 24.7s. Missing GSAP keeps readable static hero.

Task 5: complete — capability scene and viewport logic extracted. Existing helper exports retained. Browser Home/End/arrows and previous/next/pause work; desktop pinned and mobile native modes tested. Returning from FAQ preserves eight live panels and exactly ten explainers.

Task 6: complete — only the identical visibilitychange/preference listener registration shared by clinical video and workflow playback. Thresholds, callbacks, autoplay and manual-pause rules remain local. Browser clinical-video button goes Jeda then Putar; settled reduced-motion state matches baseline: static hero, stacked capabilities, both videos paused. Product-film's existing visibility policy is intentionally unchanged.

Task 7: complete — only the unused img.wp-smiley/img.emoji style block removed. No matching markup or authored generator references found. Whole-tree parity reinserts that exact stored block before checking the original homepage hash. Vendors and all public media URLs retained.

Ruling: source fragments are concatenated into the existing five JavaScript bundles instead of changing classic scripts to modules — preserves deferred execution order and public URLs without dependencies — cost if wrong: build assembly must be maintained; source/served checks and dedicated assembly tests cover it.

Ruling: public tree parity allows exactly five reviewed JavaScript bundles plus the exact dead emoji style removal — extracting runtime code necessarily changes bundle bytes — cost if wrong: browser behavior regressions inside these bundles; exact extraction review and browser parity supplement the hash gate.

Final review: fresh reviewer gpt-6-astra (high), read-only. No confirmed findings. Independent raw comparisons proved verbatim feature bodies, hero bindings/timeline and normalized capability extractions. Verification-control integrity accepted independently; protected design-integrity.json untouched. Reviewer deferred browser-only judgments; primary browser checks cover layout, timeline, reduced motion and back navigation.

Verification note: manifest generation encountered one Windows UNKNOWN/open error; file remained readable and a single subsequent run succeeded. No manifest content was substituted manually.

Deferred minors: none reported by reviewer.

## Website publication - 2026-10-23

- Gaffer authorized push and deploy. A dedicated-repository checkout based on drferdi/Sentrapedia main a056f65 received only the reviewed apps/site snapshot. Release commit dc3666174cb1be4a12bfb451565b10f6771638f6 was pushed to codex/sentrapedia-site-refactor; main was not merged. Source snapshot: e8488b93.
- Exact release snapshot: install:check, test (53/53), lint (63 JS files), verify (22 protected files, 72 local targets), docs:verify (96 documents) and deploy:dry-run passed. Staged additions had no phone-pattern or private-key matches; repository history scan for private group identifiers had zero matches.
- Vercel project sentrapedia / scope sentraverse: staged production dpl_BYLyJHdcNvMUtY1622FNJnsZF2g6 was READY, seven routes returned 200, all five browser bundles returned 200, and media byte ranges returned 206. One preliminary check used the wrong /assets/ script prefix and returned 404; checked-in markup uses /media/, which passed without code changes.
- Promoted the tested build to https://sentrapedia.vercel.app. All 88 public output files returned 200 and matched local SHA-256, with no mismatches. Media range: 206 and 1024 bytes; contact GET: 405. Deployment runtime error query (last hour) returned zero records. Browser Masuk reached Cloudflare Access "Log in to Sentrapedia BETA" with email/code controls; no email submitted.
- System beta, Cloudflare policy and credentials were not modified. No demo account was created. GitHub reported one existing high Dependabot alert on the default branch; it is outside this website-only release.
# Clerk navigation preparation - 2026-10-24

The reviewed foundation from `c773e692` is preserved. Desktop/mobile navigation now prepares `https://beta.sentrapedia.com/sign-in` and `/apply` using existing classes. Historical output parity normalizes only these exact approved anchors. Publication is blocked until the selected Clerk instances, real invitation/OTP flow and separately authorized Cloudflare cutover are verified; this branch does not deploy the marketing site. See the capsule's `docs/auth-beta-access.md` release checklist.

## Header login consistency - 2026-10-24

- Gaffer asked for Masuk to join the header navigation and match the other items. Commit `d05df2ce` moves the desktop anchor out of the pill/language group into the existing `ul.menu`/`li.menu-item`, with its HTTPS `/sign-in` destination unchanged. Mobile already uses that structure and stays unchanged. No new stylesheet or dependency.
- The desktop Bootstrap grid allocates seven columns to the six navigation items and two to the remaining actions, preserving the logo's three. At 768px all six anchors stay on one line with about 10px gaps and no header overflow. At 1440px all six use Inter 16px/24px, zero border/padding/radius; mobile uses the existing 40px/64px menu treatment. Tab reaches Masuk with a solid focus outline. Existing Escape behavior is bound to the menu toggle, not arbitrary links; its behavior was not expanded by this presentation change.
- TDD: the served-HTML check failed before implementation because Masuk was outside the primary list. After implementation, site tests 53/53, lint (63 authored JS files), verify (22 presentation files unchanged, 72 targets), docs (96 documents) and deploy dry-run all exit 0. Only the exact approved anchor/wrapper/grid markup is normalized for historical output parity; all other outputs and protected assets retain their gates.
- Preview: `http://127.0.0.1:3402/`. No merge, push, publication, Cloudflare setting or Clerk configuration was performed. Gaffer asked to continue Clerk setup; a fresh Dashboard tab still shows Sign in to Clerk. Human login and intended application selection are required; never send secrets or OTPs in chat.
- Independent read-only review accepted the verification-control boundary for `1ffaaef2..d05df2ce`: exact replacements only, all path/hash gates and the five-runtime-bundle exception unchanged, 126 manifest entries with only the source hash changing. Reviewer reran login/output-parity checks 2/2, verified source SHA-256 and reported no findings. Live provisioning and browser-only judgments were outside that narrow review; they were not silently marked passed.


## PageSpeed plan - 2026-11-21

- **Asked:** Gaffer had PageSpeed Insights review `https://sentrapedia.com` (report of 2026-11-21 20:01 WIB: mobile Performance 66, LCP 11.9 s, page weight 7,318 KiB, Accessibility 92; desktop Performance 86) and approved five performance items and three accessibility fixes. Branch `perf/site-pagespeed-2026-11-21`, cut from public `main` `f4bf45c`.
- **Where this departs from the behaviour contract, on that approval.** The contract keeps HTML, CSS and media byte-identical; these changed bytes: the four wordmark SVGs (so their four hashes in `reference/design-integrity.json` changed with them); the homepage (five `defer` attributes with script order unchanged, two `<video>` tags, one inline font `<style>`, one heading tag); every page (the analytics choice panel after `<body>`); seven stylesheets (subset `@font-face` rules in `faq.css`, `legal.css`, `ruang-kerja.css`, `sejarah-sentra.css` and `clinical-video.css`, the full Caveat rule's range, one colour each in `capability-explorer.css` and `capability-anatomy.css`); and `product-film.js`. Seven files were added (five WOFF2, two posters). No public path was removed and no protected CSS, vendor file or theme font changed. `tests/output-parity.test.mjs` removes each of those edits as an exact string and then demands the historical bytes, so any other change to those files still fails; only the four wordmarks are exempt from that comparison, and `design-integrity.json` pins them.
- **Wordmarks:** each file embedded Inter Bold (343,972 bytes) and a 943x735 PNG. The word is now a path shaped with HarfBuzz from that font at the same position and size; the mark is resampled to the size it is drawn at. 558 KB each became 12.9, 18.4, 15.2 and 71.2 KB.
- **Fonts:** a subset WOFF2 `@font-face` with a `unicode-range` follows each full-font rule, so shipped copy uses the subset (Inter 37-38 KB per weight, Caveat 81 KB, 23 Bootstrap icons 2.4 KB) and the full file is fetched only for a character outside it. The full Caveat rule names the range it can draw, because the note sets an arrow Caveat lacks and the browser fetched the whole file to draw nothing. Subsets were made with `pyftsubset` (fontTools 4.67, all layout features, hinting kept); they are derived files under the same licences as their sources.
- **Films:** `promo-vid.mp4` and `sentrapedia-solusi.mp4` carry `preload="none"` and a poster that is frame 0 of the film. The clinical film starts buffering one screen early, the product film when its first pixel is on screen; neither under reduced motion.
- **Scripts:** jQuery, jQuery Migrate, Bootstrap, Slick and the theme script are deferred.
- **Analytics choice:** the build writes the panel, hidden, first in `<body>`; an inline script shows it by the module's own host, path and 180-day rules. Because the panel is now on screen before the module has run, and the module may never run (a slow connection, a content blocker), the inline script also lets either button close the panel and store the choice in the shape the module reads. The module adopts the panel and acts on a stored choice when it loads: a consent loads the tag, and a refusal gets the same clean-up as one made through the module. Nothing reaches Google before "Izinkan analitik". The panel carries `data-nosnippet`.
- **Accessibility:** the clinical title is named on its heading while split; card numbers and the `FIG.` label use the action colour `#13786e` (4.97:1 to 5.33:1, from 3.91:1 to 4.08:1); "Alur Kerja" is `<h2 class="section-subtitle h5">`.
- **Tests:** written first and seen failing, then passing: `tests/performance-budget.test.mjs` (7), `tests/accessibility.test.mjs` (3), seven added to `tests/google-site.test.mjs`. Site tests 73/73, lint 67 files, verify (22 protected files, 76 local targets, no errors), docs (96 documents), deploy dry-run, all exit 0. The capsule-root gates were not run: no root file changed and the workspace had no root install.
- **Final review** (fresh reviewer, read-only, gates re-run): no critical finding. Fixed in one pass, each with a test that failed first: the panel's buttons did nothing until the module had run and the panel could not be closed if the module never loaded; the panel's text could be quoted in search results; the parity test exempted eight whole stylesheets and one script instead of reversing their edits (an unreviewed edit to `faq.css` passed before and fails now); this entry understated what departed from the contract.
- **Measured** with Lighthouse 13.6.0 (the version PageSpeed used) in headless Chrome 153 against a local HTTP/2 server with Brotli, loaded as `https://sentrapedia.com/` so the analytics choice shows; median of three runs:

  | | Before | After |
  | --- | --- | --- |
  | Mobile Performance | 60 (60, 60, 70) | 95 (83, 95, 97) |
  | Mobile FCP / LCP | 2.3 s / 10.9 s | 1.9 s / 1.9 s |
  | Mobile Speed Index / TBT | 4.7 s / 400 ms | 2.8 s / 190 ms |
  | Desktop Performance | 89 | 100 |
  | Desktop FCP / LCP | 0.5 s / 2.0 s | 0.4 s / 0.4 s |
  | Accessibility, both | 92 | 100 |
  | Transfer on load | 2,703 KiB | 1,223 KiB |

  The local "before" matches the PageSpeed report closely except for page weight: PageSpeed's browser fetched both films whole (7,318 KiB); the local one did not in either run. Mobile runs vary with the measuring machine's blocking time (an earlier set of three after the same performance changes read 82, 90, 94), so read the mobile score as a range.
- **Checked in Chrome at 1440 and 390 px:** old and new wordmarks have identical ink bounds; full-page screenshots under reduced motion differ only at the three wordmarks and the two film boxes; on `/` and `/faq/` only WOFF2 fonts are requested (the other five pages rest on the static test); no `.mp4` is requested on load and both films play in view; menu, workflow cards, capability keys and the contact form's invalid state behave as before with no console error; no request reaches Google before "Izinkan analitik", and a refusal survives reload; with the module blocked, Tolak closes the panel and the refusal holds on the next page; with the module delayed, a consent given first loads the tag only when the module arrives.
- **Changed look, for Gaffer to confirm:** under reduced motion the films do not play, so their boxes show the poster. The product film's box was empty and now shows frame 0, which is nearly black because the film fades in from black; the clinical film's box was the dark panel and now shows its bright first frame.
- **Not verified:** the live site (nothing is deployed), a real phone, Safari and Firefox, a screen reader. The PageSpeed score itself will differ from the local one; rerun PageSpeed after deployment.
- **Open from the review, not changed:** while a choice is pending the panel's link and two buttons come before the skip link in Tab order on the six inner pages; the declared subset range names about 40 code points Inter lacks (a soft hyphen in future copy would fetch the full font and the copy test would not notice); several tests match the controllers' text and not their behaviour; the product film's early observer gains only the scroll distance between its first pixel and 30% in view.
- **Left as found:** the five workflow posters (410 KiB) and the 943x735 mark used at 120 px (72 KiB) still load with the page; 664 KB of homepage HTML is mostly four inline SVG illustrations; Bootstrap's CSS is almost entirely unused; `Cache-Control` is `max-age=0` for every file (a Vercel setting); twelve `.clinical-note-ink` spans carry `aria-label`; `label-content-name-mismatch` is reported for the language link and the five workflow card controls.
