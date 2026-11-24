import { Suspense } from "react";
import { Library } from "@/components/library/Library";
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
          A quiet nook of owned books — filter by how they were read, regroup the bays, and open a
          volume when something catches the light.
        </p>
      </section>

      <Library books={books} />
    </div>
  );
}
