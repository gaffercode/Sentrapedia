// The three accessibility findings of the PageSpeed Insights review of 2026-11-21 (Accessibility 92), held against the
// built site with Node built-ins only. Lighthouse itself is not a dependency; its result is recorded in docs/refactor-progress.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const site = new URL('../site/', import.meta.url);
const read = file => readFile(new URL(file, site), 'utf8');

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test('small teal labels in the capability explorer reach 4.5:1 on every surface they sit on', async () => {
  // Before: card numbers #0a8b80 on #f9fcfb (4.05:1) and on #f0f9f7 (3.91:1); the FIG. label #138d80 on white (4.08:1); all 11 px.
  assert.ok(Math.abs(contrast('#0a8b80', '#f9fcfb') - 4.05) < 0.01, 'the formula reproduces the ratio Lighthouse reported');
  const explorer = await read('media/capability-explorer.css');
  const anatomy = await read('media/capability-anatomy.css');
  const properties = Object.fromEntries([...(explorer + anatomy).matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{3,6})\b/g)].map(match => [match[1], match[2]]));
  const colour = value => (value.startsWith('var(') ? properties[value.slice(4, -1)] : value);
  const index = colour(/\.capability-live-card-index \{ color: ([^;]+);/.exec(explorer)[1]);
  const surfaces = [/\.capability-live-card \{[^}]*background: (#[0-9a-f]{6})/.exec(explorer)[1], /\.capability-live-card:first-child \{[^}]*background: (#[0-9a-f]{6})/.exec(explorer)[1]];
  assert.deepEqual(surfaces, ['#f9fcfb', '#f0f9f7']);
  for (const surface of surfaces) assert.ok(contrast(index, surface) >= 4.5, `card number ${index} on ${surface} is ${contrast(index, surface).toFixed(2)}:1`);
  const figure = colour(/\.feature-anatomy-heading span:first-child \{ color: ([^;]+);/.exec(anatomy)[1]);
  assert.ok(contrast(figure, '#ffffff') >= 4.5, `FIG. label ${figure} on white is ${contrast(figure, '#ffffff').toFixed(2)}:1`);
  // The illustration keeps its own accent; only the text label changes.
  assert.match(anatomy, /--anatomy-accent: #138d80/);
});

test('no heading on the homepage skips a level on the way down', async () => {
  // Before: <h5 class="section-subtitle">Alur Kerja</h5> directly after an <h2>.
  const html = await read('index.html');
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map(match => ({ level: Number(match[1]), text: match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) }));
  assert.ok(headings.length > 30);
  for (let i = 1; i < headings.length; i++) {
    assert.ok(headings[i].level <= headings[i - 1].level + 1, `h${headings[i - 1].level} "${headings[i - 1].text}" is followed by h${headings[i].level} "${headings[i].text}"`);
  }
  // It keeps its look: the theme styles `.h5` exactly as it styles `h5`, and the reveal script finds it by class.
  assert.match(html, /<h2 class="section-subtitle h5">Alur Kerja<\/h2>/);
});

test('the split title is named on its heading, not on its lines', async () => {
  // Before: SplitText's aria: 'auto' put aria-label on the two <span> lines of #clinical-title; a span has no role
  // that takes a name, so assistive technology may ignore it while the letters beneath are hidden.
  const script = await read('media/clinical-video.js');
  assert.match(script, /SplitText\.create\(element, \{ type, mask: 'words', aria \}\)/);
  assert.match(script, /function split\(element, type, aria = 'auto'\)/, 'stage titles (headings) keep aria: auto');
  assert.match(script, /split\(titleLines, 'words,chars', 'hidden'\)/, 'the title lines are hidden while split');
  assert.match(script, /heading\.setAttribute\('aria-label', \[\.\.\.titleLines\]\.map\(line => line\.textContent\.trim\(\)\)\.join\(' '\)\)/, 'the heading carries the whole title');
  assert.match(script, /heading\.removeAttribute\('aria-label'\);[\s\S]{0,80}splits\.forEach\(item => item\.revert\(\)\)/, 'the name goes when the split is reverted');
  const html = await read('index.html');
  assert.doesNotMatch(html, /<span class="clinical-title-line[^>]*\baria-label=/, 'the title lines carry no aria-label in the page markup either');
});
