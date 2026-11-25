import { Suspense } from "react";
import { LibraryWalk } from "@/components/library2d/LibraryWalk";
import { getLibraryBooks } from "@/lib/books";

export default function Home() {
  return (
    <Suspense fallback={<p className="walk-loading">Opening the library…</p>}>
      <HomeLibrary />
    </Suspense>
  );
}

async function HomeLibrary() {
  const books = await getLibraryBooks();
  return <LibraryWalk books={books} />;
}
