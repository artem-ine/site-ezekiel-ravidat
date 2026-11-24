import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { STATUS_MARK } from "@/lib/spine-style";

export const BAY_SPACING = 4.6;
export const NEAR_RADIUS = 2;
export const MAX_SPINES_PER_SIDE = 22;

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
