import type { FC } from "react";
import type { Content } from "@prismicio/client";
import type { SliceComponentProps } from "@prismicio/react";
import { relatedData } from "@/lib/related";

export type CurrentlyReadingProps = SliceComponentProps<Content.CurrentlyReadingSlice>;

const MAX_BOOKS = 6;

const CurrentlyReading: FC<CurrentlyReadingProps> = ({ slice }) => {
	const titles = slice.primary.books
		.slice(0, MAX_BOOKS)
		.map((item) => relatedData(item.book)?.title)
		.filter((title): title is string => Boolean(title));
	return (
		<section data-slice-type={slice.slice_type} data-slice-variation={slice.variation}>
			{slice.primary.heading && <h2>{slice.primary.heading}</h2>}
			<ul>
				{titles.map((title, index) => (
					<li key={`${title}-${index}`}>{title}</li>
				))}
			</ul>
		</section>
	);
};

export default CurrentlyReading;
