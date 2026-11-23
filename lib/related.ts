import { isFilled, type ContentRelationshipField } from "@prismicio/client";

export const sliceFetchLinks = [
	"book.title",
	"book.subtitle",
	"book.cover",
	"shelf.title",
	"shelf.description",
];

type RelatedData = {
	title?: string | null;
	subtitle?: string | null;
	cover?: { url?: string | null; alt?: string | null } | null;
};

export function relatedData(field: ContentRelationshipField): RelatedData | undefined {
	if (!isFilled.contentRelationship(field)) return undefined;
	return (field as { data?: RelatedData }).data;
}
