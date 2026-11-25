"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { LibraryBook } from "@/lib/books";
import { groupIntoShelves } from "@/components/library/groupBooks";
import { WalkBook } from "@/components/library2d/WalkBook";

type Props = {
  books: LibraryBook[];
};

const MAX_PER_BAY = 22;
const PILE_COUNT = 5;

/**
 * Full-viewport side-scroller library walk (Chrome-dino spirit).
 * HTML/CSS only — no WebGL. Real <a> spines, keyboard + drag/touch.
 */
export function LibraryWalk({ books }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; x: number; left: number } | null>(null);
  const lastScrollRef = useRef(0);
  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preferReducedMotion, setPreferReducedMotion] = useState(false);
  const [facing, setFacing] = useState<"right" | "left">("right");
  const [isWalking, setIsWalking] = useState(false);
  const [progress, setProgress] = useState({ left: 0, width: 1 });

  const sections = useMemo(() => {
    const shelves = groupIntoShelves(books, "genre");
    if (shelves.length > 0) return shelves;
    return groupIntoShelves(books, "title");
  }, [books]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPreferReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      const x = el.scrollLeft;
      if (!preferReducedMotion) {
        el.style.setProperty("--walk-scroll", `${x}px`);
      }

      const delta = x - lastScrollRef.current;
      if (Math.abs(delta) > 1) {
        setFacing(delta > 0 ? "right" : "left");
        if (!preferReducedMotion) {
          setIsWalking(true);
          if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
          walkTimerRef.current = setTimeout(() => setIsWalking(false), 180);
        }
      }
      lastScrollRef.current = x;

      setProgress({
        left: x / Math.max(1, el.scrollWidth),
        width: el.clientWidth / Math.max(1, el.scrollWidth),
      });

      const mid = x + el.clientWidth / 2;
      let nearest: string | null = null;
      let best = Infinity;
      for (const node of el.querySelectorAll<HTMLElement>("[data-section-id]")) {
        const center = node.offsetLeft + node.offsetWidth / 2;
        const d = Math.abs(center - mid);
        if (d < best) {
          best = d;
          nearest = node.dataset.sectionId ?? null;
        }
      }
      setActiveId(nearest);
    };

    const onWheelNative = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      el.scrollLeft += event.deltaY;
      event.preventDefault();
    };

    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheelNative, { passive: false });
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheelNative);
      window.removeEventListener("resize", onScroll);
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
    };
  }, [preferReducedMotion, sections]);

  const scrollToSection = useCallback(
    (id: string) => {
      const el = scrollerRef.current;
      if (!el) return;
      const node = el.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(id)}"]`);
      if (!node) return;
      el.scrollTo({
        left: Math.max(0, node.offsetLeft - el.clientWidth * 0.12),
        behavior: preferReducedMotion ? "auto" : "smooth",
      });
    },
    [preferReducedMotion],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button")) return;
    dragRef.current = { id: event.pointerId, x: event.clientX, left: el.scrollLeft };
    el.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || drag.id !== event.pointerId || !el) return;
    el.scrollLeft = drag.left - (event.clientX - drag.x);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = scrollerRef.current;
      if (!el) return;
      const step = Math.round(el.clientWidth * 0.35);
      if (event.key === "ArrowRight") {
        event.preventDefault();
        el.scrollBy({ left: step, behavior: preferReducedMotion ? "auto" : "smooth" });
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        el.scrollBy({ left: -step, behavior: preferReducedMotion ? "auto" : "smooth" });
      } else if (event.key === "Home") {
        event.preventDefault();
        el.scrollTo({ left: 0, behavior: preferReducedMotion ? "auto" : "smooth" });
      } else if (event.key === "End") {
        event.preventDefault();
        el.scrollTo({
          left: el.scrollWidth,
          behavior: preferReducedMotion ? "auto" : "smooth",
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preferReducedMotion]);

  if (books.length === 0) {
    return (
      <p role="status" className="rounded-sm border border-brass/40 bg-paper-deep/40 px-4 py-6 text-ink-soft">
        No books on the shelves yet.
      </p>
    );
  }

  return (
    <section className="walk" aria-label="Pixel library side-scroller">
      <header className="walk-hud">
        <div className="walk-hud__brand">
          <p className="label">A personal library</p>
          <p className="walk-hud__title">
            Ezekiel <em>Ravidat</em>
          </p>
          <p className="walk-hud__hint">
            Drag, scroll, or ← →.{" "}
            <a className="ink-link" href="#catalogue">
              Skip to catalogue list
            </a>
          </p>
        </div>

        <nav className="walk-strip" aria-label="Library sections">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`walk-strip__btn${activeId === section.id ? " is-active" : ""}`}
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </header>

      <div
        ref={scrollerRef}
        className={`walk-scroller${preferReducedMotion ? " walk-scroller--calm" : ""}`}
        tabIndex={0}
        role="region"
        aria-label="Scrollable library room. Arrow keys move left and right."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="walk-scene">
          <div className="walk-layer walk-layer--wall" aria-hidden="true">
            <div className="walk-wall" />
            <div className="walk-window walk-window--a" />
            <div className="walk-window walk-window--b" />
            <div className="walk-window walk-window--c" />
            <div className="walk-window walk-window--d" />
            <div className="walk-shaft walk-shaft--a" />
            <div className="walk-shaft walk-shaft--b" />
            <div className="walk-shaft walk-shaft--c" />
            {!preferReducedMotion && <div className="walk-motes" />}
          </div>

          <div className="walk-layer walk-layer--shelves">
            <div className="walk-floor" aria-hidden="true" />
            <div className="walk-ground" aria-hidden="true" />
            {sections.map((section, index) => (
              <WalkSection
                key={section.id}
                id={section.id}
                label={section.label}
                books={section.books}
                index={index}
                isLast={index === sections.length - 1}
              />
            ))}
          </div>

          <div className="walk-layer walk-layer--fore" aria-hidden="true">
            <div className="walk-rug walk-rug--a" />
            <div className="walk-rug walk-rug--b" />
            <div className="walk-rug walk-rug--c" />
            <div className="walk-hearth">
              <div className="walk-hearth__glow" />
            </div>
            <div className="walk-sofa" />
            <div className="walk-bean walk-bean--a" />
            <div className="walk-bean walk-bean--b" />
            <div className="walk-lamp">
              <div className="walk-lamp__glow" />
            </div>
            <div className="walk-cat">
              <div className="walk-cat__body" />
            </div>
            <div className="walk-table" />
          </div>
        </div>
      </div>

      {/* Fixed on the ground line — world scrolls past, like the Chrome dino. */}
      <div
        className={`walk-avatar walk-avatar--${facing}${isWalking ? " is-walking" : ""}`}
        aria-hidden="true"
      >
        <span className="walk-avatar__body" />
        <span className="walk-avatar__leg walk-avatar__leg--l" />
        <span className="walk-avatar__leg walk-avatar__leg--r" />
      </div>

      <aside className="walk-minimap" aria-label="Library mini-map">
        <div className="walk-minimap__track" role="presentation">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`walk-minimap__bay${activeId === section.id ? " is-active" : ""}`}
              title={section.label}
              aria-label={`Jump to ${section.label}`}
              onClick={() => scrollToSection(section.id)}
            />
          ))}
          <div
            className="walk-minimap__you"
            style={{
              left: `${progress.left * 100}%`,
              width: `${Math.max(progress.width * 100, 8)}%`,
            }}
          />
        </div>
        <p className="walk-minimap__label label">
          {sections.find((s) => s.id === activeId)?.label ?? "Library"}
        </p>
      </aside>
    </section>
  );
}

