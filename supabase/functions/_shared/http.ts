export function corsHeaders(req: Request): Record<string, string> {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((value: string) => value.trim()).filter(Boolean);
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = configured.includes('*') ? '*' : (configured.includes(origin) ? origin : configured[0]);
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name, traceparent, tracestate, baggage',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export function getClientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function safeError(error: unknown, fallback = 'The operation could not be completed.'): string {
  console.error(error);
  return fallback;
}
