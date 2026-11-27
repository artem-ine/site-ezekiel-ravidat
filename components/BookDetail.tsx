import Image from "next/image";
import type { LibraryBook } from "@/lib/books";
import { BookDescription } from "@/components/BookDescription";
import { STATUS_LABEL } from "@/lib/spine-style";

export function BookCover({ book, priority = false }: { book: LibraryBook; priority?: boolean }) {
  if (book.coverUrl) {
    return (
      <Image
        src={book.coverUrl}
        alt={book.coverAlt}
        width={320}
        height={480}
        className="book-detail__image"
        priority={priority}
      />
    );
  }
  return (
    <div className="book-detail__placeholder" aria-hidden="true">
      No cover
    </div>
  );
}

/** Title, byline, metadata and blurb — shared by the full page and the popup. */
export function BookCopy({ book, titleId }: { book: LibraryBook; titleId?: string }) {
  const authors = book.authors.join(", ") || "Unknown author";

  return (
    <div className="book-detail__copy">
      <h1 id={titleId} className="text-4xl leading-tight sm:text-5xl">
        {book.title}
      </h1>
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

      {book.descriptionRichText && (
        <div className="book-detail__blurb mt-8">
          <h2 className="label mb-3">Description</h2>
          <BookDescription field={book.descriptionRichText} className="text-ink-soft" />
        </div>
      )}
    </div>
  );
}
