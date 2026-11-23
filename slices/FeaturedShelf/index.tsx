import type { FC } from "react";
import type { Content } from "@prismicio/client";
import type { SliceComponentProps } from "@prismicio/react";
import { relatedData } from "@/lib/related";

export type FeaturedShelfProps = SliceComponentProps<Content.FeaturedShelfSlice>;

const FeaturedShelf: FC<FeaturedShelfProps> = ({ slice }) => {
	const { heading, shelf } = slice.primary;
	const title = relatedData(shelf)?.title;
	return (
		<section data-slice-type={slice.slice_type} data-slice-variation={slice.variation}>
			{heading && <h2>{heading}</h2>}
			{title && <p>{title}</p>}
		</section>
	);
};

export default FeaturedShelf;
