# Google measurement and discovery

Authorized by Gaffer on 21 November 2026: complete the Sentrapedia Google setup end to end.

## Configuration

- Public origin: `https://sentrapedia.com`.
- Analytics account: `400368907`; dedicated property: `565388497` (Sentrapedia).
- Web stream: `16387170007`; measurement ID: `G-XKM0Q1GQCL`.
- Reporting timezone: Jakarta; currency: IDR; industry: Health.
- Business size was provisionally set to 1–10 employees for this product team; this is an editable setup classification, not a verified headcount.
- Search Console URL-prefix property: `https://sentrapedia.com/`; verified owner confirmed in the UI. Analytics association created successfully.
- Event and user retention: 14 months; Google notes settings take effect after 24 hours.
- Enhanced measurement: page views, scrolls, video engagement and file downloads. Automatic site search, form interactions and outbound clicks disabled; custom contact events carry fixed labels only.

## Runtime boundary

The Google tag loads only on the two production hostnames, only on the seven enumerated public pages, and only after analytics consent. Preview hosts and the clinical workspace never load it. Basic consent mode defaults advertising consent to denied. Google Signals and ad personalization are disabled in the tag configuration. This is an analytics-only preference control, not an advertising CMP.

The script never reads form fields. `generate_lead` fires only after the contact service returns its accepted status; clicking Submit alone is not a lead. `contact_click` and `view_product` use fixed labels. Campaign labels are restricted to simple identifiers; unknown query parameters and hashes are excluded from the configured page URL. Referrers retain only their origin. Declining or withdrawing consent prevents subsequent custom events and sets the Google disable flag.

The consent choice expires after 180 days. Withdrawal clears accessible Analytics cookies; it does not delete historical data from Google. The public privacy page describes this behavior.

## Discovery

The build emits `robots.txt`, an XML sitemap containing the seven shipped public pages, one absolute canonical per page, a verification meta tag, and homepage WebSite structured data. The existing HTML verification file remains present. No rating, clinical certification or medical-device claim is added.

## Verification

Local checks on 21 November 2026: 56 site tests pass; authored JavaScript syntax passes; presentation verifier reports 22 protected files unchanged and zero errors; 96-document SPDS check and deploy dry-run pass. Consent tests verify no tag before consent, rejection, expiration, preview exclusion, URL redaction and withdrawal.

Production evidence on 21 November 2026:

- PR #12 merged; production deployment `dpl_4cem7kw76pJJXHPVtYonFooNGS14` READY for commit `27260ef8cb66e3a92fa9b5a2da28eb00e7d1d229`. Both CI check and Docker build succeeded for the PR head.
- Seven sitemap URLs return HTTP 200 with one correct canonical and one local analytics loader each. Verification file, robots.txt and analytics script return HTTP 200.
- Browser DOM: zero Google tag scripts before consent; granting consent inserts `gtag/js?id=G-XKM0Q1GQCL`; withdrawing consent and reloading results in zero Google tag scripts.
- GA4 Realtime shows one active user, the Sentrapedia page, and `page_view`, `first_visit`, `session_start`. This proves receipt of the test visit, not long-term reporting completeness.
- `generate_lead` registered as a key event, with no assigned monetary value. Live lead delivery was not fabricated or sent merely to test Analytics; accepted-contact behavior is covered locally.
- Search Console sitemap `/sitemap.xml`: Success, seven discovered pages. robots.txt recrawl requested. Homepage indexing request accepted into Google's priority crawl queue; actual indexing remains pending.
- PageSpeed mobile lab baseline: Performance 83, Accessibility 92, Best Practices 100, SEO 92; LCP 2.7 seconds, TBT 20 ms, CLS 0. Field data unavailable. The missing meta description was subsequently corrected; the baseline scores are not a claim about the later build. No visual redesign or performance rewrite was included.

## Maintenance

Carry this change into the sovereign source before its next public export, to avoid overwriting this release. The private `.agents` records are excluded from the public repository and were unavailable here. Changes remain scoped to public site code; the public tree is passed through `scripts/export-split.mjs` before publishing.

Use Google Analytics for visitor and lead reports and Search Console for indexing and search traffic. Do not add Ads, BigQuery billing, advertising personalization or a second tag container without a concrete need. Search reports and field performance data require real traffic and processing time.
