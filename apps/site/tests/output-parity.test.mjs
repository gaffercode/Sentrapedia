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
test('every public path is preserved and only reviewed runtime bundles change bytes', async () => {
  const expected = JSON.parse(await readFile(new URL('refactor-evidence/baseline-output.json', root), 'utf8'));
  const actual = await inventory(new URL('site/', root));
  const additions = new Set(['media/site-analytics.js', 'media/site-analytics.css', 'robots.txt', 'sitemap.xml',
    // PageSpeed plan 2026-11-21: subset WOFF2 files served ahead of the full fonts, which stay at their paths.
    'assets/theme/fonts/Inter_28pt-Regular.woff2', 'assets/theme/fonts/Inter_28pt-SemiBold.woff2', 'assets/theme/fonts/Inter_28pt-Bold.woff2',
    'assets/theme/fonts/bootstrap-icons-subset.woff2', 'media/fonts/Caveat-Variable.woff2',
    // PageSpeed plan 2026-11-21: frame 0 of each film, shown until the film itself is fetched.
    'media/promo-vid-poster.webp', 'media/sentrapedia-solusi-poster.webp']);
  for (let i = actual.length - 1; i >= 0; i--) if (additions.has(actual[i].path)) actual.splice(i, 1);
  // Strip only the reviewed shared metadata; preserve byte comparisons for the remaining HTML.
  for (const entry of actual.filter(entry => entry.path.endsWith('.html') && entry.path !== 'index.html' && entry.path !== 'privasi/index.html')) {
    const source = await readFile(new URL('site/' + entry.path, root), 'utf8');
    entry.sha256 = createHash('sha256').update(source.replace(/<!-- google-site:start -->[\s\S]*?<!-- google-site:end -->\n/, '')).digest('hex');
  }
  // Reinsert only the audited unused WordPress emoji rule to prove the rest of the homepage is byte-identical.
  const html = await readFile(new URL('site/index.html', root), 'utf8');
  const removed = await readFile(new URL('refactor-evidence/removed-emoji-style.txt', root), 'utf8');
  const restored = html.replace(/<!-- google-site:start -->[\s\S]*?<!-- google-site:end -->\n/, '').replace('https://sentrapedia.com/\" />', 'index.html\" />').replace('<style id="wp-block-library-inline-css">', removed + '<style id="wp-block-library-inline-css">')
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
    .replace(/\n<style id="site-fonts-css">\n(?:@font-face \{[^}]*\}\n){4}<\/style>/, '')
    .replace('<video class="product-film-video" muted playsinline loop preload="none" poster="/media/promo-vid-poster.webp">', '<video class="product-film-video" muted playsinline loop preload="metadata">')
    .replace('<video muted playsinline loop preload="none" poster="/media/sentrapedia-solusi-poster.webp" aria-label=', '<video muted playsinline loop preload="metadata" aria-label=');
  actual.find(entry => entry.path === 'index.html').sha256 = createHash('sha256').update(restored).digest('hex');
  assert.deepEqual(actual.map(entry => entry.path), expected.map(entry => entry.path));
  const runtime = new Set(['media/design-audit.js', 'media/hero-workspace.js', 'media/capability-explorer.js', 'media/clinical-video.js', 'media/workflow-playback.js', 'privasi/index.html']); // Privacy copy is independently reviewed for the opt-in analytics change.
  // PageSpeed plan, approved by Gaffer on 2026-11-21 (docs/refactor-progress.md): these paths keep their URL and change bytes on purpose.
  const performance20261121 = new Set([
    // The word is an outline shaped from the Inter Bold each file used to embed; the mark is resampled to its drawn size.
    'assets/theme/img/sentrapedia-wordmark-big.svg', 'assets/theme/img/sentrapedia-wordmark-compact.svg',
    'assets/theme/img/sentrapedia-wordmark-footer.svg', 'assets/theme/img/sentrapedia-wordmark-header.svg',
    // A subset @font-face follows each full-font rule; the full Caveat rule also names the range it can draw.
    'media/clinical-video.css', 'media/faq.css', 'media/legal.css', 'media/ruang-kerja.css', 'media/sejarah-sentra.css',
    // An early observer starts the film's download before playback is due (media/clinical-video.js is a runtime bundle above).
    'media/product-film.js',
  ]);
  const reviewed = entry => !runtime.has(entry.path) && !performance20261121.has(entry.path);
  assert.deepEqual(actual.filter(reviewed), expected.filter(reviewed));
});
