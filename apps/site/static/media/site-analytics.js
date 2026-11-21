(() => {
  'use strict';
  const id = 'G-XKM0Q1GQCL';
  const key = 'sentrapedia.analytics.v1';
  const paths = new Set(['/', '/index.html', '/faq/', '/privasi/', '/ketentuan/', '/penafian/', '/ruang-kerja/', '/sejarah-sentra/']);
  if (!paths.has(location.pathname) || !['sentrapedia.com', 'www.sentrapedia.com'].includes(location.hostname)) return;
  let granted = false;
  let loaded = false;
  let choice = null;
  try { choice = JSON.parse(localStorage.getItem(key)); } catch { /* A blocked store leaves analytics off. */ }
  const valid = choice && ['granted', 'denied'].includes(choice.value) && Date.now() - choice.time < 180 * 86400000;
  window.dataLayer = window.dataLayer || [];
  function tag() { window.dataLayer.push(arguments); }
  tag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  function track(name, parameters = {}) {
    if (granted) tag('event', name, { ...parameters, send_to: id });
  }
  function enable() {
    granted = true;
    window['ga-disable-' + id] = false;
    tag('consent', 'update', { analytics_storage: 'granted' });
    if (loaded) return;
    loaded = true;
    tag('js', new Date());
    const url = new URL(location.origin + (location.pathname === '/index.html' ? '/' : location.pathname));
    // Only campaign labels are retained; arbitrary query strings, hashes and form data never enter events.
    for (const name of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const value = new URLSearchParams(location.search).get(name);
      if (value && /^[a-z0-9_-]{1,80}$/i.test(value)) url.searchParams.set(name, value);
    }
    let referrer = '';
    try { referrer = new URL(document.referrer).origin + '/'; } catch { /* No referrer. */ }
    tag('config', id, { page_location: url.href, page_referrer: referrer, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 15552000 });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.append(script);
  }
  // The build writes the panel into each page so it paints with the page; this module adopts it and builds one only if it is absent.
  const inPage = document.querySelector('.analytics-choice');
  const panel = inPage || document.createElement('section');
  panel.className = 'analytics-choice';
  panel.setAttribute('aria-label', 'Pilihan analitik');
  panel.setAttribute('data-nosnippet', '');
  if (!inPage) panel.innerHTML = '<h2>Izinkan analitik kunjungan?</h2><p>Google Analytics membantu kami memahami penggunaan situs. Pilihan ini opsional. Isi formulir dan data pasien tidak dikirim ke Analytics. <a href="/privasi/#pasal-5">Kebijakan privasi</a></p><div class="analytics-actions"><button type="button" data-choice="denied">Tolak</button><button type="button" data-choice="granted">Izinkan analitik</button></div>';
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'analytics-settings';
  settings.textContent = 'Privasi analitik';
  settings.addEventListener('click', () => { panel.hidden = false; panel.querySelector('button').focus(); });
  function refuse() {
    granted = false;
    window['ga-disable-' + id] = true;
    tag('consent', 'update', { analytics_storage: 'denied' });
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ['', ';domain=' + location.hostname, ';domain=.sentrapedia.com']) document.cookie = name + '=;Max-Age=0;path=/' + domain;
    }
  }
  function save(value) {
    try { localStorage.setItem(key, JSON.stringify({ value, time: Date.now() })); } catch { /* This visit only. */ }
    panel.hidden = true;
    if (value === 'granted') enable();
    else refuse();
    settings.focus();
  }
  panel.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => save(button.dataset.choice)));
  if (inPage) document.body.append(settings);
  else document.body.append(panel, settings);
  panel.hidden = Boolean(valid);
  // The panel in the page can record a choice before this script has run, so a stored refusal gets the same
  // clean-up here as one made through save().
  if (valid && choice.value === 'granted') enable();
  else if (valid) refuse();
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (href === '#sentrapedia-contact') track('contact_click', { method: 'website' });
    else if (/^https:\/\/(wa.me|api.whatsapp.com)\//.test(href)) track('contact_click', { method: 'whatsapp' });
    else if (href.startsWith('/ruang-kerja/')) track('view_product', { product: 'sentrapedia' });
  });
  document.addEventListener('sentrapedia:contact-accepted', () => track('generate_lead', { method: 'contact_form' }));
})();
