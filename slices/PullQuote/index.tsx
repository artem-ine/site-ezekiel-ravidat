import type { FC } from "react";
import type { Content } from "@prismicio/client";
import type { SliceComponentProps } from "@prismicio/react";

export type PullQuoteProps = SliceComponentProps<Content.PullQuoteSlice>;

const PullQuote: FC<PullQuoteProps> = ({ slice }) => (
	<figure data-slice-type={slice.slice_type} data-slice-variation={slice.variation}>
		<blockquote>{slice.primary.quote}</blockquote>
		{slice.primary.attribution && <figcaption>{slice.primary.attribution}</figcaption>}
	</figure>
);

export default PullQuote;
