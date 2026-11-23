import { cacheLife } from "next/cache";
import { cacheTagPrismicPages } from "@prismicio/next";
import { createClient } from "@/prismicio";
import { sliceFetchLinks } from "@/lib/related";

export async function getPageByUID(uid: string, ref?: string) {
	"use cache";
	cacheLife("max");
	const client = createClient();
	const page = await client
		.getByUID("page", uid, { ref, fetchLinks: sliceFetchLinks })
		.catch(() => undefined);
	if (page) cacheTagPrismicPages([page]);
	return page;
}
