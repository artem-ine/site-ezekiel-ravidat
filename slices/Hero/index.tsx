import type { FC } from "react";
import type { Content } from "@prismicio/client";
import { PrismicNextImage, PrismicNextLink } from "@prismicio/next";
import type { SliceComponentProps } from "@prismicio/react";

export type HeroProps = SliceComponentProps<Content.HeroSlice>;

const Hero: FC<HeroProps> = ({ slice }) => {
	const { heading, subheading, image, link } = slice.primary;
	return (
		<section data-slice-type={slice.slice_type} data-slice-variation={slice.variation}>
			{heading && <h1>{heading}</h1>}
			{subheading && <p>{subheading}</p>}
			<PrismicNextImage field={image} />
			<PrismicNextLink field={link} />
		</section>
	);
};

export default Hero;
