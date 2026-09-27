# Development

## Project layout

```
src/
  main.ts          app state, rendering, drag and drop, event wiring
  style.css
  data/
    cards.ts       card registry: posters, slot rectangles and the kind each slot takes
    storage.ts     localStorage: items per card
  steam/
    api.ts         Steam requests (item details and uploader names, via worker/)
    workshop.ts    link parsing, Markdown export, tag descriptions, item kinds (pure, covered by `pnpm check`)
  ui/
    dom.ts         element lookup helper
    export.ts      full-size PNG rendering
    sound.ts       TF2 UI sounds and mute
    tooltip.ts     TF2-style item tooltip
worker/            Cloudflare Worker: Steam proxy holding the Steam Web API key (see worker.md)
scripts/
  check-workshop-links.mjs   `pnpm check`
  make-badges.py             regenerates docs/badges/ (TF2 tooltip-style README badges)
public/
  templates/       posters, one folder per event (PNG only; see below)
  ui/              TF2 fonts, textures, icons and sounds
```

## Adding cards

Cards live in `src/data/cards.ts`, newest event first. The newest event opens by default; every event is listed in the archive, and an event's cards are shown side by side. To add one (say an older Scream Fortress card):

1. Put the full-size PNG in `public/templates/<event>/` (e.g. `scream-fortress-2025/card-1.png`). Only the PNG is committed: the page shows a 2048px `.webp` of the same name, which `vite.config.ts` generates with `sharp` (on request in dev, as files in `pnpm build`).
2. Add an `event()` block (or a card to an existing one) at the right place in `cards`:

   ```ts
   ...event("Scream Fortress 2025", "scream-fortress-2025", {
     width: 3448, height: 3936, lefts: [221, 817, 1406, 2010, 2605], tops: [745, 1343, 1940, 2532, 3123], side: 550,
   }, [
     {
       id: "sf2025-1", name: "Card 1", file: "card-1",
       squares: [
         "W W W W W",
         "W W ? W W",
         "W W ? W W",
         "U U U U U",
         "U U U U U",
       ],
     },
   ]),
   ```

   The layout is measured once per event from the PNG: its size, the x of each column's left edge, the y of each row's top edge and the square side, all in pixels. `squares` draws the grid as it looks on the poster, one letter per square: `W` War Paint, `U` Unusual Effect, `T` Taunt, `C` Cosmetic, `M` Map, `?` any item. `id` keys the user's saved items, so never change it once released.
3. Run `pnpm check`: it fails if a card's `squares` doesn't match its layout, uses an unknown letter, or reuses an ID.

## How items are placed

`itemKind()` in `src/steam/workshop.ts` reads an item's Workshop tags:

| Kind | Tags |
|---|---|
| `"War Paint"` | War Paint |
| `"Unusual Effect"` | Unusual Effect (hat and taunt effects; wins over Taunt and Headgear) |
| `"Taunt"` | Taunt |
| `"Cosmetic"` | Headgear or Misc |
| `"Map"` | a game mode tag, or no item type and no class at all (some maps are tagged only "Halloween") |

Weapons have no kind. A new item takes the first free square of its kind across the event's cards, then a free "?" square; if neither is free it's left out, and the status line says so. A free square the user clicked first takes the next item whatever its kind.

## Dragging

Dragging follows the TF2 backpack (`CBackpackPanel` in the Source SDK): press and move 10px or hold 0.3s, the item follows the cursor, the square under it lights up, and dropping anywhere else puts it back.
