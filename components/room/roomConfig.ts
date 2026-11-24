import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { STATUS_MARK } from "@/lib/spine-style";

export const BAY_SPACING = 5.2;
export const NEAR_RADIUS = 1;
export const MAX_SPINES_PER_SIDE = 30;
export const SHELF_X = 2.4;
/** Distance from shelf face to camera — whole bay in a ~40° FOV. */
export const CAMERA_DISTANCE = 3.9;
export const EYE_HEIGHT = 1.35;
export const FOV = 40;

export type ShelfSide = "left" | "right";

export type Station = {
  bay: number;
  side: ShelfSide;
};

export function clampBay(bay: number, maxBay: number): number {
  return Math.min(maxBay, Math.max(0, bay));
}

export function nearbyBooksFromShelves(
  shelves: ShelfGroup[],
  bay: number,
  side: ShelfSide,
): LibraryBook[] {
  const shelf = shelves[bay];
  if (!shelf) return [];

  const left = shelf.books.slice(0, MAX_SPINES_PER_SIDE);
  const rightSlice = shelf.books.slice(MAX_SPINES_PER_SIDE, MAX_SPINES_PER_SIDE * 2);
  const right =
    rightSlice.length > 0
      ? rightSlice
      : [...left].reverse().slice(0, Math.min(MAX_SPINES_PER_SIDE, left.length));

  return side === "left" ? left : right;
}

export function statusMark(book: LibraryBook): string {
  return book.readStatus ? STATUS_MARK[book.readStatus] : "?";
}
