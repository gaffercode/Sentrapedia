import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { googleHead, pages, sitemap } from '../scripts/google-site.mjs';

const script = await readFile(new URL('../static/media/site-analytics.js', import.meta.url), 'utf8');
function visit(saved = null, hostname = 'sentrapedia.com', pagePanel = false, cookie = '') {
  const cookieWrites = [];
  const listeners = {};
  const buttons = ['denied', 'granted'].map(value => ({ dataset: { choice: value }, addEventListener(_event, handler) { this.click = handler; }, focus() {} }));
  const scripts = [];
  const created = [];
  const appended = [];
  const node = tag => { const element = { tag, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener() {}, focus() {}, querySelector: () => buttons[0], querySelectorAll: () => buttons }; created.push(element); return element; };
  // The panel the build writes into the page, hidden until the inline script or the module decides.
  const panel = pagePanel ? { tag: 'section', hidden: true, setAttribute() {}, addEventListener() {}, focus() {}, querySelector: () => buttons[0], querySelectorAll: () => buttons } : null;
  const document = { referrer: 'https://example.com/private?email=private@example.com', get cookie() { return cookie; }, set cookie(value) { cookieWrites.push(value); }, createElement: node, querySelector: selector => (selector === '.analytics-choice' ? panel : null),
    head: { append: element => scripts.push(element) }, body: { append: (...elements) => appended.push(...elements) }, addEventListener: (name, handler) => { listeners[name] = handler; } };
  const context = { document, location: { hostname, origin: 'https://' + hostname, pathname: '/', search: '?email=private@example.com&utm_source=linkedin&case=secret#patient' },
    URL, URLSearchParams, Date, localStorage: { getItem: () => saved, setItem() {} } };
  context.window = context;
  vm.runInNewContext(script, context);
  return { context, buttons, scripts, listeners, panel, created, appended, cookieWrites };
}

test('analytics sends nothing before consent, after rejection, or from preview hosts', () => {
  const fresh = visit();
  assert.equal(fresh.scripts.length, 0);
  fresh.buttons[0].click();
  fresh.listeners['sentrapedia:contact-accepted']();
  assert.equal(fresh.scripts.length, 0);
  assert.equal(fresh.context.dataLayer.some(args => args[0] === 'event'), false);
  assert.equal(visit(null, 'localhost').context.dataLayer, undefined);
  assert.equal(visit(JSON.stringify({ value: 'granted', time: Date.now() - 181 * 86400000 })).scripts.length, 0);
});

test('consent enables one tag, strips private URL data, and withdrawal stops lead events', () => {
  const result = visit();
  result.buttons[1].click();
  assert.equal(result.scripts.length, 1);
  const config = result.context.dataLayer.find(args => args[0] === 'config')[2];
  assert.equal(config.page_location, 'https://sentrapedia.com/?utm_source=linkedin');
  assert.equal(config.page_referrer, 'https://example.com/');
  assert.equal(config.allow_google_signals, false);
  result.listeners['sentrapedia:contact-accepted']({ detail: { email: 'private@example.com' } });
  const events = () => result.context.dataLayer.filter(args => args[0] === 'event');
  assert.equal(events().length, 1);
  assert.doesNotMatch(JSON.stringify(events()), /private@example.com/);
  result.buttons[0].click();
  result.listeners['sentrapedia:contact-accepted']();
  assert.equal(events().length, 1);
  assert.equal(result.context['ga-disable-G-XKM0Q1GQCL'], true);
});

