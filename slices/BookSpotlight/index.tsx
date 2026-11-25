import type { FC } from "react";
import type { Content } from "@prismicio/client";
import { PrismicRichText, type SliceComponentProps } from "@prismicio/react";
import { relatedData } from "@/lib/related";

export type BookSpotlightProps = SliceComponentProps<Content.BookSpotlightSlice>;

const BookSpotlight: FC<BookSpotlightProps> = ({ slice }) => {
  const book = relatedData(slice.primary.book);

  return (
    <section className="space-y-2 border-t border-brass/50 py-8">
      <p className="label">Book spotlight</p>
      {book?.title && <h2 className="text-3xl">{book.title}</h2>}
      {book?.subtitle && <p className="text-ink-soft italic">{book.subtitle}</p>}
      <PrismicRichText field={slice.primary.note} />
    </section>
  );
};

export default BookSpotlight;
