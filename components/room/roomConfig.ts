import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { STATUS_MARK } from "@/lib/spine-style";

export const BAY_SPACING = 4.6;
export const NEAR_RADIUS = 2;
export const MAX_SPINES_PER_SIDE = 22;

/** Radians — enough to face a wall, not enough to spin into it. */
export const YAW_MAX = 1.15;
/** Gentle look up / down while facing a shelf. */
export const PITCH_MAX = 0.38;

export const FOV_AISLE = 52;
export const FOV_SHELF = 40;
export const EYE_HEIGHT = 1.4;
export const SHELF_X = 2.35;

/** Floor → top of bookcase, for framing math. */
export const BAY_HEIGHT = 2.75;
export const BAY_MID_Y = BAY_HEIGHT / 2;
/** Extra margin so top and bottom rows clear the frame. */
export const FRAME_MARGIN = 1.14;

/** Internal render scale — 1/3, upscaled with nearest-neighbour. */
export const PIXEL_SCALE = 3;

export const PALETTE = {
  walnut: "#4a2f1c",
  honey: "#c4a35a",
  oxblood: "#6b2a24",
  brass: "#c9a227",
  paper: "#e8d9b5",
  deepGreen: "#2f4a3c",
  ink: "#1e140e",
  lamp: "#ffd28a",
  fog: "#2a1d14",
} as const;

export function clampYaw(yaw: number): number {
  return Math.min(YAW_MAX, Math.max(-YAW_MAX, yaw));
}

export function clampPitch(pitch: number): number {
  return Math.min(PITCH_MAX, Math.max(-PITCH_MAX, pitch));
}

/** Distance from shelf face so the full bay fits in FOV_SHELF with margin. */
export function shelfViewDistance(fovDeg = FOV_SHELF): number {
  const half = ((fovDeg * Math.PI) / 180) / 2;
  return ((BAY_HEIGHT / 2) / Math.tan(half)) * FRAME_MARGIN;
}

export function nearbyBooksFromShelves(shelves: ShelfGroup[], depth: number): LibraryBook[] {
  const seen = new Set<string>();
  const list: LibraryBook[] = [];

  shelves.forEach((shelf, index) => {
    if (Math.abs(index - depth) > NEAR_RADIUS) return;
    for (const book of shelf.books.slice(0, MAX_SPINES_PER_SIDE * 2)) {
      if (seen.has(book.uid)) continue;
      seen.add(book.uid);
      list.push(book);
    }
  });

  return list;
}

export function statusMark(book: LibraryBook): string {
  return book.readStatus ? STATUS_MARK[book.readStatus] : "?";
}

/** Same-origin cover URL for WebGL textures (avoids CORS / tainted canvas). */
export function coverTextureUrl(coverUrl: string | null): string | null {
  if (!coverUrl) return null;
  try {
    const host = new URL(coverUrl).hostname;
    if (host !== "images.prismic.io" && host !== "images.cdn.prismic.io") return null;
  } catch {
    return null;
  }
  return `/api/cover?u=${encodeURIComponent(coverUrl)}`;
}

export function hashUid(uid: string): number {
  let value = 0;
  for (let i = 0; i < uid.length; i += 1) {
    value = (value * 31 + uid.charCodeAt(i)) >>> 0;
  }
  return value;
}
