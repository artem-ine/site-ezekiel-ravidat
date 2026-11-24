"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { LibraryBook, ReadStatus } from "@/lib/books";
import { BookSpine } from "@/components/library/BookSpine";
import {
  applyFilters,
  collectFilterOptions,
  groupIntoShelves,
  type Filters,
  type SortKey,
} from "@/components/library/groupBooks";
import { STATUS_LABEL } from "@/lib/spine-style";
import { clampPitch, statusMark } from "@/components/room/roomConfig";
import {
  buildFloorPlan,
  moveWithCollision,
  nearbyBooks,
  nearestLandmark,
  placeShelves,
  shelfFaceAmount,
  wrapYaw,
  type Landmark,
} from "@/components/room/floorPlan";
import { canCreateWebGL, RoomErrorBoundary } from "@/components/room/RoomErrorBoundary";

const RoomCanvas = dynamic(
  () => import("@/components/room/RoomCanvas").then((mod) => mod.RoomCanvas),
  {
    ssr: false,
    loading: () => <div className="room-loading">Lighting the lamps…</div>,
  },
);

type Props = {
  books: LibraryBook[];
};

const STATUS_OPTIONS: Array<ReadStatus | "all"> = [
  "all",
  "currently-reading",
  "read",
  "not-read",
  "did-not-finish",
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "year-read", label: "Year read" },
  { value: "status", label: "Read status" },
  { value: "series", label: "Series" },
  { value: "genre", label: "Genre" },
];

function useCalmMode() {
  // Start calm until we measure the viewport — avoids a WebGL flash on phones.
  const [calm, setCalm] = useState(true);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 720px)");
    const sync = () => setCalm(motion.matches || narrow.matches);
    sync();
    motion.addEventListener("change", sync);
    narrow.addEventListener("change", sync);
    return () => {
      motion.removeEventListener("change", sync);
      narrow.removeEventListener("change", sync);
    };
  }, []);

  return calm;
}

