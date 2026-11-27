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
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import Link from "next/link";
import type { LibraryBook } from "@/lib/books";
import { PixelSprite } from "@/components/library2d/PixelSprite";
import { ShelfItemView } from "@/components/library2d/ShelfItemView";
import { CAT_SPRITE, DOG_SPRITE } from "@/components/library2d/petSprites";
import { shortTitle, spineCloth } from "@/lib/spine-style";
import { Interlude } from "@/components/library2d/Interlude";
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

const DRAG_THRESHOLD_PX = 6;
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
  const dragRef = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
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
  const interludeIndex = useMemo(() => {
    const index = new Map<string, number>();
    for (const column of columns) {
      if (column.interludeUpper) index.set(`${column.slot}-upper`, index.size);
      if (column.interludeGround) index.set(`${column.slot}-ground`, index.size);
    }
    return index;
  }, [columns]);
  const stats = useMemo(() => readingStats(books), [books]);
  const reading = useMemo(
    () => books.filter((book) => book.readStatus === "currently-reading").slice(0, READING_SHOWN),
    [books],
  );
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
    suppressClickRef.current = false;
    dragRef.current = { id: event.pointerId, x: event.clientX, left: el.scrollLeft, moved: false };
    swipeYRef.current = event.clientY;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = scrollerRef.current;
    if (!drag || drag.id !== event.pointerId || !el) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      el.setPointerCapture(event.pointerId);
      el.classList.add("is-dragging");
    }
    el.scrollLeft = drag.left - dx;
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    el.scrollLeft += event.deltaY;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== event.pointerId) return;
    const startY = swipeYRef.current;
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    swipeYRef.current = null;
    suppressClickRef.current = moved;
    scrollerRef.current?.classList.remove("is-dragging");
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
        onClickCapture={onClickCapture}
        onWheel={onWheel}
        onDragStart={(event) => event.preventDefault()}
      >
        <div className="walk-scene">
          <div className="walk-layer walk-layer--parallax" aria-hidden="true">
            <div className="walk-skywash" />
          </div>

          <div className="walk-layer walk-layer--shelves">
            <EntranceCap reading={reading} stats={stats} />
            {columns.map((column) => (
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
                  <div className="walk-row walk-row--upper">
                    {column.interludeUpper && (
                      <Interlude index={interludeIndex.get(`${column.slot}-upper`)!} upper />
                    )}
                    <LevelBay bay={column.upper} display={display} />
                  </div>
                  <div className="walk-row walk-row--ground">
                    {column.interludeGround && (
                      <Interlude index={interludeIndex.get(`${column.slot}-ground`)!} upper={false} />
                    )}
                    <LevelBay bay={column.ground} display={display} />
                  </div>
                </div>
              </Fragment>
            ))}
            <div className="walk-fog" aria-hidden="true" />
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

const BUNTING_FLAGS = 48;
const STATS_YEARS_SHOWN = 6;
const READING_SHOWN = 5;
const READING_TILTS = [-3, 2, -1.5, 3, -2];

type StatRow = { label: string; count: number; latest?: boolean };
type StatGroup = { rows: StatRow[]; max: number };
type ReadingStats = { years: StatGroup; formats: StatRow[]; total: number; since: number | null };

const STAT_FORMATS = [
  { label: "Hardback", value: "hardcover" },
  { label: "Paperback", value: "paperback" },
  { label: "Audio", value: "audio" },
] as const;

function statGroup(rows: StatRow[]): StatGroup {
  return { rows, max: Math.max(1, ...rows.map((row) => row.count)) };
}

/** Read books with no year read are counted under this year. */
const UNDATED_READS_YEAR = 2021;

/**
 * Books marked read: per year read (most recent years), per format, and the
 * total across all of them.
 */
