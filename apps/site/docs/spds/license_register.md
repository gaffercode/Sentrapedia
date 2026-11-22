---
document_id: "132"
title: "License Register"
status: active
authority: Gaffer
owner: "dr. Ferdi Iskandar"
version: "1.1.0"
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
classification: CONDITIONAL
review_trigger: "material change to purpose, architecture, runtime, data handling, risk, or evidence"
---

# License Register

## Function
Preserve known license evidence and gaps.

Caveat includes an OFL text file. Local GSAP and jQuery bundles retain embedded notices. Bootstrap, Bootstrap Icons, Slick, Inter, original theme assets, brand artwork, and video/media redistribution rights require a file-by-file review before public release. This register records evidence status and does not grant rights.

## File review, 2026-11-22

Read from the first bytes of each served file (`static/` and `assets/`). Evidence of a notice, not a legal opinion.

| Component | Served at | Loaded by a page | Notice in the file | Status |
| --- | --- | --- | --- | --- |
| Bootstrap 5.3.8 CSS | `/vendor/cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/` | yes | MIT, "Copyright 2011-2025 The Bootstrap Authors" | notice present |
| Bootstrap 5.3.8 JS bundle | same package, `dist/js/` | no, since 2026-11-22 | MIT, same header | notice present; unused |
| Bootstrap Icons 1.11.3 | `/vendor/cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/` and `bootstrap-icons-subset.woff2` | yes | MIT in the CSS header | notice present |
| jQuery 3.7.1, jQuery Migrate 3.4.1 | `/assets/vendor/` | no, since 2026-11-22 | "(c) OpenJS Foundation", jquery.org/license | notice present; unused |
| Slick 1.8.1 JS and CSS | `/vendor/cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.8.1/` | no, since 2026-11-22 | none | open: no notice in the files; no longer loaded |
| GSAP, ScrollTrigger, SplitText, DrawSVGPlugin | `/media/` | yes | "@license Copyright 2026, GreenSock", terms at gsap.com/standard-license | notice present; terms are GreenSock's standard license, for Gaffer to accept |
| Inter (TTF, WOFF2 subsets) | `/assets/theme/fonts/` | yes | none in the font folder before 2026-11-22 | OFL 1.1 text added as `Inter-OFL.txt`, copied from github.com/rsms/inter LICENSE.txt |
| Caveat | `/media/fonts/` | yes | `Caveat-OFL.txt` | notice present |
| Theme CSS and `custom55e2.js` from the original WordPress theme | `/assets/theme/` | CSS yes, script no since 2026-11-22 | none | open: origin and rights of the theme need Gaffer's confirmation |
| Brand artwork, films, posters, screenshots | `/assets/`, `/media/` | yes | none | open: owner-supplied; redistribution rights need Gaffer's confirmation |

The four unused script files stay at their public paths because the output-parity contract preserves every path; removing them is a separate decision.