export function LibraryRoom({ books }: Props) {
  const calm = useCalmMode();
  const [webglOk, setWebglOk] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sort, setSort] = useState<SortKey>("genre");
  const [filters, setFilters] = useState<Filters>({
    status: "all",
    genre: "all",
    yearRead: "all",
    series: "all",
  });
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const plan = useMemo(() => buildFloorPlan(), []);
  const [x, setX] = useState(plan.entrance.x);
  const [z, setZ] = useState(plan.entrance.z);
  const [yaw, setYaw] = useState(plan.entrance.yaw);
  const [pitch, setPitch] = useState(0);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const posRef = useRef({
    x: plan.entrance.x,
    z: plan.entrance.z,
    yaw: plan.entrance.yaw,
    pitch: 0,
    vx: 0,
    vz: 0,
    vyaw: 0,
  });
  const keysRef = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    pitchUp: false,
    pitchDown: false,
  });
  const dragRef = useRef<{
    x: number;
    y: number;
    yaw: number;
    pitch: number;
    active: boolean;
    pointerId: number;
  } | null>(null);
  const skipDragRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWebglOk(canCreateWebGL());
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(motion.matches);
    sync();
    motion.addEventListener("change", sync);
    return () => motion.removeEventListener("change", sync);
  }, []);

  const options = useMemo(() => collectFilterOptions(books), [books]);
  const filtered = useMemo(() => applyFilters(books, filters), [books, filters]);
  const shelves = useMemo(() => groupIntoShelves(filtered, sort), [filtered, sort]);
  const placed = useMemo(() => placeShelves(plan, shelves), [plan, shelves]);
  const currentlyReading = useMemo(
    () => books.filter((book) => book.readStatus === "currently-reading"),
    [books],
  );
  const selectedBook = useMemo(
    () => (selectedUid ? books.find((book) => book.uid === selectedUid) ?? null : null),
    [books, selectedUid],
  );
  const facing = shelfFaceAmount(x, z, yaw, placed);
  const here = nearestLandmark(plan.landmarks, x, z);

  const goTo = useCallback((landmark: Landmark) => {
    setSelectedUid(null);
    setPitch(0);
    setX(landmark.x);
    setZ(landmark.z);
    setYaw(landmark.yaw);
    posRef.current = {
      x: landmark.x,
      z: landmark.z,
      yaw: landmark.yaw,
      pitch: 0,
      vx: 0,
      vz: 0,
      vyaw: 0,
    };
  }, []);

  const goEntrance = useCallback(() => goTo(plan.entrance), [goTo, plan.entrance]);

  // Continuous walk / turn with inertia. Turning never checks collision.
  useEffect(() => {
    if (calm) return;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const keys = keysRef.current;
      const body = posRef.current;

      const wishYaw =
        (keys.left ? 1 : 0) * -2.6 + (keys.right ? 1 : 0) * 2.6;
      body.vyaw += (wishYaw - body.vyaw) * Math.min(1, dt * 10);
      body.yaw = wrapYaw(body.yaw + body.vyaw * dt);

      const wish =
        (keys.forward ? 1 : 0) + (keys.back ? -1 : 0);
      const speed = 3.4;
      const wishX = Math.sin(body.yaw) * wish * speed;
      const wishZ = -Math.cos(body.yaw) * wish * speed;
      body.vx += (wishX - body.vx) * Math.min(1, dt * 8);
      body.vz += (wishZ - body.vz) * Math.min(1, dt * 8);

      if (Math.hypot(body.vx, body.vz) > 0.001) {
        const next = moveWithCollision(
          body.x,
          body.z,
          body.vx * dt,
          body.vz * dt,
          plan.colliders,
        );
        // If we slid, kill the blocked component of velocity.
        if (Math.abs(next.x - body.x) < Math.abs(body.vx * dt) * 0.25) body.vx *= 0.2;
        if (Math.abs(next.z - body.z) < Math.abs(body.vz * dt) * 0.25) body.vz *= 0.2;
        body.x = next.x;
        body.z = next.z;
      }

      if (keys.pitchUp) body.pitch = clampPitch(body.pitch + dt * 1.2);
      if (keys.pitchDown) body.pitch = clampPitch(body.pitch - dt * 1.2);

      setX(body.x);
      setZ(body.z);
      setYaw(body.yaw);
      setPitch(body.pitch);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [calm, plan.colliders]);

  useEffect(() => {
    if (calm) return;

    const setKey = (event: KeyboardEvent, down: boolean) => {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      }
      const keys = keysRef.current;
      if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
        event.preventDefault();
        keys.forward = down;
      } else if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
        event.preventDefault();
        keys.back = down;
      } else if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        event.preventDefault();
        keys.left = down;
      } else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        event.preventDefault();
        keys.right = down;
      } else if (
        event.key === "r" ||
        event.key === "R" ||
        event.key === "q" ||
        event.key === "Q" ||
        event.key === "PageUp"
      ) {
        event.preventDefault();
        keys.pitchUp = down;
      } else if (
        event.key === "f" ||
        event.key === "F" ||
        event.key === "e" ||
        event.key === "E" ||
        event.key === "PageDown"
      ) {
        event.preventDefault();
        keys.pitchDown = down;
      } else if (down && event.key === "Home") {
        event.preventDefault();
        goEntrance();
      } else if (down && event.key === "Escape") {
        event.preventDefault();
        if (selectedUid) {
          setSelectedUid(null);
          return;
        }
        setCatalogueOpen(false);
        posRef.current.pitch = 0;
        setPitch(0);
      }
    };

    const onDown = (event: KeyboardEvent) => setKey(event, true);
    const onUp = (event: KeyboardEvent) => setKey(event, false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [calm, goEntrance, selectedUid]);

  useEffect(() => {
    if (calm) return;
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const body = posRef.current;
      const distance = -event.deltaY * 0.004;
      const next = moveWithCollision(
        body.x,
        body.z,
        Math.sin(body.yaw) * distance,
        -Math.cos(body.yaw) * distance,
        plan.colliders,
      );
      body.x = next.x;
      body.z = next.z;
      body.vx *= 0.5;
      body.vz *= 0.5;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [calm, plan.colliders]);

  const selectBook = useCallback((uid: string | null) => {
    skipDragRef.current = true;
    queueMicrotask(() => {
      skipDragRef.current = false;
    });
    setSelectedUid(uid);
  }, []);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (calm) return;
    if (
      (event.target as HTMLElement).closest(
        "a, button, select, label, summary, .room-book-card, .room-minimap",
      )
    ) {
      return;
    }
    if (
      skipDragRef.current ||
      (event.nativeEvent as PointerEvent & { __roomBookPick?: boolean }).__roomBookPick
    ) {
      return;
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      yaw,
      pitch,
      active: false,
      pointerId: event.pointerId,
    };
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = drag.y - event.clientY;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < 10) return;
      drag.active = true;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      setSelectedUid(null);
    }
    // Turn on X, pitch on Y — neither is blocked by collision.
    const nextYaw = wrapYaw(drag.yaw + dx / 180);
    const nextPitch = clampPitch(drag.pitch + dy / 240);
    posRef.current.yaw = nextYaw;
    posRef.current.vyaw = 0;
    posRef.current.pitch = nextPitch;
    setYaw(nextYaw);
    setPitch(nextPitch);
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (drag?.active) {
      try {
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }
    dragRef.current = null;
  };

  if (books.length === 0) {
    return (
      <p role="status" className="room-empty">
        The room is empty. Publish books in Prismic and refresh.
      </p>
    );
  }

  const calmView = (
    <CalmRoom
      books={filtered}
      total={books.length}
      shelves={shelves}
      currentlyReading={currentlyReading}
      sort={sort}
      setSort={setSort}
      filters={filters}
      setFilters={setFilters}
      options={options}
    />
  );

  if (calm || !webglOk) {
    return calmView;
  }

  const nearbyBookList = nearbyBooks(placed, x, z);
  const sectionLabel = facing.slot?.shelf?.label ?? here?.label ?? "Library";

  return (
    <RoomErrorBoundary fallback={calmView}>
      <div className="room" aria-label="Library room">
        <p className="room-sr-only">
          Branching pixel library. Hold W S or arrows to walk, A D to turn. Scroll also walks. Drag
          vertically or hold R and F to look up and down. Home or the mini-map returns to the
          entrance. Click a book to open it; Escape closes it.
        </p>

        <nav className="room-sr-only" aria-label="Books near you">
          <ul>
            {nearbyBookList.map((book) => {
              const authors = book.authors.join(", ") || "Unknown author";
              const status = book.readStatus ? STATUS_LABEL[book.readStatus] : "Status unknown";
              return (
                <li key={book.uid}>
                  <button type="button" onClick={() => selectBook(book.uid)}>
                    Open {book.title}, by {authors}. {status}. Mark {statusMark(book)}.
                  </button>
                  <Link href={`/books/${book.uid}`}>Full page for {book.title}</Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div
          ref={viewportRef}
          className="room-viewport room-viewport--webgl"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="application"
          aria-label="Walkable library floor plan"
        >
          <RoomCanvas
            plan={plan}
            placed={placed}
            x={x}
            z={z}
            yaw={yaw}
            pitch={pitch}
            selectedUid={selectedUid}
            onSelect={selectBook}
            preferReducedMotion={reducedMotion}
          />
        </div>

        {selectedBook && (
          <div className="room-inspect" role="dialog" aria-label={selectedBook.title}>
            <InspectPanel book={selectedBook} onClose={() => setSelectedUid(null)} />
          </div>
        )}

        <MiniMap plan={plan} x={x} z={z} yaw={yaw} onJump={goTo} onEntrance={goEntrance} />

        <aside className="room-desk" aria-label="Currently reading">
          <p className="label">Reading desk</p>
          {currentlyReading.length === 0 ? (
            <p className="room-desk__empty">Nothing open on the desk.</p>
          ) : (
            <ul className="room-desk__list">
              {currentlyReading.map((book) => (
                <li key={book.uid}>
                  <Link href={`/books/${book.uid}`} className="room-desk__card">
                    {book.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={book.coverUrl} alt="" />
                    ) : (
                      <span className="room-desk__blank" aria-hidden="true" />
                    )}
                    <span>{book.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="room-hud">
          <p className="room-hud__bay label" aria-live="polite">
            {sectionLabel}
            {facing.slot?.shelf ? ` · ${facing.slot.shelf.books.length} vols` : ""}
          </p>
          <p className="room-hud__hint label">WASD walk/turn · R/F or drag pitch · scroll · map</p>
          <button type="button" className="room-catalogue-pull" onClick={goEntrance}>
            Entrance
          </button>
          <button
            type="button"
            className="room-catalogue-pull"
            aria-expanded={catalogueOpen}
            onClick={() => setCatalogueOpen((open) => !open)}
          >
            Card catalogue
          </button>
        </div>

        <CatalogueDrawer
          open={catalogueOpen}
          onClose={() => setCatalogueOpen(false)}
          sort={sort}
          setSort={setSort}
          filters={filters}
          setFilters={setFilters}
          options={options}
          shown={filtered.length}
          total={books.length}
        />
      </div>
    </RoomErrorBoundary>
  );
}

function MiniMap({
  plan,
  x,
  z,
  yaw,
  onJump,
  onEntrance,
}: {
  plan: ReturnType<typeof buildFloorPlan>;
  x: number;
  z: number;
  yaw: number;
  onJump: (landmark: Landmark) => void;
  onEntrance: () => void;
}) {
  const { minX, maxX, minZ, maxZ } = plan.floor;
  const w = maxX - minX;
  const h = maxZ - minZ;
  const toX = (wx: number) => ((wx - minX) / w) * 100;
  const toY = (wz: number) => ((maxZ - wz) / h) * 100;

  return (
    <aside className="room-minimap" aria-label="Floor plan">
      <p className="label">Floor plan</p>
      <svg viewBox="0 0 100 100" role="img" aria-label="Library map">
        {plan.aisles.map((aisle) => (
          <line
            key={aisle.id}
            x1={toX(aisle.from.x)}
            y1={toY(aisle.from.z)}
            x2={toX(aisle.to.x)}
            y2={toY(aisle.to.z)}
            className="room-minimap__aisle"
          />
        ))}
        {plan.landmarks.map((mark) => (
          <circle
            key={mark.id}
            cx={toX(mark.x)}
            cy={toY(mark.z)}
            r={mark.id === "entrance" ? 2.2 : 1.6}
            className="room-minimap__mark"
          />
        ))}
        <g transform={`translate(${toX(x)} ${toY(z)}) rotate(${(yaw * 180) / Math.PI})`}>
          <polygon points="0,-3.2 2.2,2.4 -2.2,2.4" className="room-minimap__you" />
        </g>
      </svg>
      <div className="room-minimap__jumps">
        {plan.landmarks.map((mark) => (
          <button key={mark.id} type="button" onClick={() => onJump(mark)}>
            {mark.label}
          </button>
        ))}
        <button type="button" onClick={onEntrance}>
          Back to entrance
        </button>
      </div>
    </aside>
  );
}

function InspectPanel({ book, onClose }: { book: LibraryBook; onClose: () => void }) {
  const authors = book.authors.join(", ") || "Unknown author";

  return (
    <div className="room-book-card room-book-card--dock">
      <button type="button" className="room-book-card__close" onClick={onClose}>
        Close
      </button>
      <h2>{book.title}</h2>
      {book.subtitle && <p className="room-book-card__sub">{book.subtitle}</p>}
      <p className="room-book-card__by">{authors}</p>
      <dl>
        {book.readStatus && (
          <>
            <dt>Status</dt>
            <dd>{STATUS_LABEL[book.readStatus]}</dd>
          </>
        )}
        {book.genres.length > 0 && (
          <>
            <dt>Genre</dt>
            <dd>{book.genres.map((genre) => genre.name).join(", ")}</dd>
          </>
        )}
        {book.series && (
          <>
            <dt>Series</dt>
            <dd>
              {book.series}
              {book.seriesPosition != null ? ` · ${book.seriesPosition}` : ""}
            </dd>
          </>
        )}
        {book.pageCount != null && (
          <>
            <dt>Pages</dt>
            <dd>{book.pageCount}</dd>
          </>
        )}
        {book.yearRead != null && (
          <>
            <dt>Year read</dt>
            <dd>{book.yearRead}</dd>
          </>
        )}
        {book.publishYear != null && (
          <>
            <dt>Published</dt>
            <dd>{book.publishYear}</dd>
          </>
        )}
      </dl>
      {book.description && <p className="room-book-card__blurb">{book.description}</p>}
      <Link className="room-book-card__link" href={`/books/${book.uid}`}>
        Full page
      </Link>
    </div>
  );
}

type CatalogueProps = {
  open: boolean;
  onClose: () => void;
  sort: SortKey;
  setSort: (sort: SortKey) => void;
  filters: Filters;
  setFilters: (next: Filters | ((current: Filters) => Filters)) => void;
  options: ReturnType<typeof collectFilterOptions>;
  shown: number;
  total: number;
  embedded?: boolean;
};

function CatalogueDrawer({
  open,
  onClose,
  sort,
  setSort,
  filters,
  setFilters,
  options,
  shown,
  total,
  embedded = false,
}: CatalogueProps) {
  return (
    <div
      className={`room-catalogue ${open ? "is-open" : ""} ${embedded ? "is-embedded" : ""}`}
      role={embedded ? "region" : "dialog"}
      aria-label="Card catalogue"
      aria-hidden={embedded ? undefined : !open}
    >
      <div className="room-catalogue__panel">
        <header className="room-catalogue__head">
          <div>
            <p className="label">Card catalogue</p>
            <p className="room-catalogue__count">
              {shown} of {total} volumes
            </p>
          </div>
          {!embedded && (
            <button type="button" className="room-catalogue__close" onClick={onClose}>
              Close
            </button>
          )}
        </header>

        <form className="room-catalogue__grid" onSubmit={(event) => event.preventDefault()}>
          <label>
            <span className="label">Sort aisle</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="label">Status</span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as Filters["status"],
                }))
              }
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All" : STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="label">Year read</span>
            <select
              value={filters.yearRead === "all" ? "all" : String(filters.yearRead)}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  yearRead:
                    event.target.value === "all" ? "all" : Number(event.target.value),
                }))
              }
            >
              <option value="all">All years</option>
              {options.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="label">Genre</span>
            <select
              value={filters.genre}
              disabled={options.genres.length === 0}
              onChange={(event) =>
                setFilters((current) => ({ ...current, genre: event.target.value }))
              }
            >
              <option value="all">
                {options.genres.length === 0 ? "Genres not published yet" : "All genres"}
              </option>
              {options.genres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="label">Series</span>
            <select
              value={filters.series}
              disabled={options.series.length === 0}
              onChange={(event) =>
                setFilters((current) => ({ ...current, series: event.target.value }))
              }
            >
              <option value="all">
                {options.series.length === 0 ? "Series not published yet" : "All series"}
              </option>
              {options.series.map((series) => (
                <option key={series} value={series}>
                  {series}
                </option>
              ))}
            </select>
          </label>
        </form>
      </div>
    </div>
  );
}

type CalmProps = {
  books: LibraryBook[];
  total: number;
  shelves: ReturnType<typeof groupIntoShelves>;
  currentlyReading: LibraryBook[];
  sort: SortKey;
  setSort: (sort: SortKey) => void;
  filters: Filters;
  setFilters: (next: Filters | ((current: Filters) => Filters)) => void;
  options: ReturnType<typeof collectFilterOptions>;
};

function CalmRoom({
  books,
  total,
  shelves,
  currentlyReading,
  sort,
  setSort,
  filters,
  setFilters,
  options,
}: CalmProps) {
  return (
    <div className="room-calm">
      <header className="room-calm__head">
        <p className="label">Library of</p>
        <h1>
          Ezekiel <span className="text-oxblood italic">Ravidat</span>
        </h1>
        <p className="text-ink-soft">
          A quieter view for small screens and reduced motion. The aisle is on a wider display.
        </p>
      </header>

      {currentlyReading.length > 0 && (
        <section className="room-calm__desk" aria-label="Currently reading">
          <p className="label">Reading desk</p>
          <ul>
            {currentlyReading.map((book) => (
              <li key={book.uid}>
                <Link href={`/books/${book.uid}`} className="ink-link">
                  {book.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CatalogueDrawer
        open
        embedded
        onClose={() => undefined}
        sort={sort}
        setSort={setSort}
        filters={filters}
        setFilters={setFilters}
        options={options}
        shown={books.length}
        total={total}
      />

      <div className="room-calm__aisle">
        {shelves.map((shelf) => (
          <section key={shelf.id} className="shelf-bay">
            <header className="shelf-bay__head">
              <h2>{shelf.label}</h2>
              <span className="label">{shelf.books.length}</span>
            </header>
            <div className="shelf-rail">
              {shelf.books.map((book) => (
                <BookSpine key={book.uid} book={book} />
              ))}
            </div>
            <div className="shelf-board" aria-hidden="true" />
          </section>
        ))}
      </div>
    </div>
  );
}
