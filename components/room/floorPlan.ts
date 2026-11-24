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
  x: number;
  z: number;
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
  windows: { x: number; z: number; facing: number; width: number; height: number }[];
  floor: { minX: number; maxX: number; minZ: number; maxZ: number };
  entrance: Landmark;
};

/** Small radius so corners and junctions stay passable. */
export const PLAYER_R = 0.22;

/** Branching library with wide aisles and clear junction pads. */
export function buildFloorPlan(): FloorPlan {
  const aisles: FloorPlan["aisles"] = [
    { id: "main", from: { x: 0, z: 5 }, to: { x: 0, z: -14 }, width: 3.2 },
    { id: "west", from: { x: 0, z: -2 }, to: { x: -11, z: -2 }, width: 3.0 },
    { id: "east", from: { x: 0, z: -2 }, to: { x: 11, z: -2 }, width: 3.0 },
    { id: "north", from: { x: 0, z: -8 }, to: { x: 0, z: -14 }, width: 3.0 },
    { id: "loop-w", from: { x: -11, z: -2 }, to: { x: -11, z: -12 }, width: 2.8 },
    { id: "loop-e", from: { x: 11, z: -2 }, to: { x: 11, z: -12 }, width: 2.8 },
    { id: "back", from: { x: -11, z: -12 }, to: { x: 11, z: -12 }, width: 2.8 },
    { id: "desk", from: { x: 0, z: 2.5 }, to: { x: -6, z: 2.5 }, width: 2.6 },
  ];

  // Cases sit farther from the aisle centre so walking clearance is generous.
  const slots: ShelfSlot[] = [
    ...bayPair("main", 0, 0.5, "Hall"),
    ...bayPair("main", 0, -5, "Hall"),
    ...bayPair("main", 0, -10.5, "Hall"),
    ...bayPairAlong("west", -5, -2, "West"),
    ...bayPairAlong("west", -9, -2, "West"),
    ...bayPairAlong("east", 5, -2, "East"),
    ...bayPairAlong("east", 9, -2, "East"),
    ...bayPair("loop-w", -11, -6, "Loop"),
    ...bayPair("loop-w", -11, -9.5, "Loop"),
    ...bayPair("loop-e", 11, -6, "Loop"),
    ...bayPair("loop-e", 11, -9.5, "Loop"),
    ...bayPairAlong("back", -5.5, -12, "Back"),
    ...bayPairAlong("back", 5.5, -12, "Back"),
    ...bayPair("north", 0, -13.2, "North"),
  ];

  const junctions: Junction[] = [
    {
      id: "j-entry",
      x: 0,
      z: 2.2,
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
    { id: "desk", label: "Reading desk", x: -4.2, z: 3.5, yaw: -Math.PI / 2 },
    { id: "catalogue", label: "Card catalogue", x: -2.6, z: 3.3, yaw: -0.5 },
    { id: "north", label: "North stacks", x: 0, z: -12.6, yaw: 0 },
  ];

  // Flush with outer walls only. facing = yaw that points local +X into the room.
  // Keep clear of shelf lines at x≈±11 and aisle centres.
  const windows = [
    { x: -13.95, z: 2.5, facing: 0, width: 2.0, height: 1.7 },
    { x: -13.95, z: -4.0, facing: 0, width: 2.0, height: 1.7 },
    { x: -13.95, z: -10.0, facing: 0, width: 2.0, height: 1.7 },
    { x: 13.95, z: 2.5, facing: Math.PI, width: 2.0, height: 1.7 },
    { x: 13.95, z: -4.0, facing: Math.PI, width: 2.0, height: 1.7 },
    { x: 13.95, z: -10.0, facing: Math.PI, width: 2.0, height: 1.7 },
    { x: -5.5, z: 7.35, facing: -Math.PI / 2, width: 2.2, height: 1.5 },
    { x: 5.5, z: 7.35, facing: -Math.PI / 2, width: 2.2, height: 1.5 },
    { x: -5.5, z: -16.35, facing: Math.PI / 2, width: 2.2, height: 1.5 },
    { x: 5.5, z: -16.35, facing: Math.PI / 2, width: 2.2, height: 1.5 },
  ];

  const colliders: Collider[] = [
    { minX: -14, maxX: 14, minZ: 7.0, maxZ: 7.8 },
    { minX: -14, maxX: 14, minZ: -16.5, maxZ: -15.6 },
    { minX: -14.2, maxX: -13.3, minZ: -16.5, maxZ: 7.5 },
    { minX: 13.3, maxX: 14.2, minZ: -16.5, maxZ: 7.5 },
    ...slots.map((slot) => caseCollider(slot)),
    { minX: -6.0, maxX: -4.4, minZ: 1.5, maxZ: 2.4 },
  ];

  return {
    aisles,
    slots,
    junctions,
    landmarks,
    colliders,
    windows,
    floor: { minX: -14, maxX: 14, minZ: -16.5, maxZ: 7.5 },
    entrance,
  };
}

function bayPair(aisleId: AisleId, x: number, z: number, hint: string): ShelfSlot[] {
  const offset = 2.05;
  return [
    { id: `${aisleId}-L-${z}`, aisleId, x: x - offset, z, facing: 0, labelHint: hint },
    { id: `${aisleId}-R-${z}`, aisleId, x: x + offset, z, facing: Math.PI, labelHint: hint },
  ];
}

function bayPairAlong(aisleId: AisleId, x: number, z: number, hint: string): ShelfSlot[] {
  const offset = 2.05;
  return [
    {
      id: `${aisleId}-N-${x}`,
      aisleId,
      x,
      z: z - offset,
      facing: Math.PI / 2,
      labelHint: hint,
    },
    {
      id: `${aisleId}-S-${x}`,
      aisleId,
      x,
      z: z + offset,
      facing: -Math.PI / 2,
      labelHint: hint,
    },
  ];
}

function caseCollider(slot: ShelfSlot): Collider {
  // Tight box on the case body only — leaves junction pads open.
  const hw = 0.28;
  const hd = 1.35;
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

export function placeShelves(plan: FloorPlan, shelves: ShelfGroup[]): PlacedShelf[] {
  return plan.slots.map((slot, index) => ({
    ...slot,
    shelf: shelves[index] ?? null,
  }));
}

function overlaps(x: number, z: number, box: Collider, radius: number): boolean {
  return (
    x + radius > box.minX &&
    x - radius < box.maxX &&
    z + radius > box.minZ &&
    z - radius < box.maxZ
  );
}

function hitsAny(x: number, z: number, colliders: Collider[], radius = PLAYER_R): boolean {
  for (const box of colliders) {
    if (overlaps(x, z, box, radius)) return true;
  }
  return false;
}

/** Push out if the player somehow ends up inside a collider. */
function unstick(x: number, z: number, colliders: Collider[]): Vec2 {
  if (!hitsAny(x, z, colliders)) return { x, z };
  const steps = [
    [0.35, 0],
    [-0.35, 0],
    [0, 0.35],
    [0, -0.35],
    [0.5, 0.5],
    [-0.5, 0.5],
    [0.5, -0.5],
    [-0.5, -0.5],
  ];
  for (const [sx, sz] of steps) {
    if (!hitsAny(x + sx, z + sz, colliders)) return { x: x + sx, z: z + sz };
  }
  return { x, z };
}

/**
 * Move with axis slide. Turning is never gated by this — only translation is.
 */
export function moveWithCollision(
  x: number,
  z: number,
  dx: number,
  dz: number,
  colliders: Collider[],
): Vec2 {
  const start = unstick(x, z, colliders);
  x = start.x;
  z = start.z;

  const tryX = x + dx;
  const tryZ = z + dz;
  if (!hitsAny(tryX, tryZ, colliders)) return { x: tryX, z: tryZ };

  // Prefer the freer axis so you glide along shelves instead of sticking.
  const freeX = !hitsAny(tryX, z, colliders);
  const freeZ = !hitsAny(x, tryZ, colliders);
  if (freeX && freeZ) {
    // Both free alone but not together (rare corner) — pick longer delta.
    return Math.abs(dx) >= Math.abs(dz) ? { x: tryX, z } : { x, z: tryZ };
  }
  if (freeX) return { x: tryX, z };
  if (freeZ) return { x, z: tryZ };

  // Nudge along the wall with a shorter step.
  const hx = dx * 0.5;
  const hz = dz * 0.5;
  if (!hitsAny(x + hx, z, colliders)) return { x: x + hx, z };
  if (!hitsAny(x, z + hz, colliders)) return { x, z: z + hz };
  return { x, z };
}

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
    if (dist > 5.5 || dist < 0.5) continue;

    const faceX = Math.sin(slot.facing);
    const faceZ = -Math.cos(slot.facing);
    const along = (x - slot.x) * faceX + (z - slot.z) * faceZ;
    if (along < 0.8 || along > 5.0) continue;

    const lookX = Math.sin(yaw);
    const lookZ = -Math.cos(yaw);
    const towardX = toX / dist;
    const towardZ = toZ / dist;
    const align = lookX * towardX + lookZ * towardZ;
    if (align < 0.6) continue;

    const score = align * (1 - dist / 6);
    if (score > bestScore) {
      bestScore = score;
      best = slot;
      bestDist = dist;
    }
  }

  return {
    amount: Math.min(1, Math.max(0, (bestScore - 0.25) / 0.5)),
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
