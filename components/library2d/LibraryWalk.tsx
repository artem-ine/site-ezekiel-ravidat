"use client";

import {
  memo,
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

/** Comfortable arrow / A-D pace (px per tap / eased glide). */
const WALK_STEP = 72;
/** Cruise speed while a walk key is held (px/s). */
const WALK_MAX_SPEED = 220;
/** Accelerate toward cruise while held (px/s²). */
const WALK_ACCEL = 900;
/** Brake after release (px/s²). Tap impulse is derived so coast ≈ WALK_STEP. */
const WALK_DECEL = 1000;
/** Seed velocity on press: decelerating from this covers ~WALK_STEP. */
const WALK_TAP_IMPULSE = Math.sqrt(2 * WALK_DECEL * WALK_STEP);
const WALK_STOP_EPS = 8;

/**
 * Duplex cross-section library: both levels visible in one viewport.
 * Walk left/right; Space (or jump button / swipe up) hops between platforms.
 */
export function LibraryWalk({ books }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const youMarkerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; x: number; left: number } | null>(null);
  const lastScrollRef = useRef(0);
  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeYRef = useRef<number | null>(null);
  const levelRef = useRef<FloorLevel>(0);
  const activeSlotRef = useRef(0);
  const tintIdRef = useRef<string | null>(null);
  const facingRef = useRef<"right" | "left">("right");
  const preferReducedMotionRef = useRef(false);
  const keysHeldRef = useRef({ left: false, right: false });
  const velocityRef = useRef(0);
  const isWalkingRef = useRef(false);
  const walkRafRef = useRef<number | null>(null);
  const walkLastTsRef = useRef<number | null>(null);
  const syncRafRef = useRef<number | null>(null);
  const columnNodesRef = useRef<HTMLElement[]>([]);

  const [level, setLevel] = useState<FloorLevel>(0);
  const [activeSlot, setActiveSlot] = useState(0);
  const [preferReducedMotion, setPreferReducedMotion] = useState(false);
  const [facing, setFacing] = useState<"right" | "left">("right");
  const [isWalking, setIsWalking] = useState(false);
  const [isJumping, setIsJumping] = useState(false);
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
    preferReducedMotionRef.current = preferReducedMotion;
  }, [preferReducedMotion]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      preferReducedMotionRef.current = mq.matches;
      setPreferReducedMotion(mq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  function refreshColumnCache() {
    const el = scrollerRef.current;
    if (!el) return;
    columnNodesRef.current = Array.from(
      el.querySelectorAll<HTMLElement>("[data-column-slot]"),
    );
  }

  function syncActive() {
    const el = scrollerRef.current;
    if (!el) return;
    const x = el.scrollLeft;
    const width = Math.max(1, el.scrollWidth);
    const view = el.clientWidth;

    if (!preferReducedMotionRef.current) {
      el.style.setProperty("--walk-scroll", `${x}px`);
    }

    // Mini-map viewport marker — DOM only, no React re-render per frame.
    const marker = youMarkerRef.current;
    if (marker) {
      marker.style.left = `${(x / width) * 100}%`;
      marker.style.width = `${Math.max((view / width) * 100, 6)}%`;
    }

    const mid = x + view / 2;
    let nearestSlot = 0;
    let best = Infinity;
    const nodes = columnNodesRef.current;
    if (nodes.length === 0) refreshColumnCache();
    for (const node of columnNodesRef.current) {
      const center = node.offsetLeft + node.offsetWidth / 2;
      const d = Math.abs(center - mid);
      if (d < best) {
        best = d;
        nearestSlot = Number(node.dataset.columnSlot ?? 0);
      }
    }

    if (nearestSlot !== activeSlotRef.current) {
      activeSlotRef.current = nearestSlot;
      setActiveSlot(nearestSlot);
    }

    const col = columnsRef.current.find((c) => c.slot === nearestSlot);
    const bay = levelRef.current === 0 ? col?.ground : col?.upper;
    if (bay && bay.theme.id !== tintIdRef.current) {
      tintIdRef.current = bay.theme.id;
      setTint(bay.theme);
    }
  }

  function scheduleSync() {
    if (syncRafRef.current != null) return;
    syncRafRef.current = requestAnimationFrame(() => {
      syncRafRef.current = null;
      syncActive();
    });
  }

  function setFacingDir(dir: "left" | "right") {
    if (facingRef.current === dir) return;
    facingRef.current = dir;
    setFacing(dir);
  }

  function setWalkingAnim(active: boolean) {
    if (preferReducedMotionRef.current) {
      if (isWalkingRef.current) {
        isWalkingRef.current = false;
        setIsWalking(false);
      }
      return;
    }
    if (isWalkingRef.current === active) return;
    isWalkingRef.current = active;
    setIsWalking(active);
  }

  /** Mark walker facing/anim from pointer or wheel scroll deltas. */
  function markWalking(dir: "left" | "right") {
    setFacingDir(dir);
    setWalkingAnim(true);
    if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
    walkTimerRef.current = setTimeout(() => setWalkingAnim(false), 180);
  }

  function stopWalkLoop() {
    if (walkRafRef.current != null) {
      cancelAnimationFrame(walkRafRef.current);
      walkRafRef.current = null;
    }
    walkLastTsRef.current = null;
  }

  function approach(current: number, target: number, maxDelta: number) {
    const delta = target - current;
    if (Math.abs(delta) <= maxDelta) return target;
    return current + Math.sign(delta) * maxDelta;
  }

  function walkFrame(ts: number) {
    const el = scrollerRef.current;
    if (!el) {
      stopWalkLoop();
      return;
    }

    const held = keysHeldRef.current;
    const heldDir = (held.right ? 1 : 0) + (held.left ? -1 : 0);
    const last = walkLastTsRef.current ?? ts;
    const dt = Math.min((ts - last) / 1000, 0.05);
    walkLastTsRef.current = ts;

    let velocity = velocityRef.current;

    if (preferReducedMotionRef.current) {
      // No easing: constant cruise while held, hard stop on release.
      if (heldDir === 0) {
        velocityRef.current = 0;
        setWalkingAnim(false);
        stopWalkLoop();
        return;
      }
      velocity = heldDir * WALK_MAX_SPEED;
    } else if (heldDir !== 0) {
      velocity = approach(velocity, heldDir * WALK_MAX_SPEED, WALK_ACCEL * dt);
    } else {
      velocity = approach(velocity, 0, WALK_DECEL * dt);
    }

    velocityRef.current = velocity;
    el.scrollLeft += velocity * dt;

    if (Math.abs(velocity) > WALK_STOP_EPS) {
      setFacingDir(velocity > 0 ? "right" : "left");
      setWalkingAnim(true);
      scheduleSync();
    }

    if (heldDir === 0 && Math.abs(velocity) <= WALK_STOP_EPS) {
      velocityRef.current = 0;
      setWalkingAnim(false);
      scheduleSync();
      stopWalkLoop();
      return;
    }

    walkRafRef.current = requestAnimationFrame(walkFrame);
  }

  function ensureWalkLoop() {
    if (walkRafRef.current != null) return;
    walkLastTsRef.current = null;
    walkRafRef.current = requestAnimationFrame(walkFrame);
  }

  function beginWalk(dir: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;

    if (dir > 0) keysHeldRef.current.right = true;
    else keysHeldRef.current.left = true;
    setFacingDir(dir > 0 ? "right" : "left");

    if (preferReducedMotionRef.current) {
      el.scrollLeft += dir * WALK_STEP;
      scheduleSync();
      // Keep the loop for hold (constant speed); tap keyup stops immediately.
      velocityRef.current = dir * WALK_MAX_SPEED;
      ensureWalkLoop();
      return;
    }

    // Seed (or reinforce) velocity so a quick tap coasts ~WALK_STEP with easing.
    const seeded = dir * WALK_TAP_IMPULSE;
    if (dir > 0) {
      velocityRef.current = Math.max(velocityRef.current, seeded);
    } else {
      velocityRef.current = Math.min(velocityRef.current, seeded);
    }
    setWalkingAnim(true);
    ensureWalkLoop();
  }

  function endWalk(dir: 1 | -1) {
    if (dir > 0) keysHeldRef.current.right = false;
    else keysHeldRef.current.left = false;

    if (preferReducedMotionRef.current) {
      if (!keysHeldRef.current.left && !keysHeldRef.current.right) {
        velocityRef.current = 0;
        stopWalkLoop();
      }
      return;
    }

    // Keep the rAF loop running so velocity can decelerate to a stop.
    ensureWalkLoop();
  }

  function playJump() {
    if (preferReducedMotionRef.current) return;
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
    requestAnimationFrame(() => {
      refreshColumnCache();
      syncActive();
    });
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
      behavior: preferReducedMotionRef.current ? "auto" : "smooth",
    });
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    refreshColumnCache();

    const onScroll = () => {
      const x = el.scrollLeft;
      const delta = x - lastScrollRef.current;
      if (Math.abs(delta) > 1) {
        markWalking(delta > 0 ? "right" : "left");
      }
      lastScrollRef.current = x;
      scheduleSync();
    };

    const onWheelNative = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      el.scrollLeft += event.deltaY * 0.55;
      event.preventDefault();
    };

    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheelNative, { passive: false });
    window.addEventListener("resize", () => {
      refreshColumnCache();
      scheduleSync();
    });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheelNative);
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
      if (syncRafRef.current != null) cancelAnimationFrame(syncRafRef.current);
      stopWalkLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  useEffect(() => {
    const isWalkKey = (key: string) =>
      key === "ArrowRight" ||
      key === "ArrowLeft" ||
      key === "a" ||
      key === "A" ||
      key === "d" ||
      key === "D";

    const onKeyDown = (event: KeyboardEvent) => {
      const el = scrollerRef.current;
      if (!el) return;

      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        event.preventDefault();
        // Ignore OS auto-repeat — motion is driven by the rAF velocity loop.
        if (event.repeat) return;
        beginWalk(1);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        event.preventDefault();
        if (event.repeat) return;
        beginWalk(-1);
        return;
      }

      if (
        event.key === " " ||
        event.key === "Spacebar" ||
        event.key === "ArrowUp" ||
        event.key === "w" ||
        event.key === "W"
      ) {
        event.preventDefault();
        if (event.repeat) return;
        jump();
        return;
      }

      if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
        event.preventDefault();
        if (event.repeat) return;
        if (levelRef.current === 1) jump();
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        el.scrollTo({
          left: 0,
          behavior: preferReducedMotionRef.current ? "auto" : "smooth",
        });
      } else if (event.key === "End") {
        event.preventDefault();
        el.scrollTo({
          left: el.scrollWidth,
          behavior: preferReducedMotionRef.current ? "auto" : "smooth",
        });
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!isWalkKey(event.key)) return;
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        endWalk(1);
      } else if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        endWalk(-1);
      }
    };

    const onBlur = () => {
      keysHeldRef.current.left = false;
      keysHeldRef.current.right = false;
      velocityRef.current = 0;
      setWalkingAnim(false);
      stopWalkLoop();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      stopWalkLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  ref={youMarkerRef}
                  className="walk-minimap__you"
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

const LevelBay = memo(function LevelBay({
  bay,
  calm,
}: {
  bay: WalkBay;
  calm: boolean;
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
});

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
