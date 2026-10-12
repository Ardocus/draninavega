import { defineConfig } from 'astro/config';

// Production URL, used for canonical/hreflang/sitemap/OG links.
// Netlify sets URL to the site's primary domain during builds. The fallback
// only matters for local builds; update it once the domain is registered.
const SITE_URL = process.env.SITE_URL || process.env.URL || 'https://draninavega.com';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
    inlineStylesheets: 'always',
  },
  vite: {
    build: {
      // Keep scripts as files so the CSP can use script-src 'self'.
      assetsInlineLimit: 0,
    },
  },
});
