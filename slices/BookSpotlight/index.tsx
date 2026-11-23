import type { FC } from "react";
import type { Content } from "@prismicio/client";
import { PrismicRichText, type SliceComponentProps } from "@prismicio/react";
import { relatedData } from "@/lib/related";

export type BookSpotlightProps = SliceComponentProps<Content.BookSpotlightSlice>;

const BookSpotlight: FC<BookSpotlightProps> = ({ slice }) => {
	const book = relatedData(slice.primary.book);
	return (
		<section data-slice-type={slice.slice_type} data-slice-variation={slice.variation}>
			{book?.title && <h2>{book.title}</h2>}
			{book?.subtitle && <p>{book.subtitle}</p>}
			<PrismicRichText field={slice.primary.note} />
		</section>
	);
};

export default BookSpotlight;
