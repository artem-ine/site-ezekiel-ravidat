import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { groupIntoWings } from "@/components/library2d/wings";
import {
  decorKitForIndex,
  themeForLabel,
  type DecorKit,
  type SectionTheme,
} from "@/components/library2d/sectionTheme";
import { hash, spineWidthRem } from "@/lib/spine-style";

export type FloorLevel = 0 | 1;

/** Soft cap on how wide a genre column can grow before spilling to more rows/floors. */
export const BAY_MAX_WIDTH_REM = 44;
/** Minimum bay width (rem); small subgenres get a snug column instead of a wide empty one. */
export const BAY_MIN_WIDTH_REM = 22;
/**
 * Horizontal chrome around the book rail inside a bay:
 * case side frames + bay padding + rail inset.
 */
export const BAY_CHROME_REM = 3.5;
/** Wood frame on each side of the book row inside the cabinet. */
export const CASE_SIDE_PAD_REM = 0.55;
/** Extra bay width reserved for a decorative ladder when the loft has books. */
export const LADDER_SPACE_REM = 2.4;
/** Floor beside every cabinet where the genre's furniture stands. */
export const DECOR_GUTTER_REM = 5.5;

/** How books sit on the shelves: standing spines, or every cover facing out. */
export type DisplayMode = "spines" | "covers";

/** A book shown cover-out is a fixed 2:3 block. */
export const FACE_WIDTH_REM = 3.2;
export const FACE_HEIGHT_REM = 4.8;
/** Covers mode: every book faces out at this size. */
export const COVER_WIDTH_REM = 3.6;
export const COVER_HEIGHT_REM = 5.4;
const COVER_GAPS_REM = [0.2, 0.3, 0.45, 0.6] as const;
/** A shelf needs at least this many books; fewer go on a display table instead. */
export const SHELF_MIN_BOOKS = 3;
/**
 * Rows per cabinet, repeating along the walk so neighbouring cabinets differ in height.
 * Spines are tall, so they stay at two rows at most.
 */
const COVER_ROW_PATTERN = [3, 2, 3, 1, 2] as const;
const SPINE_ROW_PATTERN = [2, 1, 2] as const;
/** Series longer than this stand together as a tight set instead of stacking. */
const STACK_MAX_SERIES = 6;
const STACK_MAX_HIGH = 3;
/** Sideways wobble inside a stack so piles don't look machine-aligned. */
const STACK_JITTER_REM = 0.3;
/** One in this many eligible single books faces out. */
const FACE_ONE_IN = 9;
/** Books within a series set sit nearly touching. */
const SET_GAP_REM = 0.04;
const LOOSE_GAPS_REM = [0.06, 0.12, 0.2, 0.3, 0.46] as const;
/** An occasional wide breath between books. */
const BREATH_GAP_REM = 0.8;

export type StackPiece = {
  book: LibraryBook;
  lengthRem: number;
  thicknessRem: number;
  /** Left offset inside the stack, 0..STACK_JITTER_REM. */
  offsetRem: number;
};

/** One thing on a shelf: a standing spine, a cover-out book, or a flat pile. */
export type ShelfItem =
  | { kind: "stand"; book: LibraryBook; widthRem: number; gapRem: number }
  | { kind: "face"; book: LibraryBook; widthRem: number; heightRem: number; gapRem: number }
  | { kind: "stack"; pieces: StackPiece[]; widthRem: number; gapRem: number };

export type WalkBay = {
  id: string;
  label: string;
  /** Flat list of all books on this bay (all shelf rows). */
  books: LibraryBook[];
  /**
   * Each entry is one nowrap shelf rail — never overlaps. Rails stack from the
   * bottom up, so this is bottom row first; reading order (A to Z) runs top to bottom.
   */
  shelfRows: ShelfItem[][];
  theme: SectionTheme;
  kit: DecorKit;
  floor: FloorLevel;
  /** Shared column — both levels always share the same slot count. */
  slot: number;
  empty: boolean;
  /** The other floor of this column has books too, so a ladder links them. */
  paired: boolean;
  /** A small display table of books rather than a shelf. */
  table: boolean;
  /** Top-level genre (wing) this bay belongs to. */
  parent: string;
  /** First column of its wing: the wing gate stands just before it. */
  wingStart: boolean;
};

