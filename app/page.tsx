import { Suspense } from "react";
import { Library } from "@/components/library/Library";
import { LibraryWalk } from "@/components/library2d/LibraryWalk";
import { getLibraryBooks } from "@/lib/books";

export default function Home() {
  return (
    <Suspense fallback={<p className="py-section text-ink-soft">Opening the library…</p>}>
      <HomeLibrary />
    </Suspense>
  );
}

async function HomeLibrary() {
  const books = await getLibraryBooks();

  return (
    <div className="space-y-8">
      <section className="library-intro max-w-2xl">
        <p className="label">The stacks</p>
        <h1 className="mt-2 text-3xl leading-tight sm:text-4xl">
          Walk the shelves. Pull a spine.
        </h1>
        <p className="mt-3 text-ink-soft">
          A side-on stroll through the room — drag or scroll across the bays, then open any volume.
          The full catalogue list stays below for filters and screen readers.
        </p>
      </section>

      <LibraryWalk books={books} />

      <section id="catalogue" className="walk-catalogue" aria-label="Full catalogue">
        <p className="label">Catalogue list</p>
        <h2 className="mt-2 text-2xl font-medium">Every volume, listed</h2>
        <p className="mt-2 mb-4 max-w-2xl text-ink-soft">
          Same books as the walk above — sort, filter, and open a spine from the classic shelf view.
        </p>
        <Library books={books} />
      </section>
    </div>
  );
}
