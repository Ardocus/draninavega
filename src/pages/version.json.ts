import type { APIRoute } from 'astro';
import meta from '../data/meta.json';

// The admin portal reads this to tell the doctor when her changes are live.
// `content` is the portal content version this build used (0 = committed files).
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ content: meta.content, commit: process.env.COMMIT_REF || 'local' }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