export type WingInfo = {
  id: string;
  label: string;
  /** Slot of the wing's first column. */
  startSlot: number;
  sections: number;
  books: number;
};

export type FloorPlan = {
  bays: WalkBay[];
  slots: number;
  wings: WingInfo[];
};

export type WalkColumn = {
  slot: number;
  ground: WalkBay;
  upper: WalkBay;
  parent: string;
  wingStart: boolean;
};

export function itemBooks(item: ShelfItem): LibraryBook[] {
  return item.kind === "stack" ? item.pieces.map((piece) => piece.book) : [item.book];
}

export function itemKey(item: ShelfItem): string {
  return item.kind === "stack" ? `stack-${item.pieces[0]!.book.uid}` : item.book.uid;
}

function looseGapRem(seed: string): number {
  const h = hash(seed);
  if (h % 11 === 0) return BREATH_GAP_REM;
  return LOOSE_GAPS_REM[(h >>> 3) % LOOSE_GAPS_REM.length]!;
}

function standItem(book: LibraryBook, gapRem: number): ShelfItem {
  return { kind: "stand", book, widthRem: spineWidthRem(book), gapRem };
}

function stackItem(books: LibraryBook[], seed: string): ShelfItem {
  const pieces: StackPiece[] = books.map((book) => {
    const h = hash(book.uid);
    return {
      book,
      lengthRem: 5.2 + (h % 6) * 0.22,
      thicknessRem: 0.5 + spineWidthRem(book) * 0.26,
      offsetRem: ((h >>> 4) % 7) * (STACK_JITTER_REM / 6),
    };
  });
  const widthRem = Math.max(...pieces.map((piece) => piece.offsetRem + piece.lengthRem));
  return { kind: "stack", pieces, widthRem, gapRem: looseGapRem(seed) + 0.15 };
}

/** Split a series of `n` into piles of at most STACK_MAX_HIGH, never leaving a lone book. */
function stackSizes(n: number): number[] {
  if (n <= STACK_MAX_HIGH) return [n];
  const sizes: number[] = [];
  let left = n;
  while (left > 0) {
    if (left === STACK_MAX_HIGH + 1) {
      sizes.push(2, 2);
      break;
    }
    const take = Math.min(STACK_MAX_HIGH, left);
    sizes.push(take);
    left -= take;
  }
  return sizes;
}

type Unit = { series: string | null; books: LibraryBook[] };

/** Keep alphabetical order, but gather each series (by position) where it first appears. */
function groupSeriesUnits(books: LibraryBook[]): Unit[] {
  const members = new Map<string, LibraryBook[]>();
  for (const book of books) {
    if (!book.series) continue;
    const list = members.get(book.series) ?? [];
    list.push(book);
    members.set(book.series, list);
  }

  const units: Unit[] = [];
  const placed = new Set<string>();
  for (const book of books) {
    const series = book.series;
    const list = series ? members.get(series) : undefined;
    if (!series || !list || list.length < 2) {
      units.push({ series: null, books: [book] });
      continue;
    }
    if (placed.has(series)) continue;
    placed.add(series);
    units.push({
      series,
      books: [...list].sort(
        (a, b) =>
          (a.seriesPosition ?? 999) - (b.seriesPosition ?? 999) ||
          a.title.localeCompare(b.title),
      ),
    });
  }
  return units;
}

/**
 * Turn a genre's books into shelf items: series become flat piles or tight
 * standing sets, a few single books face out, and gaps vary book to book.
 * Deterministic — the same books always shelve the same way.
 */
export function buildShelfItems(books: LibraryBook[], allowFace: boolean): ShelfItem[] {
  const items: ShelfItem[] = [];

  for (const unit of groupSeriesUnits(books)) {
    if (unit.series) {
      const h = hash(unit.series);
      const stacked = unit.books.length <= STACK_MAX_SERIES && h % 3 !== 0;
      if (stacked) {
        let from = 0;
        for (const size of stackSizes(unit.books.length)) {
          items.push(stackItem(unit.books.slice(from, from + size), `${unit.series}-${from}`));
          from += size;
        }
      } else {
        unit.books.forEach((book, index) => {
          const last = index === unit.books.length - 1;
          items.push(standItem(book, last ? looseGapRem(unit.series!) + 0.15 : SET_GAP_REM));
        });
      }
      continue;
    }

    const book = unit.books[0]!;
    const previous = items[items.length - 1];
    const canFace =
      allowFace &&
      !!book.coverUrl &&
      previous?.kind !== "face" &&
      hash(book.uid) % FACE_ONE_IN === 0;

    if (canFace) {
      items.push({
        kind: "face",
        book,
        widthRem: FACE_WIDTH_REM,
        heightRem: FACE_HEIGHT_REM,
        gapRem: looseGapRem(book.uid) + 0.1,
      });
    } else {
      items.push(standItem(book, looseGapRem(book.uid)));
    }
  }

  return items;
}

