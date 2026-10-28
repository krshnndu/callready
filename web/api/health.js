export default async function handler(req, res) {
  const origin = process.env.BACKEND_ORIGIN;
  if (!origin) return res.status(200).json({ web: 'ok', api: 'not configured' });
  try {
    const r = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(8000) });
    res.status(200).json({ web: 'ok', api: r.ok ? await r.json() : `status ${r.status}` });
  } catch {
    res.status(200).json({ web: 'ok', api: 'unreachable' });
  }
}
