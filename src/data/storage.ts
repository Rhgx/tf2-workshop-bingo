import type { WorkshopItem } from "../steam/workshop";

export type Slots = Array<WorkshopItem | null>;

const storageKey = "bingo-cards";

// /** Placeholder until Steam details are fetched (see `hydrate` in src/main.ts). */
// const stubItems = (ids: string): Slots => ids.split(" ").map((id) => ({ id, title: `Workshop item ${id}`, imageUrl: "" }));

// // Earlier Scream Fortress 2026 predictions, loaded on first run.
// const seeds = (): Record<string, Slots> => ({
//   "sf2026-1": stubItems("3770935071 3792249690 3802181222 3785049865 3748105855 3799028473 3791804874 3797017944 3793653722 3794600566 3779356927 3790167198 3777509482 3791388978 3778108684 3743346815 3800783253 3797194094 3800101999 3797130134 3794889363 3795379113 3802819874 3739207186 3776111412"),
//   "sf2026-2": stubItems("3798116079 3798114460 3798112901 3769883191 3748804409 3789986669 3800682869 3800683204 3736776010 3758984117 3801563151 3748803533 3789990320 3736777042 3789981305 3795225054 3789293911 3795568883 3794068319 3793119677 3796355150 3790027551 3778508242 3792996857 3768742548"),
// });

/** Items per card ID. */
export function loadSaved(): Record<string, Slots> {
  try {
    // Thumbnails used to go through an `api/preview` proxy; they now load straight from Steam's CDN.
    const stored = localStorage.getItem(storageKey)?.replace(/"\/?api\/preview\//g, '"https://images.steamusercontent.com/');
    const saved: unknown = JSON.parse(stored ?? "null");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) return saved as Record<string, Slots>;
  } catch {
    // Corrupt storage: start empty.
  }
  return {};
}

export const saveAll = (saved: Record<string, Slots>) => localStorage.setItem(storageKey, JSON.stringify(saved));
