# TF2 Workshop Bingo

<a href="https://www.typescriptlang.org"><img src="docs/badges/typescript.svg" alt="Built with TypeScript" /></a>
<a href="https://vite.dev"><img src="docs/badges/vite.svg" alt="Built with Vite" /></a>
<a href="https://pnpm.io"><img src="docs/badges/pnpm.svg" alt="Managed with pnpm" /></a>

Fill a Painter's Bingo prediction card with Steam Workshop items, styled like TF2's own menus and backpack. Paste links, arrange them, then export a full-size PNG or a Markdown list.

<img src="docs/screenshot.webp" alt="TF2 Workshop Bingo with a filled card and an item tooltip" width="600" />

## Running it

```sh
pnpm install
pnpm dev       # http://127.0.0.1:5173
pnpm check     # link parsing, Markdown and tag checks
pnpm build     # type-check and build to dist/
pnpm preview   # serve the build (same Steam proxies as dev)
```

Inside a pnpm workspace, add `--ignore-workspace` to each command.

## Using it

- **Add items:** paste Workshop links anywhere (Ctrl+V), type them into the field and press Enter, or drag a link from a Steam tab onto a square. Several links at once work.
- **Choose where they go:** click an empty square first; new items fill from there.
- **Rearrange:** drag a square or a list row onto another to swap them, or click two squares. Dragging follows the TF2 backpack (`CBackpackPanel` in the Source SDK): press and move 10px or hold 0.3s, the item follows the cursor, and dropping anywhere else puts it back.
- **Inspect:** hover a square for a TF2-style item tooltip (name, type, creator, tags).
- **Remove:** right-click a square, press Delete on it, or use the × in the list. Clearing a card can be undone.
- **Copy Markdown:** `- [Title](workshop link) by [Creator](profile)`, in card order. If the clipboard is blocked, a `.md` file is saved instead.
- **Download PNG:** the poster at full size with the thumbnails drawn in.
- **Archive:** every card, grouped by event. Each card keeps its own items in the browser (`localStorage`).

## Project layout

```
src/
  main.ts          app state, rendering, drag and drop, event wiring
  style.css
  data/
    cards.ts       card registry: posters and slot rectangles
    storage.ts     localStorage: items per card, uploader name cache
  steam/
    api.ts         Steam requests (item details, profile names)
    workshop.ts    link parsing, Markdown export, tag descriptions (pure, covered by `pnpm check`)
  ui/
    dom.ts         element lookup helper
    export.ts      full-size PNG rendering
    sound.ts       TF2 UI sounds and mute
    tooltip.ts     TF2-style item tooltip
scripts/
  check-workshop-links.mjs   `pnpm check`
  make-badges.py             regenerates docs/badges/ (TF2 tooltip-style README badges)
public/
  templates/       posters, one folder per event (PNG only; see below)
  ui/              TF2 fonts, textures, icons and sounds
```

## Adding cards

Cards live in `src/data/cards.ts`, newest event first. The newest event gets quick buttons; every event is listed in the archive. To add one (say an older Scream Fortress card):

1. Put the full-size PNG in `public/templates/<event>/` (e.g. `scream-fortress-2025/card-1.png`). Only the PNG is committed: the page shows a 2048px `.webp` of the same name, which `vite.config.ts` generates with `sharp` (on request in dev, as files in `pnpm build`).
2. Add an entry using `poster("<event>", "<name>")` and the slot rectangles in the PNG's pixel coordinates. `grid()` builds a regular grid; any slot count works.

## Deploying

Every push to `main` builds the site and publishes it to GitHub Pages (`.github/workflows/ci.yml`). The build uses relative URLs, so it works from any path.

The app calls Steam through same-origin proxies, because Steam does not allow cross-origin requests. The Vite dev and preview servers provide them (`vite.config.ts`). A static host like GitHub Pages cannot, so adding items only works there once these paths are served by something else (paths are relative to the page):

| Path | Proxies to | Used for |
| --- | --- | --- |
| `/api/workshop` | `api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/` | Titles, preview images, tags (one batched call) |
| `/api/preview/*` | `images.steamusercontent.com/*` | Thumbnails (needed for PNG export) |
| `/api/profile/*` | `steamcommunity.com/profiles/*` | Uploader names (`?xml=1`) |

A small serverless function (for example a Cloudflare Worker) covers all three.

## Known limitations

- **One creator per item.** The Steam API only reports the uploader. Co-creators only appear on each item's Workshop page, and scraping those from the browser gets the IP rate-limited by Steam's CDN. Doing it properly needs a server-side proxy with a Steam Web API key and a shared cache; the shelved scraper and the reasoning are in `src/steam/api.ts`.
- **Name lookups are throttled.** Uploader names are fetched one at a time, cached permanently per Steam ID, and paused for a minute if Steam starts refusing requests.
- **Saved data is per browser.** Nothing is uploaded or synced.

## Credits

Unofficial fan tool, not affiliated with Valve. Team Fortress 2 fonts, textures, icons and sounds are Valve's, extracted from the game files (`tf2_misc_dir.vpk`, `tf2_textures_dir.vpk`, `tf2_sound_misc_dir.vpk`). The Painter's Bingo posters are community artwork. Workshop items and thumbnails belong to their creators. The README badges follow [Devin's Badges](https://github.com/intergrav/devins-badges) and use icons from [Simple Icons](https://simpleicons.org).
