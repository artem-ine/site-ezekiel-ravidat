import { asText, isFilled, type Content } from "@prismicio/client";
import { cacheLife } from "next/cache";
import { createClient } from "@/prismicio";

export type ReadStatus =
  | "read"
  | "not-read"
  | "currently-reading"
  | "did-not-finish";

export type LibraryBook = {
  uid: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  genres: { name: string; accent: string | null }[];
  series: string | null;
  seriesPosition: number | null;
  coverUrl: string | null;
  coverAlt: string;
  pageCount: number | null;
  publishYear: number | null;
  yearRead: number | null;
  readStatus: ReadStatus | null;
  description: string | null;
  format: string | null;
};

const FETCH_LINKS = [
  "author.name",
  "author.sort_name",
  "genre.name",
  "genre.accent",
  "series.name",
] as const;

const READ_STATUSES = new Set<string>([
  "read",
  "not-read",
  "currently-reading",
  "did-not-finish",
]);

/**
 * Optional release label for local browsing of unpublished Migration Release drafts.
 * Only used in development. Never commit a token or a production secret here.
 */
async function resolveDevRef(): Promise<string | undefined> {
  const label = process.env.PRISMIC_RELEASE_LABEL?.trim();
  if (!label || process.env.NODE_ENV === "production") return undefined;

  try {
    return (await createClient().getReleaseByLabel(label)).ref;
  } catch {
    return undefined;
  }
}

function relatedName(
  field: Content.BookDocumentData["series"] | Content.BookDocumentDataAuthorsItem["author"],
): string | null {
  if (!isFilled.contentRelationship(field) || field.isBroken) return null;
  const data = field.data as { name?: string | null } | undefined;
  return data?.name?.trim() || field.uid || null;
}

function mapBook(doc: Content.BookDocument): LibraryBook | null {
  if (!doc.uid) return null;

  const title = doc.data.title?.trim();
  if (!title) return null;

  const authors = doc.data.authors
    .map((item) => relatedName(item.author))
    .filter((name): name is string => Boolean(name));

  const genres = doc.data.genres.flatMap((item) => {
    if (!isFilled.contentRelationship(item.genre) || item.genre.isBroken) return [];
    const data = item.genre.data as { name?: string | null; accent?: string | null } | undefined;
    const name = data?.name?.trim();
    if (!name) return [];
    return [{ name, accent: data?.accent?.trim() || null }];
  });

  const statusRaw = doc.data.read_status;
  const readStatus =
    statusRaw && READ_STATUSES.has(statusRaw) ? (statusRaw as ReadStatus) : null;

  const description = asText(doc.data.blurb)?.trim() || null;
  const coverUrl = isFilled.image(doc.data.cover) ? doc.data.cover.url : null;

  return {
    uid: doc.uid,
    title,
    subtitle: doc.data.subtitle?.trim() || null,
    authors,
    genres,
    series: relatedName(doc.data.series),
    seriesPosition: doc.data.series_position ?? null,
    coverUrl,
    coverAlt: isFilled.image(doc.data.cover)
      ? doc.data.cover.alt?.trim() || `Cover of ${title}`
      : `No cover for ${title}`,
    pageCount: doc.data.page_count ?? null,
    publishYear: doc.data.publish_year ?? null,
    yearRead: doc.data.year_read ?? null,
    readStatus,
    description,
    format: doc.data.format || null,
  };
}

export async function getLibraryBooks(): Promise<LibraryBook[]> {
  "use cache";
  cacheLife("hours");

  const ref = await resolveDevRef();
  const docs = await createClient().getAllByType("book", {
    pageSize: 100,
    fetchLinks: [...FETCH_LINKS],
    ...(ref ? { ref } : {}),
  });

  return docs
    .map(mapBook)
    .filter((book): book is LibraryBook => book !== null)
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

export async function getLibraryBook(uid: string): Promise<LibraryBook | undefined> {
  "use cache";
  cacheLife("hours");

  const ref = await resolveDevRef();

  try {
    const doc = await createClient().getByUID("book", uid, {
      fetchLinks: [...FETCH_LINKS],
      ...(ref ? { ref } : {}),
    });
    return mapBook(doc) ?? undefined;
  } catch {
    return undefined;
  }
}
