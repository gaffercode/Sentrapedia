import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = new URL('../', import.meta.url);
async function inventory(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async entry => {
    const target = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? inventory(target, relative) : [{ path: relative, sha256: createHash('sha256').update(await readFile(target)).digest('hex') }];
  }))).flat().sort((a, b) => a.path.localeCompare(b.path));
}
// PageSpeed plan approved by Gaffer on 2026-11-21 (docs/refactor-progress.md). The strings below are the exact text that
// plan added to stylesheets, one script and the homepage; the test removes them and then demands the historical bytes,
// so any other change to those files still fails here.
const subsetRange = 'U+0000-017F, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2190-2199, U+2212, U+2215, U+25CF, U+FEFF, U+FFFD';
const caveatFullRange = 'U+0000-052F, U+1E00-1EFF, U+2000-209F, U+20A0-20CF, U+2100-218F, U+2200-22FF, U+27C0-27EF, U+F6C3, U+FB00-FB06';
const interSubset = (family, name, weight) => `\n@font-face { font-family: '${family}'; src: url('/assets/theme/fonts/Inter_28pt-${name}.woff2') format('woff2'); font-weight: ${weight}; font-style: normal; font-display: swap; unicode-range: ${subsetRange}; }`;
const withoutInterSubsets = family => css => css.replace(interSubset(family, 'Regular', 400), '').replace(interSubset(family, 'SemiBold', 600), '');
const siteFontsBlock = `\n<style id="site-fonts-css">${interSubset('Inter', 'Regular', 400)}${interSubset('Inter', 'SemiBold', 600)}${interSubset('Inter', 'Bold', 700)}
@font-face { font-family: bootstrap-icons; src: url('/assets/theme/fonts/bootstrap-icons-subset.woff2') format('woff2'); font-display: block; unicode-range: U+F12B, U+F148, U+F14A, U+F194, U+F282, U+F292, U+F2CF, U+F2D6, U+F3B9, U+F444, U+F45E-F45F, U+F477-F478, U+F490, U+F4B3, U+F4E1, U+F52A, U+F56B, U+F588, U+F5F9, U+F633, U+F64D; }
</style>`;
const filmWarmUp = "    // The film is not fetched with the page (preload=\"none\"). Start buffering when its first pixel is on screen,\n    // ahead of the 30% that starts playback, unless the visitor asked for reduced motion: then it loads only when\n    // they press Putar. No margin: the film sits just below the first screen and a margin would fetch it with the page.\n    const warm = new IntersectionObserver(entries => {\n      if (!entries[0].isIntersecting || reducedMotion.matches) return;\n      video.preload = 'auto';\n      warm.disconnect();\n    });\n    warm.observe(video);\n";
const reversals20261121 = {
  'media/faq.css': withoutInterSubsets('FAQ Inter'),
  'media/legal.css': withoutInterSubsets('Legal Inter'),
  'media/ruang-kerja.css': withoutInterSubsets('Workspace Inter'),
  'media/sejarah-sentra.css': withoutInterSubsets('History Inter'),
  // The full Caveat rule names the range it can draw; a subset rule follows it; one comment explains both.
  'media/clinical-video.css': css => css
    .replace('/* The full file names what it can draw, so a character it lacks (the arrows in the note) never fetches it; the subset after it is checked first. */\n', '')
    .replace(` font-display: swap; unicode-range: ${caveatFullRange}; }`, ' font-display: swap; }')
    .replace(`\n@font-face { font-family: 'Clinical Caveat'; src: url('/media/fonts/Caveat-Variable.woff2') format('woff2'); font-style: normal; font-weight: 400 700; font-display: swap; unicode-range: ${subsetRange}; }`, ''),
  // Accessibility: the 11 px card numbers and the FIG. label use the approved action colour (5.0:1 or better).
  'media/capability-explorer.css': css => css.replace('.capability-live-card-index { color: #13786e;', '.capability-live-card-index { color: #0a8b80;'),
  'media/capability-anatomy.css': css => css.replace('.feature-anatomy-heading span:first-child { color: var(--capability-action);', '.feature-anatomy-heading span:first-child { color: var(--anatomy-accent);'),
  // An early observer starts the product film's download before playback is due (media/clinical-video.js is a runtime bundle below).
  'media/product-film.js': script => script.replace(filmWarmUp, ''),
};