test('all public pages have one absolute canonical; sitemap contains only shipped public pages', async () => {
  for (const pathname of pages) {
    const output = await readFile(new URL('../site' + pathname + 'index.html', import.meta.url), 'utf8');
    assert.equal((output.match(/rel="canonical"/g) || []).length, 1);
    assert.ok(output.includes(`href="https://sentrapedia.com${pathname}"`));
    assert.ok(output.includes('/media/site-analytics.js'));
    assert.equal((output.match(/name=["']description["']/g) || []).length, 1);
  }
  assert.equal((sitemap().match(/<url>/g) || []).length, 7);
  assert.doesNotMatch(sitemap(), /beta\.|api\/|sign-in/);
  assert.match(googleHead('<head></head>', '/'), /"@type":"WebSite"/);
});

// PageSpeed review 2026-11-21: the analytics choice was the Largest Contentful Paint element and was created by a
// deferred script. The build now writes the panel into each page; the tests below hold the consent rules in place.
const analyticsBlock = /\n<!-- analytics-choice:start -->\n(<section class="analytics-choice" aria-label="Pilihan analitik" data-nosnippet hidden>([\s\S]*?)<\/section>)<script>([\s\S]*?)<\/script>\n<!-- analytics-choice:end -->/;

test('every public page carries the analytics choice in its markup, first in the body and hidden', async () => {
  for (const pathname of pages) {
    const output = await readFile(new URL('../site' + pathname + 'index.html', import.meta.url), 'utf8');
    assert.equal((output.match(/class="analytics-choice"/g) || []).length, 1, pathname);
    const body = /<body\b[^>]*>/.exec(output);
    assert.ok(body, pathname);
    assert.equal(analyticsBlock.exec(output)?.index, body.index + body[0].length, pathname + ': the panel is not the first thing in <body>');
  }
});

test('the panel in the page and the fallback the module can still build are the same markup', async () => {
  const output = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  const fallback = /panel\.innerHTML = '([^']+)';/.exec(script)[1];
  assert.equal(analyticsBlock.exec(output)[2], fallback);
});

function paint(inline, { hostname = 'sentrapedia.com', pathname = '/', saved = null, blocked = false } = {}) {
  const stored = [];
  const panel = { hidden: true, addEventListener(type, handler) { this[type] = handler; } };
  const context = { document: { currentScript: { previousElementSibling: panel } }, location: { hostname, pathname }, Date, JSON,
    localStorage: { getItem() { if (blocked) throw new Error('blocked'); return saved; }, setItem(key, value) { if (blocked) throw new Error('blocked'); stored.push([key, JSON.parse(value)]); } } };
  vm.runInNewContext(inline, context);
  // A click as the browser delivers it: the target answers closest('[data-choice]') with the button, or with nothing.
  const press = choice => panel.click({ target: { closest: selector => (selector === '[data-choice]' && choice ? { getAttribute: name => (name === 'data-choice' ? choice : null) } : null) } });
  return { panel, stored, press };
}
const firstPaint = (inline, options) => paint(inline, options).panel.hidden;

test('the inline script shows the panel only where and when the module would', async () => {
  const output = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  const inline = analyticsBlock.exec(output)[3];
  const stored = (value, daysAgo) => JSON.stringify({ value, time: Date.now() - daysAgo * 86400000 });
  assert.equal(firstPaint(inline), false, 'first visit: shown');
  assert.equal(firstPaint(inline, { hostname: 'www.sentrapedia.com', pathname: '/faq/' }), false);
  assert.equal(firstPaint(inline, { saved: stored('denied', 1) }), true, 'a refusal is remembered');
  assert.equal(firstPaint(inline, { saved: stored('granted', 179) }), true, 'a consent is remembered');
  assert.equal(firstPaint(inline, { saved: stored('granted', 181) }), false, 'a choice older than 180 days is asked again');
  assert.equal(firstPaint(inline, { saved: stored('maybe', 1) }), false, 'an unknown value is not a choice');
  assert.equal(firstPaint(inline, { saved: '{broken' }), false, 'an unreadable choice is asked again');
  assert.equal(firstPaint(inline, { blocked: true }), false, 'blocked storage: shown, as before');
  assert.equal(firstPaint(inline, { hostname: 'localhost' }), true, 'preview and local hosts never show it');
  assert.equal(firstPaint(inline, { hostname: 'sentrapedia.vercel.app' }), true);
  assert.equal(firstPaint(inline, { pathname: '/media/site-analytics.js' }), true, 'only the listed public pages');
  // The two scripts must agree on where analytics may run and where the choice is kept.
  const modulePaths = /const paths = new Set\(\[([^\]]+)\]\)/.exec(script)[1].replace(/\s/g, '');
  assert.ok(inline.replace(/\s/g, '').includes('[' + modulePaths + ']'), 'path lists differ');
  assert.ok(inline.includes("'sentrapedia.analytics.v1'") && script.includes("const key = 'sentrapedia.analytics.v1'"));
  assert.doesNotMatch(inline, /googletagmanager|dataLayer|gtag|document\.cookie|createElement|fetch|XMLHttpRequest|sendBeacon/, 'the inline script never loads or sends anything');
});

test('the module adopts the panel already in the page and keeps every consent rule', () => {
  const fresh = visit(null, 'sentrapedia.com', true);
  assert.deepEqual(fresh.created.map(element => element.tag), ['button'], 'only the settings button is created');
  assert.deepEqual(fresh.appended.map(element => element.tag), ['button'], 'the panel stays where the build put it');
  assert.equal(fresh.panel.hidden, false, 'no stored choice: shown even if the inline script did not run');
  assert.equal(fresh.scripts.length, 0, 'nothing is loaded before a choice');
  fresh.buttons[0].click();
  assert.equal(fresh.panel.hidden, true, 'Tolak closes it');
  assert.equal(fresh.scripts.length, 0);
  const consented = visit(null, 'sentrapedia.com', true);
  consented.buttons[1].click();
  assert.equal(consented.scripts.length, 1, 'Izinkan loads the one tag');
  const returning = visit(JSON.stringify({ value: 'denied', time: Date.now() }), 'sentrapedia.com', true);
  assert.equal(returning.panel.hidden, true);
  assert.equal(returning.scripts.length, 0);
  const preview = visit(null, 'localhost', true);
  assert.equal(preview.panel.hidden, true, 'on a preview host the module leaves the hidden panel alone');
  assert.equal(preview.appended.length, 0);
  // Without a panel in the page the module still builds one, as before.
  const legacy = visit();
  assert.deepEqual(legacy.created.map(element => element.tag), ['section', 'button']);
  assert.deepEqual(legacy.appended.map(element => element.tag), ['section', 'button']);
});

// Final review, 2026-11-21: the panel is on screen before /media/site-analytics.js has run, and that script may never
// run (a slow connection, a content blocker matching its name). Its two buttons must work without it.
test('the panel closes and keeps the choice without the module', async () => {
  const output = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  const inline = analyticsBlock.exec(output)[3];
  const refused = paint(inline);
  assert.equal(refused.panel.hidden, false);
  refused.press('denied');
  assert.equal(refused.panel.hidden, true, 'Tolak closes the panel before the module exists');
  assert.equal(refused.stored.length, 1);
  assert.equal(refused.stored[0][0], 'sentrapedia.analytics.v1');
  assert.equal(refused.stored[0][1].value, 'denied');
  assert.ok(Math.abs(Date.now() - refused.stored[0][1].time) < 5000, 'stored in the shape the module reads');
  // The choice it stored is one the inline script itself honours on the next page.
  assert.equal(firstPaint(inline, { saved: JSON.stringify(refused.stored[0][1]) }), true);
  const allowed = paint(inline);
  allowed.press('granted');
  assert.deepEqual([allowed.panel.hidden, allowed.stored[0][1].value], [true, 'granted'], 'Izinkan is recorded; the module acts on it when it arrives');
  const elsewhere = paint(inline);
  elsewhere.press(null);
  assert.deepEqual([elsewhere.panel.hidden, elsewhere.stored.length], [false, 0], 'a click on the text or the privacy link is not a choice');
  const noStorage = paint(inline, { blocked: true });
  noStorage.press('denied');
  assert.equal(noStorage.panel.hidden, true, 'blocked storage: closed for this page, as the module does');
  assert.equal(paint(inline, { hostname: 'localhost' }).panel.click, undefined, 'nothing is wired on preview hosts');
});

test('a choice stored before the module ran gets the module\'s full handling when it loads', () => {
  const refusal = JSON.stringify({ value: 'denied', time: Date.now() });
  const refused = visit(refusal, 'sentrapedia.com', true, '_ga=GA1.1.1; _ga_XKM0Q1GQCL=GS1.1.2; theme=dark');
  assert.equal(refused.panel.hidden, true);
  assert.equal(refused.scripts.length, 0, 'a refusal loads nothing');
  assert.equal(refused.context['ga-disable-G-XKM0Q1GQCL'], true, 'the same switch a refusal made through the module sets');
  assert.ok(refused.cookieWrites.some(write => write.startsWith('_ga=;Max-Age=0')) && refused.cookieWrites.some(write => write.startsWith('_ga_XKM0Q1GQCL=;Max-Age=0')), 'cookies left by an earlier, expired consent are removed');
  assert.ok(refused.cookieWrites.every(write => !write.startsWith('theme=')), 'no other cookie is touched');
  const allowed = visit(JSON.stringify({ value: 'granted', time: Date.now() }), 'sentrapedia.com', true);
  assert.equal(allowed.scripts.length, 1, 'a consent given before the module ran loads the one tag');
  assert.equal(visit().cookieWrites.length, 0, 'a first visit with no choice clears nothing');
});

test('the analytics panel is kept out of search snippets wherever it is built', () => {
  // It is now the first text in every page; without this Google may quote it instead of the page.
  assert.equal(visit().created.find(element => element.tag === 'section').attributes['data-nosnippet'], '', 'the module\'s fallback panel');
});
