import "./style.css";
import { cards, cardsByEvent, currentEvent, findCard, type Card } from "./data/cards";
import { loadSaved, saveAll, type Slots } from "./data/storage";
import { fetchWorkshopItems } from "./steam/api";
import { parseWorkshopLinks, toMarkdown, type WorkshopItem } from "./steam/workshop";
import { $ } from "./ui/dom";
import { renderCardPng, saveBlob } from "./ui/export";
import { isMuted, play, toggleMuted } from "./ui/sound";
import { hideTooltip, showTooltip } from "./ui/tooltip";

const addForm = $<HTMLFormElement>("#add-form");
const linkInput = $<HTMLInputElement>("#link-input");
const status = $("#status");
const itemList = $("#item-list");
const emptyHint = $("#empty-hint");
const itemCount = $("#item-count");
const soundButton = $<HTMLButtonElement>("#sound-button");
const clearButton = $<HTMLButtonElement>("#clear-button");
const copyButton = $<HTMLButtonElement>("#copy-button");
const downloadButton = $<HTMLButtonElement>("#download-button");
const posterToggle = $("#poster-toggle");
const posterStage = $("#poster-stage");
const posterImage = $<HTMLImageElement>("#poster-image");
const grid = $("#bingo-grid");
const archive = $("#archive");

const saved = loadSaved();
let card: Card = findCard(localStorage.getItem("bingo-card"));
let selectedSlot: number | null = null;
let pending = 0;
let isExporting = false;

/** The card's items, sized to its slot count. */
function slotsFor(target: Card): Slots {
  const list = saved[target.id] ?? [];
  // A registry edit that shrinks a card drops the overflow, so keep slot counts stable per card id.
  saved[target.id] = Array.from({ length: target.slots.length }, (_, index) => list[index] ?? null);
  return saved[target.id];
}
const items = (): Slots => saved[card.id];
const filledCount = (list: Slots = items()) => list.filter(Boolean).length;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const save = () => saveAll(saved);

function setStatus(message: string, kind: "info" | "success" | "error" = "info") {
  status.textContent = message;
  status.className = `status ${kind}`;
}

function fail(message: string) {
  setStatus(message, "error");
  play("error");
}

/** Fetches Steam details for stored items that only have an ID, or predate tags or uploader names. */
const needsDetails = (item: WorkshopItem | null): item is WorkshopItem =>
  Boolean(item && (!item.imageUrl || !item.tags || (item.creatorId && !item.creatorName)));

async function hydrate(target = card) {
  const list = saved[target.id];
  const ids = list.flatMap((item) => needsDetails(item) ? [item.id] : []);
  if (!ids.length) return;
  pending++;
  setStatus(`Loading ${plural(ids.length, "item")}…`);
  render();
  try {
    const byId = new Map((await fetchWorkshopItems(ids)).map((item) => [item.id, item]));
    list.forEach((item, index) => {
      const fresh = needsDetails(item) && byId.get(item.id);
      // Keep a name we already have if Steam didn't send one this time.
      if (fresh) list[index] = { creatorName: item.creatorName, ...fresh };
    });
    save();
    setStatus(ids.length > byId.size ? `${plural(ids.length - byId.size, "item")} not found or private.` : "");
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not load this card.");
  } finally {
    pending--;
    render();
  }
}

// Fills empty squares starting at `start`, wrapping around. Returns how many were placed.
function place(list: Slots, newItems: WorkshopItem[], start: number): number {
  const queue = newItems.filter((item) => !list.some((existing) => existing?.id === item.id));
  let placed = 0;
  for (let step = 0; step < list.length && placed < queue.length; step++) {
    const slot = (start + step) % list.length;
    if (!list[slot]) list[slot] = queue[placed++];
  }
  return placed;
}

async function addLinks(text: string, start = selectedSlot ?? 0) {
  const target = card;
  const list = items();
  const parsed = parseWorkshopLinks(text);
  const onCard = new Set(list.flatMap((item) => item ? [item.id] : []));
  const ids = parsed.ids.filter((id) => !onCard.has(id));
  const repeats = parsed.duplicates + parsed.ids.length - ids.length;
  if (!ids.length) {
    fail(repeats ? "Already on the card." : "Not a Workshop item link.");
    return;
  }

  pending++;
  setStatus(`Loading ${plural(ids.length, "item")}…`);
  render();
  try {
    const loaded = await fetchWorkshopItems(ids);
    const placed = place(saved[target.id], loaded, start);
    if (target === card) selectedSlot = null;
    save();
    const notes = [
      loaded.length > placed ? `card full, ${loaded.length - placed} left out` : "",
      ids.length > loaded.length ? `${ids.length - loaded.length} not found or private` : "",
      parsed.invalid ? `${parsed.invalid} not a Workshop link` : "",
      repeats ? `${repeats} already on the card` : "",
    ].filter(Boolean);
    if (placed) play("added");
    if (!placed) fail(notes.join(" · ") || "Nothing added.");
    else setStatus(notes.length ? `Added ${placed} · ${notes.join(" · ")}` : "", notes.length ? "info" : "success");
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not load those items.");
  } finally {
    pending--;
    render();
  }
}

