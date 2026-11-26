import type { LibraryBook } from "@/lib/books";
import { groupIntoShelves, type ShelfGroup } from "@/components/library/groupBooks";
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
/** Minimum pleasant bay width (rem). */
export const BAY_MIN_WIDTH_REM = 28;
/**
 * Horizontal chrome around the book rail inside a bay:
 * case side frames + bay padding + rail inset.
 */
export const BAY_CHROME_REM = 3.5;
/** Wood frame on each side of the book row inside the cabinet. */
export const CASE_SIDE_PAD_REM = 0.55;
/** Extra bay width reserved for a decorative ladder when the loft has books. */
export const LADDER_SPACE_REM = 2.4;

/** A book shown cover-out is a fixed 2:3 block. */
export const FACE_WIDTH_REM = 3.2;
export const FACE_HEIGHT_REM = 4.8;
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
  /** Each entry is one nowrap shelf rail — never overlaps. */
  shelfRows: ShelfItem[][];
  theme: SectionTheme;
  kit: DecorKit;
  floor: FloorLevel;
  /** Shared column — both levels always share the same slot count. */
  slot: number;
  empty: boolean;
  /** Same-genre loft partner on the other floor (for labels / minimap). */
  paired: boolean;
};

export type FloorPlan = {
  bays: WalkBay[];
  slots: number;
};

export type WalkColumn = {
  slot: number;
  ground: WalkBay;
  upper: WalkBay;
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
  return { kind: "stand", book, widthRem: spineWidthRem(book.pageCount), gapRem };
}

function stackItem(books: LibraryBook[], seed: string): ShelfItem {
  const pieces: StackPiece[] = books.map((book) => {
    const h = hash(book.uid);
    return {
      book,
      lengthRem: 3 + (h % 6) * 0.18,
      thicknessRem: 0.5 + spineWidthRem(book.pageCount) * 0.26,
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

/**
 * Cover-out books are 4.8rem tall, which only fits single-row bays. When a
 * genre needs more than two rows (so a bay goes double-height), shelve it
 * again without them.
 */
function packGenre(books: LibraryBook[], maxInnerRem: number): ShelfItem[][] {
  const withFaces = packShelfRows(buildShelfItems(books, true), maxInnerRem);
  if (withFaces.length <= 2) return withFaces;
  return packShelfRows(buildShelfItems(books, false), maxInnerRem);
}

function emptyBay(
  floor: FloorLevel,
  slot: number,
  theme: SectionTheme,
  kit: DecorKit,
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
): WalkBay {
  const books = rows.flat().flatMap(itemBooks);
  return {
    id: `${genre.id}__f${floor}${rows.length > 1 ? `-r${rows.length}` : ""}`,
    label,
    books,
    shelfRows: rows,
    theme: themeForLabel(genre.label),
    kit,
    floor,
    slot,
    empty: books.length === 0,
    paired,
  };
}

/**
 * One column per genre. Pack shelf items by width into nowrap rows.
 * First rows sit on the ground; overflow rows go to the upper floor of the
 * same column. If both floors need more than one row, shelves go double-height
 * (multiple rails per level). No piles on the floor, no overlapping items.
 */
export function buildFloorPlan(books: LibraryBook[]): FloorPlan {
  let genres = groupIntoShelves(books, "genre");
  if (genres.length === 0) genres = groupIntoShelves(books, "title");

  const maxInner = BAY_MAX_WIDTH_REM - BAY_CHROME_REM;
  const bays: WalkBay[] = [];
  const slots = Math.max(genres.length, 1);

  for (let slot = 0; slot < slots; slot += 1) {
    const genre = genres[slot];
    if (!genre) {
      bays.push(emptyBay(0, slot, themeForLabel("Hall"), decorKitForIndex(slot)));
      bays.push(emptyBay(1, slot, themeForLabel("Landing"), "low-nook"));
      continue;
    }

    const kit = decorKitForIndex(slot);
    const rows = packGenre(genre.books, maxInner);

    if (rows.length === 0) {
      bays.push(emptyBay(0, slot, themeForLabel(genre.label), kit));
      bays.push(emptyBay(1, slot, themeForLabel(genre.label), "low-nook"));
      continue;
    }

    if (rows.length === 1) {
      // Fits one shelf — ground only; upper is a quiet landing in the same theme.
      bays.push(
        bayFromRows(genre, 0, slot, kit, rows, genre.label, false),
      );
      bays.push(emptyBay(1, slot, themeForLabel(genre.label), "low-nook"));
      continue;
    }

    // Two or more rows: spill upward. Split rows across floors.
    // Odd extra row stays on the ground so the walker meets books first.
    const groundRowCount = Math.ceil(rows.length / 2);
    const groundRows = rows.slice(0, groundRowCount);
    const upperRows = rows.slice(groundRowCount);
    const paired = upperRows.length > 0;

    bays.push(
      bayFromRows(genre, 0, slot, kit, groundRows, genre.label, paired),
    );
    bays.push(
      bayFromRows(
        genre,
        1,
        slot,
        "mezzanine",
        upperRows,
        `${genre.label} · loft`,
        paired,
      ),
    );
  }

  return {
    bays,
    slots: bays.filter((bay) => bay.floor === 0).length,
  };
}

export function baysOnFloor(plan: FloorPlan, floor: FloorLevel): WalkBay[] {
  return plan.bays.filter((bay) => bay.floor === floor).sort((a, b) => a.slot - b.slot);
}

/** Columns for the duplex cross-section (ground + upper paired). */
export function duplexColumns(plan: FloorPlan): WalkColumn[] {
  const columns: WalkColumn[] = [];
  for (let slot = 0; slot < plan.slots; slot += 1) {
    const ground =
      plan.bays.find((b) => b.floor === 0 && b.slot === slot) ??
      emptyBay(0, slot, themeForLabel("Hall"), decorKitForIndex(slot));
    const upper =
      plan.bays.find((b) => b.floor === 1 && b.slot === slot) ??
      emptyBay(1, slot, ground.theme, "low-nook");
    columns.push({ slot, ground, upper });
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
  const needed = caseW + (BAY_CHROME_REM - CASE_SIDE_PAD_REM * 2) + ladder;
  return Math.max(BAY_MIN_WIDTH_REM, Math.min(BAY_MAX_WIDTH_REM + ladder, needed));
}

/** Column width: wide enough for the fuller of ground / upper rails. */
export function columnWidthRem(column: WalkColumn): number {
  return Math.max(bayRailWidthRem(column.ground), bayRailWidthRem(column.upper));
}
