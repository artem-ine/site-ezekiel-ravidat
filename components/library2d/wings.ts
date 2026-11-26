import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";

/** Wing for books whose genres don't have a parent genre yet. */
export const UNSORTED_LABEL = "Unsorted";

/** A top-level genre (Fiction, Nonfiction, ...) holding its subgenre shelves. */
export type Wing = {
  id: string;
  label: string;
  shelves: ShelfGroup[];
};

function titleKey(book: LibraryBook): string {
  return book.title.replace(/^(the|a|an)\s+/i, "").toLocaleLowerCase();
}

/** Alphabetical by author surname; an author's own books keep series order, then title. */
export function sortByAuthor(books: LibraryBook[]): LibraryBook[] {
  return [...books].sort((a, b) => {
    const byAuthor = a.authorSort.localeCompare(b.authorSort);
    if (byAuthor) return byAuthor;
    if (a.series && a.series === b.series) {
      const byPosition = (a.seriesPosition ?? 999) - (b.seriesPosition ?? 999);
      if (byPosition) return byPosition;
    }
    return titleKey(a).localeCompare(titleKey(b));
  });
}

type Placement = { wing: string; shelf: string };

function placeBook(book: LibraryBook, parentNames: Set<string>): Placement {
  const underParent = book.genres.find((genre) => genre.parent);
  if (underParent) return { wing: underParent.parent!, shelf: underParent.name };

  const isParent = book.genres.find((genre) => parentNames.has(genre.name));
  if (isParent) return { wing: isParent.name, shelf: "General" };

  return { wing: UNSORTED_LABEL, shelf: book.genres[0]?.name ?? "Uncategorised" };
}

/**
 * Parent genres are the main divider; each holds its subgenres as shelves,
 * with books A to Z by author. Books under no parent go to a last wing so
 * nothing disappears while genres are still being sorted in Prismic.
 */
export function groupIntoWings(books: LibraryBook[]): Wing[] {
  const parentNames = new Set<string>();
  for (const book of books) {
    for (const genre of book.genres) {
      if (genre.parent) parentNames.add(genre.parent);
    }
  }

  const wings = new Map<string, Map<string, LibraryBook[]>>();
  for (const book of books) {
    const { wing, shelf } = placeBook(book, parentNames);
    const shelves = wings.get(wing) ?? new Map<string, LibraryBook[]>();
    const list = shelves.get(shelf) ?? [];
    list.push(book);
    shelves.set(shelf, list);
    wings.set(wing, shelves);
  }

  return [...wings.entries()]
    .sort(([a], [b]) => {
      if (a === UNSORTED_LABEL) return 1;
      if (b === UNSORTED_LABEL) return -1;
      return a.localeCompare(b);
    })
    .map(([label, shelves]) => ({
      id: `wing-${label}`,
      label,
      shelves: [...shelves.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([shelf, shelfBooks]) => ({
          id: `genre-${label}-${shelf}`,
          label: shelf,
          books: sortByAuthor(shelfBooks),
        })),
    }));
}
