import type { Card } from "../data/cards";
import type { Slots } from "../data/storage";

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The poster could not be loaded. Check your connection and try again."));
    image.src = src;
  });
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.save();
  context.beginPath();
  context.rect(x, y, w, h);
  context.clip();
  context.drawImage(image, x + (w - width) / 2, y + (h - height) / 2, width, height);
  context.restore();
}

/** The full-size poster with each item's thumbnail drawn into its slot. `missing` counts thumbnails that failed to load. */
export async function renderCardPng(card: Card, items: Slots): Promise<{ blob: Blob; missing: number }> {
  const [poster, thumbnails] = await Promise.all([
    loadImage(card.full),
    Promise.all(items.map((item) => item?.imageUrl ? loadImage(item.imageUrl).catch(() => null) : null)),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = card.width;
  canvas.height = card.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not render the card.");

  context.drawImage(poster, 0, 0, card.width, card.height);
  thumbnails.forEach((thumbnail, index) => {
    const { x, y, w, h } = card.slots[index];
    if (thumbnail) drawCover(context, thumbnail, x, y, w, h);
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode the PNG.");
  return { blob, missing: thumbnails.filter((thumbnail, index) => items[index] && !thumbnail).length };
}
