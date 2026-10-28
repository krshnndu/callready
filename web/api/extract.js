// Vercel function: starts an extraction job on the API (POST), or reads its status (GET ?job=).
// Extraction takes minutes, so the browser polls instead of holding one long connection open.
export default async function handler(req, res) {
  const origin = process.env.BACKEND_ORIGIN;
  if (!origin) return res.status(503).json({ error: 'extractor not configured' });
  const headers = { 'content-type': 'application/json', 'x-callready-key': process.env.BACKEND_KEY || '', 'x-client-ip': String(req.headers['x-forwarded-for'] || '').split(',')[0] };
  try {
    let r;
    if (req.method === 'POST') r = await fetch(`${origin}/api/extract`, { method: 'POST', headers, body: JSON.stringify(req.body || {}), signal: AbortSignal.timeout(25000) });
    else if (req.method === 'GET' && /^[a-f0-9]{16}$/.test(String(req.query.job || ''))) r = await fetch(`${origin}/api/extract/${req.query.job}`, { headers, signal: AbortSignal.timeout(15000) });
    else return res.status(400).json({ error: 'POST a document, or GET ?job=<id>' });
    res.status(r.status).setHeader('content-type', 'application/json').send(await r.text());
  } catch {
    res.status(504).json({ error: 'extractor unreachable' });
  }
}
