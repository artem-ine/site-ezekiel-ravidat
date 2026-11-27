"use client";

import {
  Fragment,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import type { LibraryBook } from "@/lib/books";
import { ShelfItemView } from "@/components/library2d/ShelfItemView";
import { ThemeDecor } from "@/components/library2d/ThemeDecor";
import { WallWindow, WallWindowPatch } from "@/components/library2d/WallWindow";
import {
  baysOnFloor,
  buildFloorPlan,
  caseWidthRem,
  columnWidthRem,
  duplexColumns,
  itemKey,
  type DisplayMode,
  type FloorLevel,
  type WalkBay,
  type WingInfo,
} from "@/components/library2d/floorLayout";
import type { DecorKit, SectionTheme } from "@/components/library2d/sectionTheme";
import {
  WALK_MAX_SPEED,
  WALK_STEP,
  WALK_STOP_EPS,
  seedTapImpulse,
  stepWalk,
} from "@/components/library2d/walkPhysics";

type Props = {
  books: LibraryBook[];
};

const DISPLAY_KEY = "walk-display";
const DISPLAY_EVENT = "walk-display-change";

function subscribeDisplay(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(DISPLAY_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DISPLAY_EVENT, onChange);
  };
}

/** Covers are the default; the choice is remembered in this browser. */
function readDisplay(): DisplayMode {
  try {
    return window.localStorage.getItem(DISPLAY_KEY) === "spines" ? "spines" : "covers";
  } catch {
    return "covers";
  }
}