function swapSlots(source: number, target: number) {
  const list = items();
  selectedSlot = null;
  if (source !== target) {
    [list[source], list[target]] = [list[target], list[source]];
    save();
    play("drop");
  }
  render();
}

function removeItem(index: number) {
  if (!items()[index]) return;
  items()[index] = null;
  selectedSlot = null;
  save();
  play("remove");
  render();
}

function selectSlot(index: number) {
  const list = items();
  if (selectedSlot === index) {
    selectedSlot = null;
  } else if (selectedSlot === null || (!list[selectedSlot] && !list[index])) {
    selectedSlot = index;
    play("pickup");
  } else {
    swapSlots(selectedSlot, index);
    return;
  }
  render();
  // An empty square is a paste target.
  if (selectedSlot !== null && !list[selectedSlot]) linkInput.focus();
}

// Backpack-style dragging (CBackpackPanel in the Source SDK): press an item, then move 10px or hold
// 0.3s. The source slot empties, a copy of the item panel follows the cursor centred on it, the slot
// under the cursor lights up, and releasing swaps. Releasing anywhere else puts the item back.
type Drag = { from: number; x: number; y: number; startX: number; startY: number; timer: number; ghost?: HTMLElement; over?: Element };
let drag: Drag | null = null;
let suppressClick = false;

const dragTargets = () => [...document.querySelectorAll<HTMLElement>(".bingo-slot, .item-row")];
const targetIndex = (element: Element | undefined) => element ? Number((element as HTMLElement).dataset.index) : -1;

function beginPress(event: PointerEvent, index: number) {
  if (event.button !== 0 || !items()[index] || drag) return;
  drag = { from: index, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, timer: window.setTimeout(startDrag, 300) };
}

function startDrag() {
  if (!drag || drag.ghost) return;
  const item = items()[drag.from];
  if (!item) return;
  selectedSlot = null;
  render();
  hideTooltip();

  const { width, height } = grid.children[drag.from].getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.className = "drag-item";
  ghost.style.width = `${width}px`;
  ghost.style.height = `${height}px`;
  if (item.imageUrl) {
    const image = document.createElement("img");
    image.src = item.imageUrl;
    image.alt = "";
    ghost.append(image);
  }
  document.body.append(ghost);
  drag.ghost = ghost;
  document.body.classList.add("is-dragging");
  for (const element of dragTargets()) element.classList.toggle("is-drag-source", targetIndex(element) === drag.from);
  play("pickup");
  moveDrag();
}

function moveDrag() {
  if (!drag?.ghost) return;
  drag.ghost.style.transform = `translate(${drag.x - drag.ghost.offsetWidth / 2}px, ${drag.y - drag.ghost.offsetHeight / 2}px)`;
  const over = document.elementFromPoint(drag.x, drag.y)?.closest(".bingo-slot, .item-row") ?? undefined;
  if (over === drag.over) return;
  drag.over?.classList.remove("is-drag-over");
  over?.classList.add("is-drag-over");
  drag.over = over;
}

function endDrag(commit: boolean) {
  if (!drag) return;
  window.clearTimeout(drag.timer);
  const { from, ghost, over } = drag;
  drag = null;
  if (!ghost) return;
  ghost.remove();
  document.body.classList.remove("is-dragging");
  suppressClick = true;
  const to = commit ? targetIndex(over) : -1;
  if (to >= 0 && to !== from) {
    swapSlots(from, to);
  } else {
    play("drop");
    render();
  }
}

document.addEventListener("pointermove", (event) => {
  if (!drag) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (!drag.ghost && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 10) startDrag();
  moveDrag();
});
document.addEventListener("pointerup", () => endDrag(true));
document.addEventListener("pointercancel", () => endDrag(false));
// A finished drag must not also count as a click on whatever is under the cursor.
document.addEventListener("click", (event) => {
  if (!suppressClick) return;
  suppressClick = false;
  event.preventDefault();
  event.stopPropagation();
}, true);
document.addEventListener("pointerdown", () => { suppressClick = false; }, true);

