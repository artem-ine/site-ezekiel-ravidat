import type { LibraryBook } from "@/lib/books";

export type StatRow = { label: string; count: number; latest?: boolean };
export type StatGroup = { rows: StatRow[]; max: number };
export type ReadingStats = {
  years: StatGroup;
  formats: StatRow[];
  total: number;
  since: number | null;
};

const STATS_YEARS_SHOWN = 6;

const STAT_FORMATS = [
  { label: "Hardback", value: "hardcover" },
  { label: "Paperback", value: "paperback" },
  { label: "Audio", value: "audio" },
] as const;

/** Read books with no year read are counted under this year. */
const UNDATED_READS_YEAR = 2021;

function statGroup(rows: StatRow[]): StatGroup {
  return { rows, max: Math.max(1, ...rows.map((row) => row.count)) };
}

/** Title with any " - audio" / " - double" suffix dropped, for matching copies of one book. */
export function statsTitleKey(title: string): string {
  let key = title.normalize("NFKC").trim();
  for (;;) {
    const next = key.replace(/\s+-\s+(audio|double)\s*$/i, "");
    if (next === key) break;
    key = next;
  }
  return key.replace(/\s+/g, " ").toLowerCase();
}

/**
 * One book read in several formats in the same year counts once. The audio
 * copy only stands in when no visible (non-audio) copy was read that year.
 */
function preferCopy(current: LibraryBook, candidate: LibraryBook): LibraryBook {
  return current.format === "audio" && candidate.format !== "audio" ? candidate : current;
}

/** Read books, one per title and year read (undated reads fall under UNDATED_READS_YEAR). */
export function readBooksOncePerYear(books: LibraryBook[]): { book: LibraryBook; year: number }[] {
  const kept = new Map<string, { book: LibraryBook; year: number }>();
  for (const book of books) {
    if (book.readStatus !== "read") continue;
    const year = book.yearRead ?? UNDATED_READS_YEAR;
    const key = `${year}|${statsTitleKey(book.title)}`;
    const existing = kept.get(key);
    kept.set(key, existing ? { book: preferCopy(existing.book, book), year } : { book, year });
  }
  return [...kept.values()];
}

/**
 * Books marked read: per year read (most recent years), per format, and the
 * total across all of them. A title read in several formats in one year counts once.
 */
export function readingStats(books: LibraryBook[]): ReadingStats | null {
  const reads = readBooksOncePerYear(books);
  if (reads.length === 0) return null;

  const perYear = new Map<number, number>();
  const perFormat = new Map<string, number>();
  for (const { book, year } of reads) {
    perYear.set(year, (perYear.get(year) ?? 0) + 1);
    const format = STAT_FORMATS.find((option) => option.value === book.format)?.label ?? "Other";
    perFormat.set(format, (perFormat.get(format) ?? 0) + 1);
  }

  const years = [...perYear.keys()].sort((a, b) => a - b);
  const yearRows: StatRow[] = years
    .slice(-STATS_YEARS_SHOWN)
    .map((year, index, shown) => ({
      label: String(year),
      count: perYear.get(year)!,
      latest: index === shown.length - 1,
    }));

  const formatRows: StatRow[] = [...STAT_FORMATS.map((option) => option.label), "Other"]
    .map((label) => ({ label, count: perFormat.get(label) ?? 0 }))
    .filter((row) => row.count > 0);

  return {
    years: statGroup(yearRows),
    formats: formatRows,
    total: reads.length,
    since: years[0] ?? null,
  };
}
