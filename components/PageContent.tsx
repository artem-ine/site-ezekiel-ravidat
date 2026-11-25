import { SliceZone } from "@prismicio/react";
import type { Content } from "@prismicio/client";
import { components } from "@/slices";
import { isHeroEmpty } from "@/slices/Hero";

export function PageContent({ slices }: { slices: Content.PageDocumentData["slices"] }) {
  const hasContent = slices.some((slice) => slice.slice_type !== "hero" || !isHeroEmpty(slice.primary));

  if (!hasContent) {
    return <p className="py-section text-ink-soft italic">This page has no content yet.</p>;
  }

  return <SliceZone slices={slices} components={components} />;
}
