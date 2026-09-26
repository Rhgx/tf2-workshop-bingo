// Steam proxy for the site. The Workshop API sends no CORS headers, so the browser cannot call it
// directly, and uploader names need a Steam Web API key that must stay server-side (a Worker secret:
// `wrangler secret put STEAM_API_KEY`). Thumbnails skip this: Steam's image CDN allows any origin.
// Only this one route is forwarded, so it is not a general-purpose proxy.

type Env = { STEAM_API_KEY?: string };

const cors = { "Access-Control-Allow-Origin": "*" };

/** Steam ID to persona name, one batched call for up to 100 IDs. Empty if the key is missing or Steam fails. */
async function playerNames(ids: string[], key: string | undefined): Promise<Record<string, string>> {
  if (!key || !ids.length) return {};
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${ids.slice(0, 100).join(",")}`;
  // Cached at Cloudflare's edge for a day; names rarely change.
  const response = await fetch(url, { cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "300-599": 0 } } } as RequestInit);
  if (!response.ok) return {};
  const players = ((await response.json()) as { response?: { players?: Array<{ steamid: string; personaname: string }> } }).response?.players ?? [];
  return Object.fromEntries(players.map((player) => [player.steamid, player.personaname]));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/workshop" || request.method !== "POST") {
      return new Response("Not found", { status: 404, headers: cors });
    }

    const upstream = await fetch("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: await request.text(),
    });
    if (!upstream.ok) return new Response(upstream.body, { status: upstream.status, headers: cors });

    // Steam's payload plus `names`: the uploaders' persona names, keyed by Steam ID.
    const payload = (await upstream.json()) as { response?: { publishedfiledetails?: Array<{ creator?: string }> } };
    const creators = [...new Set((payload.response?.publishedfiledetails ?? []).flatMap((item) => /^\d{1,20}$/.test(item.creator ?? "") ? [item.creator!] : []))];
    return Response.json({ ...payload, names: await playerNames(creators, env.STEAM_API_KEY) }, { headers: cors });
  },
};
