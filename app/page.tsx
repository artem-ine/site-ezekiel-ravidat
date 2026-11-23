import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { SliceZone } from "@prismicio/react";
import { getPreviewRef } from "@prismicio/next";
import { createClient, repositoryName } from "@/prismicio";
import { getPageByUID } from "@/lib/page";
import { components } from "@/slices";

export default function Home() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const page = await getPageByUID("home", await getPreviewRef());
  if (page) return <SliceZone slices={page.data.slices} components={components} />;

  return (
    <main style={{ maxWidth: 40 * 16, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Ezekiel Ravidat — Library</h1>
      <p>
        No <code>page</code> document with the UID <code>home</code> is published
        yet. This is the Prismic connection check for the repository{" "}
        <code>{repositoryName}</code>.
      </p>
      <Suspense fallback={<p>Connecting to Prismic…</p>}>
        <PrismicStatus />
      </Suspense>
    </main>
  );
}

async function PrismicStatus() {
  "use cache";
  cacheLife("minutes");

  const result = await createClient()
    .getRepository()
    .then((repository) => ({ ok: true as const, repository }))
    .catch((error: unknown) => ({
      ok: false as const,
      message: error instanceof Error ? error.message : String(error),
    }));

  if (!result.ok) {
    return (
      <p role="alert">
        <strong>Could not reach Prismic.</strong> {result.message}
      </p>
    );
  }

  const { repository } = result;
  const types = Object.values(repository.types);
  return (
    <section>
      <p>
        <strong>Connected.</strong> Master locale:{" "}
        <code>{repository.languages[0]?.id ?? "unknown"}</code>.
      </p>
      <p>
        Custom types in the repository:{" "}
        {types.length > 0 ? types.join(", ") : "none yet (push the models)"}.
      </p>
    </section>
  );
}
