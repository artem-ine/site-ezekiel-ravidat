"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { LibraryBook } from "@/lib/books";
import { groupIntoShelves } from "@/components/library/groupBooks";
import { WalkBook } from "@/components/library2d/WalkBook";
import {
  decorKitForIndex,
  themeForLabel,
  type DecorKit,
  type SectionTheme,
} from "@/components/library2d/sectionTheme";

type Props = {
  books: LibraryBook[];
};

const MAX_PER_BAY = 20;
const PILE_COUNT = 5;

/**
 * Full-viewport side-scroller library. Minimal chrome, themed sections,
 * mini-map navigation. HTML/CSS only — real <a> spines.
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
  const [tint, setTint] = useState<SectionTheme | null>(null);

  const sections = useMemo(() => {
    const shelves = groupIntoShelves(books, "genre");
    if (shelves.length > 0) return shelves;
    return groupIntoShelves(books, "title");
  }, [books]);

  const themed = useMemo(
    () =>
      sections.map((section, index) => ({
        ...section,
        theme: themeForLabel(section.label),
        kit: decorKitForIndex(index),
      })),
    [sections],
  );

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
      let nearest: (typeof themed)[number] | null = null;
      let best = Infinity;
      for (const node of el.querySelectorAll<HTMLElement>("[data-section-id]")) {
        const center = node.offsetLeft + node.offsetWidth / 2;
        const d = Math.abs(center - mid);
        if (d < best) {
          best = d;
          nearest = themed.find((s) => s.id === node.dataset.sectionId) ?? null;
        }
      }
      setActiveId(nearest?.id ?? null);
      if (nearest) setTint(nearest.theme);
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
  }, [preferReducedMotion, themed]);

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
      <p role="status" className="walk-empty">
        No books on the shelves yet.
      </p>
    );
  }

  const activeTheme = tint ?? themed[0]?.theme;
  const walkStyle = {
    "--walk-sky": activeTheme?.sky,
    "--walk-wall": activeTheme?.wall,
    "--walk-wall-deep": activeTheme?.wallDeep,
    "--walk-floor": activeTheme?.floor,
    "--walk-floor-deep": activeTheme?.floorDeep,
    "--walk-accent": activeTheme?.accent,
    "--walk-light": activeTheme?.light,
  } as CSSProperties;

  return (
    <section
      className={`walk${preferReducedMotion ? " walk--calm" : ""}`}
      aria-label="Pixel library side-scroller"
      style={walkStyle}
      data-mood={activeTheme?.mood}
    >
      <a className="walk-skip" href="#walk-scene">
        Skip to the stacks
      </a>

      <div
        ref={scrollerRef}
        id="walk-scene"
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
          <div className="walk-layer walk-layer--parallax" aria-hidden="true">
            {/* Soft sky wash — colour transitions via CSS vars on .walk */}
            <div className="walk-skywash" />
          </div>

          <div className="walk-layer walk-layer--shelves">
            <div className="walk-floor-run" aria-hidden="true" />
            <div className="walk-ground" aria-hidden="true" />
            {themed.map((section, index) => (
              <WalkSection
                key={section.id}
                id={section.id}
                label={section.label}
                books={section.books}
                theme={section.theme}
                kit={section.kit}
                index={index}
                isLast={index === themed.length - 1}
                calm={preferReducedMotion}
              />
            ))}
          </div>
        </div>
      </div>

      <div
        className={`walk-avatar walk-avatar--${facing}${isWalking ? " is-walking" : ""}`}
        aria-hidden="true"
      >
        <span className="walk-avatar__body" />
        <span className="walk-avatar__leg walk-avatar__leg--l" />
        <span className="walk-avatar__leg walk-avatar__leg--r" />
      </div>

      <aside className="walk-minimap" aria-label="Library mini-map">
        <p className="walk-minimap__title label">
          Map ·{" "}
          <a className="ink-link" href="/cozy">
            Cozy 3D
          </a>
        </p>
        <div className="walk-minimap__track">
          {themed.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`walk-minimap__bay${activeId === section.id ? " is-active" : ""}`}
              style={
                {
                  "--bay-color": section.theme.wall,
                  "--bay-accent": section.theme.accent,
                } as CSSProperties
              }
              aria-label={`Jump to ${section.label}`}
              title={section.label}
              onClick={() => scrollToSection(section.id)}
            >
              <span className="walk-minimap__tip">{section.label}</span>
            </button>
          ))}
          <div
            className="walk-minimap__you"
            style={{
              left: `${progress.left * 100}%`,
              width: `${Math.max(progress.width * 100, 6)}%`,
            }}
            aria-hidden="true"
          />
        </div>
        <p className="walk-minimap__here label" aria-live="polite">
          {themed.find((s) => s.id === activeId)?.label ?? "Library"}
        </p>
      </aside>
    </section>
  );
}

