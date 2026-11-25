import type { LibraryBook } from "@/lib/books";
import { groupIntoShelves, type ShelfGroup } from "@/components/library/groupBooks";
import {
  decorKitForIndex,
  themeForLabel,
  type DecorKit,
  type SectionTheme,
} from "@/components/library2d/sectionTheme";
import { spineWidthRem } from "@/lib/spine-style";

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
const RAIL_GAP_REM = 0.1;

export type WalkBay = {
  id: string;
  label: string;
  /** Flat list of all books on this bay (all shelf rows). */
  books: LibraryBook[];
  /** Each entry is one nowrap shelf rail — never overlaps. */
  shelfRows: LibraryBook[][];
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

/** Sum of spine widths + flex gaps for one nowrap row. */
export function booksWidthRem(books: LibraryBook[]): number {
  if (books.length === 0) return 0;
  let width = 0;
  for (const book of books) {
    width += spineWidthRem(book.pageCount) + RAIL_GAP_REM;
  }
  // flex gap is between items only — drop the trailing gap added above
  return Math.max(0, width - RAIL_GAP_REM);
}

/** Widest packed row on this bay (inner content, no case chrome). */
export function bayContentWidthRem(bay: WalkBay): number {
  if (bay.empty || bay.shelfRows.length === 0) return 0;
  let widest = 0;
  for (const row of bay.shelfRows) {
    widest = Math.max(widest, booksWidthRem(row));
  }
  return widest;
}

/**
 * Cabinet width so every book row sits fully on the shelf boards.
 * Always >= content + side frames; never smaller than the books.
 */
export function caseWidthRem(bay: WalkBay): number {
  const content = bayContentWidthRem(bay);
  if (content <= 0) return 0;
  return content + CASE_SIDE_PAD_REM * 2;
}

/** How many leading books fit in `maxInnerRem` as a single nowrap row. */
export function fitRowCount(books: LibraryBook[], maxInnerRem: number): number {
  if (books.length === 0) return 0;
  let width = 0;
  let count = 0;
  for (const book of books) {
    const spine = spineWidthRem(book.pageCount);
    const next = count === 0 ? spine : width + RAIL_GAP_REM + spine;
    if (count > 0 && next > maxInnerRem) break;
    width = next;
    count += 1;
  }
  return Math.max(1, count);
}

/** Pack books into nowrap rows that each fit within maxInnerRem. */
export function packShelfRows(
  books: LibraryBook[],
  maxInnerRem: number,
): LibraryBook[][] {
  const rows: LibraryBook[][] = [];
  let remaining = books;
  while (remaining.length > 0) {
    const n = fitRowCount(remaining, maxInnerRem);
    rows.push(remaining.slice(0, n));
    remaining = remaining.slice(n);
  }
  return rows;
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
  rows: LibraryBook[][],
  label: string,
  paired: boolean,
): WalkBay {
  const books = rows.flat();
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
 * One column per genre. Pack books by spine width into nowrap rows.
 * First rows sit on the ground; overflow rows go to the upper floor of the
 * same column. If both floors need more than one row, shelves go double-height
 * (multiple rails per level). No piles, no overlapping spines.
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
    const rows = packShelfRows(genre.books, maxInner);

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
