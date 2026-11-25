import { isFilled, type ContentRelationshipField } from "@prismicio/client";

type RelatedData = { title?: string | null; subtitle?: string | null };

export function relatedData(field: ContentRelationshipField): RelatedData | undefined {
  if (!isFilled.contentRelationship(field)) return undefined;
  return (field as { data?: RelatedData }).data;
}
