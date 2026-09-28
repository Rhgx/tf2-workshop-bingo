import assert from "node:assert/strict";
import { describeTags, itemKind, parseWorkshopLinks, toMarkdown } from "../src/steam/workshop.ts";
// Loading the registry validates every card's squares and IDs.
import "../src/data/cards.ts";

assert.deepEqual(
  parseWorkshopLinks([
    "https://steamcommunity.com/sharedfiles/filedetails/?id=101",
    "https://www.steamcommunity.com/sharedfiles/filedetails/?searchtext=hat&id=202",
    "https://steamcommunity.com/sharedfiles/filedetails/?id=101",
    "https://example.com/sharedfiles/filedetails/?id=303",
    "https://fixsteamcommunity.com/sharedfiles/filedetails/?id=3808168316&tscn=1790406489",
    "http://m.steamcommunity.com/workshop/filedetails/?id=404",
    "(steamcommunity.com/sharedfiles/filedetails?id=505).",
    "steam://url/CommunityFilePage/606",
    "steam://openurl/https://steamcommunity.com/sharedfiles/filedetails/?id=707",
    "ftp://steamcommunity.com/sharedfiles/filedetails/?id=808",
  ].join("\n")),
  { ids: ["101", "202", "3808168316", "404", "505", "606", "707"], duplicates: 1, invalid: 2 },
);

assert.equal(
  toMarkdown([
    { id: "101", title: "The [Big]  *Hat* _v2_", imageUrl: "", creatorId: "7656", creatorName: "Pie_Savvy" },
    null,
    { id: "202", title: "Plain", imageUrl: "" },
    { id: "303", title: "Solo", imageUrl: "", creatorId: "7657" },
  ]),
  [
    String.raw`- [The \[Big\] \*Hat\* \_v2\_](https://steamcommunity.com/sharedfiles/filedetails/?id=101) by [Pie_Savvy](https://steamcommunity.com/profiles/7656)`,
    "- [Plain](https://steamcommunity.com/sharedfiles/filedetails/?id=202)",
    "- [Solo](https://steamcommunity.com/sharedfiles/filedetails/?id=303) by [creator](https://steamcommunity.com/profiles/7657)",
  ].join("\n"),
);

assert.deepEqual(describeTags(["Spy", "Misc", "Halloween", "Certified Compatible"]), { type: "Spy Misc", extra: ["Halloween"] });
assert.deepEqual(
  describeTags(["Scout", "Sniper", "Soldier", "Demoman", "Medic", "Heavy", "Pyro", "Spy", "Engineer", "Weapon", "War Paint", "Halloween"]),
  { type: "All-Class War Paint", extra: ["Halloween"] },
);
assert.deepEqual(describeTags(["King of the Hill", "Night"]), { type: "", extra: ["King of the Hill", "Night"] });

// Tags as Steam reports them for Scream Fortress 2026 submissions.
const allClass = ["Scout", "Sniper", "Soldier", "Demoman", "Medic", "Heavy", "Pyro", "Spy", "Engineer"];
assert.equal(itemKind([...allClass, "Weapon", "Halloween", "War Paint", "Smissmas", "Summer"]), "War Paint");
assert.equal(itemKind(["Headgear", "Misc", "Halloween", "Unusual Effect"]), "Unusual Effect");
assert.equal(itemKind(["Halloween", "Taunt", "Unusual Effect"]), "Unusual Effect");
assert.equal(itemKind(["Medic", "Halloween", "Taunt", "Certified Compatible"]), "Taunt");
assert.equal(itemKind(["Spy", "Headgear", "Halloween", "Certified Compatible"]), "Cosmetic");
assert.equal(itemKind(["Heavy", "Misc", "Halloween", "Certified Compatible"]), "Cosmetic");
assert.equal(itemKind(["Capture the Flag", "Medieval", "Halloween", "Night"]), "Map");
assert.equal(itemKind(["Halloween"]), "Map");
assert.equal(itemKind(["Soldier", "Primary", "Weapon"]), undefined);

console.log("Workshop link, Markdown and tag checks passed.");
