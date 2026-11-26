import Link from "next/link";
import type { CSSProperties } from "react";
import { WalkBook } from "@/components/library2d/WalkBook";
import type { ShelfItem, StackPiece } from "@/components/library2d/floorLayout";
import {
  shortTitle,
  spineCloth,
  STATUS_LABEL,
} from "@/lib/spine-style";

type Props = {
  item: ShelfItem;
  /** The last item in a row carries no trailing gap, so the case hugs the books. */
  last: boolean;
};

/** One thing on a shelf: standing spine, cover-out book, or a flat pile. */
export function ShelfItemView({ item, last }: Props) {
  const spacing: CSSProperties = { marginRight: last ? 0 : `${item.gapRem}rem` };

  if (item.kind === "stand") {
    return <WalkBook book={item.book} style={spacing} />;
  }

  if (item.kind === "face") {
    return (
      <WalkBook
        book={item.book}
        pose="face"
        size={{ width: item.widthRem, height: item.heightRem }}
        style={spacing}
      />
    );
  }

  return (
    <div
      className="walk-stack"
      style={{ width: `${item.widthRem}rem`, ...spacing }}
      role="group"
      aria-label={`${item.pieces[0]!.book.series ?? "Series"} stack, ${item.pieces.length} books`}
    >
      {item.pieces.map((piece) => (
        <LyingBook key={piece.book.uid} piece={piece} />
      ))}
    </div>
  );
}

/** A book lying flat with its spine to the front. */
function LyingBook({ piece }: { piece: StackPiece }) {
  const { book } = piece;
  const authors = book.authors.join(", ") || "Unknown author";
  const status = book.readStatus ? STATUS_LABEL[book.readStatus] : "Status unknown";

  return (
    <Link
      href={`/books/${book.uid}`}
      className={`walk-lie${book.coverUrl ? " walk-lie--cover" : ""}`}
      style={{
        width: `${piece.lengthRem}rem`,
        height: `${piece.thicknessRem}rem`,
        marginLeft: `${piece.offsetRem}rem`,
        backgroundColor: spineCloth(book),
      }}
      aria-label={`${book.title}, by ${authors}. ${status}.`}
      title={`${book.title} — ${authors}`}
    >
      {book.coverUrl && (
        // Decorative; the link's aria-label carries the title.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="walk-lie__cover"
          src={book.coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      )}
      <span className="walk-lie__title">{shortTitle(book.title, 24)}</span>
      <span className="walk-lie__pages" aria-hidden="true" />
    </Link>
  );
}
