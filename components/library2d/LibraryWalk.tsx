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
  cellsForFloor1,
  type FloorLevel,
  type WalkBay,
} from "@/components/library2d/floorLayout";
import type { DecorKit, SectionTheme } from "@/components/library2d/sectionTheme";

type Props = {
  books: LibraryBook[];
};

/**
 * Full-viewport multi-floor side-scroller. HTML/CSS only — real <a> spines.
 * Ground floor + loft/gallery; ladders, stairs, and ↑/W/E to change floors.
 */
export function LibraryWalk({ books }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; x: number; left: number } | null>(null);
  const lastScrollRef = useRef(0);
  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const climbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeYRef = useRef<number | null>(null);
  const floorRef = useRef<FloorLevel>(0);
  const activeIdRef = useRef<string | null>(null);

  const [floor, setFloor] = useState<FloorLevel>(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preferReducedMotion, setPreferReducedMotion] = useState(false);
  const [facing, setFacing] = useState<"right" | "left">("right");
  const [isWalking, setIsWalking] = useState(false);
  const [isClimbing, setIsClimbing] = useState(false);
  const [progress, setProgress] = useState({ left: 0, width: 1 });
  const [tint, setTint] = useState<SectionTheme | null>(null);

  const plan = useMemo(() => buildFloorPlan(books), [books]);
  const hasUpper = plan.floors.includes(1);
  const planRef = useRef(plan);

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  useEffect(() => {
    floorRef.current = floor;
  }, [floor]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

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
    const level = floorRef.current;
    if (!preferReducedMotion) el.style.setProperty("--walk-scroll", `${x}px`);

    setProgress({
      left: x / Math.max(1, el.scrollWidth),
      width: el.clientWidth / Math.max(1, el.scrollWidth),
    });

    const mid = x + el.clientWidth / 2;
    let nearest: WalkBay | null = null;
    let best = Infinity;
    for (const node of el.querySelectorAll<HTMLElement>(`[data-floor="${level}"][data-section-id]`)) {
      const center = node.offsetLeft + node.offsetWidth / 2;
      const d = Math.abs(center - mid);
      if (d < best) {
        best = d;
        nearest = planRef.current.bays.find((b) => b.id === node.dataset.sectionId) ?? null;
      }
    }
    setActiveId(nearest?.id ?? null);
    if (nearest) setTint(nearest.theme);
  }

  function playClimb() {
    if (preferReducedMotion) return;
    setIsClimbing(true);
    if (climbTimerRef.current) clearTimeout(climbTimerRef.current);
    climbTimerRef.current = setTimeout(() => setIsClimbing(false), 520);
  }

  function scrollToBay(id: string, behavior?: ScrollBehavior) {
    const el = scrollerRef.current;
    if (!el) return;
    const node = el.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(id)}"]`);
    if (!node) return;
    el.scrollTo({
      left: Math.max(0, node.offsetLeft - el.clientWidth * 0.12),
      behavior: behavior ?? (preferReducedMotion ? "auto" : "smooth"),
    });
  }

  function goFloor(next: FloorLevel, preferBayId?: string | null) {
    const current = floorRef.current;
    if (next === current) return;
    if (next === 1 && !planRef.current.floors.includes(1)) return;
    playClimb();
    setFloor(next);
    floorRef.current = next;

    const active = planRef.current.bays.find((b) => b.id === activeIdRef.current);
    let targetId = preferBayId ?? null;
    if (!targetId && active?.partnerId) {
      const partner = planRef.current.bays.find((b) => b.id === active.partnerId);
      if (partner?.floor === next) targetId = partner.id;
    }
    if (!targetId) {
      const onNext = baysOnFloor(planRef.current, next);
      const sameSlot = active ? onNext.find((b) => b.slot === active.slot) : undefined;
      targetId = sameSlot?.id ?? onNext[0]?.id ?? null;
    }

    requestAnimationFrame(() => {
      if (targetId) scrollToBay(targetId, preferReducedMotion ? "auto" : "smooth");
      syncActive();
    });
  }

  function tryFloorChange(dir: 1 | -1) {
    const current = floorRef.current;
    const active = planRef.current.bays.find((b) => b.id === activeIdRef.current);
    if (dir === 1) {
      if (active?.partnerId) {
        const partner = planRef.current.bays.find((b) => b.id === active.partnerId);
        if (partner && partner.floor > current) {
          goFloor(partner.floor, partner.id);
          return;
        }
      }
      if (current === 0 && planRef.current.floors.includes(1)) goFloor(1);
    } else {
      if (active?.partnerId) {
        const partner = planRef.current.bays.find((b) => b.id === active.partnerId);
        if (partner && partner.floor < current) {
          goFloor(partner.floor, partner.id);
          return;
        }
      }
      if (current === 1) goFloor(0);
    }
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
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX) || Math.abs(event.deltaY) <= 8) return;
      const level = floorRef.current;
      const upper = planRef.current.floors.includes(1);
      if (event.deltaY < -40 && level === 0 && upper) {
        event.preventDefault();
        tryFloorChange(1);
        return;
      }
      if (event.deltaY > 40 && level === 1) {
        event.preventDefault();
        tryFloorChange(-1);
        return;
      }
      el.scrollLeft += event.deltaY;
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
    // Handlers close over latest preferReducedMotion via effect rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferReducedMotion, plan]);

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
      } else if (
        event.key === "ArrowUp" ||
        event.key === "w" ||
        event.key === "W" ||
        event.key === "e" ||
        event.key === "E"
      ) {
        event.preventDefault();
        tryFloorChange(1);
      } else if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
        event.preventDefault();
        tryFloorChange(-1);
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
      if (climbTimerRef.current) clearTimeout(climbTimerRef.current);
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
    if (Math.abs(dy) > 70) tryFloorChange(dy < 0 ? 1 : -1);
  };

  if (books.length === 0) {
    return <p role="status" className="walk-empty">No books on the shelves yet.</p>;
  }

  const activeTheme = tint ?? plan.bays[0]?.theme;
  const walkStyle = {
    "--walk-sky": activeTheme?.sky,
    "--walk-wall": activeTheme?.wall,
    "--walk-wall-deep": activeTheme?.wallDeep,
    "--walk-floor": activeTheme?.floor,
    "--walk-floor-deep": activeTheme?.floorDeep,
    "--walk-accent": activeTheme?.accent,
    "--walk-light": activeTheme?.light,
    "--walk-level": floor,
  } as CSSProperties;

  const activeBay = plan.bays.find((b) => b.id === activeId);

  return (
    <section
      className={`walk${preferReducedMotion ? " walk--calm" : ""}`}
      aria-label="Pixel library side-scroller"
      style={walkStyle}
      data-mood={activeTheme?.mood}
      data-floor={floor}
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
        aria-label="Scrollable library. Arrow keys move; up or W climbs a floor."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="walk-world">
          <div className="walk-storey" data-floor={0} aria-hidden={floor !== 0}>
            <div className="walk-scene">
              <div className="walk-layer walk-layer--parallax" aria-hidden="true">
                <div className="walk-skywash" />
              </div>
              <div className="walk-layer walk-layer--shelves">
                <div className="walk-floor-run" aria-hidden="true" />
                <div className="walk-ground" aria-hidden="true" />
                {baysOnFloor(plan, 0).map((bay, index, list) => (
                  <WalkSection
                    key={bay.id}
                    bay={bay}
                    index={index}
                    isLast={index === list.length - 1}
                    calm={preferReducedMotion}
                    onClimb={() => {
                      if (bay.partnerId) {
                        const partner = plan.bays.find((b) => b.id === bay.partnerId);
                        if (partner) goFloor(partner.floor, partner.id);
                      } else if (hasUpper) {
                        goFloor(1);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {hasUpper && (
            <div className="walk-storey" data-floor={1} aria-hidden={floor !== 1}>
              <div className="walk-scene">
                <div className="walk-layer walk-layer--parallax" aria-hidden="true">
                  <div className="walk-skywash" />
                </div>
                <div className="walk-layer walk-layer--shelves">
                  <div className="walk-floor-run" aria-hidden="true" />
                  <div className="walk-ground" aria-hidden="true" />
                  {cellsForFloor1(plan).map((cell, index, list) =>
                    cell.kind === "spacer" ? (
                      <div
                        key={`spacer-${cell.slot}`}
                        className="walk-section walk-section--spacer"
                        aria-hidden="true"
                      />
                    ) : (
                      <WalkSection
                        key={cell.bay.id}
                        bay={cell.bay}
                        index={index}
                        isLast={index === list.length - 1}
                        calm={preferReducedMotion}
                        onClimb={() => {
                          if (cell.bay.partnerId) {
                            const partner = plan.bays.find((b) => b.id === cell.bay.partnerId);
                            if (partner) goFloor(partner.floor, partner.id);
                          } else {
                            goFloor(0);
                          }
                        }}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className={`walk-avatar walk-avatar--${facing}${isWalking ? " is-walking" : ""}${isClimbing ? " is-climbing" : ""}`}
        aria-hidden="true"
      >
        <span className="walk-avatar__body" />
        <span className="walk-avatar__leg walk-avatar__leg--l" />
        <span className="walk-avatar__leg walk-avatar__leg--r" />
      </div>

      {hasUpper && (
        <div className="walk-floor-pad" role="group" aria-label="Change floor">
          <button
            type="button"
            className="walk-floor-pad__btn"
            aria-label="Go up a floor"
            disabled={floor === 1}
            onClick={() => tryFloorChange(1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="walk-floor-pad__btn"
            aria-label="Go down a floor"
            disabled={floor === 0}
            onClick={() => tryFloorChange(-1)}
          >
            ↓
          </button>
        </div>
      )}

      <aside className="walk-minimap" aria-label="Library mini-map">
        <p className="walk-minimap__title label">
          Map · floor {floor + 1}
          {activeBay?.access === "ladder" ? " · ladder" : ""}
          {activeBay?.access === "stairs" ? " · stairs" : ""}
        </p>
        {plan.floors.map((level) => (
          <div
            key={level}
            className={`walk-minimap__row${floor === level ? " is-current" : ""}`}
          >
            <span className="walk-minimap__floor-tag label">F{level + 1}</span>
            <div className="walk-minimap__track">
              {baysOnFloor(plan, level).map((bay) => (
                <button
                  key={bay.id}
                  type="button"
                  className={`walk-minimap__bay${activeId === bay.id ? " is-active" : ""}`}
                  style={
                    {
                      "--bay-color": bay.theme.wall,
                      "--bay-accent": bay.theme.accent,
                    } as CSSProperties
                  }
                  aria-label={`Jump to ${bay.label} on floor ${level + 1}`}
                  title={bay.label}
                  onClick={() => {
                    if (level !== floor) goFloor(level, bay.id);
                    else scrollToBay(bay.id);
                  }}
                >
                  <span className="walk-minimap__tip">{bay.label}</span>
                </button>
              ))}
              {floor === level && (
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

function WalkSection({
  bay,
  index,
  isLast,
  calm,
  onClimb,
}: {
  bay: WalkBay;
  index: number;
  isLast: boolean;
  calm: boolean;
  onClimb: () => void;
}) {
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
      className={`walk-section walk-section--${bay.kit} walk-section--${bay.theme.pattern}`}
      data-section-id={bay.id}
      data-floor={bay.floor}
      data-mood={bay.theme.mood}
      aria-label={`${bay.label}, ${bay.books.length + bay.piles.length} books, floor ${bay.floor + 1}`}
      style={style}
    >
      <div className="walk-section__wall" aria-hidden="true">
        <div className="walk-section__paper" />
        <div className="walk-section__glow" />
        {!calm && <div className="walk-section__motes" />}
        <div className="walk-section__window" />
      </div>

      <div className="walk-sign" aria-hidden="true">
        <span>{bay.label}</span>
      </div>
      <h3 className="walk-sr-only">{bay.label}</h3>

      <SectionShelves kit={bay.kit} />
      <SectionDecor kit={bay.kit} index={index} />

      {(bay.access === "ladder" || bay.partnerId) && (
        <button
          type="button"
          className={`walk-climb walk-climb--${bay.access === "ladder" || bay.floor === 1 ? "ladder" : "rail"}`}
          aria-label={
            bay.floor === 0
              ? `Climb the ladder to ${bay.label} loft`
              : `Climb down from ${bay.label}`
          }
          onClick={onClimb}
        />
      )}

      {bay.access === "stairs" && (
        <button
          type="button"
          className="walk-climb walk-climb--stairs"
          aria-label={`Take the stairs to floor ${bay.floor === 0 ? 2 : 1}`}
          onClick={onClimb}
        />
      )}

      {index === 0 && bay.floor === 0 && (
        <button
          type="button"
          className="walk-climb walk-climb--stairs walk-climb--entrance"
          aria-label="Stairs to the upper gallery"
          onClick={onClimb}
        />
      )}

      <div className="walk-rail">
        {bay.books.map((book) => (
          <WalkBook key={book.uid} book={book} />
        ))}
      </div>

      {bay.piles.length > 0 && (
        <div className="walk-pile" aria-label={`${bay.label} floor stack`}>
          {bay.piles.map((book) => (
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
