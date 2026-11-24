import type { FC } from "react";
import type { Content } from "@prismicio/client";
import type { SliceComponentProps } from "@prismicio/react";

export type PullQuoteProps = SliceComponentProps<Content.PullQuoteSlice>;

const PullQuote: FC<PullQuoteProps> = ({ slice }) => (
  <figure className="my-8 border-l-2 border-oxblood pl-6">
    <blockquote className="text-2xl leading-snug italic">{slice.primary.quote}</blockquote>
    {slice.primary.attribution && (
      <figcaption className="label mt-3">— {slice.primary.attribution}</figcaption>
    )}
  </figure>
);

export default PullQuote;