function writeDisplay(mode: DisplayMode) {
  try {
    window.localStorage.setItem(DISPLAY_KEY, mode);
  } catch {
    // Private mode: the toggle still works for this page view via the event below.
  }
  window.dispatchEvent(new Event(DISPLAY_EVENT));
}

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
  /** Most recent walk intent — used when both left and right are down. */
  const lastDirRef = useRef<-1 | 0 | 1>(0);
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
  const [mapOpen, setMapOpen] = useState(false);
  const mapRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mapOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (mapRef.current && !mapRef.current.contains(event.target as Node)) {
        setMapOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMapOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [mapOpen]);

  const display = useSyncExternalStore<DisplayMode>(subscribeDisplay, readDisplay, () => "covers");
  const plan = useMemo(() => buildFloorPlan(books, display), [books, display]);
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

  function walkFrame(ts: number) {
    const el = scrollerRef.current;
    if (!el) {
      stopWalkLoop();
      return;
    }

    const last = walkLastTsRef.current ?? ts;
    const dt = (ts - last) / 1000;
    walkLastTsRef.current = ts;

    const stepped = stepWalk({
      velocity: velocityRef.current,
      keys: keysHeldRef.current,
      lastDir: lastDirRef.current,
      dt,
      reducedMotion: preferReducedMotionRef.current,
    });

    velocityRef.current = stepped.velocity;
    el.scrollLeft += stepped.dx;

    if (Math.abs(stepped.velocity) > WALK_STOP_EPS || stepped.heldDir !== 0) {
      if (stepped.heldDir !== 0) {
        setFacingDir(stepped.heldDir > 0 ? "right" : "left");
      } else if (Math.abs(stepped.velocity) > WALK_STOP_EPS) {
        setFacingDir(stepped.velocity > 0 ? "right" : "left");
      }
      setWalkingAnim(stepped.heldDir !== 0 || Math.abs(stepped.velocity) > WALK_STOP_EPS);
      scheduleSync();
    }

    if (!stepped.keepGoing) {
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

  /**
   * Press or OS-repeat for a walk key.
   * Always re-asserts held state + rAF (repeats must revive a stopped loop).
   * Only the initial (!repeat) press seeds the tap impulse / reduced-motion step.
   */
  function beginWalk(dir: 1 | -1, isRepeat: boolean) {
    const el = scrollerRef.current;
    if (!el) return;

    if (dir > 0) keysHeldRef.current.right = true;
    else keysHeldRef.current.left = true;
    lastDirRef.current = dir;
    setFacingDir(dir > 0 ? "right" : "left");

    if (preferReducedMotionRef.current) {
      if (!isRepeat) {
        el.scrollLeft += dir * WALK_STEP;
        scheduleSync();
      }
      velocityRef.current = dir * WALK_MAX_SPEED;
      ensureWalkLoop();
      return;
    }

    if (!isRepeat) {
      velocityRef.current = seedTapImpulse(velocityRef.current, dir);
    }
    setWalkingAnim(true);
    ensureWalkLoop();
  }

  function endWalk(dir: 1 | -1) {
    if (dir > 0) keysHeldRef.current.right = false;
    else keysHeldRef.current.left = false;

    const stillHeld = keysHeldRef.current.left || keysHeldRef.current.right;
    if (stillHeld) {
      lastDirRef.current = keysHeldRef.current.right && !keysHeldRef.current.left
        ? 1
        : keysHeldRef.current.left && !keysHeldRef.current.right
          ? -1
          : lastDirRef.current;
      // Opposite key still down — keep cruising that way (do not leave rAF dead).
      ensureWalkLoop();
      return;
    }

    lastDirRef.current = 0;

    if (preferReducedMotionRef.current) {
      velocityRef.current = 0;
      stopWalkLoop();
      return;
    }

    // Coast / decelerate to a stop.
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
      if (syncRafRef.current != null) {
        cancelAnimationFrame(syncRafRef.current);
        syncRafRef.current = null;
      }
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
      // An open book owns the keyboard (Space/arrows would walk behind it).
      if (document.documentElement.dataset.bookOpen) return;

      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        event.preventDefault();
        // Repeats re-assert held + rAF (do not re-seed impulse).
        beginWalk(1, event.repeat);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        event.preventDefault();
        beginWalk(-1, event.repeat);
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
      lastDirRef.current = 0;
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
            <EntranceCap />
            {columns.map((column, columnIndex) => (
              <Fragment key={column.slot}>
                {column.wingStart && (
                  <WingGate wing={plan.wings.find((w) => w.startSlot === column.slot)} />
                )}
                <div
                  className="walk-column"
                  data-column-slot={column.slot}
                  style={
                    {
                      "--walk-bay-width": `${columnWidthRem(column)}rem`,
                    } as CSSProperties
                  }
                >
                  <LevelBay
                    bay={column.upper}
                    calm={preferReducedMotion}
                    display={display}
                    before={columns[columnIndex - 1]?.upper.theme}
                    after={columns[columnIndex + 1]?.upper.theme}
                  />
                  <LevelBay
                    bay={column.ground}
                    calm={preferReducedMotion}
                    display={display}
                    before={columns[columnIndex - 1]?.ground.theme}
                    after={columns[columnIndex + 1]?.ground.theme}
                  />
                </div>
              </Fragment>
            ))}
            <EndingCap />
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

      <button
        type="button"
        className="walk-view-btn"
        aria-label={`Showing ${display}. Switch to ${display === "covers" ? "spines" : "covers"}.`}
        title={`Switch to ${display === "covers" ? "spines" : "covers"}`}
        onClick={() => writeDisplay(display === "covers" ? "spines" : "covers")}
      >
        {display === "covers" ? "Covers" : "Spines"}
      </button>

      <aside
        ref={mapRef}
        className={`walk-minimap${mapOpen ? " is-open" : ""}`}
        aria-label="Library mini-map"
      >
        <button
          type="button"
          className="walk-minimap__toggle"
          aria-expanded={mapOpen}
          aria-controls="walk-minimap-panel"
          onClick={() => setMapOpen((open) => !open)}
        >
          <span className="walk-minimap__toggle-icon" aria-hidden="true" />
          <span className="walk-minimap__toggle-label">
            {activeBay ? bayTitle(activeBay) : "Map"}
          </span>
        </button>
        <div id="walk-minimap-panel" className="walk-minimap__panel">
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
                  className={`walk-minimap__bay${activeSlot === bay.slot && level === floor ? " is-active" : ""}${bay.empty ? " is-empty" : ""}${bay.wingStart ? " is-wing-start" : ""}`}
                  style={
                    {
                      "--bay-color": bay.theme.wall,
                      "--bay-accent": bay.theme.accent,
                    } as CSSProperties
                  }
                  aria-label={`Go to ${bayTitle(bay)} on the ${floor === 0 ? "ground" : "upper"} floor`}
                  title={bayTitle(bay)}
                  onClick={() => {
                    scrollToSlot(bay.slot, floor);
                    setMapOpen(false);
                  }}
                >
                  <span className="walk-minimap__tip">{bayTitle(bay)}</span>
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
          {activeBay ? bayTitle(activeBay) : "Library"}
        </p>
        </div>
      </aside>
    </section>
  );
}

function bayTitle(bay: WalkBay): string {
  return bay.empty ? bay.parent : `${bay.parent} · ${bay.label}`;
}

/** Archway between wings, naming the parent genre that follows. */
function WingGate({ wing }: { wing: WingInfo | undefined }) {
  if (!wing) return null;
  return (
    <div className="walk-wing" role="group" aria-label={`${wing.label} wing, ${wing.sections} sections`}>
      <div className="walk-wing__storey walk-wing__storey--upper" aria-hidden="true">
        <div className="walk-cap__paper walk-cap__paper--loft" />
        <div className="walk-cap__deck" />
        <p className="walk-wing__banner">{wing.label}</p>
      </div>
      <div className="walk-wing__storey walk-wing__storey--ground">
        <div className="walk-cap__paper" aria-hidden="true" />
        <div className="walk-cap__deck" aria-hidden="true" />
        <div className="walk-wing__sign">
          <p className="walk-wing__title">{wing.label}</p>
          <p className="walk-wing__count">
            {wing.sections} {wing.sections === 1 ? "section" : "sections"} · {wing.books} books
          </p>
        </div>
      </div>
    </div>
  );
}

/** Left end of the walk: entrance hall + how-to board (real text). */
function EntranceCap() {
  return (
    <aside className="walk-cap walk-cap--start" aria-label="Library entrance">
      <div className="walk-cap__storey walk-cap__storey--upper" aria-hidden="true">
        <div className="walk-cap__paper walk-cap__paper--loft" />
        <div className="walk-cap__window" />
        <div className="walk-cap__case walk-cap__case--loft" />
        <div className="walk-cap__deck" />
        <p className="walk-cap__plaque">Landing</p>
        <div className="walk-cap__plant walk-cap__plant--loft" />
        <div className="walk-cap__rug walk-cap__rug--loft" />
      </div>
      <div className="walk-cap__storey walk-cap__storey--ground">
        <div className="walk-cap__paper" aria-hidden="true" />
        <div className="walk-cap__door" aria-hidden="true" />
        <div className="walk-cap__coat" aria-hidden="true" />
        <div className="walk-cap__mat" aria-hidden="true" />
        <div className="walk-cap__plant" aria-hidden="true" />
        <div className="walk-cap__rug" aria-hidden="true" />
        <div className="walk-cap__deck" aria-hidden="true" />
        <div className="walk-cap__guide">
          <p className="walk-cap__guide-title">How to walk the stacks</p>
          <ul className="walk-cap__guide-list">
            <li>
              <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd> — walk
            </li>
            <li>
              <kbd>Space</kbd> — jump between floors
            </li>
            <li>Click a book — open it</li>
            <li>Mini-map — jump to a genre</li>
            <li className="walk-cap__guide-touch">Touch: drag to walk, Jump or swipe up</li>
          </ul>
        </div>
      </div>
    </aside>
  );
}

/** Right end of the walk: reading nook / end of the shelves. */
function EndingCap() {
  return (
    <aside className="walk-cap walk-cap--end" aria-label="End of the walk">
      <div className="walk-cap__storey walk-cap__storey--upper" aria-hidden="true">
        <div className="walk-cap__paper walk-cap__paper--loft" />
        <div className="walk-cap__deck" />
      </div>
      <div className="walk-cap__storey walk-cap__storey--ground" aria-hidden="true">
        <div className="walk-cap__paper" />
        <div className="walk-cap__deck" />
      </div>
      <Link
        href="/cozy"
        prefetch={false}
        className="walk-cap__exit"
        aria-label="Bonus: the backrooms. An abandoned 3D version of the library."
      >
        <span className="walk-cap__exit-sign" aria-hidden="true">
          <span>Bonus: the backrooms</span>
        </span>
        <span className="walk-cap__exit-arrow" aria-hidden="true" />
        <span className="walk-cap__exit-door" aria-hidden="true" />
      </Link>
    </aside>
  );
}

const LevelBay = memo(function LevelBay({
  bay,
  calm,
  display,
  before,
  after,
}: {
  bay: WalkBay;
  calm: boolean;
  display: DisplayMode;
  /** Themes of the bays either side on this floor, so the edges can blend into them. */
  before?: SectionTheme;
  after?: SectionTheme;
}) {
  const caseW = caseWidthRem(bay);
  const style = {
    "--sec-sky": bay.theme.sky,
    "--sec-wall": bay.theme.wall,
    "--sec-wall-deep": bay.theme.wallDeep,
    "--sec-floor": bay.theme.floor,
    "--sec-floor-deep": bay.theme.floorDeep,
    "--sec-accent": bay.theme.accent,
    "--sec-light": bay.theme.light,
    "--prev-sky": (before ?? bay.theme).sky,
    "--prev-wall": (before ?? bay.theme).wall,
    "--prev-floor": (before ?? bay.theme).floor,
    "--next-sky": (after ?? bay.theme).sky,
    "--next-wall": (after ?? bay.theme).wall,
    "--next-floor": (after ?? bay.theme).floor,
    ...(caseW > 0
      ? {
          "--walk-case-width": `${caseW}rem`,
          "--walk-prop-left": `${caseW + 2.75}rem`,
        }
      : null),
  } as CSSProperties;

  const multi = bay.shelfRows.length > 1;
  const showLadder = bay.paired && !bay.empty;

  return (
    <section
      className={`walk-bay walk-bay--${bay.floor === 1 ? "upper" : "ground"} walk-bay--${bay.kit} walk-t-${bay.theme.id}${bay.empty ? " walk-bay--empty" : ""}${multi ? " walk-bay--multi" : ""}${bay.paired ? " walk-bay--paired" : ""}${display === "covers" ? " walk-bay--covers" : ""}${bay.shelfRows.length >= 3 ? " walk-bay--triple" : ""}`}
      data-section-id={bay.id}
      data-floor={bay.floor}
      data-shelf-rows={bay.shelfRows.length}
      aria-label={
        bay.empty ? `${bay.label}` : `${bay.label}, ${bay.books.length} books`
      }
      style={style}
    >
      <div className="walk-bay__wall" aria-hidden="true">
        <div className="walk-bay__paper" />
        <div className="walk-bay__pattern" />
        <div className="walk-bay__trim" />
        <div className="walk-bay__glow" />
        {!calm && !bay.empty && <div className="walk-bay__motes" />}
        <WallWindow bay={bay} />
      </div>

      <div className="walk-bay__deck" aria-hidden="true" />
      <WallWindowPatch bay={bay} />

      <div className="walk-sign" aria-hidden="true">
        <span>{bay.label}</span>
      </div>
      <h3 className="walk-sr-only">{bay.label}</h3>

      {!bay.empty && (
        <>
          {bay.table ? (
            <SectionTable />
          ) : (
            <SectionShelves kit={bay.kit} rows={bay.shelfRows.length} display={display} />
          )}
          <ThemeDecor bay={bay} />
          {showLadder && <LibraryLadder />}
          <div
            className={`walk-rails${bay.table ? " walk-rails--table" : ""}`}
            data-rows={bay.shelfRows.length}
          >
            {bay.shelfRows.map((row, rowIndex) => (
              <div
                key={`${bay.id}-row-${rowIndex}`}
                className="walk-rail"
                aria-label={
                  bay.shelfRows.length > 1
                    ? `${bay.label} shelf ${bay.shelfRows.length - rowIndex}`
                    : undefined
                }
              >
                {row.map((item, itemIndex) => (
                  <ShelfItemView
                    key={itemKey(item)}
                    item={item}
                    last={itemIndex === row.length - 1}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
});

function LibraryLadder() {
  const rungs = [12, 28, 44, 60, 76];
  return (
    <div className="walk-ladder" aria-hidden="true">
      <span className="walk-ladder__rail walk-ladder__rail--l" />
      <span className="walk-ladder__rail walk-ladder__rail--r" />
      {rungs.map((top) => (
        <span
          key={top}
          className="walk-ladder__rung"
          style={{ top: `${top}%` }}
        />
      ))}
    </div>
  );
}

function SectionShelves({
  kit,
  rows,
  display,
}: {
  kit: DecorKit;
  rows: number;
  display: DisplayMode;
}) {
  const kitIsTall = kit === "tall-hearth" || kit === "ladder-desk" || kit === "mezzanine";
  // One row of covers fits the low cabinet; tall cabinets stay for spines and double rows.
  const tall = rows > 1 || (kitIsTall && display === "spines");
  const boards = Math.max(rows + 1, tall && kitIsTall ? 3 : 2);
  const shape =
    rows >= 3
      ? "walk-case--triple"
      : `${tall ? " walk-case--tall" : " walk-case--low"}${rows > 1 ? " walk-case--multi" : ""}`;
  return (
    <div className={`walk-case ${shape}`} aria-hidden="true">
      {Array.from({ length: boards }, (_, i) => (
        <div key={i} className="walk-case__board" />
      ))}
    </div>
  );
}

/** A small display table: books stand on its top instead of in a cabinet. */
function SectionTable() {
  return (
    <div className="walk-table" aria-hidden="true">
      <span className="walk-table__top" />
      <span className="walk-table__leg walk-table__leg--l" />
      <span className="walk-table__leg walk-table__leg--r" />
    </div>
  );
}

