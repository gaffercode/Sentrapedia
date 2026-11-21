// Budgets from the PageSpeed Insights review of 2026-11-21 (mobile Performance 66, LCP 11.9 s, 7,318 KiB).
// Each test guards one cause that review found, against the built site only; no browser or package is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const site = new URL('../site/', import.meta.url);

test('wordmarks ship outlines, not an embedded font', async () => {
  // Before: each file embedded Inter Bold (343,972 bytes) and a 943x735 PNG, 558 KB apiece, loaded four times.
  const expected = {
    compact: { width: 152, height: 24, limit: 24000 },
    header: { width: 168, height: 48, limit: 24000 },
    big: { width: 1380, height: 650, limit: 90000 },
    footer: { width: 161, height: 92, limit: 24000 },
  };
  for (const [name, { width, height, limit }] of Object.entries(expected)) {
    const file = `assets/theme/img/sentrapedia-wordmark-${name}.svg`;
    const svg = await readFile(new URL(file, site), 'utf8');
    assert.doesNotMatch(svg, /@font-face/, `${file} embeds a font`);
    assert.doesNotMatch(svg, /<text\b/, `${file} still depends on a font being present`);
    assert.match(svg, /<path\b/, `${file} has no outline`);
    assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Sentrapedia">`), `${file} changed its box or its name`);
    assert.ok(Buffer.byteLength(svg) <= limit, `${file} is ${Buffer.byteLength(svg)} bytes, over ${limit}`);
  }
});
