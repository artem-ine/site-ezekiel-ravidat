import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SliceZone } from "@prismicio/react";
import { getPreviewRef } from "@prismicio/next";
import { createClient } from "@/prismicio";
import { getPageByUID } from "@/lib/page";
import { components } from "@/slices";

export default async function Page({ params }: PageProps<"/[uid]">) {
	const { uid } = await params;
	const page = await getPageByUID(uid, await getPreviewRef());
	if (!page) notFound();

	return <SliceZone slices={page.data.slices} components={components} />;
}

export async function generateMetadata({ params }: PageProps<"/[uid]">): Promise<Metadata> {
	const { uid } = await params;
	const page = await getPageByUID(uid, await getPreviewRef());
	if (!page) return {};

	return {
		title: page.data.meta_title || page.data.title,
		description: page.data.meta_description,
		openGraph: page.data.meta_image.url ? { images: [{ url: page.data.meta_image.url }] } : undefined,
	};
}

export async function generateStaticParams() {
	const pages = await createClient().getAllByType("page");
	const params = pages.filter((page) => page.uid).map((page) => ({ uid: page.uid }));
	return params.length > 0 ? params : [{ uid: "home" }];
}
