export const origin = 'https://sentrapedia.com';
export const pages = ['/', '/faq/', '/privasi/', '/ketentuan/', '/penafian/', '/ruang-kerja/', '/sejarah-sentra/'];

// The analytics choice is written into every page so it paints with the page instead of after script load (it was
// the Largest Contentful Paint element in the PageSpeed review of 2026-11-21). It ships hidden; the inline script only
// decides whether to show it, by the same host, path and stored-choice rules as /media/site-analytics.js, which then
// adopts this element and owns everything else. Because the panel is on screen before that script has run, and the
// script may never run (a slow connection, a content blocker), the inline script also lets either button close the
// panel and store the choice in the shape the module reads; the module acts on a stored choice when it loads.
// Nothing here loads or sends anything. data-nosnippet keeps the panel's text out of search results.
const choicePanel = '<section class="analytics-choice" aria-label="Pilihan analitik" data-nosnippet hidden><h2>Izinkan analitik kunjungan?</h2><p>Google Analytics membantu kami memahami penggunaan situs. Pilihan ini opsional. Isi formulir dan data pasien tidak dikirim ke Analytics. <a href="/privasi/#pasal-5">Kebijakan privasi</a></p><div class="analytics-actions"><button type="button" data-choice="denied">Tolak</button><button type="button" data-choice="granted">Izinkan analitik</button></div></section>';
const choiceScript = `(function(){var p=document.currentScript.previousElementSibling,k='sentrapedia.analytics.v1',c=null;if(['sentrapedia.com','www.sentrapedia.com'].indexOf(location.hostname)<0||[${['/', '/index.html', ...pages.slice(1)].map(page => `'${page}'`).join(', ')}].indexOf(location.pathname)<0)return;p.addEventListener('click',function(e){var b=e.target.closest('[data-choice]');if(!b)return;try{localStorage.setItem(k,JSON.stringify({value:b.getAttribute('data-choice'),time:Date.now()}))}catch(x){}p.hidden=true});try{c=JSON.parse(localStorage.getItem(k))}catch(e){}if(!(c&&(c.value==='granted'||c.value==='denied')&&Date.now()-c.time<180*86400000))p.hidden=false})();`;
const analyticsChoice = `\n<!-- analytics-choice:start -->\n${choicePanel}<script>${choiceScript}</script>\n<!-- analytics-choice:end -->`;

export function googleHead(html, pathname) {
  const canonical = origin + pathname;
  const hasDescription = /<meta\b[^>]*name=["']description["']/i.test(html);
  const description = 'Sentrapedia membantu dokter menata konteks, mengeksplorasi pengetahuan, dan menyusun dokumentasi klinis. Setiap keluaran ditinjau oleh dokter.';
  const hadCanonical = /<link\b[^>]*rel=["']canonical["'][^>]*>/i.test(html);
  const clean = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, `<link rel="canonical" href="${canonical}" />`);
  const schema = pathname === '/' ? `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'Sentrapedia', url: origin + '/', inLanguage: 'id',
    publisher: { '@type': 'Organization', name: 'Sentra Artificial Intelligence', url: origin + '/' }
  })}</script>` : '';
  return clean.replace(/<body\b[^>]*>/, body => body + analyticsChoice).replace('</head>', `<!-- google-site:start -->
${hadCanonical ? '' : `<link rel="canonical" href="${canonical}">`}
${hasDescription ? '' : `<meta name="description" content="${description}">`}
<meta property="og:site_name" content="Sentrapedia">
<meta property="og:url" content="${canonical}">
<meta name="google-site-verification" content="iH8sws19Xwk2OQx5CdXmzGUpyqHlZFFIqL0u0mcTDvU">
<link rel="stylesheet" href="/media/site-analytics.css">
<script src="/media/site-analytics.js" defer></script>
${schema}
<!-- google-site:end -->
</head>`);
}

export function sitemap() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.map(page => `  <url><loc>${origin}${page}</loc></url>`).join('\n') + '\n</urlset>\n';
}
