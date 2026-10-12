import type { APIRoute } from 'astro';

// The admin portal reads this to tell the doctor when her changes are live.
// COMMIT_REF is set by Netlify during builds.
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ commit: process.env.COMMIT_REF || 'local' }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
