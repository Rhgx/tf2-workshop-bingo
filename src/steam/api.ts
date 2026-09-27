import type { WorkshopItem } from "./workshop";

/** The Steam proxy in worker/. Point VITE_STEAM_PROXY at your own deployment (or `wrangler dev`) to use another. */
const proxy = import.meta.env.VITE_STEAM_PROXY || "https://tf2-workshop-bingo.rhgx.workers.dev";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function fetchWorkshopItems(ids: string[]): Promise<WorkshopItem[]> {
  const body = new URLSearchParams({ itemcount: String(ids.length) });
  ids.forEach((id, index) => body.set(`publishedfileids[${index}]`, id));

  const response = await fetch(`${proxy}/workshop`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (response.status === 429) throw new Error("Too many lookups. Wait a minute and try again.");
  if (!response.ok) throw new Error(`Steam lookup failed (HTTP ${response.status}).`);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isRecord(payload.response) || !Array.isArray(payload.response.publishedfiledetails)) {
    throw new Error("Steam returned an unexpected response.");
  }

  // The worker adds `names`: uploader persona names keyed by Steam ID.
  const names = isRecord(payload.names) ? payload.names : {};

  return payload.response.publishedfiledetails.flatMap((detail): WorkshopItem[] => {
    if (!isRecord(detail) || typeof detail.publishedfileid !== "string" || !ids.includes(detail.publishedfileid)) return [];
    if (String(detail.result) !== "1") return [];
    // Steam sometimes sends an empty preview_url (an item without an image right now). Keep the item; its square
    // stays blank, and it is fetched again on the next load in case the image has appeared.
    const preview = typeof detail.preview_url === "string" && URL.canParse(detail.preview_url) ? new URL(detail.preview_url) : undefined;
    const imageUrl = preview?.protocol === "https:" && preview.hostname === "images.steamusercontent.com" ? preview.href : "";

    const id = detail.publishedfileid;
    const creatorId = typeof detail.creator === "string" && /^\d{1,20}$/.test(detail.creator) ? detail.creator : undefined;
    const creatorName = creatorId && typeof names[creatorId] === "string" ? names[creatorId] : undefined;
    const tags = Array.isArray(detail.tags)
      ? detail.tags.flatMap((tag) => isRecord(tag) && typeof tag.tag === "string" ? [tag.tag] : [])
      : [];
    return [{
      id,
      title: typeof detail.title === "string" && detail.title.trim() ? detail.title.trim() : `Workshop item ${id}`,
      // Steam's image CDN allows any origin, so thumbnails load directly (and stay usable in canvas).
      imageUrl,
      tags,
      ...(creatorId ? { creatorId } : {}),
      ...(creatorName ? { creatorName } : {}),
    }];
  });
}

// Co-creators: shelved for now.
//
// Items often have several creators, but the Steam API only reports the uploader. The full "Created by"
// list only exists in the Workshop page's HTML, so showing it means scraping one page per item. Without
// an API key there is no batch alternative: IPublishedFileService/GetDetails answers 401, and
// steamcommunity.com/actions/ajaxresolveusers needs a logged-in session. From a browser those page
// requests trip Akamai's rate limit (403 for the whole IP) almost immediately.
//
// worker/ now holds a Steam Web API key, which covers uploader names in bulk but still gives no co-creator
// list, so this would mean scraping the pages there with edge caching. The scraper below worked; to bring it back,
// add a `creators?: Array<{ name: string; profile: string }>` field to WorkshopItem, credit all of them
// in toMarkdown, and proxy `item` to https://steamcommunity.com/sharedfiles/filedetails/.
//
// async function fetchCreators(id: string): Promise<Array<{ name: string; profile: string }> | "blocked"> {
//   try {
//     const response = await fetch(`/api/item?id=${id}`);
//     if (!response.ok) return "blocked";
//     const page = new DOMParser().parseFromString(await response.text(), "text/html");
//     if (!page.querySelector(".workshopItemTitle")) return "blocked";
//     return [...page.querySelectorAll(".creatorsBlock .friendBlock")].flatMap((block) => {
//       const profile = block.querySelector("a.friendBlockLinkOverlay")?.getAttribute("href") ?? "";
//       const name = block.querySelector(".friendBlockContent")?.firstChild?.textContent?.trim() ?? "";
//       return name && /^https:\/\/steamcommunity\.com\/(id|profiles)\/[\w-]+\/?$/.test(profile) ? [{ name, profile }] : [];
//     });
//   } catch {
//     return "blocked";
//   }
// }
