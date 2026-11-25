import type { LibraryBook, ReadStatus } from "@/lib/books";
import { STATUS_LABEL } from "@/lib/spine-style";

export type SortKey = "title" | "author" | "year-read" | "status" | "series" | "genre";

export type Filters = {
  status: ReadStatus | "all";
  genre: string | "all";
  yearRead: number | "all";
  series: string | "all";
};

export type ShelfGroup = {
  id: string;
  label: string;
  books: LibraryBook[];
};

const STATUS_ORDER: ReadStatus[] = [
  "currently-reading",
  "read",
  "not-read",
  "did-not-finish",
];

function authorSortKey(book: LibraryBook): string {
  return (book.authors[0] || "Unknown").toLocaleLowerCase();
}

function titleSortKey(book: LibraryBook): string {
  return book.title.replace(/^(the|a|an)\s+/i, "").toLocaleLowerCase();
}

export function applyFilters(books: LibraryBook[], filters: Filters): LibraryBook[] {
  return books.filter((book) => {
    if (filters.status !== "all" && book.readStatus !== filters.status) return false;
    if (filters.genre !== "all" && !book.genres.some((g) => g.name === filters.genre)) {
      return false;
    }
    if (filters.yearRead !== "all" && book.yearRead !== filters.yearRead) return false;
    if (filters.series !== "all" && book.series !== filters.series) return false;
    return true;
  });
}

export function groupIntoShelves(books: LibraryBook[], sort: SortKey): ShelfGroup[] {
  if (books.length === 0) return [];

  if (sort === "title") {
    return chunkAlpha(
      [...books].sort((a, b) => titleSortKey(a).localeCompare(titleSortKey(b))),
      "title",
    );
  }

  if (sort === "author") {
    return chunkAlpha(
      [...books].sort((a, b) => {
        const byAuthor = authorSortKey(a).localeCompare(authorSortKey(b));
        return byAuthor || titleSortKey(a).localeCompare(titleSortKey(b));
      }),
      "author",
    );
  }

  if (sort === "year-read") {
    const buckets = new Map<string, LibraryBook[]>();
    for (const book of [...books].sort((a, b) => (b.yearRead ?? 0) - (a.yearRead ?? 0))) {
      const key = book.yearRead ? String(book.yearRead) : "Year unknown";
      const list = buckets.get(key) ?? [];
      list.push(book);
      buckets.set(key, list);
    }
    return [...buckets.entries()].map(([label, shelfBooks]) => ({
      id: `year-${label}`,
      label,
      books: shelfBooks.sort((a, b) => titleSortKey(a).localeCompare(titleSortKey(b))),
    }));
  }

  if (sort === "status") {
    return STATUS_ORDER.map((status) => ({
      id: `status-${status}`,
      label: STATUS_LABEL[status],
      books: books
        .filter((book) => book.readStatus === status)
        .sort((a, b) => titleSortKey(a).localeCompare(titleSortKey(b))),
    })).filter((shelf) => shelf.books.length > 0);
  }

  if (sort === "series") {
    const buckets = new Map<string, LibraryBook[]>();
    for (const book of books) {
      const key = book.series || "Standalone";
      const list = buckets.get(key) ?? [];
      list.push(book);
      buckets.set(key, list);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => {
        if (a === "Standalone") return 1;
        if (b === "Standalone") return -1;
        return a.localeCompare(b);
      })
      .map(([label, shelfBooks]) => ({
        id: `series-${label}`,
        label,
        books: shelfBooks.sort((a, b) => {
          const byPos = (a.seriesPosition ?? 999) - (b.seriesPosition ?? 999);
          return byPos || titleSortKey(a).localeCompare(titleSortKey(b));
        }),
      }));
  }

  // genre — one shelf per genre; books with several genres appear once under the first
  const buckets = new Map<string, LibraryBook[]>();
  for (const book of books) {
    const key = book.genres[0]?.name || "Uncategorised";
    const list = buckets.get(key) ?? [];
    list.push(book);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, shelfBooks]) => ({
      id: `genre-${label}`,
      label,
      books: shelfBooks.sort((a, b) => titleSortKey(a).localeCompare(titleSortKey(b))),
    }));
}

/** Split a long A–Z list into lettered bays so the aisle stays walkable. */
function chunkAlpha(books: LibraryBook[], mode: "title" | "author"): ShelfGroup[] {
  const buckets = new Map<string, LibraryBook[]>();

  for (const book of books) {
    const source = mode === "author" ? authorSortKey(book) : titleSortKey(book);
    const letter = (source[0] || "#").toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : "#";
    const list = buckets.get(key) ?? [];
    list.push(book);
    buckets.set(key, list);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, shelfBooks]) => ({
      id: `${mode}-${letter}`,
      label: mode === "author" ? `Authors · ${letter}` : `Titles · ${letter}`,
      books: shelfBooks,
    }));
}

export function collectFilterOptions(books: LibraryBook[]) {
  const genres = new Set<string>();
  const series = new Set<string>();
  const years = new Set<number>();

  for (const book of books) {
    for (const genre of book.genres) genres.add(genre.name);
    if (book.series) series.add(book.series);
    if (book.yearRead) years.add(book.yearRead);
  }

  return {
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
    series: [...series].sort((a, b) => a.localeCompare(b)),
    years: [...years].sort((a, b) => b - a),
  };
}
