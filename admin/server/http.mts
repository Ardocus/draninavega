import { env } from './env.mts';

export class HttpError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;
  constructor(status: number, code: string, extra?: Record<string, unknown>) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function json(data: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(data), { status, headers });
}

export function readCookies(req: Request) {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// __Host- prefix: browser enforces Secure, Path=/ and no Domain, so the
// cookie can't be set or read by draninavega.com or any other subdomain.
export const SESSION_COOKIE = '__Host-nv_session';
export const PENDING_COOKIE = '__Host-nv_mfa';

export const cookie = (name: string, value: string, maxAgeSec: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
export const clearCookie = (name: string) => cookie(name, '', 0);

/**
 * CSRF defence for every state-changing request: exact Origin match plus a
 * JSON content type (which a cross-site <form> can't send without a preflight).
 * SameSite=Strict cookies are the second layer.
 */
export function assertSameOrigin(req: Request) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  if (req.headers.get('origin') !== env.origin) throw new HttpError(403, 'bad_origin');
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') throw new HttpError(403, 'bad_origin');
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) {
    throw new HttpError(415, 'json_required');
  }
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 64 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large');
  try {
    const v = JSON.parse(text || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as T;
  } catch {
    throw new HttpError(400, 'bad_json');
  }
}

export const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
