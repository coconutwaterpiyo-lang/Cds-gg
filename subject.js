// /api/subject.js
// Server-side proxy: browser calls THIS endpoint (same origin, no CORS issue),
// this function calls the streamfiles API on the server (no CORS restriction
// applies server-to-server), and passes the JSON straight back.

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  try {
    const upstream = await fetch(
      `https://cds.streamfiles.eu.org/api.php?action=subject&token=${encodeURIComponent(token)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
          'Accept': 'application/json'
        }
      }
    );

    const bodyText = await upstream.text();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(upstream.status).send(bodyText);
  } catch (err) {
    res.status(502).json({ error: 'Upstream fetch failed', detail: String(err) });
  }
}
