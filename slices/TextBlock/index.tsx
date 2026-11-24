import type { FC } from "react";
import type { Content } from "@prismicio/client";
import { PrismicNextLink } from "@prismicio/next";
import { PrismicRichText, type JSXMapSerializer, type SliceComponentProps } from "@prismicio/react";

export type TextBlockProps = SliceComponentProps<Content.TextBlockSlice>;

const richTextComponents: JSXMapSerializer = {
  heading2: ({ children }) => <h2 className="mt-8 mb-3 text-3xl">{children}</h2>,
  heading3: ({ children }) => <h3 className="mt-6 mb-2 text-2xl italic">{children}</h3>,
  paragraph: ({ children }) => <p className="mb-4">{children}</p>,
  hyperlink: ({ node, children }) => (
    <PrismicNextLink field={node.data} className="ink-link">
      {children}
    </PrismicNextLink>
  ),
};

const TextBlock: FC<TextBlockProps> = ({ slice }) => (
  <section className="py-8">
    <PrismicRichText field={slice.primary.text} components={richTextComponents} />
  </section>
);

export default TextBlock;
