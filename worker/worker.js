// MicroCiv cloud-save Worker — a tiny per-account key/value store on Cloudflare KV.
//   GET  /v1/save?u=<id>  -> { t, data }   (data is the save envelope, or null)
//   PUT  /v1/save?u=<id>  body=<json>      -> { ok: true, t }
// The account id `u` is the only secret; anyone with the id can read/write that
// save (fine for a personal single-user game). No auth, permissive CORS.
//
// Wrapped the KV write in try/catch so a transient KV failure (e.g. the free-tier
// daily write cap) returns a clean 503 instead of an opaque 1101 exception.
export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '86400',
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const u = new URL(req.url);
    if (!u.pathname.endsWith('/v1/save')) return new Response('MicroCiv save worker', { headers: cors });

    const id = (u.searchParams.get('u') || '').replace(/[^a-z0-9]/gi, '').slice(0, 64);
    if (!id) return json({ error: 'missing u' }, 400);
    if (!env.SAVES) return json({ error: 'KV not bound — create the SAVES namespace' }, 500);
    const key = 'save:' + id;

    if (req.method === 'GET') {
      const v = await env.SAVES.get(key);
      return v
        ? new Response(v, { headers: { ...cors, 'content-type': 'application/json' } })
        : json({ data: null });
    }

    if (req.method === 'PUT') {
      const body = await req.text();
      if (body.length > 250000) return json({ error: 'too large' }, 413);
      let data;
      try { data = JSON.parse(body); } catch (e) { return json({ error: 'bad json' }, 400); }
      const t = (data && typeof data.t === 'number') ? data.t : Date.now();
      try {
        await env.SAVES.put(key, JSON.stringify({ t, data }));
      } catch (e) {
        // Most likely the free-tier KV daily write limit (~1,000/day, resets 00:00 UTC).
        return json({ error: 'write failed', detail: String(e && e.message || e) }, 503);
      }
      return json({ ok: true, t });
    }

    return new Response('method not allowed', { status: 405, headers: cors });
  },
};