/** Sum of item widths plus the gaps between them (no trailing gap). */
export function itemsWidthRem(items: ShelfItem[]): number {
  let width = 0;
  items.forEach((item, index) => {
    width += item.widthRem;
    if (index < items.length - 1) width += item.gapRem;
  });
  return width;
}

/** Widest packed row on this bay (inner content, no case chrome). */
export function bayContentWidthRem(bay: WalkBay): number {
  if (bay.empty || bay.shelfRows.length === 0) return 0;
  let widest = 0;
  for (const row of bay.shelfRows) {
    widest = Math.max(widest, itemsWidthRem(row));
  }
  return widest;
}

/**
 * Cabinet width so every row sits fully on the shelf boards.
 * Always >= content + side frames; never smaller than the books.
 */
export function caseWidthRem(bay: WalkBay): number {
  const content = bayContentWidthRem(bay);
  if (content <= 0) return 0;
  return content + CASE_SIDE_PAD_REM * 2;
}

/** How many leading items fit in `maxInnerRem` as a single nowrap row. */
export function fitRowCount(items: ShelfItem[], maxInnerRem: number): number {
  if (items.length === 0) return 0;
  let width = 0;
  let count = 0;
  for (const item of items) {
    const next = count === 0 ? item.widthRem : width + items[count - 1]!.gapRem + item.widthRem;
    if (count > 0 && next > maxInnerRem) break;
    width = next;
    count += 1;
  }
  return Math.max(1, count);
}

/** Pack items into nowrap rows that each fit within maxInnerRem. */
export function packShelfRows(items: ShelfItem[], maxInnerRem: number): ShelfItem[][] {
  const rows: ShelfItem[][] = [];
  let remaining = items;
  while (remaining.length > 0) {
    const n = fitRowCount(remaining, maxInnerRem);
    rows.push(remaining.slice(0, n));
    remaining = remaining.slice(n);
  }
  return rows;
}

/** Every book faces out at one size; series stay together, gaps vary deterministically. */
export function buildCoverItems(books: LibraryBook[]): ShelfItem[] {
  const items: ShelfItem[] = [];
  for (const unit of groupSeriesUnits(books)) {
    unit.books.forEach((book, index) => {
      const h = hash(book.uid);
      const last = index === unit.books.length - 1;
      const loose = h % 13 === 0 ? 1 : COVER_GAPS_REM[(h >>> 3) % COVER_GAPS_REM.length]!;
      items.push({
        kind: "face",
        book,
        widthRem: COVER_WIDTH_REM,
        heightRem: COVER_HEIGHT_REM + ((h >>> 6) % 5 - 2) * 0.12,
        gapRem: unit.series && !last ? 0.12 : loose,
      });
    });
  }
  return items;
}

function shelfItems(books: LibraryBook[], display: DisplayMode): ShelfItem[] {
  return display === "covers" ? buildCoverItems(books) : buildShelfItems(books, false);
}

function bookCount(items: ShelfItem[]): number {
  return items.reduce((total, item) => total + itemBooks(item).length, 0);
}

