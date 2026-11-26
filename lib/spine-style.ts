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

/** Stable string hash — keeps "random" shelf variety identical on every render. */
export function hash(text: string): number {
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

export type BindingKind = "hardcover" | "paperback";

/**
 * Hardcovers stand taller and leaner; paperbacks are shorter and fatter.
 * Digital, audio and unknown formats use the paperback shape.
 */
export function bindingOf(book: LibraryBook): BindingKind {
  return book.format === "hardcover" ? "hardcover" : "paperback";
}

/** Spine width in rem from page count and binding; short books stay readable. */
export function spineWidthRem(book: LibraryBook): number {
  const pages = book.pageCount && book.pageCount > 0 ? book.pageCount : 280;
  const base = 0.7 + (pages / 900) * 2.4;
  const bindingScale = bindingOf(book) === "hardcover" ? 0.8 : 1.3;
  return Math.min(3.6, Math.max(0.85, base * bindingScale));
}

/** Spine height in rem; binding and page count set the shape, the hash adds variety. */
export function spineHeightRem(book: LibraryBook): number {
  const pages = book.pageCount ?? 0;
  let height = 9 + (hash(book.uid) % 7) * 0.25;
  if (pages > 500) height += 0.4;
  if (pages > 0 && pages < 180) height -= 0.6;
  height += bindingOf(book) === "hardcover" ? 0.6 : -0.5;
  return Math.min(11.5, Math.max(7.5, height));
}

export function shortTitle(title: string, max = 28): string {
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1).trimEnd()}…`;
}
