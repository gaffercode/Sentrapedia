export const origin = 'https://sentrapedia.com';
export const pages = ['/', '/faq/', '/privasi/', '/ketentuan/', '/penafian/', '/ruang-kerja/', '/sejarah-sentra/'];

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
  return clean.replace('</head>', `<!-- google-site:start -->
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
