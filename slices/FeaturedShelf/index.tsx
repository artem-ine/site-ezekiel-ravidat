import type { FC } from "react";
import type { Content } from "@prismicio/client";
import type { SliceComponentProps } from "@prismicio/react";
import { relatedData } from "@/lib/related";

export type FeaturedShelfProps = SliceComponentProps<Content.FeaturedShelfSlice>;

const FeaturedShelf: FC<FeaturedShelfProps> = ({ slice }) => {
  const { heading, shelf } = slice.primary;
  const title = relatedData(shelf)?.title;

  return (
    <section className="space-y-2 border-t border-brass/50 py-8">
      <p className="label">Featured shelf</p>
      {heading && <h2 className="text-3xl">{heading}</h2>}
      {title && <p className="text-ink-soft italic">{title}</p>}
    </section>
  );
};

export default FeaturedShelf;