// Theme script removal, 2026-11-22: jQuery, jQuery Migrate, the Bootstrap bundle, Slick and the WordPress theme script
// are no longer loaded (their two live behaviours moved to scripts/browser/menu.js); their files stay at their paths.
const themeScripts = ['<script id="jquery-core-js" src="assets/vendor/jquery.min.js?ver=3.7.1" defer></script>',
  '<script id="jquery-migrate-js" src="assets/vendor/jquery-migrate.min.js?ver=3.4.1" defer></script>',
  '<script id="bootstrap-js" src="/vendor/cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" defer></script>',
  '<script id="slick-js" src="/vendor/cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.8.1/slick.min.js" defer></script>',
  '<script id="custom-js" src="assets/theme/js/custom55e2.js?ver=7.1.3" defer></script>'].join('\n');
const restoreThemeScripts = html => html
  .replace('crossorigin="anonymous">\n\n\n\n    <link rel="stylesheet" href="assets/theme/css/main1509.css',
    'crossorigin="anonymous">\n\n    <link rel="stylesheet" href="/vendor/cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.8.1/slick.min.css">\n\n\n    <link rel="stylesheet" href="assets/theme/css/main1509.css')
  .replace('</style>\n\n\n\n\n<link rel="canonical"', `</style>\n\n\n${themeScripts}\n\n\n<link rel="canonical"`)
  .replace('" />\n\n\n\n\n\n\n\n<link rel="icon"',
    `" />\n\n\n    <script type="text/javascript">\n\n        var ajaxurl = '/api/unavailable';\n    </script>\n\n\n\n\n\n<link rel="icon"`);

