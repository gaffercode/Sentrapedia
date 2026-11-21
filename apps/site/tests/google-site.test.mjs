import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { googleHead, pages, sitemap } from '../scripts/google-site.mjs';

const script = await readFile(new URL('../static/media/site-analytics.js', import.meta.url), 'utf8');
function visit(saved = null, hostname = 'sentrapedia.com') {
  const listeners = {};
  const buttons = ['denied', 'granted'].map(value => ({ dataset: { choice: value }, addEventListener(_event, handler) { this.click = handler; }, focus() {} }));
  const scripts = [];
  const node = () => ({ setAttribute() {}, addEventListener() {}, focus() {}, querySelector: () => buttons[0], querySelectorAll: () => buttons });
  const document = { referrer: 'https://example.com/private?email=private@example.com', cookie: '', createElement: node,
    head: { append: element => scripts.push(element) }, body: { append() {} }, addEventListener: (name, handler) => { listeners[name] = handler; } };
  const context = { document, location: { hostname, origin: 'https://' + hostname, pathname: '/', search: '?email=private@example.com&utm_source=linkedin&case=secret#patient' },
    URL, URLSearchParams, Date, localStorage: { getItem: () => saved, setItem() {} } };
  context.window = context;
  vm.runInNewContext(script, context);
  return { context, buttons, scripts, listeners };
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
