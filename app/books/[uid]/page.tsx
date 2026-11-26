import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookCopy, BookCover } from "@/components/BookDetail";
import { SiteShell } from "@/components/SiteShell";
import { getLibraryBook, getLibraryBooks } from "@/lib/books";

type Props = PageProps<"/books/[uid]">;

export default async function BookPage({ params }: Props) {
  const { uid } = await params;
  const book = await getLibraryBook(uid);
  if (!book) notFound();

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
            <BookCover book={book} priority />
          </div>
          <BookCopy book={book} />
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
