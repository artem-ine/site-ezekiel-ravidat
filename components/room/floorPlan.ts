import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { MAX_SPINES_PER_SIDE } from "@/components/room/roomConfig";

export type Vec2 = { x: number; z: number };

export type AisleId =
  | "main"
  | "west"
  | "east"
  | "north"
  | "loop-w"
  | "loop-e"
  | "desk"
  | "back";

export type ShelfSlot = {
  id: string;
  aisleId: AisleId;
  /** World centre of the bookcase. */
  x: number;
  z: number;
  /** 0 = faces +X (aisle to the right of case), π = faces −X, etc. */
  facing: number;
  labelHint: string;
};

export type Junction = {
  id: string;
  x: number;
  z: number;
  lines: string[];
};

export type Landmark = {
  id: "entrance" | "desk" | "catalogue" | "north";
  label: string;
  x: number;
  z: number;
  yaw: number;
};

export type Collider = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type FloorPlan = {
  aisles: { id: AisleId; from: Vec2; to: Vec2; width: number }[];
  slots: ShelfSlot[];
  junctions: Junction[];
  landmarks: Landmark[];
  colliders: Collider[];
  floor: { minX: number; maxX: number; minZ: number; maxZ: number };
  entrance: Landmark;
};

const PLAYER_R = 0.35;

/** Branching library: main hall, side wings, north loop, desk alcove. */
export function buildFloorPlan(): FloorPlan {
  const aisles: FloorPlan["aisles"] = [
    { id: "main", from: { x: 0, z: 5 }, to: { x: 0, z: -14 }, width: 2.4 },
    { id: "west", from: { x: 0, z: -2 }, to: { x: -10, z: -2 }, width: 2.2 },
    { id: "east", from: { x: 0, z: -2 }, to: { x: 10, z: -2 }, width: 2.2 },
    { id: "north", from: { x: 0, z: -8 }, to: { x: 0, z: -14 }, width: 2.2 },
    { id: "loop-w", from: { x: -10, z: -2 }, to: { x: -10, z: -12 }, width: 2.0 },
    { id: "loop-e", from: { x: 10, z: -2 }, to: { x: 10, z: -12 }, width: 2.0 },
    { id: "back", from: { x: -10, z: -12 }, to: { x: 10, z: -12 }, width: 2.0 },
    { id: "desk", from: { x: 0, z: 2 }, to: { x: -6, z: 2 }, width: 2.0 },
  ];

  const slots: ShelfSlot[] = [
    // Main hall — books on both sides
    ...bayPair("main", 0, -0.5, "Hall"),
    ...bayPair("main", 0, -4.5, "Hall"),
    ...bayPair("main", 0, -9.5, "Hall"),
    // West wing
    ...bayPairAlongZ("west", -4, -2, Math.PI / 2, "West"),
    ...bayPairAlongZ("west", -8, -2, Math.PI / 2, "West"),
    // East wing
    ...bayPairAlongZ("east", 4, -2, Math.PI / 2, "East"),
    ...bayPairAlongZ("east", 8, -2, Math.PI / 2, "East"),
    // Loop corridors
    ...bayPair("loop-w", -10, -5, "Loop"),
    ...bayPair("loop-w", -10, -9, "Loop"),
    ...bayPair("loop-e", 10, -5, "Loop"),
    ...bayPair("loop-e", 10, -9, "Loop"),
    // Back corridor
    ...bayPairAlongZ("back", -5, -12, Math.PI / 2, "Back"),
    ...bayPairAlongZ("back", 5, -12, Math.PI / 2, "Back"),
    // North end
    ...bayPair("north", 0, -13, "North"),
  ];

  const junctions: Junction[] = [
    {
      id: "j-entry",
      x: 0,
      z: 2,
      lines: ["Main hall ahead", "Desk & catalogue ←", "Entrance behind"],
    },
    {
      id: "j-cross",
      x: 0,
      z: -2,
      lines: ["← West wing", "East wing →", "Main hall ↕"],
    },
    {
      id: "j-north",
      x: 0,
      z: -8,
      lines: ["← Loop west", "Loop east →", "North stacks ↓"],
    },
    {
      id: "j-back",
      x: 0,
      z: -12,
      lines: ["Back corridor", "Loops ↑", "Entrance via main"],
    },
  ];

  const entrance: Landmark = {
    id: "entrance",
    label: "Entrance",
    x: 0,
    z: 4.2,
    yaw: 0,
  };

  const landmarks: Landmark[] = [
    entrance,
    { id: "desk", label: "Reading desk", x: -4.2, z: 3.4, yaw: -Math.PI / 2 },
    { id: "catalogue", label: "Card catalogue", x: -2.6, z: 3.2, yaw: -0.5 },
    { id: "north", label: "North stacks", x: 0, z: -12.5, yaw: 0 },
  ];

  const colliders: Collider[] = [
    // Outer walls
    { minX: -13, maxX: 13, minZ: 6.2, maxZ: 7.2 },
    { minX: -13, maxX: 13, minZ: -16, maxZ: -15 },
    { minX: -13.5, maxX: -12.5, minZ: -16, maxZ: 7 },
    { minX: 12.5, maxX: 13.5, minZ: -16, maxZ: 7 },
    // Bookcase bodies (approx) — keep player in aisles
    ...slots.map((slot) => caseCollider(slot)),
    // Desk furniture (leave standing room on the +Z side)
    { minX: -6.1, maxX: -4.3, minZ: 1.4, maxZ: 2.5 },
  ];

  return {
    aisles,
    slots,
    junctions,
    landmarks,
    colliders,
    floor: { minX: -13, maxX: 13, minZ: -16, maxZ: 7 },
    entrance,
  };
}

