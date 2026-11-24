import { cacheLife } from "next/cache";
import { NotFoundError } from "@prismicio/client";
import { cacheTagPrismicPages } from "@prismicio/next";
import { createClient } from "@/prismicio";

const fetchLinks = ["book.title", "book.subtitle", "shelf.title"];

export async function getPageByUID(uid: string, ref?: string) {
  "use cache";
  cacheLife("hours");

  try {
    const page = await createClient().getByUID("page", uid, { ref, fetchLinks });
    cacheTagPrismicPages([page]);
    return page;
  } catch (error) {
    if (error instanceof NotFoundError) return undefined;
    throw error;
  }
}
