import "./style.css";
import { cards, cardsByEvent, currentEvent, type Card, type Slot } from "./data/cards";
import { loadSaved, saveAll, type Slots } from "./data/storage";
import { fetchWorkshopItems } from "./steam/api";
import { itemKind, parseWorkshopLinks, toMarkdown, type WorkshopItem } from "./steam/workshop";
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
const board = $("#board");
const archive = $("#archive");

/** A square: card ID and slot index. */
type Ref = { card: string; index: number };

const saved = loadSaved();
/** The open event's cards, shown side by side. */
let shown: Card[] = [];
let grids = new Map<string, HTMLElement>();
let selected: Ref | null = null;
let pending = 0;
let isExporting = false;

/** The card's items, sized to its slot count. */
function slotsFor(target: Card): Slots {
  const list = saved[target.id] ?? [];
  // A registry edit that shrinks a card drops the overflow, so keep slot counts stable per card id.
  saved[target.id] = Array.from({ length: target.slots.length }, (_, index) => list[index] ?? null);
  return saved[target.id];
}
const eventCards = (event: string | null) => cards.filter((card) => card.event === event);
const at = ({ card, index }: Ref) => saved[card][index];
const same = (a: Ref | null, b: Ref | null) => Boolean(a && b && a.card === b.card && a.index === b.index);
const shownItems = (): Slots => shown.flatMap((card) => saved[card.id]);
const hasItems = (card: Card) => saved[card.id].some(Boolean);
const filledCount = (list: Slots) => list.filter(Boolean).length;
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

async function hydrate(target = shown) {
  const lists = target.map((card) => saved[card.id]);
  const ids = lists.flat().flatMap((item) => needsDetails(item) ? [item.id] : []);
  if (!ids.length) return;
  pending++;
  setStatus(`Loading ${plural(ids.length, "item")}…`);
  render();
  try {
    const byId = new Map((await fetchWorkshopItems(ids)).map((item) => [item.id, item]));
    for (const list of lists) {
      list.forEach((item, index) => {
        const fresh = needsDetails(item) && byId.get(item.id);
        // Keep a name we already have if Steam didn't send one this time.
        if (fresh) list[index] = { creatorName: item.creatorName, ...fresh };
      });
    }
    save();
    setStatus(ids.length > byId.size ? `${plural(ids.length - byId.size, "item")} not found or private.` : "");
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not load these cards.");
  } finally {
    pending--;
    render();
  }
}

// Each item goes in the first free square of its kind (from its tags), then in a free "?" square. A free
// square the user picked (`start`) takes the first item whatever its kind. Returns how many were placed.
function place(target: Card[], newItems: WorkshopItem[], start: Ref | null): number {
  const squares = target.flatMap((card) => card.slots.map(({ kind }, index) => ({ card: card.id, index, kind })));
  const onCard = new Set(squares.flatMap((square) => at(square)?.id ?? []));
  let placed = 0;
  newItems.filter((item) => !onCard.has(item.id)).forEach((item, n) => {
    const kind = itemKind(item.tags ?? []);
    const free = squares.filter((square) => !at(square));
    const square = (n === 0 ? free.find((square) => same(square, start)) : undefined)
      ?? free.find((square) => square.kind === kind)
      ?? free.find((square) => !square.kind);
    if (!square) return;
    saved[square.card][square.index] = item;
    placed++;
  });
  return placed;
}