function bayPair(aisleId: AisleId, x: number, z: number, hint: string): ShelfSlot[] {
  return [
    {
      id: `${aisleId}-L-${z}`,
      aisleId,
      x: x - 1.55,
      z,
      facing: 0, // faces +X (into aisle)
      labelHint: hint,
    },
    {
      id: `${aisleId}-R-${z}`,
      aisleId,
      x: x + 1.55,
      z,
      facing: Math.PI, // faces −X
      labelHint: hint,
    },
  ];
}

/** Cases on the north/south sides of an east–west aisle. */
function bayPairAlongZ(
  aisleId: AisleId,
  x: number,
  z: number,
  _unused: number,
  hint: string,
): ShelfSlot[] {
  return [
    {
      id: `${aisleId}-N-${x}`,
      aisleId,
      x,
      z: z - 1.55,
      facing: Math.PI / 2, // faces +Z
      labelHint: hint,
    },
    {
      id: `${aisleId}-S-${x}`,
      aisleId,
      x,
      z: z + 1.55,
      facing: -Math.PI / 2, // faces −Z
      labelHint: hint,
    },
  ];
}

function caseCollider(slot: ShelfSlot): Collider {
  const hw = 0.35;
  const hd = 1.7;
  const alongX = Math.abs(Math.cos(slot.facing)) > 0.5;
  if (alongX) {
    return {
      minX: slot.x - hw,
      maxX: slot.x + hw,
      minZ: slot.z - hd,
      maxZ: slot.z + hd,
    };
  }
  return {
    minX: slot.x - hd,
    maxX: slot.x + hd,
    minZ: slot.z - hw,
    maxZ: slot.z + hw,
  };
}

export type PlacedShelf = ShelfSlot & {
  shelf: ShelfGroup | null;
};

/** Map current shelf groups onto floor slots (fill in order, leave extras empty). */
export function placeShelves(plan: FloorPlan, shelves: ShelfGroup[]): PlacedShelf[] {
  return plan.slots.map((slot, index) => ({
    ...slot,
    shelf: shelves[index] ?? null,
  }));
}

export function moveWithCollision(
  x: number,
  z: number,
  dx: number,
  dz: number,
  colliders: Collider[],
): Vec2 {
  let nx = x + dx;
  let nz = z + dz;
  if (!hitsAny(nx, z, colliders)) {
    x = nx;
  }
  if (!hitsAny(x, nz, colliders)) {
    z = nz;
  }
  return { x, z };
}

function hitsAny(x: number, z: number, colliders: Collider[]): boolean {
  for (const box of colliders) {
    if (
      x + PLAYER_R > box.minX &&
      x - PLAYER_R < box.maxX &&
      z + PLAYER_R > box.minZ &&
      z - PLAYER_R < box.maxZ
    ) {
      return true;
    }
  }
  return false;
}

/** How strongly the camera is square-on to a nearby shelf face (0–1). */
export function shelfFaceAmount(
  x: number,
  z: number,
  yaw: number,
  placed: PlacedShelf[],
): { amount: number; slot: PlacedShelf | null; dist: number } {
  let best: PlacedShelf | null = null;
  let bestScore = 0;
  let bestDist = 99;

  for (const slot of placed) {
    if (!slot.shelf) continue;
    const toX = slot.x - x;
    const toZ = slot.z - z;
    const dist = Math.hypot(toX, toZ);
    if (dist > 5.5 || dist < 0.4) continue;

    const faceX = Math.sin(slot.facing);
    const faceZ = -Math.cos(slot.facing);
    // Player should be in front of the case (along its facing).
    const along = (x - slot.x) * faceX + (z - slot.z) * faceZ;
    if (along < 0.6 || along > 4.8) continue;

    const lookX = Math.sin(yaw);
    const lookZ = -Math.cos(yaw);
    const towardX = toX / dist;
    const towardZ = toZ / dist;
    const align = lookX * towardX + lookZ * towardZ;
    if (align < 0.55) continue;

    const score = align * (1 - dist / 6);
    if (score > bestScore) {
      bestScore = score;
      best = slot;
      bestDist = dist;
    }
  }

  return {
    amount: Math.min(1, Math.max(0, (bestScore - 0.2) / 0.55)),
    slot: best,
    dist: bestDist,
  };
}

export function nearbyBooks(placed: PlacedShelf[], x: number, z: number, radius = 8): LibraryBook[] {
  const seen = new Set<string>();
  const list: LibraryBook[] = [];
  const ranked = placed
    .filter((p) => p.shelf)
    .map((p) => ({ p, d: Math.hypot(p.x - x, p.z - z) }))
    .filter(({ d }) => d <= radius)
    .sort((a, b) => a.d - b.d);

  for (const { p } of ranked) {
    for (const book of p.shelf!.books.slice(0, MAX_SPINES_PER_SIDE)) {
      if (seen.has(book.uid)) continue;
      seen.add(book.uid);
      list.push(book);
      if (list.length >= 40) return list;
    }
  }
  return list;
}

export function nearestLandmark(
  landmarks: Landmark[],
  x: number,
  z: number,
): Landmark | null {
  let best: Landmark | null = null;
  let bestD = Infinity;
  for (const mark of landmarks) {
    const d = Math.hypot(mark.x - x, mark.z - z);
    if (d < bestD) {
      bestD = d;
      best = mark;
    }
  }
  return best;
}

export function wrapYaw(yaw: number): number {
  const tau = Math.PI * 2;
  let value = yaw % tau;
  if (value > Math.PI) value -= tau;
  if (value < -Math.PI) value += tau;
  return value;
}