test('every public path is preserved and only reviewed runtime bundles change bytes', async () => {
  const expected = JSON.parse(await readFile(new URL('refactor-evidence/baseline-output.json', root), 'utf8'));
  const actual = await inventory(new URL('site/', root));
  const additions = new Set(['media/site-analytics.js', 'media/site-analytics.css', 'robots.txt', 'sitemap.xml',
    // PageSpeed plan 2026-11-21: subset WOFF2 files served ahead of the full fonts, which stay at their paths.
    'assets/theme/fonts/Inter_28pt-Regular.woff2', 'assets/theme/fonts/Inter_28pt-SemiBold.woff2', 'assets/theme/fonts/Inter_28pt-Bold.woff2',
    'assets/theme/fonts/bootstrap-icons-subset.woff2', 'media/fonts/Caveat-Variable.woff2',
    // PageSpeed plan 2026-11-21: frame 0 of each film, shown until the film itself is fetched.
    'media/promo-vid-poster.webp', 'media/sentrapedia-solusi-poster.webp',
    // License evidence 2026-11-22: the Inter font's OFL text, served beside the Inter files it covers.
    'assets/theme/fonts/Inter-OFL.txt']);
  for (let i = actual.length - 1; i >= 0; i--) if (additions.has(actual[i].path)) actual.splice(i, 1);
  // Strip only the reviewed shared metadata; preserve byte comparisons for the remaining HTML.
  for (const entry of actual.filter(entry => entry.path.endsWith('.html') && entry.path !== 'index.html' && entry.path !== 'privasi/index.html')) {
    const source = await readFile(new URL('site/' + entry.path, root), 'utf8');
    // The analytics choice panel is written after <body> on every page (PageSpeed plan 2026-11-21); strip it like the head block.
    entry.sha256 = createHash('sha256').update(source.replace(/<!-- google-site:start -->[\s\S]*?<!-- google-site:end -->\n/, '').replace(/\n<!-- analytics-choice:start -->[\s\S]*?<!-- analytics-choice:end -->/, '')).digest('hex');
  }
  for (const [file, reverse] of Object.entries(reversals20261121)) {
    const served = await readFile(new URL('site/' + file, root), 'utf8');
    const restored = reverse(served);
    assert.notEqual(restored, served, `${file}: the approved edit is no longer there to reverse`);
    actual.find(entry => entry.path === file).sha256 = createHash('sha256').update(restored).digest('hex');
  }
  // Reinsert only the audited unused WordPress emoji rule to prove the rest of the homepage is byte-identical.
  const html = await readFile(new URL('site/index.html', root), 'utf8');
  const removed = await readFile(new URL('refactor-evidence/removed-emoji-style.txt', root), 'utf8');
  const themeRestored = restoreThemeScripts(html);
  assert.notEqual(themeRestored, html, 'index.html: the theme script removal is no longer there to reverse');
  const restored = themeRestored.replace(/<!-- google-site:start -->[\s\S]*?<!-- google-site:end -->\n/, '').replace(/\n<!-- analytics-choice:start -->[\s\S]*?<!-- analytics-choice:end -->/, '').replace('https://sentrapedia.com/\" />', 'index.html\" />').replace('<style id="wp-block-library-inline-css">', removed + '<style id="wp-block-library-inline-css">')
    // Gaffer approved desktop/mobile beta access; remove only the exact added navigation markup for historical comparison.
    .replace('<li class="menu-item" data-login-desktop><a href="https://beta.sentrapedia.com/sign-in">Masuk</a></li>\n', '')
    .replace('<div class="col-md-7 main-menu-div d-none d-md-block">', '<div class="col-md-6 main-menu-div d-none d-md-block">')
    .replace('<div class="col-md-2 col-6">\n                <div class="lang-menu d-none d-md-block">', '<div class="col-md-3 col-6">\n                <div class="lang-menu d-none d-md-block">')
    .replace('<div class="d-flex align-items-center justify-content-end gap-3" data-login-actions>\n', '')
    .replace('<a href="https://beta.sentrapedia.com/sign-up" data-request-access>Daftar</a>\n', '')
    .replace(' </div><!-- login-actions -->\n', '')
    .replace('<li class="menu-item" data-login-mobile><a href="https://beta.sentrapedia.com/sign-in">Masuk</a></li>\n', '')
    .replace('<li class="menu-item" data-request-mobile><a href="https://beta.sentrapedia.com/sign-up">Daftar</a></li>\n', '')
    // Gaffer explicitly removed the directional caption on 2026-10-23; preserve the historical baseline.
    .replace('<h3 id="capability-explorer-title">Sepuluh kemampuan.<br>Satu ruang kerja.</h3></div>', '$&<p>3 ke kanan · 3 turun<br>3 ke kanan · 1 turun.</p>')
    // PageSpeed plan approved by Gaffer on 2026-11-21; each line below removes exactly one approved homepage edit.
    .replace(siteFontsBlock, '')
    .replace('<video class="product-film-video" muted playsinline loop preload="none" poster="/media/promo-vid-poster.webp">', '<video class="product-film-video" muted playsinline loop preload="metadata">')
    .replace('<video muted playsinline loop preload="none" poster="/media/sentrapedia-solusi-poster.webp" aria-label=', '<video muted playsinline loop preload="metadata" aria-label=')
    .replace('<script id="jquery-core-js" src="assets/vendor/jquery.min.js?ver=3.7.1" defer>', '<script id="jquery-core-js" src="assets/vendor/jquery.min.js?ver=3.7.1">')
    .replace('<script id="jquery-migrate-js" src="assets/vendor/jquery-migrate.min.js?ver=3.4.1" defer>', '<script id="jquery-migrate-js" src="assets/vendor/jquery-migrate.min.js?ver=3.4.1">')
    .replace('<script id="bootstrap-js" src="/vendor/cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" defer>', '<script id="bootstrap-js" src="/vendor/cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js">')
    .replace('<script id="slick-js" src="/vendor/cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.8.1/slick.min.js" defer>', '<script id="slick-js" src="/vendor/cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.8.1/slick.min.js">')
    .replace('<script id="custom-js" src="assets/theme/js/custom55e2.js?ver=7.1.3" defer>', '<script id="custom-js" src="assets/theme/js/custom55e2.js?ver=7.1.3">')
    .replace('<h2 class="section-subtitle h5">Alur Kerja</h2>', '<h5 class="section-subtitle">Alur Kerja</h5>');
  actual.find(entry => entry.path === 'index.html').sha256 = createHash('sha256').update(restored).digest('hex');
  assert.deepEqual(actual.map(entry => entry.path), expected.map(entry => entry.path));
  const runtime = new Set(['media/design-audit.js', 'media/hero-workspace.js', 'media/capability-explorer.js', 'media/clinical-video.js', 'media/workflow-playback.js', 'privasi/index.html']); // Privacy copy is independently reviewed for the opt-in analytics change.
  // PageSpeed plan 2026-11-21: the four wordmarks keep their URL and change bytes on purpose (the word is an outline shaped
  // from the Inter Bold each file used to embed; the mark is resampled). reference/design-integrity.json holds their new hashes.
  const performance20261121 = new Set([
    'assets/theme/img/sentrapedia-wordmark-big.svg', 'assets/theme/img/sentrapedia-wordmark-compact.svg',
    'assets/theme/img/sentrapedia-wordmark-footer.svg', 'assets/theme/img/sentrapedia-wordmark-header.svg',
  ]);
  const reviewed = entry => !runtime.has(entry.path) && !performance20261121.has(entry.path);
  assert.deepEqual(actual.filter(reviewed), expected.filter(reviewed));
});