async function addLinks(text: string, start = selected) {
  const target = shown;
  const parsed = parseWorkshopLinks(text);
  const onCard = new Set(target.flatMap((card) => saved[card.id].flatMap((item) => item ? [item.id] : [])));
  const ids = parsed.ids.filter((id) => !onCard.has(id));
  const repeats = parsed.duplicates + parsed.ids.length - ids.length;
  if (!ids.length) {
    fail(repeats ? "Already on a card." : "Not a Workshop item link.");
    return;
  }

  pending++;
  setStatus(`Loading ${plural(ids.length, "item")}…`);
  render();
  try {
    const loaded = await fetchWorkshopItems(ids);
    const placed = place(target, loaded, start);
    if (target === shown) selected = null;
    save();
    const left = loaded.length - placed;
    const notes = [
      left ? `${left} left out, no free square of ${left === 1 ? "its" : "their"} kind` : "",
      ids.length > loaded.length ? `${ids.length - loaded.length} not found or private` : "",
      parsed.invalid ? `${parsed.invalid} not a Workshop link` : "",
      repeats ? `${repeats} already on a card` : "",
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

function swapSlots(source: Ref, target: Ref) {
  selected = null;
  if (!same(source, target)) {
    [saved[source.card][source.index], saved[target.card][target.index]] = [at(target), at(source)];
    save();
    play("drop");
  }
  render();
}

function removeItem(ref: Ref) {
  if (!at(ref)) return;
  saved[ref.card][ref.index] = null;
  selected = null;
  save();
  play("remove");
  render();
}

function selectSlot(ref: Ref) {
  if (same(selected, ref)) {
    selected = null;
  } else if (!selected || (!at(selected) && !at(ref))) {
    selected = ref;
    play("pickup");
  } else {
    swapSlots(selected, ref);
    return;
  }
  render();
  // An empty square is a paste target.
  if (selected && !at(selected)) linkInput.focus();
}

// Backpack-style dragging (CBackpackPanel in the Source SDK): press an item, then move 10px or hold
// 0.3s. The source slot empties, a copy of the item panel follows the cursor centred on it, the slot
// under the cursor lights up, and releasing swaps (across cards too). Releasing anywhere else puts the item back.
type Drag = { from: Ref; x: number; y: number; startX: number; startY: number; timer: number; ghost?: HTMLElement; over?: Element };
let drag: Drag | null = null;
let suppressClick = false;

const dragTargets = () => [...document.querySelectorAll<HTMLElement>(".bingo-slot, .item-row")];
/** The square a slot or list row stands for. */
const refOf = (element: Element | null | undefined): Ref | null =>
  element instanceof HTMLElement && element.dataset.card ? { card: element.dataset.card, index: Number(element.dataset.index) } : null;
const slotElement = ({ card, index }: Ref) => board.querySelector<HTMLElement>(`.bingo-slot[data-card="${card}"][data-index="${index}"]`);

function beginPress(event: PointerEvent, ref: Ref) {
  if (event.button !== 0 || !at(ref) || drag) return;
  drag = { from: ref, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, timer: window.setTimeout(startDrag, 300) };
}

function startDrag() {
  if (!drag || drag.ghost) return;
  const item = at(drag.from);
  if (!item) return;
  selected = null;
  render();
  hideTooltip();

  const { width, height } = slotElement(drag.from)?.getBoundingClientRect() ?? { width: 64, height: 64 };
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
  for (const element of dragTargets()) element.classList.toggle("is-drag-source", same(refOf(element), drag.from));
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
  const to = commit ? refOf(over) : null;
  if (to && !same(to, from)) {
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

/** A card's poster with an empty layer over it for the squares. */
function makeStage(card: Card): [stage: HTMLElement, grid: HTMLElement] {
  const stage = document.createElement("div");
  stage.className = "poster-stage";
  stage.style.setProperty("--ratio", String(card.width / card.height));
  const poster = document.createElement("img");
  poster.className = "poster-image";
  poster.src = card.preview;
  poster.alt = `${card.event} ${card.name}`;
  poster.draggable = false;
  const grid = document.createElement("div");
  grid.className = "bingo-grid";
  stage.append(poster, grid);
  return [stage, grid];
}

/** Puts an element over its slot, in percentages of the poster so it scales with it. */
function placeOver(element: HTMLElement, card: Card, { x, y, w, h }: Slot) {
  element.style.left = `${(x / card.width) * 100}%`;
  element.style.top = `${(y / card.height) * 100}%`;
  element.style.width = `${(w / card.width) * 100}%`;
  element.style.height = `${(h / card.height) * 100}%`;
}

function makeSlot(card: Card, index: number): HTMLButtonElement {
  const ref = { card: card.id, index };
  const item = at(ref);
  const { kind } = card.slots[index];
  const isSelected = same(selected, ref);
  const slot = document.createElement("button");
  slot.type = "button";
  slot.className = `bingo-slot${item ? " is-filled" : ""}${isSelected ? " is-selected" : ""}`;
  slot.dataset.card = card.id;
  slot.dataset.index = String(index);
  slot.setAttribute("aria-pressed", String(isSelected));
  slot.setAttribute("aria-label", `${card.name}, square ${index + 1} (${kind ?? "any item"}): ${item ? item.title : "empty"}`);
  placeOver(slot, card, card.slots[index]);

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

  slot.addEventListener("pointerdown", (event) => beginPress(event, ref));
  if (item) {
    slot.addEventListener("pointerenter", () => showTooltip(item, slot));
    slot.addEventListener("focus", () => showTooltip(item, slot));
    slot.addEventListener("pointerleave", hideTooltip);
    slot.addEventListener("blur", hideTooltip);
  }
  slot.addEventListener("click", () => selectSlot(ref));
  slot.addEventListener("contextmenu", (event) => {
    if (!item) return;
    event.preventDefault();
    removeItem(ref);
  });
  slot.addEventListener("keydown", (event) => {
    if (event.key === "Delete" || event.key === "Backspace") removeItem(ref);
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
    addLinks(event.dataTransfer?.getData("text/uri-list") || event.dataTransfer?.getData("text/plain") || "", ref);
  });

  return slot;
}

function makeRow(item: WorkshopItem, ref: Ref): HTMLLIElement {
  const row = document.createElement("li");
  row.className = "item-row";
  row.dataset.card = ref.card;
  row.dataset.index = String(ref.index);

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
  remove.addEventListener("click", () => removeItem(ref));

  row.addEventListener("pointerdown", (event) => {
    if (!(event.target as Element).closest(".remove-button")) beginPress(event, ref);
  });
  row.addEventListener("pointerenter", () => slotElement(ref)?.classList.add("is-hot"));
  row.addEventListener("pointerleave", () => slotElement(ref)?.classList.remove("is-hot"));
  row.append(thumb, text, remove);
  return row;
}

// One list for every shown card, in card order, with a heading per card when there are several.
function renderList() {
  itemList.replaceChildren(...shown.flatMap((card) => {
    const rows = saved[card.id].flatMap((item, index) => item ? [makeRow(item, { card: card.id, index })] : []);
    if (!rows.length || shown.length === 1) return rows;
    const heading = document.createElement("li");
    heading.className = "list-heading";
    heading.textContent = `${card.name} · ${rows.length}/${card.slots.length}`;
    return [heading, ...rows];
  }));
  emptyHint.hidden = shownItems().some(Boolean);
}

function render() {
  hideTooltip();
  const focused = refOf(document.activeElement?.closest(".bingo-slot"));
  for (const card of shown) grids.get(card.id)?.replaceChildren(...card.slots.map((_, index) => makeSlot(card, index)));
  if (focused) slotElement(focused)?.focus();
  renderList();
  const count = filledCount(shownItems());
  itemCount.innerHTML = `<b>${count}</b>/${shownItems().length}`;
  copyButton.disabled = count === 0;
  downloadButton.disabled = count === 0 || isExporting;
  clearButton.disabled = count === 0;
  addForm.classList.toggle("is-loading", pending > 0);
}

function openEvent(event: string) {
  endDrag(false);
  shown = eventCards(event);
  shown.forEach((card) => slotsFor(card));
  localStorage.setItem("bingo-event", event);
  selected = null;
  $("#event-title").textContent = event;
  grids = new Map();
  board.replaceChildren(...shown.map((card) => {
    const [stage, grid] = makeStage(card);
    grid.setAttribute("aria-label", `${card.name} squares`);
    grids.set(card.id, grid);
    return stage;
  }));
  board.style.setProperty("--cards", String(shown.length));
  setStatus("");
  render();
  hydrate();
}

// One entry per event, since an event opens all its cards: small copies of its cards with their items drawn in.
function renderArchive() {
  archive.replaceChildren(...[...cardsByEvent()].map(([event, eventCards]) => {
    const items = eventCards.flatMap((card) => slotsFor(card));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "archive-event";
    button.setAttribute("aria-current", String(event === shown[0].event));
    button.setAttribute("aria-label", `${event}, ${filledCount(items)} of ${items.length} squares filled`);

    const posters = document.createElement("div");
    posters.className = "archive-posters";
    posters.append(...eventCards.map((card) => {
      const [stage, grid] = makeStage(card);
      grid.append(...saved[card.id].flatMap((item, index) => {
        if (!item?.imageUrl) return [];
        const image = document.createElement("img");
        image.src = item.imageUrl;
        image.alt = "";
        image.loading = "lazy";
        placeOver(image, card, card.slots[index]);
        return [image];
      }));
      return stage;
    }));

    const caption = document.createElement("span");
    caption.className = "archive-caption";
    const name = document.createElement("strong");
    name.textContent = event;
    const count = document.createElement("span");
    count.className = "count";
    count.innerHTML = `<b>${filledCount(items)}</b>/${items.length}`;
    caption.append(name, count);

    button.append(posters, caption);
    button.addEventListener("click", () => {
      archive.hidePopover();
      if (event === shown[0].event) return;
      openEvent(event);
      play("folder");
    });
    return button;
  }));
}

function renderSound() {
  soundButton.setAttribute("aria-pressed", String(!isMuted()));
}

const fileSlug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// One PNG per card with items, so each card can be posted on its own.
async function downloadCards() {
  const target = shown.filter(hasItems);
  isExporting = true;
  render();
  setStatus(`Rendering ${plural(target.length, "PNG")}…`);
  try {
    let missing = 0;
    for (const card of target) {
      const result = await renderCardPng(card, saved[card.id]);
      saveBlob(result.blob, `${fileSlug(`${card.event} ${card.name}`)}.png`);
      missing += result.missing;
    }
    setStatus(missing ? `Saved, but ${plural(missing, "thumbnail")} failed to load.` : "");
    play("download");
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not export the cards.");
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

// Links dragged in from a Steam tab land in a free square of their kind.
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
  else if (selected) {
    selected = null;
    render();
  }
});

document.addEventListener("pointerdown", (event) => {
  const button = (event.target as Element).closest?.<HTMLButtonElement>(".tf-button");
  if (button && !button.disabled) play("click");
});

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
  const target = shown;
  const previous = target.map((card) => saved[card.id]);
  for (const card of target) saved[card.id] = saved[card.id].map(() => null);
  selected = null;
  save();
  play("clear");
  render();
  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "text-button";
  undo.textContent = "Undo";
  undo.addEventListener("click", () => {
    target.forEach((card, index) => { saved[card.id] = previous[index]; });
    save();
    setStatus("");
    if (target === shown) render();
  });
  setStatus(target.length > 1 ? "Cards cleared. " : "Card cleared. ");
  status.append(undo);
});

copyButton.addEventListener("click", async () => {
  const filled = shown.filter(hasItems);
  // Each card's list under its name, so they can be posted separately.
  const markdown = filled.map((card) => `${filled.length > 1 ? `**${card.name}**\n` : ""}${toMarkdown(saved[card.id])}`).join("\n\n");
  const file = `${fileSlug(shown[0].event)}.md`;
  try {
    await navigator.clipboard.writeText(markdown);
    setStatus("Markdown copied.", "success");
  } catch {
    saveBlob(new Blob([markdown], { type: "text/markdown" }), file);
    setStatus(`Clipboard blocked, saved ${file} instead.`);
  }
  play("copy");
});

downloadButton.addEventListener("click", downloadCards);

renderSound();
const lastEvent = localStorage.getItem("bingo-event");
openEvent(lastEvent && eventCards(lastEvent).length ? lastEvent : currentEvent);
save();
