// Steam proxy for the deployed site. The Workshop API and profile pages send no CORS headers, so the
// browser cannot call them directly. Thumbnails skip this: Steam's image CDN allows any origin.
// Only these two routes are forwarded, so it is not a general-purpose proxy.

const cors = { "Access-Control-Allow-Origin": "*" };

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const profile = pathname.match(/^\/profile\/(\d{1,20})\/?$/);
    let upstream: Response;

    if (pathname === "/workshop" && request.method === "POST") {
      upstream = await fetch("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: await request.text(),
      });
    } else if (profile && request.method === "GET") {
      // Cached at Cloudflare's edge for a day so repeat lookups never reach Steam's rate limit.
      upstream = await fetch(`https://steamcommunity.com/profiles/${profile[1]}/?xml=1`, {
        cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "300-599": 0 } },
      } as RequestInit);
    } else {
      return new Response("Not found", { status: 404, headers: cors });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") ?? "text/plain" },
    });
  },
};
