"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { LibraryBook, ReadStatus } from "@/lib/books";
import { STATUS_LABEL } from "@/lib/spine-style";
import { BookSpine } from "@/components/library/BookSpine";
import {
  applyFilters,
  collectFilterOptions,
  groupIntoShelves,
  type Filters,
  type SortKey,
} from "@/components/library/groupBooks";

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

export function Library({ books }: Props) {
  const [sort, setSort] = useState<SortKey>("title");
  const [filters, setFilters] = useState<Filters>({
    status: "all",
    genre: "all",
    yearRead: "all",
    series: "all",
  });

  const options = useMemo(() => collectFilterOptions(books), [books]);
  const filtered = useMemo(() => applyFilters(books, filters), [books, filters]);
  const shelves = useMemo(() => groupIntoShelves(filtered, sort), [filtered, sort]);

  if (books.length === 0) {
    return (
      <p role="status" className="rounded-sm border border-brass/40 bg-paper-deep/40 px-4 py-6 text-ink-soft">
        No books on the shelves yet. Publish the catalogue in Prismic, or set{" "}
        <code className="font-mono text-sm">PRISMIC_RELEASE_LABEL</code> in{" "}
        <code className="font-mono text-sm">.env.local</code> while developing against a Migration
        Release.
      </p>
    );
  }

  return (
    <div className="library">
      <form
        className="library-controls"
        onSubmit={(event) => event.preventDefault()}
        aria-label="Browse the library"
      >
        <label className="library-field">
          <span className="label">Sort shelves</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="library-field">
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

        <label className="library-field">
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

        <label className="library-field">
          <span className="label">Genre</span>
          <select
            value={filters.genre}
            onChange={(event) =>
              setFilters((current) => ({ ...current, genre: event.target.value }))
            }
            disabled={options.genres.length === 0}
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

        <label className="library-field">
          <span className="label">Series</span>
          <select
            value={filters.series}
            onChange={(event) =>
              setFilters((current) => ({ ...current, series: event.target.value }))
            }
            disabled={options.series.length === 0}
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

      <p className="library-count label" aria-live="polite">
        {filtered.length} of {books.length} volumes
      </p>

      {shelves.length === 0 ? (
        <p role="status" className="text-ink-soft">
          Nothing matches these filters. Ease a constraint and the bay will refill.
        </p>
      ) : (
        <div className="library-aisle">
          {shelves.map((shelf, index) => (
            <section
              key={shelf.id}
              className="shelf-bay"
              style={{ "--shelf-delay": `${Math.min(index, 8) * 40}ms` } as CSSProperties}
              aria-label={`${shelf.label}, ${shelf.books.length} books`}
            >
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
      )}
    </div>
  );
}