function readingStats(books: LibraryBook[]): ReadingStats | null {
  const perYear = new Map<number, number>();
  const perFormat = new Map<string, number>();
  let total = 0;
  for (const book of books) {
    if (book.readStatus !== "read") continue;
    total += 1;
    const year = book.yearRead ?? UNDATED_READS_YEAR;
    perYear.set(year, (perYear.get(year) ?? 0) + 1);
    const format = STAT_FORMATS.find((option) => option.value === book.format)?.label ?? "Other";
    perFormat.set(format, (perFormat.get(format) ?? 0) + 1);
  }
  if (total === 0) return null;

  const years = [...perYear.keys()].sort((a, b) => a - b);
  const yearRows: StatRow[] = years
    .slice(-STATS_YEARS_SHOWN)
    .map((year, index, shown) => ({
      label: String(year),
      count: perYear.get(year)!,
      latest: index === shown.length - 1,
    }));

  const formatRows: StatRow[] = [...STAT_FORMATS.map((option) => option.label), "Other"]
    .map((label) => ({ label, count: perFormat.get(label) ?? 0 }))
    .filter((row) => row.count > 0);

  return {
    years: statGroup(yearRows),
    formats: formatRows,
    total,
    since: years[0] ?? null,
  };
}

/**
 * Left end of the walk. The walker never reaches it, so it is a stage set:
 * a banner and the current reads upstairs, the house cat and dog explaining
 * the controls downstairs.
 */
function EntranceCap({ reading, stats }: { reading: LibraryBook[]; stats: ReadingStats | null }) {
  return (
    <aside className="walk-cap walk-cap--start" aria-label="Library entrance">
      <div className="walk-cap__storey walk-cap__storey--upper">
        <div className="walk-cap__paper walk-cap__paper--loft" aria-hidden="true" />
        <div className="walk-bunting" aria-hidden="true">
          {Array.from({ length: BUNTING_FLAGS }, (_, i) => (
            <span key={i} className="walk-bunting__flag" />
          ))}
        </div>
        <div className="walk-loft">
          <div className="walk-banner">
            <div className="walk-banner__cloth">
              <p className="walk-banner__kicker">Welcome to</p>
              <h1 className="walk-banner__title">
                <span className="walk-banner__owner">Ezekiel&rsquo;s</span>
                <span className="walk-banner__name">Personal Library</span>
              </h1>
              <span className="walk-banner__rule" aria-hidden="true" />
            </div>
          </div>
          {(reading.length > 0 || stats) && (
            <div className="walk-loft__row">
              <section className="walk-board" aria-label="Reading board">
                {reading.length > 0 && <ReadingPane books={reading} />}
                {stats && <StatsNotes stats={stats} />}
              </section>
            </div>
          )}
        </div>
        <div className="walk-cap__deck" aria-hidden="true" />
      </div>
      <div className="walk-cap__storey walk-cap__storey--ground">
        <div className="walk-cap__paper" aria-hidden="true" />
        <ul className="walk-chat" aria-label="How to walk the stacks, explained by the house cat and dog">
          <li className="walk-chat__line walk-chat__line--cat" style={{ "--say": 0 } as CSSProperties}>
            <span className="walk-sr-only">Cat: </span>
            Welcome! Walk with <kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd>.
          </li>
          <li className="walk-chat__line walk-chat__line--dog" style={{ "--say": 1 } as CSSProperties}>
            <span className="walk-sr-only">Dog: </span>
            <kbd>Space</kbd> hops between floors.<span className="walk-chat__woof"> Woof.</span>
          </li>
          <li className="walk-chat__line walk-chat__line--cat" style={{ "--say": 2 } as CSSProperties}>
            <span className="walk-sr-only">Cat: </span>
            Click a book to open it.
          </li>
          <li className="walk-chat__line walk-chat__line--dog" style={{ "--say": 3 } as CSSProperties}>
            <span className="walk-sr-only">Dog: </span>
            The corner map jumps to any genre.
          </li>
          <li className="walk-chat__line walk-chat__line--cat" style={{ "--say": 4 } as CSSProperties}>
            <span className="walk-sr-only">Cat: </span>
            On a phone? Drag to walk, swipe up to jump.
          </li>
        </ul>
        <div className="walk-pets__rug" aria-hidden="true" />
        <PixelSprite sprite={CAT_SPRITE} className="walk-pet walk-pet--cat" />
        <PixelSprite sprite={DOG_SPRITE} className="walk-pet walk-pet--dog" />
        <div className="walk-cap__deck" aria-hidden="true" />
      </div>
    </aside>
  );
}

