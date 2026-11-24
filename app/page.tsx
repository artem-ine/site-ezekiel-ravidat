import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { getPreviewRef } from "@prismicio/next";
import { PageContent } from "@/components/PageContent";
import { getPageByUID } from "@/lib/page";
import { createClient, repositoryName } from "@/prismicio";

export default function Home() {
  return (
    <Suspense fallback={<p className="py-section text-ink-soft">Loading…</p>}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const page = await getPageByUID("home", await getPreviewRef());
  if (page) return <PageContent slices={page.data.slices} />;

  return (
    <section className="space-y-4 py-section">
      <p className="label">Catalogue</p>
      <h1 className="text-3xl">Nothing on the shelf yet</h1>
      <p>
        No <code>page</code> document with the UID <code>home</code> is published yet. This is the
        Prismic connection check for the repository <code>{repositoryName}</code>.
      </p>
      <Suspense fallback={<p className="text-ink-soft">Connecting to Prismic…</p>}>
        <PrismicStatus />
      </Suspense>
    </section>
  );
}

async function PrismicStatus() {
  "use cache";
  cacheLife("minutes");

  const result = await createClient()
    .getRepository()
    .then((repository) => ({ repository, error: undefined }))
    .catch((error: unknown) => ({
      repository: undefined,
      error: error instanceof Error ? error.message : String(error),
    }));

  if (!result.repository) {
    return (
      <p role="alert" className="text-oxblood">
        Could not reach Prismic. {result.error}
      </p>
    );
  }

  const types = Object.values(result.repository.types);
  return (
    <p className="text-ink-soft">
      Connected. Master locale: <code>{result.repository.languages[0]?.id ?? "unknown"}</code>.
      Custom types: {types.length > 0 ? types.join(", ") : "none yet (push the models)"}.
    </p>
  );
}