/** Longest run from the front of `items` that packs into `rows` rows at full width. */
function leadingRun(items: ShelfItem[], rows: number, maxInnerRem: number): number {
  let lo = 1;
  let hi = items.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (packShelfRows(items.slice(0, mid), maxInnerRem).length <= rows) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Rows for `items` at the narrowest width that still keeps them within `rows` rows. */
function narrowestRows(items: ShelfItem[], rows: number, maxInnerRem: number): ShelfItem[][] {
  let lo = 0;
  let hi = maxInnerRem;
  for (let step = 0; step < 16; step += 1) {
    const mid = (lo + hi) / 2;
    if (packShelfRows(items, mid).length <= rows) hi = mid;
    else lo = mid;
  }
  return packShelfRows(items, hi);
}

/**
 * Cut a genre's items into cabinets. Each cabinet takes the rows the pattern asks for
 * and is as narrow as that allows, so a three-row cabinet is tall and short. A
 * cabinet never ends up with fewer than SHELF_MIN_BOOKS by borrowing from the one before.
 */
function groupIntoCabinets(
  items: ShelfItem[],
  pattern: readonly number[],
  offset: number,
  maxInnerRem: number,
): ShelfItem[][][] {
  const groups: { items: ShelfItem[]; rows: number }[] = [];
  let rest = items;
  while (rest.length > 0) {
    const rows = pattern[(offset + groups.length) % pattern.length]!;
    const count = leadingRun(rest, rows, maxInnerRem);
    groups.push({ items: rest.slice(0, count), rows });
    rest = rest.slice(count);
  }
  for (let g = groups.length - 1; g > 0; g -= 1) {
    const group = groups[g]!;
    const before = groups[g - 1]!;
    while (
      bookCount(group.items) < SHELF_MIN_BOOKS &&
      before.items.length > 1 &&
      packShelfRows([before.items[before.items.length - 1]!, ...group.items], maxInnerRem).length <= group.rows
    ) {
      group.items.unshift(before.items.pop()!);
    }
  }
  return groups.map((group) => {
    const books = bookCount(group.items);
    const rows = Math.min(group.rows, Math.max(1, Math.floor(books / SHELF_MIN_BOOKS)));
    return narrowestRows(group.items, rows, maxInnerRem);
  });
}

/** Audiobooks are not shelved on the walk; they stay in the library. */
function isShelved(book: LibraryBook): boolean {
  return book.format !== "audio";
}

type Placement = { parent: string; wingStart: boolean };

function emptyBay(
  floor: FloorLevel,
  slot: number,
  theme: SectionTheme,
  kit: DecorKit,
  place: Placement,
): WalkBay {
  return {
    id: `empty-f${floor}-s${slot}`,
    label: floor === 0 ? "Hall" : "Landing",
    books: [],
    shelfRows: [],
    theme,
    kit,
    floor,
    slot,
    empty: true,
    paired: false,
    table: false,
    ...place,
  };
}

function bayFromRows(
  genre: ShelfGroup,
  floor: FloorLevel,
  slot: number,
  kit: DecorKit,
  rows: ShelfItem[][],
  label: string,
  paired: boolean,
  place: Placement,
  table: boolean,
): WalkBay {
  const books = rows.flat().flatMap(itemBooks);
  return {
    id: `${genre.id}__s${slot}f${floor}`,
    label,
    books,
    shelfRows: [...rows].reverse(),
    theme: themeForLabel(genre.label),
    kit,
    floor,
    slot,
    empty: books.length === 0,
    paired,
    table,
    ...place,
  };
}

type Piece = { shelf: ShelfGroup; rows: ShelfItem[][]; label: string; table: boolean };

function surnameTag(book: LibraryBook): string {
  const letters = book.authorSort.replace(/[^a-z]/g, "").slice(0, 3);
  return letters ? letters[0]!.toUpperCase() + letters.slice(1) : "#";
}

/** "Abe-Dun": which authors a long genre's cabinet covers, so you can find your way. */
function rangeLabel(base: string, rows: ShelfItem[][]): string {
  const books = rows.flat().flatMap(itemBooks);
  const from = surnameTag(books[0]!);
  const to = surnameTag(books[books.length - 1]!);
  return from === to ? `${base} · ${from}` : `${base} · ${from}–${to}`;
}

/**
 * One wing per parent genre (Fiction, Nonfiction, ...). Each subgenre is cut into
 * cabinets of one to three rows, and the wing's cabinets fill columns two at a time,
 * ground floor then loft. Subgenres with fewer than SHELF_MIN_BOOKS get a display
 * table instead of a shelf. Books run A to Z by author and read top to bottom.
 */
export function buildFloorPlan(allBooks: LibraryBook[], display: DisplayMode = "spines"): FloorPlan {
  const books = allBooks.filter(isShelved);
  const wings = groupIntoWings(books);
  const maxInner = BAY_MAX_WIDTH_REM - BAY_CHROME_REM;
  const pattern = display === "covers" ? COVER_ROW_PATTERN : SPINE_ROW_PATTERN;
  const bays: WalkBay[] = [];
  const wingInfo: WingInfo[] = [];
  let slot = 0;
  let variety = 0;

  for (const wing of wings) {
    const pieces: Piece[] = [];

    for (const shelf of wing.shelves) {
      if (shelf.books.length < SHELF_MIN_BOOKS) {
        pieces.push({ shelf, rows: [buildCoverItems(shelf.books)], label: shelf.label, table: true });
        continue;
      }
      const cabinets = groupIntoCabinets(shelfItems(shelf.books, display), pattern, variety, maxInner);
      variety += cabinets.length;
      for (const rows of cabinets) {
        pieces.push({
          shelf,
          rows,
          label: cabinets.length > 1 ? rangeLabel(shelf.label, rows) : shelf.label,
          table: false,
        });
      }
    }

    const startSlot = slot;
    pieces.forEach((piece, index) => {
      const column = startSlot + Math.floor(index / 2);
      const floor: FloorLevel = index % 2 === 0 ? 0 : 1;
      const place: Placement = { parent: wing.label, wingStart: index === 0 };
      const paired = floor === 1 || index + 1 < pieces.length;
      const label = floor === 0 ? piece.label : `${piece.label} · loft`;
      bays.push(
        bayFromRows(
          piece.shelf,
          floor,
          column,
          floor === 0 ? decorKitForIndex(column) : "mezzanine",
          piece.rows,
          label,
          paired,
          place,
          piece.table,
        ),
      );
    });
    slot = startSlot + Math.ceil(pieces.length / 2);

    wingInfo.push({
      id: wing.id,
      label: wing.label,
      startSlot,
      sections: wing.shelves.length,
      books: wing.shelves.reduce((total, shelf) => total + shelf.books.length, 0),
    });
  }

  if (slot === 0) {
    const place = { parent: UNSORTED_FALLBACK, wingStart: true };
    bays.push(
      emptyBay(0, 0, themeForLabel("Hall"), decorKitForIndex(0), place),
      emptyBay(1, 0, themeForLabel("Landing"), "low-nook", place),
    );
    slot = 1;
  }

  return { bays, slots: slot, wings: wingInfo };
}

const UNSORTED_FALLBACK = "Library";

export function baysOnFloor(plan: FloorPlan, floor: FloorLevel): WalkBay[] {
  return plan.bays.filter((bay) => bay.floor === floor).sort((a, b) => a.slot - b.slot);
}

/** Columns for the duplex cross-section (ground + upper paired). */
export function duplexColumns(plan: FloorPlan): WalkColumn[] {
  const columns: WalkColumn[] = [];
  for (let slot = 0; slot < plan.slots; slot += 1) {
    const place = { parent: UNSORTED_FALLBACK, wingStart: false };
    const ground =
      plan.bays.find((b) => b.floor === 0 && b.slot === slot) ??
      emptyBay(0, slot, themeForLabel("Hall"), decorKitForIndex(slot), place);
    const upper =
      plan.bays.find((b) => b.floor === 1 && b.slot === slot) ??
      emptyBay(1, slot, ground.theme, "low-nook", place);
    columns.push({
      slot,
      ground,
      upper,
      parent: ground.parent,
      wingStart: ground.wingStart,
    });
  }
  return columns;
}

/**
 * Width needed so every shelf row sits in a single line (no wrap),
 * including case chrome and optional ladder space for loft pairs.
 */
export function bayRailWidthRem(bay: WalkBay): number {
  if (bay.empty || bay.shelfRows.length === 0) return BAY_MIN_WIDTH_REM;
  const caseW = caseWidthRem(bay);
  const ladder = bay.paired ? LADDER_SPACE_REM : 0;
  // Case + bay padding/margins; ladder sits beside the cabinet.
  const needed = caseW + (BAY_CHROME_REM - CASE_SIDE_PAD_REM * 2) + ladder + DECOR_GUTTER_REM;
  return Math.max(BAY_MIN_WIDTH_REM, Math.min(BAY_MAX_WIDTH_REM + ladder + DECOR_GUTTER_REM, needed));
}

/** Column width: wide enough for the fuller of ground / upper rails. */
export function columnWidthRem(column: WalkColumn): number {
  return Math.max(bayRailWidthRem(column.ground), bayRailWidthRem(column.upper));
}
