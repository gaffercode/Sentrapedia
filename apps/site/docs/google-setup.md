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

Local checks on 21 November 2026: 56 site tests pass; authored JavaScript syntax passes; presentation verifier reports 22 protected files unchanged and zero errors; 96-document SPDS check and deploy dry-run pass. Consent tests verify no tag before consent, rejection, expiration, preview exclusion, URL redaction and withdrawal. This local evidence does not establish live collection or indexing; verify the deployed tag, sitemap submission and Analytics reception separately.

## Maintenance

Carry this change into the sovereign source before its next public export, to avoid overwriting this release. The private `.agents` records are excluded from the public repository and were unavailable here. Changes remain scoped to public site code; the public tree is passed through `scripts/export-split.mjs` before publishing.

Use Google Analytics for visitor and lead reports and Search Console for indexing and search traffic. Do not add Ads, BigQuery billing, advertising personalization or a second tag container without a concrete need. Search reports and field performance data require real traffic and processing time.
