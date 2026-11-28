import { isFilled, type RichTextField } from "@prismicio/client";
import { PrismicRichText, type JSXMapSerializer } from "@prismicio/react";

const PARAGRAPH_CLASS = "[&:not(:first-child)]:mt-[0.75em]";

/** Each Structured Text paragraph becomes its own <p> with spacing between paragraphs. */
const descriptionComponents: JSXMapSerializer = {
  paragraph: ({ children }) => <p className={PARAGRAPH_CLASS}>{children}</p>,
};

export function BookDescription({
  field,
  className,
}: {
  field: RichTextField | null;
  className?: string;
}) {
  if (!field || !isFilled.richText(field)) return null;

  return (
    <div className={className}>
      <PrismicRichText field={field} components={descriptionComponents} />
    </div>
  );
}
