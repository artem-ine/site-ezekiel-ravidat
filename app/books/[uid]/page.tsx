import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/SiteShell";
import { getLibraryBook, getLibraryBooks } from "@/lib/books";
import { STATUS_LABEL } from "@/lib/spine-style";

type Props = PageProps<"/books/[uid]">;

export default async function BookPage({ params }: Props) {
  const { uid } = await params;
  const book = await getLibraryBook(uid);
  if (!book) notFound();

  const authors = book.authors.join(", ") || "Unknown author";

  return (
    <SiteShell>
    <article className="book-detail settle">
      <p className="label">
        <Link href="/" className="ink-link">
          Back to the walk
        </Link>
      </p>

      <div className="book-detail__layout mt-6">
        <div className="book-detail__cover">
          {book.coverUrl ? (
            <Image
              src={book.coverUrl}
              alt={book.coverAlt}
              width={320}
              height={480}
              className="book-detail__image"
              priority
            />
          ) : (
            <div className="book-detail__placeholder" aria-hidden="true">
              No cover
            </div>
          )}
        </div>

        <div className="book-detail__copy">
          <h1 className="text-4xl leading-tight sm:text-5xl">{book.title}</h1>
          {book.subtitle && <p className="mt-2 text-xl text-ink-soft italic">{book.subtitle}</p>}
          <p className="mt-4 text-xl">{authors}</p>

          <dl className="book-meta mt-8">
            {book.readStatus && (
              <div>
                <dt>Status</dt>
                <dd>{STATUS_LABEL[book.readStatus]}</dd>
              </div>
            )}
            {book.genres.length > 0 && (
              <div>
                <dt>Genre</dt>
                <dd>{book.genres.map((genre) => genre.name).join(", ")}</dd>
              </div>
            )}
            {book.series && (
              <div>
                <dt>Series</dt>
                <dd>
                  {book.series}
                  {book.seriesPosition != null ? ` · ${book.seriesPosition}` : ""}
                </dd>
              </div>
            )}
            {book.yearRead != null && (
              <div>
                <dt>Year read</dt>
                <dd>{book.yearRead}</dd>
              </div>
            )}
            {book.publishYear != null && (
              <div>
                <dt>Published</dt>
                <dd>{book.publishYear}</dd>
              </div>
            )}
            {book.pageCount != null && (
              <div>
                <dt>Pages</dt>
                <dd>{book.pageCount}</dd>
              </div>
            )}
            {book.format && (
              <div>
                <dt>Format</dt>
                <dd className="capitalize">{book.format}</dd>
              </div>
            )}
          </dl>

          {book.description && (
            <div className="book-detail__blurb mt-8">
              <h2 className="label mb-3">Description</h2>
              <p className="whitespace-pre-wrap text-ink-soft">{book.description}</p>
            </div>
          )}
        </div>
      </div>
    </article>
    </SiteShell>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uid } = await params;
  const book = await getLibraryBook(uid);
  if (!book) return { title: "Book" };

  return {
    title: `${book.title} — Ezekiel Ravidat`,
    description: book.description?.slice(0, 160) || `From the library: ${book.title}`,
    openGraph: book.coverUrl ? { images: [{ url: book.coverUrl }] } : undefined,
  };
}

export async function generateStaticParams() {
  const books = await getLibraryBooks();
  return books.slice(0, 50).map((book) => ({ uid: book.uid }));
}