function WalkSection({
  id,
  label,
  books,
  theme,
  kit,
  index,
  isLast,
  calm,
}: {
  id: string;
  label: string;
  books: LibraryBook[];
  theme: SectionTheme;
  kit: DecorKit;
  index: number;
  isLast: boolean;
  calm: boolean;
}) {
  const shelfBooks = books.slice(0, MAX_PER_BAY);
  const pileBooks = books.slice(MAX_PER_BAY, MAX_PER_BAY + PILE_COUNT);
  const style = {
    "--sec-sky": theme.sky,
    "--sec-wall": theme.wall,
    "--sec-wall-deep": theme.wallDeep,
    "--sec-floor": theme.floor,
    "--sec-floor-deep": theme.floorDeep,
    "--sec-accent": theme.accent,
    "--sec-light": theme.light,
  } as CSSProperties;

  return (
    <section
      className={`walk-section walk-section--${kit} walk-section--${theme.pattern}`}
      data-section-id={id}
      data-mood={theme.mood}
      aria-label={`${label}, ${books.length} books`}
      style={style}
    >
      <div className="walk-section__wall" aria-hidden="true">
        <div className="walk-section__paper" />
        <div className="walk-section__glow" />
        {!calm && <div className="walk-section__motes" />}
        <div className="walk-section__window" />
      </div>

      <div className="walk-sign" aria-hidden="true">
        <span>{label}</span>
      </div>
      <h3 className="walk-sr-only">{label}</h3>

      <SectionShelves kit={kit} />
      <SectionDecor kit={kit} index={index} />

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
          <span>→</span>
        </div>
      )}
    </section>
  );
}

function SectionShelves({ kit }: { kit: DecorKit }) {
  if (kit === "tall-hearth") {
    return (
      <div className="walk-case walk-case--tall" aria-hidden="true">
        <div className="walk-case__board" />
        <div className="walk-case__board" />
        <div className="walk-case__board" />
        <div className="walk-case__board" />
      </div>
    );
  }
  if (kit === "low-nook") {
    return (
      <>
        <div className="walk-case walk-case--low" aria-hidden="true">
          <div className="walk-case__board" />
          <div className="walk-case__board" />
        </div>
        <div className="walk-case walk-case--side" aria-hidden="true">
          <div className="walk-case__board" />
          <div className="walk-case__board" />
          <div className="walk-case__board" />
        </div>
      </>
    );
  }
  if (kit === "mezzanine") {
    return (
      <>
        <div className="walk-mezzanine" aria-hidden="true">
          <div className="walk-mezzanine__rail" />
          <div className="walk-case walk-case--balcony">
            <div className="walk-case__board" />
            <div className="walk-case__board" />
          </div>
        </div>
        <div className="walk-case walk-case--mid" aria-hidden="true">
          <div className="walk-case__board" />
          <div className="walk-case__board" />
          <div className="walk-case__board" />
        </div>
      </>
    );
  }
  if (kit === "ladder-desk") {
    return (
      <>
        <div className="walk-case walk-case--tall" aria-hidden="true">
          <div className="walk-case__board" />
          <div className="walk-case__board" />
          <div className="walk-case__board" />
          <div className="walk-case__board" />
        </div>
        <div className="walk-ladder" aria-hidden="true" />
      </>
    );
  }
  if (kit === "plants-globe") {
    return (
      <div className="walk-case walk-case--mid" aria-hidden="true">
        <div className="walk-case__board" />
        <div className="walk-case__board" />
        <div className="walk-case__board" />
      </div>
    );
  }
  return (
    <>
      <div className="walk-mezzanine walk-mezzanine--clock" aria-hidden="true">
        <div className="walk-mezzanine__rail" />
        <div className="walk-case walk-case--balcony">
          <div className="walk-case__board" />
        </div>
      </div>
      <div className="walk-case walk-case--low" aria-hidden="true">
        <div className="walk-case__board" />
        <div className="walk-case__board" />
      </div>
      <div className="walk-stool" aria-hidden="true" />
    </>
  );
}

function SectionDecor({ kit, index }: { kit: DecorKit; index: number }) {
  return (
    <div className="walk-decor" aria-hidden="true">
      {(kit === "tall-hearth" || kit === "low-nook") && (
        <div className="walk-hearth">
          <div className="walk-hearth__glow" />
        </div>
      )}
      {(kit === "low-nook" || kit === "plants-globe") && <div className="walk-sofa" />}
      {(kit === "tall-hearth" || kit === "balcony-clock") && (
        <>
          <div className="walk-chair" />
          <div className="walk-chair walk-chair--b" />
        </>
      )}
      {(kit === "ladder-desk" || kit === "mezzanine") && (
        <>
          <div className="walk-desk" />
          <div className="walk-lamp">
            <div className="walk-lamp__glow" />
          </div>
        </>
      )}
      {(kit === "plants-globe" || kit === "balcony-clock") && (
        <>
          <div className="walk-plant" />
          <div className="walk-plant walk-plant--b" />
          <div className="walk-globe" />
        </>
      )}
      {kit === "balcony-clock" && <div className="walk-clock" />}
      {(kit === "low-nook" || kit === "ladder-desk") && (
        <>
          <div className="walk-bean" />
          <div className="walk-bean walk-bean--b" />
        </>
      )}
      <div className={`walk-rug walk-rug--${(index % 3) + 1}`} />
      {(kit === "tall-hearth" || kit === "plants-globe" || index % 2 === 0) && (
        <div className="walk-cat">
          <div className="walk-cat__body" />
        </div>
      )}
    </div>
  );
}
