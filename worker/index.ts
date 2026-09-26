// Steam proxy for the site. The Workshop API sends no CORS headers, so the browser cannot call it
// directly, and uploader names need a Steam Web API key that must stay server-side (a Worker secret:
// `wrangler secret put STEAM_API_KEY`). Thumbnails skip this: Steam's image CDN allows any origin.
//
// Abuse guards, cheapest first: only the site's origins, one fixed route, a small body of numeric item
// IDs (rebuilt here, never forwarded as sent), and a per-IP rate limit. Origin can be faked outside a
// browser, so the rate limit is what actually protects the free-tier quota and the key's daily limit.

type Env = {
  STEAM_API_KEY?: string;
  LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
};

/** The deployed site and local dev. Forks: add your own origin. */
const allowedOrigin = /^(https:\/\/rhgx\.github\.io|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/;
const maxItems = 100;
const maxBodyBytes = 8192;

/** Steam ID to persona name, one batched call for up to 100 IDs. Empty if the key is missing or Steam fails. */
async function playerNames(ids: string[], key: string | undefined): Promise<Record<string, string>> {
  if (!key || !ids.length) return {};
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${ids.join(",")}`;
  // Cached at Cloudflare's edge for a day; names rarely change.
  const response = await fetch(url, { cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "300-599": 0 } } } as RequestInit);
  if (!response.ok) return {};
  const players = ((await response.json()) as { response?: { players?: Array<{ steamid: string; personaname: string }> } }).response?.players ?? [];
  return Object.fromEntries(players.map((player) => [player.steamid, player.personaname]));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    if (!allowedOrigin.test(origin)) return new Response("Forbidden", { status: 403 });
    const cors = { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
    const reply = (status: number, message: string, headers: Record<string, string> = {}) =>
      new Response(message, { status, headers: { ...cors, ...headers } });

    if (new URL(request.url).pathname !== "/workshop" || request.method !== "POST") return reply(404, "Not found");
    if (Number(request.headers.get("Content-Length") ?? maxBodyBytes + 1) > maxBodyBytes) return reply(413, "Too large");

    const { success } = await env.LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") ?? "unknown" });
    if (!success) return reply(429, "Too many requests", { "Retry-After": "60" });

    const ids = [...new URLSearchParams(await request.text())].flatMap(([name, value]) => /^publishedfileids\[\d+\]$/.test(name) ? [value] : []);
    if (!ids.length || ids.length > maxItems || !ids.every((id) => /^\d{1,20}$/.test(id))) return reply(400, "Bad item IDs");
    const body = new URLSearchParams({ itemcount: String(ids.length) });
    ids.forEach((id, index) => body.set(`publishedfileids[${index}]`, id));

    const upstream = await fetch("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/", { method: "POST", body });
    if (!upstream.ok) return reply(502, `Steam answered ${upstream.status}`);

    // Steam's payload plus `names`: the uploaders' persona names, keyed by Steam ID.
    const payload = (await upstream.json()) as { response?: { publishedfiledetails?: Array<{ creator?: string }> } };
    const creators = [...new Set((payload.response?.publishedfiledetails ?? []).flatMap((item) => /^\d{1,20}$/.test(item.creator ?? "") ? [item.creator!] : []))];
    // Sorted so the same uploaders always hit the same cached name lookup.
    return Response.json({ ...payload, names: await playerNames(creators.sort(), env.STEAM_API_KEY) }, { headers: cors });
  },
};
