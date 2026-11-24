import type { LibraryBook, ReadStatus } from "@/lib/books";

/** Cloth colours that sit with aged paper / walnut / brass — not purple SaaS. */
const CLOTH = [
  "#5c2a24",
  "#3f5a3c",
  "#2f3f55",
  "#6b4a2b",
  "#4a3540",
  "#3a4f4a",
  "#7a3b2e",
  "#2c3340",
  "#5a4630",
  "#364a38",
  "#6e3f4a",
  "#405060",
] as const;

export const STATUS_LABEL: Record<ReadStatus, string> = {
  read: "Read",
  "not-read": "Not read",
  "currently-reading": "Currently reading",
  "did-not-finish": "Did not finish",
};

export const STATUS_MARK: Record<ReadStatus, string> = {
  read: "R",
  "not-read": "T",
  "currently-reading": "C",
  "did-not-finish": "D",
};

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}

export function spineCloth(book: LibraryBook): string {
  const genreAccent = book.genres.find((genre) => genre.accent)?.accent;
  if (genreAccent) return genreAccent;
  return CLOTH[hash(book.uid) % CLOTH.length];
}

/** Spine width in rem from page count; short books stay readable. */
export function spineWidthRem(pageCount: number | null): number {
  const pages = pageCount && pageCount > 0 ? pageCount : 280;
  const rem = 0.7 + (pages / 900) * 2.4;
  return Math.min(3.2, Math.max(0.85, rem));
}

/** Spine height in rem — slight variation so the shelf feels lived-in. */
export function spineHeightRem(book: LibraryBook): number {
  const base = 9.5 + (hash(book.uid) % 7) * 0.35;
  if (book.pageCount && book.pageCount > 500) return base + 0.8;
  if (book.pageCount && book.pageCount < 180) return base - 0.7;
  return base;
}

export function shortTitle(title: string, max = 28): string {
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1).trimEnd()}…`;
}
