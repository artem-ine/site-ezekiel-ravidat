import type { LibraryBook } from "@/lib/books";
import { groupIntoShelves, type ShelfGroup } from "@/components/library/groupBooks";
import {
  decorKitForIndex,
  themeForLabel,
  type DecorKit,
  type SectionTheme,
} from "@/components/library2d/sectionTheme";

/** Books on the ground shelves before overflow goes to a ladder loft. */
export const BAY_CAPACITY = 14;
/** Genres beyond this move to the upper floor (jump), not a loft. */
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
  /** Shared column index — both floors always have the same slot count. */
  slot: number;
  partnerId: string | null;
  /** How this bay is reached / left vertically. */
  access: "ground" | "ladder" | "jump" | "empty";
  /** Solid empty pad so floors stay the same length. */
  empty: boolean;
};

export type FloorPlan = {
  bays: WalkBay[];
  floors: FloorLevel[];
  /** Total columns — identical on every floor. */
  slots: number;
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
    partnerId: null,
    access: "empty",
    empty: true,
  };
}

function genreBay(
  genre: ShelfGroup,
  floor: FloorLevel,
  slot: number,
  access: WalkBay["access"],
  partnerId: string | null,
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
    partnerId,
    access,
    empty: false,
  };
}

export function buildFloorPlan(books: LibraryBook[]): FloorPlan {
  let genres = groupIntoShelves(books, "genre");
  if (genres.length === 0) genres = groupIntoShelves(books, "title");

  const groundGenres =
    genres.length > GROUND_GENRE_CAP ? genres.slice(0, GROUND_GENRE_CAP) : [...genres];
  const upperOnly =
    genres.length > GROUND_GENRE_CAP ? genres.slice(GROUND_GENRE_CAP) : [];

  // Columns = max(ground genres, upper-only genres). Both floors get every column.
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
      const groundId = `${groundGenre.id}__f0`;
      const loftId = `${groundGenre.id}__f1`;

      if (overflow) {
        bays.push(
          genreBay(groundGenre, 0, slot, "ladder", loftId, kit, groundBooks),
        );
        bays.push(
          genreBay(
            groundGenre,
            1,
            slot,
            "ladder",
            groundId,
            "mezzanine",
            loftBooks,
            `${groundGenre.label} · loft`,
          ),
        );
      } else if (upperIdx < upperOnly.length) {
        const upper = upperOnly[upperIdx++];
        const upperId = `${upper.id}__f1`;
        bays.push(
          genreBay(groundGenre, 0, slot, "jump", upperId, kit, groundBooks),
        );
        bays.push(
          genreBay(
            upper,
            1,
            slot,
            "jump",
            groundId,
            decorKitForIndex(slot + 3),
            upper.books.slice(0, BAY_CAPACITY + 4),
          ),
        );
      } else {
        bays.push(
          genreBay(groundGenre, 0, slot, "ground", null, kit, groundBooks),
        );
        bays.push(emptyBay(1, slot, themeForLabel(groundGenre.label), "low-nook"));
      }
    } else {
      // No ground genre for this column — pad ground, put upper-only genre above.
      const upper = upperOnly[upperIdx++];
      const theme = themeForLabel(upper.label);
      const groundId = `empty-f0-s${slot}`;
      const upperId = `${upper.id}__f1`;
      const pad = emptyBay(0, slot, theme, kit);
      pad.id = groundId;
      pad.partnerId = upperId;
      pad.access = "jump";
      bays.push(pad);
      bays.push(
        genreBay(
          upper,
          1,
          slot,
          "jump",
          groundId,
          decorKitForIndex(slot + 5),
          upper.books.slice(0, BAY_CAPACITY + 4),
        ),
      );
    }
  }

  // Any leftover upper genres: extend BOTH floors with equal new columns.
  while (upperIdx < upperOnly.length) {
    const slot = bays.filter((b) => b.floor === 0).length;
    const upper = upperOnly[upperIdx++];
    const theme = themeForLabel(upper.label);
    const kit = decorKitForIndex(slot);
    const groundId = `empty-f0-s${slot}`;
    const upperId = `${upper.id}__f1`;
    const pad = emptyBay(0, slot, theme, kit);
    pad.id = groundId;
    pad.partnerId = upperId;
    pad.access = "jump";
    bays.push(pad);
    bays.push(
      genreBay(
        upper,
        1,
        slot,
        "jump",
        groundId,
        decorKitForIndex(slot + 5),
        upper.books.slice(0, BAY_CAPACITY + 4),
      ),
    );
  }

  const finalSlots = bays.filter((b) => b.floor === 0).length;
  const hasUpperContent = bays.some((b) => b.floor === 1 && !b.empty);

  return {
    bays,
    floors: hasUpperContent ? [0, 1] : [0],
    slots: finalSlots,
  };
}

export function baysOnFloor(plan: FloorPlan, floor: FloorLevel): WalkBay[] {
  return plan.bays.filter((bay) => bay.floor === floor).sort((a, b) => a.slot - b.slot);
}
