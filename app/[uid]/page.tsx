import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPreviewRef } from "@prismicio/next";
import { PageContent } from "@/components/PageContent";
import { SiteShell } from "@/components/SiteShell";
import { getPageByUID } from "@/lib/page";
import { createClient } from "@/prismicio";

export default async function Page({ params }: PageProps<"/[uid]">) {
  const { uid } = await params;
  const page = await getPageByUID(uid, await getPreviewRef());
  if (!page) notFound();

  return (
    <SiteShell>
      <PageContent slices={page.data.slices} />
    </SiteShell>
  );
}

export async function generateMetadata({ params }: PageProps<"/[uid]">): Promise<Metadata> {
  const { uid } = await params;
  const page = await getPageByUID(uid, await getPreviewRef());
  if (!page) return {};

  const { title, meta_title, meta_description, meta_image } = page.data;
  return {
    title: meta_title || title,
    description: meta_description,
    openGraph: meta_image.url ? { images: [{ url: meta_image.url }] } : undefined,
  };
}

// Next.js needs at least one static param, so fall back to "home" until a page exists.
export async function generateStaticParams() {
  const pages = await createClient().getAllByType("page");
  const uids = pages.flatMap((page) => (page.uid ? [{ uid: page.uid }] : []));
  return uids.length > 0 ? uids : [{ uid: "home" }];
}
