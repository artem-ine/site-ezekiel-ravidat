import Link from "next/link";
import type { ReactNode } from "react";

/** Quiet page chrome for book detail and other document pages — not used by the room. */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-library flex-col px-gutter">
      <header className="pt-10 pb-6 sm:pt-14 sm:pb-8">
        <p className="label">A personal library</p>
        <Link
          href="/"
          className="mt-2 block text-5xl leading-none font-medium tracking-tight sm:text-6xl md:text-7xl"
        >
          Ezekiel <span className="text-oxblood italic">Ravidat</span>
        </Link>
        <div className="draw-rule mt-8 border-y border-brass py-0.5">
          <div className="border-t border-brass" />
        </div>
      </header>
      <main className="settle flex-1 pb-section">{children}</main>
      <footer className="label border-t border-brass/50 py-6">
        Set in EB Garamond &amp; Courier Prime
      </footer>
    </div>
  );
}
