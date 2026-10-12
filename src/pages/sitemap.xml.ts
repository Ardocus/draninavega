import type { APIRoute } from 'astro';
import { langPath } from '../lib/site';

export const GET: APIRoute = ({ site }) => {
  const es = new URL(langPath.es, site).href;
  const en = new URL(langPath.en, site).href;
  const alternates = `
    <xhtml:link rel="alternate" hreflang="es" href="${es}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${en}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${es}"/>`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url><loc>${es}</loc>${alternates}
  </url>
  <url><loc>${en}</loc>${alternates}
  </url>
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
