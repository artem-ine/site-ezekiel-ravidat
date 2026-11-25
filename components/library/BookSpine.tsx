import Link from "next/link";
import type { LibraryBook } from "@/lib/books";
import {
  shortTitle,
  spineCloth,
  spineHeightRem,
  spineWidthRem,
  STATUS_LABEL,
  STATUS_MARK,
} from "@/lib/spine-style";

type Props = {
  book: LibraryBook;
};

export function BookSpine({ book }: Props) {
  const width = spineWidthRem(book.pageCount);
  const height = spineHeightRem(book);
  const cloth = spineCloth(book);
  const authors = book.authors.join(", ") || "Unknown author";
  const status = book.readStatus ? STATUS_LABEL[book.readStatus] : "Status unknown";
  const label = `${book.title}, by ${authors}. ${status}.`;

  return (
    <Link
      href={`/books/${book.uid}`}
      className="book-spine group"
      style={{
        width: `${width}rem`,
        height: `${height}rem`,
        backgroundColor: cloth,
      }}
      aria-label={label}
      title={`${book.title} — ${authors}`}
    >
      <span className="book-spine__edge" aria-hidden="true" />
      <span className="book-spine__title">{shortTitle(book.title)}</span>
      {book.readStatus && (
        <span className="book-spine__mark" aria-hidden="true">
          {STATUS_MARK[book.readStatus]}
        </span>
      )}
      {book.coverUrl && (
        // Decorative preview only; the link label carries the title.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="book-spine__cover"
          src={book.coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      )}
    </Link>
  );
}
