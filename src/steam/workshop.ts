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
    const candidate = token
      .replace(/^[([{<]+/, "")
      .replace(/[)\]}>.,;]+$/, "")
      .replace(/^steam:\/\/openurl\//i, "")
      .replace(/^steam:\/\/url\/CommunityFilePage\/(\d+)$/i, "https://steamcommunity.com/sharedfiles/filedetails/?id=$1");
    try {
      // Links pasted without a scheme ("steamcommunity.com/sharedfiles/...") still count.
      const url = new URL(/^[a-z][\w+.-]*:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
      const path = url.pathname.toLowerCase().replace(/\/+$/, "");
      // Covers www., m., and embed fixers like fixsteamcommunity.com; only the ID is used, so any lookalike host is harmless.
      const isWorkshopPage =
        /^https?:$/.test(url.protocol) &&
        url.hostname.toLowerCase().endsWith("steamcommunity.com") &&
        ["/sharedfiles/filedetails", "/workshop/filedetails"].includes(path);
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

export type Kind = "War Paint" | "Unusual Effect" | "Taunt" | "Cosmetic" | "Map";

/** The kind of bingo square an item belongs in, from its Workshop tags. Weapons and untagged oddities have none. */
export function itemKind(tags: string[]): Kind | undefined {
  const type = itemTypes.find((name) => tags.includes(name));
  if (type === "Unusual Effect" || type === "War Paint" || type === "Taunt") return type;
  if (type === "Headgear" || type === "Misc") return "Cosmetic";
  // Maps have a game mode tag ("King of the Hill"), or sometimes only "Halloween": never an item type or a class.
  if (!type && !classes.some((name) => tags.includes(name))) return "Map";
  return undefined;
}
