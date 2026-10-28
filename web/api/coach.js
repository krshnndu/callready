// Vercel function: forwards the coach call to the API on the VPS. The origin and the
// shared key live in Vercel env vars (BACKEND_ORIGIN, BACKEND_KEY), never in this repo.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const origin = process.env.BACKEND_ORIGIN;
  if (!origin) return res.status(503).json({ error: 'coach not configured' });
  try {
    const r = await fetch(`${origin}/api/coach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-callready-key': process.env.BACKEND_KEY || '', 'x-client-ip': String(req.headers['x-forwarded-for'] || '').split(',')[0] },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(50000),
    });
    res.status(r.status).setHeader('content-type', 'application/json').send(await r.text());
  } catch {
    res.status(504).json({ error: 'coach timed out' });
  }
}
