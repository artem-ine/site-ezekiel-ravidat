import type { Metadata } from "next";
import { Courier_Prime, EB_Garamond, Pixelify_Sans } from "next/font/google";
import { PrismicPreview } from "@prismicio/next";
import { repositoryName } from "@/prismicio";
import "./globals.css";

const garamond = EB_Garamond({ subsets: ["latin"], variable: "--font-garamond" });
const courier = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-courier" });
const pixel = Pixelify_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-pixelify" });

export const metadata: Metadata = {
  title: "Ezekiel Ravidat — Library",
  description: "A personal library.",
};

export default function RootLayout({ children, book }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${garamond.variable} ${courier.variable} ${pixel.variable}`}>
      <body className="bg-paper font-serif text-ink antialiased">
        {children}
        {book}
        <PrismicPreview repositoryName={repositoryName} />
      </body>
    </html>
  );
}
