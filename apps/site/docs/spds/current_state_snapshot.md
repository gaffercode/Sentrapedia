---
document_id: "S04"
title: "Current State Snapshot"
status: active
authority: Gaffer
owner: "dr. Ferdi Iskandar"
version: "1.2.0"
created: "2026-10-14"
last_verified: "2026-11-22"
applies_to: "projects/healthcare/sentrapedia/apps/site"
source_of_truth: true
supersedes: []
related_requirements: []
related_decisions: []
related_evidence: []
agent_readable: true
agent_editable: false
human_approval_required: true
classification: SENTRA
review_trigger: "material change to purpose, architecture, runtime, data handling, risk, or evidence"
---

# Current State Snapshot

## Function
Preserve a dated implementation snapshot.

As of 2026-11-22, the site subsystem contains authored source/assets, generated `site/`, Node build/preview/contact tooling, a Vercel contact function (`api/contact.mjs`), 77 automated tests (`node --test`), a verifier, migration manifest/report, and SPDS documentation. It is public at `https://sentrapedia.com` as a work-in-progress pre-beta site. Since the previous snapshot (2026-10-15):

- **Beta entry:** "Masuk" and "Daftar" link to `https://beta.sentrapedia.com/sign-in` and `/sign-up`; the beta application's `/apply` renders Clerk's waitlist (root repository, pull request 19).
- **Contact form:** accepts the site's HTTPS origin without a pinned `CONTACT_PUBLIC_ORIGIN` and logs each delivery failure as one line naming only the reason (pull request 17). The per-address attempt limit is held in memory per function instance, so it is weak on serverless hosting.
- **Measurement and search:** consent-based Google Analytics, Search Console verification, `robots.txt` and `sitemap.xml` (pull requests 11, 12, 16).
- **Performance and accessibility:** the PageSpeed plan of 2026-11-21 (pull request 14; record in `docs/refactor-progress.md`). On 2026-11-22 the homepage stopped loading jQuery, jQuery Migrate, the Bootstrap JS bundle, Slick and the WordPress theme script; the mobile menu toggle and the compact header moved to `scripts/browser/menu.js`.
- **Monitoring:** `.github/workflows/uptime.yml` probes the site, the contact function and the beta sign-up every 15 minutes and opens an `outage` issue on failure (pull request 18).
- **Licensing:** file review in `license_register.md`; the theme, Slick and owner-supplied media remain open.

Still open: legal basis and retention for contact messages, the license items above, Bootstrap CSS that is almost entirely unused, and `Cache-Control: max-age=0` on every file (a Vercel setting).
