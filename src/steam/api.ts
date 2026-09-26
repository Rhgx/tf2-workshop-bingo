import type { WorkshopItem } from "./workshop";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function fetchWorkshopItems(ids: string[]): Promise<WorkshopItem[]> {
  const body = new URLSearchParams({ itemcount: String(ids.length) });
  ids.forEach((id, index) => body.set(`publishedfileids[${index}]`, id));

  const response = await fetch("api/workshop", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Steam lookup failed (HTTP ${response.status}).`);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isRecord(payload.response) || !Array.isArray(payload.response.publishedfiledetails)) {
    throw new Error("Steam returned an unexpected response.");
  }

  return payload.response.publishedfiledetails.flatMap((detail): WorkshopItem[] => {
    if (!isRecord(detail) || typeof detail.publishedfileid !== "string" || !ids.includes(detail.publishedfileid)) return [];
    if (String(detail.result) !== "1" || typeof detail.preview_url !== "string") return [];
    const preview = new URL(detail.preview_url);
    if (preview.protocol !== "https:" || preview.hostname !== "images.steamusercontent.com") return [];

    const id = detail.publishedfileid;
    const creatorId = typeof detail.creator === "string" && /^\d{1,20}$/.test(detail.creator) ? detail.creator : undefined;
    const tags = Array.isArray(detail.tags)
      ? detail.tags.flatMap((tag) => isRecord(tag) && typeof tag.tag === "string" ? [tag.tag] : [])
      : [];
    return [{
      id,
      title: typeof detail.title === "string" && detail.title.trim() ? detail.title.trim() : `Workshop item ${id}`,
      imageUrl: `api/preview${preview.pathname}${preview.search}`,
      tags,
      ...(creatorId ? { creatorId } : {}),
    }];
  });
}

/** Profile name, "" if the profile has none to give, or "blocked" if Steam refused. */
export async function fetchProfileName(steamId: string): Promise<string> {
  try {
    const response = await fetch(`api/profile/${steamId}/?xml=1`);
    if (!response.ok) return "blocked";
    const xml = new DOMParser().parseFromString(await response.text(), "text/xml");
    if (xml.querySelector("profile")) return xml.querySelector("profile > steamID")?.textContent?.trim() ?? "";
    // A missing or private profile answers <response><error>; anything else is an error page.
    return xml.querySelector("response > error") ? "" : "blocked";
  } catch {
    return "blocked";
  }
}

// Co-creators: shelved for now.
//
// Items often have several creators, but the Steam API only reports the uploader. The full "Created by"
// list only exists in the Workshop page's HTML, so showing it means scraping one page per item. Without
// an API key there is no batch alternative: IPublishedFileService/GetDetails answers 401, and
// steamcommunity.com/actions/ajaxresolveusers needs a logged-in session. From a browser those page
// requests trip Akamai's rate limit (403 for the whole IP) almost immediately.
//
// Doing this properly needs a server-side proxy (e.g. a Cloudflare Worker) that holds a Steam Web API
// key as a secret and caches pages and lookups for everyone. The scraper below worked; to bring it back,
// add a `creators?: Array<{ name: string; profile: string }>` field to WorkshopItem, credit all of them
// in toMarkdown, and proxy `/api/item` to https://steamcommunity.com/sharedfiles/filedetails/.
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
