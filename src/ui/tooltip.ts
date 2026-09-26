import { $ } from "./dom";
import { describeTags, type WorkshopItem } from "../steam/workshop";

const tooltip = $("#tooltip");

// Item tooltip, after CItemModelPanelToolTip: the popup sits beside the item (right, then left,
// above, below), overlapping it slightly, with the name in quality colour and attribute lines below.
export function showTooltip(item: WorkshopItem, anchor: HTMLElement) {
  if (document.body.classList.contains("is-dragging")) return;
  const { type, extra } = describeTags(item.tags ?? []);
  const lines: Array<[string, string]> = [
    ["name", item.title],
    ["level", type],
    ["neutral", item.creatorName ? `by ${item.creatorName}` : ""],
    ["positive", extra.join(" · ")],
  ];
  tooltip.replaceChildren(...lines.filter(([, text]) => text).map(([kind, text]) => {
    const line = document.createElement("p");
    line.className = `tip-${kind}`;
    line.textContent = text;
    return line;
  }));
  tooltip.hidden = false;

  const box = anchor.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = tooltip;
  const overlap = 12;
  const spots = [
    [box.right - overlap, box.top - 6],
    [box.left - w + overlap, box.top - 6],
    [box.left + box.width / 2 - w / 2, box.top - h - 4],
    [box.left + box.width / 2 - w / 2, box.bottom + 4],
  ];
  const fits = ([x, y]: number[]) => x >= 0 && y >= 0 && x + w <= innerWidth && y + h <= innerHeight;
  const [x, y] = spots.find(fits) ?? spots[0];
  tooltip.style.transform = `translate(${Math.max(0, Math.min(x, innerWidth - w))}px, ${Math.max(0, Math.min(y, innerHeight - h))}px)`;
}

export function hideTooltip() {
  tooltip.hidden = true;
}
