"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { LibraryBook } from "@/lib/books";
import { WalkBook } from "@/components/library2d/WalkBook";
import {
  baysOnFloor,
  buildFloorPlan,
  duplexColumns,
  type FloorLevel,
  type WalkBay,
} from "@/components/library2d/floorLayout";
import type { DecorKit, SectionTheme } from "@/components/library2d/sectionTheme";

type Props = {
  books: LibraryBook[];
};

/** Comfortable arrow / A-D pace (px per tap). */
const WALK_STEP = 72;

/**
 * Duplex cross-section library: both levels visible in one viewport.
 * Walk left/right; Space (or jump button / swipe up) hops between platforms.
 */
export function LibraryWalk({ books }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; x: number; left: number } | null>(null);
  const lastScrollRef = useRef(0);
  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeYRef = useRef<number | null>(null);
  const levelRef = useRef<FloorLevel>(0);
  const activeSlotRef = useRef(0);

  const [level, setLevel] = useState<FloorLevel>(0);
  const [activeSlot, setActiveSlot] = useState(0);
  const [preferReducedMotion, setPreferReducedMotion] = useState(false);
  const [facing, setFacing] = useState<"right" | "left">("right");
  const [isWalking, setIsWalking] = useState(false);
  const [isJumping, setIsJumping] = useState(false);
  const [progress, setProgress] = useState({ left: 0, width: 1 });
  const [tint, setTint] = useState<SectionTheme | null>(null);

  const plan = useMemo(() => buildFloorPlan(books), [books]);
  const columns = useMemo(() => duplexColumns(plan), [plan]);
  const planRef = useRef(plan);
  const columnsRef = useRef(columns);

  useEffect(() => {
    planRef.current = plan;
    columnsRef.current = columns;
  }, [plan, columns]);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPreferReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  function syncActive() {
    const el = scrollerRef.current;
    if (!el) return;
    const x = el.scrollLeft;
    if (!preferReducedMotion) el.style.setProperty("--walk-scroll", `${x}px`);

    setProgress({
      left: x / Math.max(1, el.scrollWidth),
      width: el.clientWidth / Math.max(1, el.scrollWidth),
    });

    const mid = x + el.clientWidth / 2;
    let nearestSlot = 0;
    let best = Infinity;
    for (const node of el.querySelectorAll<HTMLElement>("[data-column-slot]")) {
      const center = node.offsetLeft + node.offsetWidth / 2;
      const d = Math.abs(center - mid);
      if (d < best) {
        best = d;
        nearestSlot = Number(node.dataset.columnSlot ?? 0);
      }
    }
    setActiveSlot(nearestSlot);
    const col = columnsRef.current.find((c) => c.slot === nearestSlot);
    const bay = levelRef.current === 0 ? col?.ground : col?.upper;
    if (bay) setTint(bay.theme);
  }

  function playJump() {
    if (preferReducedMotion) {
      return;
    }
    setIsJumping(true);
    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = setTimeout(() => setIsJumping(false), 420);
  }

  function jump() {
    playJump();
    setLevel((current) => {
      const next: FloorLevel = current === 0 ? 1 : 0;
      levelRef.current = next;
      return next;
    });
    requestAnimationFrame(syncActive);
  }

  function scrollToSlot(slot: number, nextLevel?: FloorLevel) {
    const el = scrollerRef.current;
    if (!el) return;
    if (nextLevel != null && nextLevel !== levelRef.current) {
      playJump();
      setLevel(nextLevel);
      levelRef.current = nextLevel;
    }
    const node = el.querySelector<HTMLElement>(`[data-column-slot="${slot}"]`);
    if (!node) return;
    el.scrollTo({
      left: Math.max(0, node.offsetLeft - el.clientWidth * 0.12),
      behavior: preferReducedMotion ? "auto" : "smooth",
    });
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      const x = el.scrollLeft;
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
      syncActive();
    };

    const onWheelNative = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      el.scrollLeft += event.deltaY * 0.55;
      event.preventDefault();
    };

    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheelNative, { passive: false });
    window.addEventListener("resize", syncActive);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheelNative);
      window.removeEventListener("resize", syncActive);
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferReducedMotion, plan]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = scrollerRef.current;
      if (!el) return;
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        event.preventDefault();
        el.scrollBy({ left: WALK_STEP, behavior: preferReducedMotion ? "auto" : "smooth" });
      } else if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        event.preventDefault();
        el.scrollBy({ left: -WALK_STEP, behavior: preferReducedMotion ? "auto" : "smooth" });
      } else if (
        event.key === " " ||
        event.key === "Spacebar" ||
        event.key === "ArrowUp" ||
        event.key === "w" ||
        event.key === "W"
      ) {
        event.preventDefault();
        jump();
      } else if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
        event.preventDefault();
        if (levelRef.current === 1) jump();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferReducedMotion]);

  useEffect(
    () => () => {
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    },
    [],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button")) return;
    dragRef.current = { id: event.pointerId, x: event.clientX, left: el.scrollLeft };
    swipeYRef.current = event.clientY;
    el.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || drag.id !== event.pointerId || !el) return;
    el.scrollLeft = drag.left - (event.clientX - drag.x);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== event.pointerId) return;
    const startY = swipeYRef.current;
    dragRef.current = null;
    swipeYRef.current = null;
    if (startY == null) return;
    const dy = event.clientY - startY;
    if (Math.abs(dy) > 70) jump();
  };

  if (books.length === 0) {
    return <p role="status" className="walk-empty">No books on the shelves yet.</p>;
  }

  const activeCol = columns.find((c) => c.slot === activeSlot);
  const activeBay = level === 0 ? activeCol?.ground : activeCol?.upper;
  const activeTheme = tint ?? activeBay?.theme ?? columns[0]?.ground.theme;

  const walkStyle = {
    "--walk-sky": activeTheme?.sky,
    "--walk-wall": activeTheme?.wall,
    "--walk-wall-deep": activeTheme?.wallDeep,
    "--walk-floor": activeTheme?.floor,
    "--walk-floor-deep": activeTheme?.floorDeep,
    "--walk-accent": activeTheme?.accent,
    "--walk-light": activeTheme?.light,
    "--walk-level": level,
  } as CSSProperties;

  return (
    <section
      className={`walk walk--duplex${preferReducedMotion ? " walk--calm" : ""}`}
      aria-label="Pixel library duplex"
      style={walkStyle}
      data-mood={activeTheme?.mood}
      data-level={level}
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
        aria-label="Duplex library. Arrow keys or A and D walk. Space jumps between floors."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="walk-scene">
          <div className="walk-layer walk-layer--parallax" aria-hidden="true">
            <div className="walk-skywash" />
          </div>

          <div className="walk-layer walk-layer--shelves">
            {columns.map((column) => (
              <div
                key={column.slot}
                className="walk-column"
                data-column-slot={column.slot}
              >
                <LevelBay bay={column.upper} calm={preferReducedMotion} />
                <LevelBay bay={column.ground} calm={preferReducedMotion} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`walk-avatar walk-avatar--${facing} walk-avatar--level-${level}${isWalking ? " is-walking" : ""}${isJumping ? " is-jumping" : ""}`}
        aria-hidden="true"
      >
        <span className="walk-avatar__body" />
        <span className="walk-avatar__leg walk-avatar__leg--l" />
        <span className="walk-avatar__leg walk-avatar__leg--r" />
      </div>

      <button
        type="button"
        className="walk-jump-btn"
        aria-label={level === 0 ? "Jump to the upper floor" : "Jump to the ground floor"}
        onClick={jump}
      >
        Jump
      </button>

      <aside className="walk-minimap" aria-label="Library mini-map">
        <p className="walk-minimap__title label">
          Map · {level === 0 ? "ground" : "upper"}
        </p>
        {([1, 0] as FloorLevel[]).map((floor) => (
          <div
            key={floor}
            className={`walk-minimap__row${level === floor ? " is-current" : ""}`}
          >
            <span className="walk-minimap__floor-tag label">
              {floor === 1 ? "Up" : "G"}
            </span>
            <div className="walk-minimap__track">
              {baysOnFloor(plan, floor).map((bay) => (
                <button
                  key={bay.id}
                  type="button"
                  className={`walk-minimap__bay${activeSlot === bay.slot && level === floor ? " is-active" : ""}${bay.empty ? " is-empty" : ""}`}
                  style={
                    {
                      "--bay-color": bay.theme.wall,
                      "--bay-accent": bay.theme.accent,
                    } as CSSProperties
                  }
                  aria-label={`Go to ${bay.label} on the ${floor === 0 ? "ground" : "upper"} floor`}
                  title={bay.label}
                  onClick={() => scrollToSlot(bay.slot, floor)}
                >
                  <span className="walk-minimap__tip">{bay.label}</span>
                </button>
              ))}
              {level === floor && (
                <div
                  className="walk-minimap__you"
                  style={{
                    left: `${progress.left * 100}%`,
                    width: `${Math.max(progress.width * 100, 6)}%`,
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        ))}
        <p className="walk-minimap__here label" aria-live="polite">
          {activeBay?.label ?? "Library"}
        </p>
      </aside>
    </section>
  );
}

function LevelBay({ bay, calm }: { bay: WalkBay; calm: boolean }) {
  const style = {
    "--sec-sky": bay.theme.sky,
    "--sec-wall": bay.theme.wall,
    "--sec-wall-deep": bay.theme.wallDeep,
    "--sec-floor": bay.theme.floor,
    "--sec-floor-deep": bay.theme.floorDeep,
    "--sec-accent": bay.theme.accent,
    "--sec-light": bay.theme.light,
  } as CSSProperties;

  return (
    <section
      className={`walk-bay walk-bay--${bay.floor === 1 ? "upper" : "ground"} walk-bay--${bay.kit} walk-bay--${bay.theme.pattern}${bay.empty ? " walk-bay--empty" : ""}`}
      data-section-id={bay.id}
      data-floor={bay.floor}
      aria-label={
        bay.empty
          ? `${bay.label}`
          : `${bay.label}, ${bay.books.length + bay.piles.length} books`
      }
      style={style}
    >
      <div className="walk-bay__wall" aria-hidden="true">
        <div className="walk-bay__paper" />
        <div className="walk-bay__glow" />
        {!calm && !bay.empty && <div className="walk-bay__motes" />}
        <div className="walk-bay__window" />
      </div>

      <div className="walk-bay__deck" aria-hidden="true" />

      <div className="walk-sign" aria-hidden="true">
        <span>{bay.label}</span>
      </div>
      <h3 className="walk-sr-only">{bay.label}</h3>

      {!bay.empty && (
        <>
          <SectionShelves kit={bay.kit} />
          <SectionDecor kit={bay.kit} index={bay.slot} />
          <div className="walk-rail">
            {bay.books.map((book) => (
              <WalkBook key={book.uid} book={book} />
            ))}
          </div>
          {bay.piles.length > 0 && (
            <div className="walk-pile" aria-label={`${bay.label} stack`}>
              {bay.piles.map((book) => (
                <WalkBook key={`pile-${book.uid}`} book={book} pose="pile" />
              ))}
            </div>
          )}
        </>
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
      </div>
    );
  }
  if (kit === "low-nook") {
    return (
      <div className="walk-case walk-case--low" aria-hidden="true">
        <div className="walk-case__board" />
        <div className="walk-case__board" />
      </div>
    );
  }
  if (kit === "mezzanine") {
    return (
      <div className="walk-case walk-case--mid" aria-hidden="true">
        <div className="walk-case__board" />
        <div className="walk-case__board" />
        <div className="walk-case__board" />
      </div>
    );
  }
  if (kit === "ladder-desk") {
    return (
      <div className="walk-case walk-case--tall" aria-hidden="true">
        <div className="walk-case__board" />
        <div className="walk-case__board" />
        <div className="walk-case__board" />
      </div>
    );
  }
  if (kit === "plants-globe") {
    return (
      <div className="walk-case walk-case--mid" aria-hidden="true">
        <div className="walk-case__board" />
        <div className="walk-case__board" />
      </div>
    );
  }
  return (
    <div className="walk-case walk-case--low" aria-hidden="true">
      <div className="walk-case__board" />
      <div className="walk-case__board" />
    </div>
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
      {(kit === "tall-hearth" || kit === "balcony-clock") && <div className="walk-chair" />}
      {(kit === "ladder-desk" || kit === "mezzanine") && (
        <div className="walk-lamp">
          <div className="walk-lamp__glow" />
        </div>
      )}
      {(kit === "plants-globe" || kit === "balcony-clock") && (
        <>
          <div className="walk-plant" />
          <div className="walk-globe" />
        </>
      )}
      {kit === "balcony-clock" && <div className="walk-clock" />}
      <div className={`walk-rug walk-rug--${(index % 3) + 1}`} />
      {index % 2 === 0 && (
        <div className="walk-cat">
          <div className="walk-cat__body" />
        </div>
      )}
    </div>
  );
}
