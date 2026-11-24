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
import {
  BAY_SPACING,
  nearbyBooksFromShelves,
  NEAR_RADIUS,
  statusMark,
} from "@/components/room/roomConfig";
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
  const [calm, setCalm] = useState(false);

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
  const [webglOk, setWebglOk] = useState(true);
  const [sort, setSort] = useState<SortKey>("title");
  const [filters, setFilters] = useState<Filters>({
    status: "all",
    genre: "all",
    yearRead: "all",
    series: "all",
  });
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [depth, setDepth] = useState(0);
  const dragRef = useRef<{ y: number; depth: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWebglOk(canCreateWebGL());
  }, []);

  const options = useMemo(() => collectFilterOptions(books), [books]);
  const filtered = useMemo(() => applyFilters(books, filters), [books, filters]);
  const shelves = useMemo(() => groupIntoShelves(filtered, sort), [filtered, sort]);
  const currentlyReading = useMemo(
    () => books.filter((book) => book.readStatus === "currently-reading"),
    [books],
  );

  const maxDepth = Math.max(0, shelves.length - 1);
  const clampWalk = useCallback(
    (next: number) => Math.min(maxDepth, Math.max(0, next)),
    [maxDepth],
  );
  const walkBy = useCallback(
    (delta: number) => setDepth((current) => clampWalk(current + delta)),
    [clampWalk],
  );

  useEffect(() => {
    setDepth((current) => clampWalk(current));
  }, [maxDepth, clampWalk]);

  useEffect(() => {
    if (calm) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      }
      if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
        event.preventDefault();
        walkBy(-0.35);
      } else if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
        event.preventDefault();
        walkBy(0.35);
      } else if (event.key === "Home") {
        event.preventDefault();
        setDepth(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setDepth(maxDepth);
      } else if (event.key === "Escape") {
        setCatalogueOpen(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [calm, walkBy, maxDepth]);

  useEffect(() => {
    if (calm) return;
    const node = viewportRef.current;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      walkBy(event.deltaY * 0.004);
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [calm, walkBy]);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (calm) return;
    if ((event.target as HTMLElement).closest("a, button, select, label, summary")) return;
    dragRef.current = { y: event.clientY, depth };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const delta = (dragRef.current.y - event.clientY) / 180;
    setDepth(clampWalk(dragRef.current.depth + delta));
  };

  const onPointerUp = () => {
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

  const active = shelves[Math.round(depth)];
  const nearbyBooks = nearbyBooksFromShelves(shelves, depth);

  return (
    <RoomErrorBoundary fallback={calmView}>
      <div className="room" aria-label="Library room">
        <p className="room-sr-only">
          Three-dimensional library aisle. Use W and S or the arrow keys to walk. Open the card
          catalogue for filters. Nearby books are listed as links below for screen readers.
        </p>

        <nav className="room-sr-only" aria-label="Books near you in the aisle">
          <ul>
            {nearbyBooks.map((book) => {
              const authors = book.authors.join(", ") || "Unknown author";
              const status = book.readStatus ? STATUS_LABEL[book.readStatus] : "Status unknown";
              return (
                <li key={book.uid}>
                  <Link href={`/books/${book.uid}`}>
                    {book.title}, by {authors}. {status}. Mark {statusMark(book)}.
                  </Link>
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
          aria-label="Walkable library aisle"
        >
          <RoomCanvas shelves={shelves} depth={depth} />
        </div>

        <aside className="room-plate" aria-label="Library nameplate">
          <p className="label">Library of</p>
          <p className="room-plate__name">
            Ezekiel <em>Ravidat</em>
          </p>
        </aside>

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
            {active
              ? `${active.label} · ${Math.round(depth) + 1}/${shelves.length}`
              : "Aisle"}
          </p>
          <p className="room-hud__hint label">Scroll · drag · W/S</p>
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

        <span className="room-sr-only">
          Bay spacing {BAY_SPACING}m, near radius {NEAR_RADIUS}.
        </span>
      </div>
    </RoomErrorBoundary>
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
