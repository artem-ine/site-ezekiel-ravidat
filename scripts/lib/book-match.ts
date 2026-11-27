import { bookTitleSlug, normalizeIsbn } from "./slug";

export interface PublishedBook {
  id: string;
  uid: string;
  titleSlug: string;
  /** ISBN-13 when the stored value converts to one, otherwise the cleaned code. */
  isbn: string;
  format: string | null;
}

export interface BookLookupInput {
  title: string;
  uid: string;
  isbnRaw: string;
  format: string | null;
}

export type BookMatch =
  | { kind: "match"; book: PublishedBook; by: "isbn" | "uid" | "format" }
  | { kind: "ambiguous"; candidates: PublishedBook[] }
  | { kind: "none" };

export function comparableIsbn(raw: string | null | undefined): string {
  if (!raw) return "";
  const normalized = normalizeIsbn(raw);
  return normalized.isbn13 ?? normalized.cleaned;
}

export function toPublishedBook(doc: {
  id: string;
  uid: string | null;
  data: { title?: string | null; isbn?: string | null; format?: string | null };
}): PublishedBook | null {
  if (!doc.uid) return null;
  return {
    id: doc.id,
    uid: doc.uid,
    titleSlug: bookTitleSlug(doc.data.title ?? doc.uid),
    isbn: comparableIsbn(doc.data.isbn),
    format: doc.data.format ?? null,
  };
}

/**
 * Finds the document an imported row already lives in, so a re-run updates it
 * instead of creating a second book. The match is on the title slug, then:
 * the same ISBN, else the row's own uid when the format agrees, else the only
 * document of that title in the same format (documents with a different ISBN
 * never match, they are other editions). Documents keep whatever uid they
 * already have, which includes older ISBN-suffixed uids.
 */
export function findExistingBook(
  input: BookLookupInput,
  published: readonly PublishedBook[],
): BookMatch {
  const slug = bookTitleSlug(input.title);
  const sameTitle = published.filter((p) => p.titleSlug === slug);

  const isbn = comparableIsbn(input.isbnRaw);
  if (isbn) {
    const hit = sameTitle.find((p) => p.isbn === isbn);
    if (hit) return { kind: "match", book: hit, by: "isbn" };
  }

  // A document with a different ISBN is another edition, not the same book.
  const sameEdition = sameTitle.filter((p) => !isbn || !p.isbn || p.isbn === isbn);

  const byUid = sameEdition.find((p) => p.uid === input.uid);
  if (byUid && byUid.format === input.format) {
    return { kind: "match", book: byUid, by: "uid" };
  }

  const sameFormat = sameEdition.filter((p) => p.format === input.format);
  if (sameFormat.length === 1) {
    return { kind: "match", book: sameFormat[0], by: "format" };
  }
  if (sameFormat.length > 1) return { kind: "ambiguous", candidates: sameFormat };
  return { kind: "none" };
}
