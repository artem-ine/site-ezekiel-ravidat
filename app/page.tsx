import { Suspense } from "react";
import { Library } from "@/components/library/Library";
import { LibraryWalk } from "@/components/library2d/LibraryWalk";
import { SiteShell } from "@/components/SiteShell";
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

  return (
    <>
      <LibraryWalk books={books} />

      <SiteShell>
        <section id="catalogue" className="walk-catalogue" aria-label="Full catalogue">
          <p className="label">Catalogue list</p>
          <h2 className="mt-2 text-2xl font-medium">Every volume, listed</h2>
          <p className="mt-2 mb-4 max-w-2xl text-ink-soft">
            Same books as the walk above — sort, filter, and open a spine from the classic shelf
            view. Kept here for accessibility and when scripts are off.
          </p>
          <Library books={books} />
        </section>
      </SiteShell>
    </>
  );
}
