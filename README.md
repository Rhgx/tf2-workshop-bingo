# TF2 Workshop Bingo

<a href="https://www.typescriptlang.org"><img src="docs/badges/typescript.svg" alt="Built with TypeScript" /></a>
<a href="https://vite.dev"><img src="docs/badges/vite.svg" alt="Built with Vite" /></a>
<a href="https://pnpm.io"><img src="docs/badges/pnpm.svg" alt="Managed with pnpm" /></a>

Fill Painter's Bingo prediction cards with Steam Workshop items, styled like TF2's own menus and backpack. Paste links, and each item lands in a square of its kind; arrange them, then export full-size PNGs or a Markdown list.

<img src="docs/screenshot.webp" alt="TF2 Workshop Bingo with both Scream Fortress 2026 cards filled and an item tooltip" width="600" />

## Using it

- **Add items:** paste Workshop links anywhere (Ctrl+V), type them into the field, or drag a link from a Steam tab onto a square. Several at once work.
- **Placement:** each item goes to a free square of its kind (war paint, unusual effect, cosmetic, taunt or map, from its Workshop tags), then to a "?" square. Click an empty square first to put the next item there instead.
- **Rearrange:** drag a square or list row onto another, or click two squares. This works across cards.
- **Remove:** right-click a square, press Delete on it, or use the × in the list.
- **Export:** Copy Markdown gives `- [Title](link) by [Creator](profile)` per card; Download PNG saves each card at full size.
- **Archive:** older events. Items are saved in your browser only.

## Running it

```sh
pnpm install
pnpm dev       # http://127.0.0.1:5173
pnpm check     # link parsing, Markdown and tag checks
pnpm build     # type-check and build to dist/
```

Inside a pnpm workspace, add `--ignore-workspace` to each command. Every push to `main` deploys to GitHub Pages. Item details come through a small Cloudflare Worker that holds the Steam API key; see [docs/worker.md](docs/worker.md). Project layout, adding cards and the placement rules are in [docs/development.md](docs/development.md).

## Credits

Unofficial fan tool, not affiliated with Valve. Team Fortress 2 fonts, textures, icons, sounds and music are Valve's, extracted from the game files (`tf2_misc_dir.vpk`, `tf2_textures_dir.vpk`, `tf2_sound_misc_dir.vpk`). The Painter's Bingo cards are made by [TF2 Painter's Workshop](https://steamcommunity.com/groups/PaintersWorkshop). Workshop items and thumbnails belong to their creators. The README badges follow [Devin's Badges](https://github.com/intergrav/devins-badges); they come from [Simple Icons](https://simpleicons.org). The Markdown button icon is the [Markdown mark](https://github.com/dcurtis/markdown-mark) redrawn as a page in the style of the game glyphs.

## License

The code is [MIT](LICENSE). It doesn't cover the TF2 assets, the bingo cards or Workshop content above, which belong to their owners.