/** Sticky notes pinned to the cork: books read per year, by format, and the total. */
function StatsNotes({ stats }: { stats: ReadingStats }) {
  return (
    <div className="walk-notes">
      <section className="walk-note walk-note--years" aria-label="Books read per year">
        <p className="walk-note__title">Books read</p>
        <table className="walk-stats__table">
          <caption className="walk-sr-only">Books read per year</caption>
          <tbody>
            {stats.years.rows.map((row) => (
              <StatLine key={row.label} row={row} max={stats.years.max} />
            ))}
          </tbody>
        </table>
      </section>
      <section className="walk-note walk-note--formats" aria-label="Books read by format">
        <p className="walk-note__title">By format</p>
        <ul className="walk-stats__formats">
          {stats.formats.map((row) => (
            <li key={row.label} className={`walk-stats__format walk-stats__format--${row.label.toLowerCase()}`}>
              <span>{row.label}</span>
              <strong>{row.count}</strong>
            </li>
          ))}
        </ul>
      </section>
      <section className="walk-note walk-note--total" aria-label="Total books read">
        <p className="walk-note__total">{stats.total}</p>
        <p className="walk-note__since">{stats.since != null ? `read since ${stats.since}` : "read in total"}</p>
      </section>
    </div>
  );
}

function StatLine({ row, max }: { row: StatRow; max: number }) {
  const className = row.latest ? "is-latest" : undefined;
  return (
    <tr className={className}>
      <th scope="row">{row.label}</th>
      <td className="walk-stats__bar">
        <span aria-hidden="true" style={{ width: `${(row.count / max) * 100}%` }} />
      </td>
      <td className="walk-stats__count">{row.count}</td>
    </tr>
  );
}

/** The books Ezekiel is reading right now, pinned cover-out on the cork. */
function ReadingPane({ books }: { books: LibraryBook[] }) {
  return (
    <section className="walk-board__pane" aria-label="Currently reading">
      <p className="walk-board__label">Currently reading</p>
      <ul className="walk-board__books">
        {books.map((book, index) => {
          const authors = book.authors.join(", ") || "Unknown author";
          return (
            <li
              key={book.uid}
              className="walk-board__item"
              style={{ "--tilt": `${READING_TILTS[index % READING_TILTS.length]}deg` } as CSSProperties}
            >
              <Link
                href={`/books/${book.uid}`}
                className="walk-board__book"
                style={{ backgroundColor: spineCloth(book) }}
                aria-label={`${book.title}, by ${authors}. Currently reading.`}
                title={`${book.title} — ${authors}`}
              >
                {book.coverUrl ? (
                  // Decorative; the link's aria-label carries the title.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="walk-board__cover" src={book.coverUrl} alt="" decoding="async" />
                ) : (
                  <span className="walk-board__fallback">{shortTitle(book.title, 30)}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Right end of the walk: reading nook / end of the shelves. */
function EndingCap() {
  return (
    <aside className="walk-cap walk-cap--end" aria-label="The backrooms">
      <div className="walk-cap__storey walk-cap__storey--upper">
        <div className="walk-cap__paper" aria-hidden="true" />
        <div className="walk-cap__deck" aria-hidden="true" />
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
  display,
}: {
  bay: WalkBay;
  display: DisplayMode;
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
    ...(caseW > 0 ? { "--walk-case-width": `${caseW}rem` } : null),
  } as CSSProperties;

  const multi = bay.shelfRows.length > 1;

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
      </div>

      <div className="walk-bay__deck" aria-hidden="true" />

      {bay.label && (
        <>
          <div className="walk-sign" aria-hidden="true">
            <span>{bay.label}</span>
          </div>
          <h3 className="walk-sr-only">{bay.label}</h3>
        </>
      )}

      {!bay.empty && (
        <>
          {bay.table ? (
            <SectionTable />
          ) : (
            <SectionShelves kit={bay.kit} rows={bay.shelfRows.length} display={display} />
          )}
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

