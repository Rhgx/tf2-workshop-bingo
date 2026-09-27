export type ParsedLinks = {
  ids: string[];
  duplicates: number;
  invalid: number;
};

export type WorkshopItem = {
  id: string;
  title: string;
  imageUrl: string;
  /** Uploader's Steam ID, from the Steam API. */
  creatorId?: string;
  /** Uploader's profile name. */
  creatorName?: string;
  tags?: string[];
};

export function parseWorkshopLinks(text: string): ParsedLinks {
  const ids: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let invalid = 0;

  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const candidate = token.replace(/^[([{<]+/, "").replace(/[)\]}>.,;]+$/, "");
    try {
      const url = new URL(candidate);
      const path = url.pathname.toLowerCase().replace(/\/+$/, "");
      const isWorkshopPage =
        ["steamcommunity.com", "www.steamcommunity.com"].includes(url.hostname.toLowerCase()) &&
        path === "/sharedfiles/filedetails";
      const id = url.searchParams.get("id");
      if (!isWorkshopPage || !id || !/^\d{1,20}$/.test(id)) {
        invalid++;
        continue;
      }
      if (seen.has(id)) {
        duplicates++;
        continue;
      }
      ids.push(id);
      seen.add(id);
    } catch {
      invalid++;
    }
  }

  return { ids, duplicates, invalid };
}

// Underscores inside a word never start emphasis, so names like Pie_Savvy stay unescaped.
const escapeMarkdown = (value: string) =>
  value.replace(/\s+/g, " ").replace(/[\\`*[\]<>|~]|(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, "\\$&");

export function toMarkdown(items: Array<WorkshopItem | null>): string {
  return items.flatMap((item) => {
    if (!item) return [];
    const link = `[${escapeMarkdown(item.title)}](https://steamcommunity.com/sharedfiles/filedetails/?id=${item.id})`;
    const by = item.creatorId
      ? ` by [${escapeMarkdown(item.creatorName ?? "creator")}](https://steamcommunity.com/profiles/${item.creatorId})`
      : "";
    return [`- ${link}${by}`];
  }).join("\n");
}

const classes = ["Scout", "Soldier", "Pyro", "Demoman", "Heavy", "Engineer", "Medic", "Sniper", "Spy"];
// Most specific first: war paints are also tagged "Weapon", unusual effects "Headgear".
const itemTypes = ["Unusual Effect", "War Paint", "Taunt", "Headgear", "Misc", "Primary", "Secondary", "Melee", "Weapon"];

/** Splits Workshop tags into a TF2-style type line ("Spy Misc", "All-Class War Paint") and the rest. */
export function describeTags(tags: string[]): { type: string; extra: string[] } {
  const forClasses = classes.filter((name) => tags.includes(name));
  const kind = itemTypes.find((name) => tags.includes(name));
  const who = forClasses.length === classes.length ? "All-Class" : forClasses.length > 3 ? "Multi-Class" : forClasses.join(" / ");
  return {
    type: kind ? [who, kind].filter(Boolean).join(" ") : "",
    extra: tags.filter((tag) => !classes.includes(tag) && !itemTypes.includes(tag) && tag !== "Certified Compatible"),
  };
}
