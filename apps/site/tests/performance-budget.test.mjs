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

const pages = ['index.html', 'faq/index.html', 'privasi/index.html', 'ketentuan/index.html', 'penafian/index.html', 'ruang-kerja/index.html', 'sejarah-sentra/index.html'];
const fullFont = /\.ttf\b|bootstrap-icons\.woff2\b/;

// Style rules in the order a browser applies them: linked sheets and inline <style> blocks, top to bottom.
async function cascade(page) {
  const html = await readFile(new URL(page, site), 'utf8');
  let css = '';
  for (const match of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>|<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
    if (match[1] !== undefined) { css += match[1] + '\n'; continue; }
    const href = /href=["']([^"']+)["']/.exec(match[0])[1].split('?')[0];
    css += await readFile(new URL(href.startsWith('/') ? href.slice(1) : new URL(href, new URL(page, 'https://x/')).pathname.slice(1), site), 'utf8') + '\n';
  }
  return { html, css };
}
function fontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(match => {
    const value = name => (new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(match[1])?.[1] ?? '').trim();
    return { family: value('font-family').replace(/["']/g, ''), weight: value('font-weight') || '400', display: value('font-display'), src: value('src'), range: value('unicode-range') };
  });
}
function inRange(range, codePoint) {
  return range.split(',').some(part => {
    const [from, to = from] = part.trim().replace(/^U\+/i, '').split('-').map(hex => parseInt(hex, 16));
    return codePoint >= from && codePoint <= to;
  });
}
function shadowFor(faces, index) {
  const face = faces[index];
  return faces.slice(index + 1).find(later => later.family === face.family && later.weight === face.weight && /\.woff2\b/.test(later.src) && later.range);
}

test('subset fonts sit in front of every full font', async () => {
  // Before: Inter x3 and Caveat as TTF (711 KiB on the wire) and all of Bootstrap Icons (128 KiB) for 23 icons.
  // A later @font-face for the same family and weight is checked first by browsers; its unicode-range keeps the
  // full file as the fallback for any character outside the subset, so no declaration or file is taken away.
  const limits = [[/Inter_28pt-(?:Regular|SemiBold|Bold)\.woff2/, 60000], [/Caveat-Variable\.woff2/, 90000], [/bootstrap-icons-subset\.woff2/, 8000]];
  let checked = 0;
  for (const page of pages) {
    const faces = fontFaces((await cascade(page)).css);
    for (const [index, face] of faces.entries()) {
      if (!fullFont.test(face.src)) continue;
      const shadow = shadowFor(faces, index);
      assert.ok(shadow, `${page}: ${face.family} ${face.weight} has no subset in front of it`);
      assert.equal(shadow.display, face.display, `${page}: ${face.family} ${face.weight} subset changes font-display`);
      const file = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(shadow.src)[1];
      const bytes = await readFile(new URL(file.slice(1), site));
      assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${file} is not WOFF2`);
      const limit = limits.find(([pattern]) => pattern.test(file));
      assert.ok(limit, `${file} has no size budget`);
      assert.ok(bytes.length <= limit[1], `${file} is ${bytes.length} bytes, over ${limit[1]}`);
      checked++;
    }
  }
  assert.equal(checked, 17, 'homepage: Inter 400/600/700, Clinical Caveat, bootstrap-icons; six other pages: Inter 400/600 each');
});

test('shipped copy stays inside the subset range', async () => {
  // A character outside the range still renders (the full font is fetched for it); this guards the saving instead.
  const entities = { amp: '&', middot: '·', nbsp: ' ', lt: '<', gt: '>', quot: '"' };
  for (const page of pages) {
    const { html, css } = await cascade(page);
    const faces = fontFaces(css);
    const text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
      .replace(/<[^>]*\b(?:alt|title|aria-label|placeholder)="([^"]*)"[^>]*>/g, ' $1 ').replace(/<[^>]+>/g, ' ')
      .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code))).replace(/&([a-z]+);/g, (whole, name) => entities[name] ?? whole);
    for (const face of faces.filter(face => face.range && /Inter/.test(face.family))) {
      for (const character of new Set(text)) {
        assert.ok(inRange(face.range, character.codePointAt(0)), `${page}: U+${character.codePointAt(0).toString(16).toUpperCase()} is outside the ${face.family} ${face.weight} subset`);
      }
    }
    const icons = faces.find(face => face.range && face.family === 'bootstrap-icons');
    const used = new Set([...html.matchAll(/\bbi-([a-z0-9-]+)/g)].map(match => match[1]));
    for (const name of used) {
      const code = new RegExp(`\\.bi-${name}::before\\{content:"\\\\([0-9a-f]+)"\\}`).exec(css)?.[1];
      if (!code) continue; // `bi-` inside an id or URL, not an icon class
      assert.ok(icons && inRange(icons.range, parseInt(code, 16)), `${page}: icon bi-${name} (U+${code}) is outside the icon subset`);
    }
  }
});

// Code points a TrueType file can draw, read from its cmap (formats 4 and 12), with Node built-ins only.
function codePoints(font) {
  const tables = font.readUInt16BE(4);
  let cmap = 0;
  for (let i = 0; i < tables; i++) if (font.toString('latin1', 12 + i * 16, 16 + i * 16) === 'cmap') cmap = font.readUInt32BE(20 + i * 16);
  const found = new Set();
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const table = cmap + font.readUInt32BE(cmap + 8 + i * 8);
    const format = font.readUInt16BE(table);
    if (format === 12) {
      for (let group = 0; group < font.readUInt32BE(table + 12); group++) {
        const at = table + 16 + group * 12;
        for (let code = font.readUInt32BE(at); code <= font.readUInt32BE(at + 4); code++) found.add(code);
      }
    } else if (format === 4) {
      const segments = font.readUInt16BE(table + 6) / 2;
      const ends = table + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, offsets = deltas + segments * 2;
      for (let segment = 0; segment < segments; segment++) {
        const start = font.readUInt16BE(starts + segment * 2), end = font.readUInt16BE(ends + segment * 2);
        for (let code = start; code <= end && code !== 0xffff; code++) {
          const offset = font.readUInt16BE(offsets + segment * 2);
          const glyph = offset === 0 ? (code + font.readUInt16BE(deltas + segment * 2)) & 0xffff : font.readUInt16BE(offsets + segment * 2 + offset + (code - start) * 2);
          if (glyph !== 0) found.add(code);
        }
      }
    }
  }
  return found;
}

test('the handwriting font is not fetched to draw an arrow it does not contain', async () => {
  // The clinical note sets an arrow in 'Clinical Caveat'. Caveat has no arrows, so with an unbounded full face the
  // browser fetched all 211 KiB only to fall back anyway. The full face now names what it can draw; anything it
  // cannot draw skips it. Its range must still cover every code point in the file, so no character loses its font.
  const faces = fontFaces((await cascade('index.html')).css).filter(face => face.family === 'Clinical Caveat');
  const full = faces.find(face => /\.ttf\b/.test(face.src));
  assert.ok(full.range, 'the full Caveat face has no unicode-range');
  const font = await readFile(new URL('media/fonts/Caveat-Variable.ttf', site));
  const drawable = codePoints(font);
  assert.ok(drawable.size > 700 && drawable.has(0x41) && !drawable.has(0x2192), 'cmap reader disagrees with the known contents of Caveat');
  for (const code of drawable) assert.ok(inRange(full.range, code), `U+${code.toString(16).toUpperCase()} is in Caveat but outside the range its face declares`);
  for (const arrow of [0x2190, 0x2191, 0x2192, 0x2193, 0x2197, 0x2198]) assert.ok(!inRange(full.range, arrow), `U+${arrow.toString(16).toUpperCase()} would fetch the full Caveat for nothing`);
});
