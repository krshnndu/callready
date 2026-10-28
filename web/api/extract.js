// Vercel function: forwards a document's text to the API's extractor (AI), which returns a draft pack.
// The browser then checks the draft against the same text with rules before anything is used.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const origin = process.env.BACKEND_ORIGIN;
  if (!origin) return res.status(503).json({ error: 'extractor not configured' });
  try {
    const r = await fetch(`${origin}/api/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-callready-key': process.env.BACKEND_KEY || '', 'x-client-ip': String(req.headers['x-forwarded-for'] || '').split(',')[0] },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(280000),
    });
    res.status(r.status).setHeader('content-type', 'application/json').send(await r.text());
  } catch {
    res.status(504).json({ error: 'extraction timed out' });
  }
}
