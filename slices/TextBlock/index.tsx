import type { FC } from "react";
import type { Content } from "@prismicio/client";
import { PrismicRichText, type SliceComponentProps } from "@prismicio/react";

export type TextBlockProps = SliceComponentProps<Content.TextBlockSlice>;

const TextBlock: FC<TextBlockProps> = ({ slice }) => (
	<section data-slice-type={slice.slice_type} data-slice-variation={slice.variation}>
		<PrismicRichText field={slice.primary.text} />
	</section>
);

export default TextBlock;
