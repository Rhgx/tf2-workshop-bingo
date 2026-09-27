import type { Kind } from "../steam/workshop";

/** `kind` is what the poster's square asks for; without one, the square takes anything (the "?" squares). */
export type Slot = { x: number; y: number; w: number; h: number; kind?: Kind };

export type Card = {
  id: string;
  event: string;
  name: string;
  /** Light image shown in the page. */
  preview: string;
  /** Full-size image used for PNG export; slot coordinates are in its pixels. */
  full: string;
  width: number;
  height: number;
  slots: Slot[];
};

/** Letters used in a card's `squares`. */
const kinds: Record<string, Kind | undefined> = { W: "War Paint", U: "Unusual Effect", T: "Taunt", C: "Cosmetic", M: "Map", "?": undefined };

/** Poster size and square grid, in the full PNG's pixels: each column's left edge, each row's top edge, and the square side. */
type Layout = { width: number; height: number; lefts: number[]; tops: number[]; side: number };

type Entry = {
  /** Keys the user's saved items: never change it once released. */
  id: string;
  name: string;
  /** Poster file name in the event's folder, without extension. */
  file: string;
  /** The grid as drawn on the poster: one string per row, one letter per square (see `kinds`). Spaces are ignored. */
  squares: string[];
};

/** An event's cards, all on one layout. Posters are public/templates/<folder>/<file>.png; vite.config.ts generates the .webp shown in the page. */
const event = (event: string, folder: string, layout: Layout, entries: Entry[]): Card[] =>
  entries.map(({ id, name, file, squares }) => {
    const { width, height, lefts, tops, side } = layout;
    const rows = squares.map((row) => row.replaceAll(" ", ""));
    if (rows.length !== tops.length || rows.some((row) => row.length !== lefts.length)) {
      throw new Error(`Card ${id}: squares must be ${tops.length} rows of ${lefts.length}.`);
    }
    const slots = rows.flatMap((row, r) => [...row].map((letter, c) => {
      if (!(letter in kinds)) throw new Error(`Card ${id}: unknown square "${letter}".`);
      return { x: lefts[c], y: tops[r], w: side, h: side, kind: kinds[letter] };
    }));
    return { id, event, name, preview: `templates/${folder}/${file}.webp`, full: `templates/${folder}/${file}.png`, width, height, slots };
  });

// Newest event first: it opens by default, and every event is listed in the archive. An event's cards are shown together.
export const cards: Card[] = [
  ...event("Scream Fortress 2026", "scream-fortress-2026", {
    width: 3448, height: 3936, lefts: [221, 817, 1406, 2010, 2605], tops: [745, 1343, 1940, 2532, 3123], side: 550,
  }, [
    {
      id: "sf2026-1", name: "Card 1", file: "card-1",
      squares: [
        "W W W W W",
        "W W ? W W",
        "W W ? W W",
        "U U U U U",
        "U U U U U",
      ],
    },
    {
      id: "sf2026-2", name: "Card 2", file: "card-2",
      squares: [
        "C C C C C",
        "C C C C C",
        "C C C C C",
        "T T T T T",
        "M M M M M",
      ],
    },
  ]),
];

if (new Set(cards.map((card) => card.id)).size !== cards.length) throw new Error("Card IDs must be unique.");

export const currentEvent = cards[0].event;

/** Cards grouped by event, in registry order. */
export const cardsByEvent = (): Map<string, Card[]> =>
  cards.reduce((groups, card) => groups.set(card.event, [...(groups.get(card.event) ?? []), card]), new Map<string, Card[]>());
