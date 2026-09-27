# Steam proxy (`worker/`)

The app gets item details through a small Cloudflare Worker, because the Workshop API doesn't allow cross-origin requests and uploader names need a Steam Web API key that must stay server-side. It has one route, `POST /workshop`: it forwards to `ISteamRemoteStorage/GetPublishedFileDetails` and adds a `names` map from one batched `ISteamUser/GetPlayerSummaries` call (edge-cached for a day). Thumbnails load straight from Steam's image CDN, which allows any origin.

To stop it being used as a free Steam proxy, the worker only answers the site's origins (`https://rhgx.github.io` and local dev), accepts at most 100 numeric item IDs in a small body, and rate-limits each IP to about 20 requests a minute. On the free plan, running out of quota only stops the worker for the day; it never bills.

## Running your own

Dev, `pnpm preview` and the Pages build all use the deployed worker. To run your own (the free tier is plenty):

```sh
cd worker
pnpm dlx wrangler login
pnpm dlx wrangler secret put STEAM_API_KEY    # from https://steamcommunity.com/dev/apikey
pnpm dlx wrangler deploy                      # prints https://tf2-workshop-bingo.<you>.workers.dev
```

Add your site's origin to `allowedOrigin` in `worker/index.ts` first, then build with `VITE_STEAM_PROXY` set to that URL. Without the key, items still load, just without uploader names.

## Co-creators

The Steam API only reports an item's uploader, even with a key. Co-creators only appear on each item's Workshop page, so showing them means scraping those pages in the worker; the shelved scraper and the reasoning are in `src/steam/api.ts`.
