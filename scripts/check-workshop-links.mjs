import assert from "node:assert/strict";
import { describeTags, parseWorkshopLinks, toMarkdown } from "../src/steam/workshop.ts";

assert.deepEqual(
  parseWorkshopLinks([
    "https://steamcommunity.com/sharedfiles/filedetails/?id=101",
    "https://www.steamcommunity.com/sharedfiles/filedetails/?searchtext=hat&id=202",
    "https://steamcommunity.com/sharedfiles/filedetails/?id=101",
    "https://example.com/sharedfiles/filedetails/?id=303",
  ].join("\n")),
  { ids: ["101", "202"], duplicates: 1, invalid: 1 },
);

assert.equal(
  toMarkdown([
    { id: "101", title: "The [Big]  *Hat*", imageUrl: "", creatorId: "7656", creatorName: "some_guy" },
    null,
    { id: "202", title: "Plain", imageUrl: "" },
    { id: "303", title: "Solo", imageUrl: "", creatorId: "7657" },
  ]),
  [
    String.raw`- [The \[Big\] \*Hat\*](https://steamcommunity.com/sharedfiles/filedetails/?id=101) by [some\_guy](https://steamcommunity.com/profiles/7656)`,
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

console.log("Workshop link, Markdown and tag checks passed.");
