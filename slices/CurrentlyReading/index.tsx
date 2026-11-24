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
    <section className="space-y-3 border-t border-brass/50 py-8">
      <p className="label">Currently reading</p>
      {slice.primary.heading && <h2 className="text-3xl">{slice.primary.heading}</h2>}
      <ol className="divide-y divide-brass/40 border-y border-brass/40">
        {titles.map((title, index) => (
          <li key={`${title}-${index}`} className="flex gap-4 py-2">
            <span className="label pt-1">{String(index + 1).padStart(2, "0")}</span>
            <span>{title}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default CurrentlyReading;
