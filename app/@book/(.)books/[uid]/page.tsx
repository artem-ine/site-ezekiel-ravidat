import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BookCopy, BookCover } from "@/components/BookDetail";
import { BookPopup } from "@/components/library2d/BookPopup";
import { getLibraryBook } from "@/lib/books";
import { spineCloth } from "@/lib/spine-style";

type Props = { params: Promise<{ uid: string }> };

/**
 * Soft navigations from the walk land here: the book opens over the shelf and
 * the shelf stays mounted underneath. A hard load of /books/[uid] still gets the full page.
 */
export default function InterceptedBookPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <PopupContent params={params} />
    </Suspense>
  );
}

async function PopupContent({ params }: Props) {
  const { uid } = await params;
  const book = await getLibraryBook(uid);
  if (!book) notFound();

  const titleId = `book-popup-title-${book.uid}`;

  return (
    <BookPopup
      titleId={titleId}
      cloth={spineCloth(book)}
      title={book.title}
      author={book.authors.join(", ")}
      cover={<BookCover book={book} priority />}
    >
      <BookCopy book={book} titleId={titleId} />
    </BookPopup>
  );
}
