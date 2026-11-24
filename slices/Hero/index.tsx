import type { FC } from "react";
import { isFilled, type Content } from "@prismicio/client";
import { PrismicNextImage, PrismicNextLink } from "@prismicio/next";
import type { SliceComponentProps } from "@prismicio/react";

export type HeroProps = SliceComponentProps<Content.HeroSlice>;

export function isHeroEmpty({ heading, subheading, image, link }: Content.HeroSliceDefaultPrimary) {
  return !heading && !subheading && !isFilled.image(image) && !isFilled.link(link);
}

const Hero: FC<HeroProps> = ({ slice }) => {
  if (isHeroEmpty(slice.primary)) return null;

  const { heading, subheading, image, link } = slice.primary;
  return (
    <section className="space-y-6 py-section">
      {heading && <h1 className="text-4xl leading-tight sm:text-5xl">{heading}</h1>}
      {subheading && <p className="text-xl text-ink-soft italic">{subheading}</p>}
      <PrismicNextImage field={image} className="border border-brass bg-paper-deep p-1.5" />
      {isFilled.link(link) && (
        <p className="label">
          <PrismicNextLink field={link} className="ink-link" /> →
        </p>
      )}
    </section>
  );
};

export default Hero;