function makeSlot(index: number): HTMLButtonElement {
  const item = items()[index];
  const { width, height, slots } = card;
  const { x, y, w, h } = slots[index];
  const slot = document.createElement("button");
  slot.type = "button";
  slot.className = `bingo-slot${item ? " is-filled" : ""}${selectedSlot === index ? " is-selected" : ""}`;
  slot.dataset.index = String(index);
  slot.setAttribute("aria-pressed", String(selectedSlot === index));
  slot.setAttribute("aria-label", `Square ${index + 1}: ${item ? item.title : "empty"}`);
  slot.style.left = `${(x / width) * 100}%`;
  slot.style.top = `${(y / height) * 100}%`;
  slot.style.width = `${(w / width) * 100}%`;
  slot.style.height = `${(h / height) * 100}%`;

  if (item?.imageUrl) {
    const image = document.createElement("img");
    image.src = item.imageUrl;
    image.alt = "";
    image.draggable = false;
    image.addEventListener("error", () => {
      slot.classList.add("image-missing");
      image.remove();
    }, { once: true });
    slot.append(image);
  }

  slot.addEventListener("pointerdown", (event) => beginPress(event, index));
  if (item) {
    slot.addEventListener("pointerenter", () => showTooltip(item, slot));
    slot.addEventListener("focus", () => showTooltip(item, slot));
    slot.addEventListener("pointerleave", hideTooltip);
    slot.addEventListener("blur", hideTooltip);
  }
  slot.addEventListener("click", () => selectSlot(index));
  slot.addEventListener("contextmenu", (event) => {
    if (!item) return;
    event.preventDefault();
    removeItem(index);
  });
  slot.addEventListener("keydown", (event) => {
    if (event.key === "Delete" || event.key === "Backspace") removeItem(index);
  });
  // Links dragged in from another tab (native drag and drop).
  slot.addEventListener("dragover", (event) => {
    event.preventDefault();
    slot.classList.add("is-drag-over");
  });
  slot.addEventListener("dragleave", () => slot.classList.remove("is-drag-over"));
  slot.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    slot.classList.remove("is-drag-over");
    addLinks(event.dataTransfer?.getData("text/uri-list") || event.dataTransfer?.getData("text/plain") || "", index);
  });

  return slot;
}

function makeRow(item: WorkshopItem, index: number): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "item-row";
  row.dataset.index = String(index);

  const thumb = document.createElement("img");
  if (item.imageUrl) thumb.src = item.imageUrl;
  thumb.alt = "";
  thumb.draggable = false;

  const text = document.createElement("a");
  text.href = `https://steamcommunity.com/sharedfiles/filedetails/?id=${item.id}`;
  text.target = "_blank";
  text.rel = "noreferrer";
  text.draggable = false;
  const title = document.createElement("strong");
  title.textContent = item.title;
  const creator = document.createElement("span");
  creator.textContent = item.creatorName ?? "";
  text.append(title, creator);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-button";
  remove.setAttribute("aria-label", `Remove ${item.title}`);
  remove.innerHTML = `<img src="ui/glyphs/close_x.png" alt="" />`;
  remove.addEventListener("click", () => removeItem(index));

  row.addEventListener("pointerdown", (event) => {
    if (!(event.target as Element).closest(".remove-button")) beginPress(event, index);
  });
  row.addEventListener("pointerenter", () => grid.children[index]?.classList.add("is-hot"));
  row.addEventListener("pointerleave", () => grid.children[index]?.classList.remove("is-hot"));
  row.append(thumb, text, remove);
  return row;
}

function renderList() {
  itemList.replaceChildren(...items().flatMap((item, index) => item ? [makeRow(item, index)] : []));
  emptyHint.hidden = filledCount() > 0;
}

function render() {
  hideTooltip();
  const focused = [...grid.children].indexOf(document.activeElement as Element);
  grid.replaceChildren(...items().map((_, index) => makeSlot(index)));
  if (focused >= 0) (grid.children[focused] as HTMLElement | undefined)?.focus();
  renderList();
  const count = filledCount();
  itemCount.innerHTML = `<b>${count}</b>/${items().length}`;
  copyButton.disabled = count === 0;
  downloadButton.disabled = count === 0 || isExporting;
  clearButton.disabled = count === 0;
  addForm.classList.toggle("is-loading", pending > 0);
  for (const button of posterToggle.children) button.setAttribute("aria-pressed", String((button as HTMLElement).dataset.card === card.id));
}

