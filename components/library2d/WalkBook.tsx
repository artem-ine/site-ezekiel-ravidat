import type { CSSProperties } from "react";
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
  /** Floor / table books sit flatter and a touch shorter; "face" shows the cover out. */
  pose?: "shelf" | "pile" | "face";
  /** Explicit size in rem — used by cover-out books, which aren't spine-shaped. */
  size?: { width: number; height: number };
  /** Spacing from the shelf layout (margin-right). */
  style?: CSSProperties;
};

/** Accessible spine hotspot — real link, hover outline + lift. */
export function WalkBook({ book, pose = "shelf", size, style }: Props) {
  const width = size?.width ?? spineWidthRem(book.pageCount) * (pose === "pile" ? 0.85 : 1);
  const height = size?.height ?? spineHeightRem(book) * (pose === "pile" ? 0.72 : 1);
  const cloth = spineCloth(book);
  const authors = book.authors.join(", ") || "Unknown author";
  const status = book.readStatus ? STATUS_LABEL[book.readStatus] : "Status unknown";
  const label = `${book.title}, by ${authors}. ${status}.`;

  return (
    <Link
      href={`/books/${book.uid}`}
      className={`walk-book${pose === "pile" ? " walk-book--pile" : ""}${pose === "face" ? " walk-book--face" : ""}${book.coverUrl ? " walk-book--cover" : ""}`}
      style={{
        width: `${width}rem`,
        height: `${height}rem`,
        backgroundColor: cloth,
        ...style,
      }}
      aria-label={label}
      title={`${book.title} — ${authors}`}
    >
      <span className="walk-book__outline" aria-hidden="true" />
      <span className="walk-book__edge" aria-hidden="true" />
      <span className="walk-book__title">{shortTitle(book.title, pose === "pile" ? 18 : 26)}</span>
      {book.readStatus && (
        <span className="walk-book__mark" aria-hidden="true">
          {STATUS_MARK[book.readStatus]}
        </span>
      )}
      {book.coverUrl && (
        // Decorative; link aria-label carries the title.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="walk-book__cover"
          src={book.coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      )}
    </Link>
  );
}
