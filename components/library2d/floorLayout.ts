import type { LibraryBook } from "@/lib/books";
import { groupIntoShelves, type ShelfGroup } from "@/components/library/groupBooks";
import {
  decorKitForIndex,
  themeForLabel,
  type DecorKit,
  type SectionTheme,
} from "@/components/library2d/sectionTheme";

/** Books on the ground shelves before overflow goes to the loft above. */
export const BAY_CAPACITY = 14;
/** Genres beyond this sit on the upper level as stacked rooms. */
export const GROUND_GENRE_CAP = 5;

export type FloorLevel = 0 | 1;

export type WalkBay = {
  id: string;
  label: string;
  books: LibraryBook[];
  piles: LibraryBook[];
  theme: SectionTheme;
  kit: DecorKit;
  floor: FloorLevel;
  /** Shared column — both levels always share the same slot count. */
  slot: number;
  empty: boolean;
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

function splitBooks(books: LibraryBook[]) {
  const piles = books.length > 8 ? books.slice(-4) : [];
  const shelf = piles.length > 0 ? books.slice(0, -piles.length) : books;
  return { shelf, piles };
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
    piles: [],
    theme,
    kit,
    floor,
    slot,
    empty: true,
  };
}

function genreBay(
  genre: ShelfGroup,
  floor: FloorLevel,
  slot: number,
  kit: DecorKit,
  books: LibraryBook[],
  label = genre.label,
): WalkBay {
  const { shelf, piles } = splitBooks(books);
  return {
    id: `${genre.id}__f${floor}`,
    label,
    books: shelf,
    piles,
    theme: themeForLabel(genre.label),
    kit,
    floor,
    slot,
    empty: false,
  };
}

/**
 * Build equal-length duplex columns: ground + upper in every slot.
 * Overflow of the same genre → loft above that column.
 * Extra genres → upper rooms over halls or over ground genres without lofts.
 */
export function buildFloorPlan(books: LibraryBook[]): FloorPlan {
  let genres = groupIntoShelves(books, "genre");
  if (genres.length === 0) genres = groupIntoShelves(books, "title");

  const groundGenres =
    genres.length > GROUND_GENRE_CAP ? genres.slice(0, GROUND_GENRE_CAP) : [...genres];
  const upperOnly =
    genres.length > GROUND_GENRE_CAP ? genres.slice(GROUND_GENRE_CAP) : [];

  const slots = Math.max(groundGenres.length, upperOnly.length, 1);
  const bays: WalkBay[] = [];
  let upperIdx = 0;

  for (let slot = 0; slot < slots; slot += 1) {
    const groundGenre = groundGenres[slot] ?? null;
    const kit = decorKitForIndex(slot);

    if (groundGenre) {
      const overflow = groundGenre.books.length > BAY_CAPACITY;
      const groundBooks = overflow
        ? groundGenre.books.slice(0, BAY_CAPACITY)
        : groundGenre.books;
      const loftBooks = overflow ? groundGenre.books.slice(BAY_CAPACITY) : [];

      bays.push(genreBay(groundGenre, 0, slot, kit, groundBooks));

      if (overflow) {
        bays.push(
          genreBay(
            groundGenre,
            1,
            slot,
            "mezzanine",
            loftBooks,
            `${groundGenre.label} · loft`,
          ),
        );
      } else if (upperIdx < upperOnly.length) {
        const upper = upperOnly[upperIdx++];
        bays.push(
          genreBay(
            upper,
            1,
            slot,
            decorKitForIndex(slot + 3),
            upper.books.slice(0, BAY_CAPACITY + 4),
          ),
        );
      } else {
        bays.push(emptyBay(1, slot, themeForLabel(groundGenre.label), "low-nook"));
      }
    } else {
      const upper = upperOnly[upperIdx++];
      const theme = themeForLabel(upper.label);
      bays.push(emptyBay(0, slot, theme, kit));
      bays.push(
        genreBay(
          upper,
          1,
          slot,
          decorKitForIndex(slot + 5),
          upper.books.slice(0, BAY_CAPACITY + 4),
        ),
      );
    }
  }

  while (upperIdx < upperOnly.length) {
    const slot = bays.filter((b) => b.floor === 0).length;
    const upper = upperOnly[upperIdx++];
    const theme = themeForLabel(upper.label);
    const kit = decorKitForIndex(slot);
    bays.push(emptyBay(0, slot, theme, kit));
    bays.push(
      genreBay(
        upper,
        1,
        slot,
        decorKitForIndex(slot + 5),
        upper.books.slice(0, BAY_CAPACITY + 4),
      ),
    );
  }

  return {
    bays,
    slots: bays.filter((b) => b.floor === 0).length,
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