function openCard(next: Card) {
  endDrag(false);
  card = next;
  slotsFor(card);
  localStorage.setItem("bingo-card", card.id);
  selectedSlot = null;
  posterImage.src = card.preview;
  posterImage.alt = `${card.event} ${card.name}`;
  posterStage.style.setProperty("--ratio", String(card.width / card.height));
  setStatus("");
  render();
  hydrate();
}

function renderArchive() {
  archive.replaceChildren(...[...cardsByEvent()].map(([event, eventCards]) => {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    heading.textContent = event;
    const list = document.createElement("div");
    list.className = "archive-cards";
    list.append(...eventCards.map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "archive-card";
      button.setAttribute("aria-pressed", String(entry === card));
      const image = document.createElement("img");
      image.src = entry.preview;
      image.alt = "";
      image.loading = "lazy";
      const label = document.createElement("span");
      label.textContent = `${entry.name} · ${filledCount(slotsFor(entry))}/${entry.slots.length}`;
      button.append(image, label);
      button.addEventListener("click", () => {
        archive.hidePopover();
        if (entry !== card) {
          openCard(entry);
          play("folder");
        }
      });
      return button;
    }));
    section.append(heading, list);
    return section;
  }));
}

function renderSound() {
  soundButton.setAttribute("aria-pressed", String(!isMuted()));
}

const fileSlug = () => `${card.event} ${card.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

async function downloadCard() {
  const current = card;
  const list = items();
  isExporting = true;
  render();
  setStatus("Rendering PNG…");
  try {
    const { blob, missing } = await renderCardPng(current, list);
    saveBlob(blob, `${fileSlug()}.png`);
    setStatus(missing ? `Saved, but ${plural(missing, "thumbnail")} failed to load.` : "");
    play("download");
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not export the card.");
  } finally {
    isExporting = false;
    render();
  }
}

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!linkInput.value.trim()) return;
  addLinks(linkInput.value);
  linkInput.value = "";
});

// Pasting links anywhere adds them; plain text pasted into the field behaves normally.
document.addEventListener("paste", (event) => {
  const text = event.clipboardData?.getData("text") ?? "";
  if (!parseWorkshopLinks(text).ids.length) {
    if (event.target !== linkInput && text.trim()) fail("Not a Workshop item link.");
    return;
  }
  event.preventDefault();
  addLinks(text);
});

// Links dragged in from a Steam tab land in the first empty square.
document.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types.includes("text/uri-list")) event.preventDefault();
});
document.addEventListener("drop", (event) => {
  const text = event.dataTransfer?.getData("text/uri-list") || event.dataTransfer?.getData("text/plain");
  if (!text) return;
  event.preventDefault();
  addLinks(text);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (drag) endDrag(false);
  else if (selectedSlot !== null) {
    selectedSlot = null;
    render();
  }
});

document.addEventListener("pointerdown", (event) => {
  const button = (event.target as Element).closest?.<HTMLButtonElement>(".tf-button");
  if (button && !button.disabled) play("click");
});

// Quick buttons for the newest event; older events are in the archive.
posterToggle.replaceChildren(...cards.filter((entry) => entry.event === currentEvent).map((entry) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tf-button";
  button.dataset.card = entry.id;
  button.textContent = entry.name;
  button.title = `${entry.event} ${entry.name}`;
  button.addEventListener("click", () => {
    if (entry === card) return;
    openCard(entry);
    play("folder");
  });
  return button;
}));

archive.addEventListener("toggle", (event) => {
  if ((event as ToggleEvent).newState !== "open") return;
  renderArchive();
  play("folder");
});

soundButton.addEventListener("click", () => {
  toggleMuted();
  renderSound();
});

clearButton.addEventListener("click", () => {
  const target = card;
  const previous = [...items()];
  saved[target.id] = previous.map(() => null);
  selectedSlot = null;
  save();
  play("clear");
  render();
  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "text-button";
  undo.textContent = "Undo";
  undo.addEventListener("click", () => {
    saved[target.id] = previous;
    save();
    setStatus("");
    if (target === card) render();
  });
  setStatus("Card cleared. ");
  status.append(undo);
});

copyButton.addEventListener("click", async () => {
  const markdown = toMarkdown(items());
  try {
    await navigator.clipboard.writeText(markdown);
    setStatus("Markdown copied.", "success");
  } catch {
    saveBlob(new Blob([markdown], { type: "text/markdown" }), `${fileSlug()}.md`);
    setStatus(`Clipboard blocked, saved ${fileSlug()}.md instead.`);
  }
  play("copy");
});

downloadButton.addEventListener("click", downloadCard);

renderSound();
openCard(card);
save();