function WalkSection({
  id,
  label,
  books,
  index,
  isLast,
}: {
  id: string;
  label: string;
  books: LibraryBook[];
  index: number;
  isLast: boolean;
}) {
  const shelfBooks = books.slice(0, MAX_PER_BAY);
  const pileBooks = books.slice(MAX_PER_BAY, MAX_PER_BAY + PILE_COUNT);
  const showNook = index % 3 === 1;

  return (
    <section
      className={`walk-section${showNook ? " walk-section--nook" : ""}`}
      data-section-id={id}
      aria-label={`${label}, ${books.length} books`}
    >
      <div className="walk-sign" aria-hidden="true">
        <span>{label} →</span>
      </div>
      <h3 className="walk-sr-only">{label}</h3>

      <div className="walk-case" aria-hidden="true">
        <div className="walk-case__board" />
        <div className="walk-case__board" />
        <div className="walk-case__board" />
      </div>

      <div className="walk-rail">
        {shelfBooks.map((book) => (
          <WalkBook key={book.uid} book={book} />
        ))}
      </div>

      {pileBooks.length > 0 && (
        <div className="walk-pile" aria-label={`${label} floor stack`}>
          {pileBooks.map((book) => (
            <WalkBook key={`pile-${book.uid}`} book={book} pose="pile" />
          ))}
        </div>
      )}

      {!isLast && (
        <div className="walk-sign walk-sign--end" aria-hidden="true">
          <span>← {label}</span>
        </div>
      )}
    </section>
  );
}
