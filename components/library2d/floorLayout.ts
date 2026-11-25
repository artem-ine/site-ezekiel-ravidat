import type { LibraryBook } from "@/lib/books";
import { groupIntoShelves, type ShelfGroup } from "@/components/library/groupBooks";
import {
  decorKitForIndex,
  themeForLabel,
  type DecorKit,
  type SectionTheme,
} from "@/components/library2d/sectionTheme";

/** Books that fit on one ground bay before a loft is warranted. */
export const BAY_CAPACITY = 14;
/** Max genre sections on the ground floor before extras move upstairs. */
export const GROUND_GENRE_CAP = 5;

export type FloorLevel = 0 | 1;

export type WalkBay = {
  id: string;
  label: string;
  books: LibraryBook[];
  theme: SectionTheme;
  kit: DecorKit;
  floor: FloorLevel;
  /** Horizontal slot shared with a loft sibling (same scroll target). */
  slot: number;
  /** Linked loft/ground partner id, if any. */
  partnerId: string | null;
  /** How the player reaches this bay from its partner / other floor. */
  access: "ground" | "ladder" | "stairs";
  piles: LibraryBook[];
};

export type FloorPlan = {
  bays: WalkBay[];
  floors: FloorLevel[];
  groundSlots: number;
};

export function buildFloorPlan(books: LibraryBook[]): FloorPlan {
  let genres = groupIntoShelves(books, "genre");
  if (genres.length === 0) genres = groupIntoShelves(books, "title");

  const groundGenres: ShelfGroup[] = [];
  const galleryGenres: ShelfGroup[] = [];

  if (genres.length > GROUND_GENRE_CAP) {
    groundGenres.push(...genres.slice(0, GROUND_GENRE_CAP));
    galleryGenres.push(...genres.slice(GROUND_GENRE_CAP));
  } else {
    groundGenres.push(...genres);
  }

  const bays: WalkBay[] = [];
  let slot = 0;

  for (const [index, genre] of groundGenres.entries()) {
    const theme = themeForLabel(genre.label);
    const kit = decorKitForIndex(index);
    const overflow = genre.books.length > BAY_CAPACITY;
    const groundBooks = overflow ? genre.books.slice(0, BAY_CAPACITY) : genre.books;
    const loftBooks = overflow ? genre.books.slice(BAY_CAPACITY) : [];
    const piles = groundBooks.slice(Math.max(0, groundBooks.length - 5));
    const shelfBooks = groundBooks.slice(0, Math.max(0, groundBooks.length - piles.length));

    const groundId = `${genre.id}__g`;
    const loftId = `${genre.id}__loft`;

    bays.push({
      id: groundId,
      label: genre.label,
      books: shelfBooks.length > 0 ? shelfBooks : groundBooks,
      piles: shelfBooks.length > 0 ? piles : [],
      theme,
      kit,
      floor: 0,
      slot,
      partnerId: overflow ? loftId : null,
      access: "ground",
    });

    if (overflow) {
      bays.push({
        id: loftId,
        label: `${genre.label} · loft`,
        books: loftBooks,
        piles: [],
        theme,
        kit: "mezzanine",
        floor: 1,
        slot,
        partnerId: groundId,
        access: "ladder",
      });
    }

    slot += 1;
  }

  const groundSlots = slot;

  for (const [index, genre] of galleryGenres.entries()) {
    const theme = themeForLabel(genre.label);
    const kit = decorKitForIndex(index + groundGenres.length);
    bays.push({
      id: `${genre.id}__gallery`,
      label: genre.label,
      books: genre.books.slice(0, BAY_CAPACITY),
      piles: genre.books.slice(BAY_CAPACITY, BAY_CAPACITY + 5),
      theme,
      kit,
      floor: 1,
      slot: groundSlots + index,
      partnerId: null,
      access: "stairs",
    });
  }

  const floors: FloorLevel[] = bays.some((b) => b.floor === 1) ? [0, 1] : [0];
  return { bays, floors, groundSlots };
}

export function baysOnFloor(plan: FloorPlan, floor: FloorLevel): WalkBay[] {
  return plan.bays.filter((bay) => bay.floor === floor).sort((a, b) => a.slot - b.slot);
}

/**
 * Floor-1 layout aligned to ground slots: loft bay or a spacer, then gallery bays.
 * Spacers keep ladder lofts above their ground twin when scrolling.
 */
export type Floor1Cell =
  | { kind: "bay"; bay: WalkBay }
  | { kind: "spacer"; slot: number; widthFrom: WalkBay };

export function cellsForFloor1(plan: FloorPlan): Floor1Cell[] {
  const cells: Floor1Cell[] = [];
  for (let slot = 0; slot < plan.groundSlots; slot += 1) {
    const loft = plan.bays.find((b) => b.floor === 1 && b.slot === slot && b.access === "ladder");
    const ground = plan.bays.find((b) => b.floor === 0 && b.slot === slot);
    if (loft) cells.push({ kind: "bay", bay: loft });
    else if (ground) cells.push({ kind: "spacer", slot, widthFrom: ground });
  }
  for (const bay of plan.bays.filter((b) => b.floor === 1 && b.access === "stairs")) {
    cells.push({ kind: "bay", bay });
  }
  return cells;
}
