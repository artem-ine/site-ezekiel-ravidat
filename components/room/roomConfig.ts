import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { STATUS_MARK } from "@/lib/spine-style";

export const BAY_SPACING = 4.6;
export const NEAR_RADIUS = 2;
export const MAX_SPINES_PER_SIDE = 22;

/** Radians — enough to face a wall, not enough to spin into it. */
export const YAW_MAX = 1.15;

export const FOV_AISLE = 52;
export const FOV_SHELF = 40;
export const EYE_HEIGHT = 1.45;
export const SHELF_X = 2.35;

export function clampYaw(yaw: number): number {
  return Math.min(YAW_MAX, Math.max(-YAW_MAX, yaw));
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
