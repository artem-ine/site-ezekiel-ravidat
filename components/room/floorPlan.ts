import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { MAX_SPINES_PER_SIDE } from "@/components/room/roomConfig";
import {
  PLAYER_R,
  depenetrate,
  hitsAny,
  moveWithCollision,
  nudgeFromColliders,
  type Collider,
  type Vec2,
} from "@/components/room/collision";

export type { Collider, Vec2 };
export { PLAYER_R, depenetrate, hitsAny, moveWithCollision, nudgeFromColliders };

export type AisleId =
  | "center"
  | "west-aisle"
  | "east-aisle"
  | "cross-s"
  | "cross-m"
  | "cross-n"
  | "desk"
  | "loop";

export type ShelfSlot = {
  id: string;
  aisleId: AisleId;
  x: number;
  z: number;
  facing: number;
  labelHint: string;
};

export type WallSide = "west" | "east" | "north" | "south";

/** Pane lies in the wall; `wall` decides which plane (never across an aisle). */
export type WallWindow = {
  id: string;
  wall: WallSide;
  /** Centre along the wall (z for west/east, x for north/south). */
  along: number;
  width: number;
  height: number;
};

export type AisleSign = {
  id: string;
  x: number;
  z: number;
  y: number;
  /** Yaw the board faces (readable when looking roughly this way). */
  facing: number;
  text: string;
};

export type Landmark = {
  id: "entrance" | "desk" | "catalogue" | "north";
  label: string;
  x: number;
  z: number;
  yaw: number;
};

export type StackCenter = {
  id: string;
  x: number;
  z: number;
  /** Long axis along Z (books face ±X) when true; along X when false. */
  alongZ: boolean;
};

export type FloorPlan = {
  aisles: { id: AisleId; from: Vec2; to: Vec2; width: number }[];
  slots: ShelfSlot[];
  stacks: StackCenter[];
  landmarks: Landmark[];
  colliders: Collider[];
  windows: WallWindow[];
  floor: { minX: number; maxX: number; minZ: number; maxZ: number };
  entrance: Landmark;
};

/** Half the case depth — backs of a double-sided stack meet near the centre. */
const STACK_HALF = 0.26;
/** Collision length along the bay — slightly inside the visual 3.4 so ends stay passable. */
const STACK_HALF_LEN = 1.5;
/** Comfortable aisle clear width between facing book faces (~body + turn). */
const AISLE_CLEAR = 3.2;

/**
 * Open reading room: free-standing double-sided stacks in parallel rows,
 * with cross-aisles and clearings — nothing against the walls or windows.
 */
export function buildFloorPlan(): FloorPlan {
  const floor = { minX: -13, maxX: 13, minZ: -15, maxZ: 6.5 };

  // Four N–S stack rows. Books face ±X into the aisles between rows.
  // Column spacing leaves ≥ AISLE_CLEAR between facing spines; outer columns
  // stay well clear of the walls/windows (~4–5 units).
  const columns = [-8.2, -3.0, 3.0, 8.2];
  // Three bays per column; north bay leaves a clear walk north of the stack ends.
  const bayZs = [0.8, -5.2, -10.6];
  const hints = ["A–C", "D–G", "H–L", "M–R", "S–Z", "Recent"];

  const slots: ShelfSlot[] = [];
  const stacks: StackCenter[] = [];
  let hintIdx = 0;

  for (let c = 0; c < columns.length; c += 1) {
    const cx = columns[c];
    const aisleId: AisleId =
      cx < -5 ? "west-aisle" : cx > 5 ? "east-aisle" : "center";
    for (let b = 0; b < bayZs.length; b += 1) {
      const cz = bayZs[b];
      const hint = hints[hintIdx % hints.length];
      hintIdx += 1;
      const stackId = `stack-${c}-${b}`;
      stacks.push({ id: stackId, x: cx, z: cz, alongZ: true });
      slots.push(...doubleStack(aisleId, stackId, cx, cz, true, hint));
    }
  }

  const entrance: Landmark = {
    id: "entrance",
    label: "Entrance",
    x: 0,
    z: 4.4,
    yaw: 0,
  };

  const landmarks: Landmark[] = [
    entrance,
    // Stand in the clear path beside the desk/catalogue, not inside their colliders.
    { id: "desk", label: "Reading desk", x: -6.2, z: 3.8, yaw: Math.PI / 2 },
    { id: "catalogue", label: "Card catalogue", x: -5.4, z: 3.2, yaw: 0.4 },
    { id: "north", label: "North stacks", x: 0, z: -12.4, yaw: 0 },
  ];

  const aisles: FloorPlan["aisles"] = [
    { id: "center", from: { x: 0, z: 5 }, to: { x: 0, z: -13.5 }, width: 5.8 },
    { id: "west-aisle", from: { x: -5.6, z: 2 }, to: { x: -5.6, z: -12.5 }, width: 3.6 },
    { id: "east-aisle", from: { x: 5.6, z: 2 }, to: { x: 5.6, z: -12.5 }, width: 3.6 },
    { id: "cross-s", from: { x: -10, z: -2.2 }, to: { x: 10, z: -2.2 }, width: 2.8 },
    { id: "cross-m", from: { x: -10, z: -7.8 }, to: { x: 10, z: -7.8 }, width: 2.8 },
    { id: "cross-n", from: { x: -10, z: -13.2 }, to: { x: 10, z: -13.2 }, width: 2.6 },
    { id: "desk", from: { x: 0, z: 3.5 }, to: { x: -9.5, z: 3.5 }, width: 2.8 },
    { id: "loop", from: { x: -10.5, z: 2 }, to: { x: -10.5, z: -12 }, width: 2.4 },
  ];

  // Wide mullioned windows in outer walls only — stacks stay clear of them.
  const windows: WallWindow[] = [
    { id: "w-w1", wall: "west", along: 2.0, width: 3.6, height: 1.85 },
    { id: "w-w2", wall: "west", along: -5.0, width: 3.6, height: 1.85 },
    { id: "w-w3", wall: "west", along: -11.0, width: 3.6, height: 1.85 },
    { id: "w-e1", wall: "east", along: 2.0, width: 3.6, height: 1.85 },
    { id: "w-e2", wall: "east", along: -5.0, width: 3.6, height: 1.85 },
    { id: "w-e3", wall: "east", along: -11.0, width: 3.6, height: 1.85 },
    { id: "w-n1", wall: "north", along: -5.5, width: 3.4, height: 1.7 },
    { id: "w-n2", wall: "north", along: 5.5, width: 3.4, height: 1.7 },
    { id: "w-s1", wall: "south", along: -5.5, width: 3.4, height: 1.7 },
    { id: "w-s2", wall: "south", along: 5.5, width: 3.4, height: 1.7 },
  ];

  const wallColliders: Collider[] = [
    { minX: floor.minX - 0.4, maxX: floor.maxX + 0.4, minZ: floor.maxZ, maxZ: floor.maxZ + 0.8 },
    { minX: floor.minX - 0.4, maxX: floor.maxX + 0.4, minZ: floor.minZ - 0.8, maxZ: floor.minZ },
    { minX: floor.minX - 0.8, maxX: floor.minX, minZ: floor.minZ, maxZ: floor.maxZ },
    { minX: floor.maxX, maxX: floor.maxX + 0.8, minZ: floor.minZ, maxZ: floor.maxZ },
  ];

  const colliders: Collider[] = [
    ...wallColliders,
    ...stacks.map((stack) => stackCollider(stack)),
    // Reading desk / catalogue — kept west of the south path so cross-s stays clear.
    { minX: -10.0, maxX: -8.4, minZ: 2.5, maxZ: 3.5 },
    { minX: -8.2, maxX: -7.4, minZ: 2.9, maxZ: 3.5 },
  ];

  void AISLE_CLEAR;

  return {
    aisles,
    slots,
    stacks,
    landmarks,
    colliders,
    windows,
    floor,
    entrance,
  };
}

/** Two back-to-back ShelfBay slots sharing a free-standing stack centre. */
function doubleStack(
  aisleId: AisleId,
  stackId: string,
  cx: number,
  cz: number,
  faceX: boolean,
  hint: string,
): ShelfSlot[] {
  if (faceX) {
    return [
      {
        id: `${stackId}-W`,
        aisleId,
        x: cx - STACK_HALF,
        z: cz,
        facing: Math.PI,
        labelHint: hint,
      },
      {
        id: `${stackId}-E`,
        aisleId,
        x: cx + STACK_HALF,
        z: cz,
        facing: 0,
        labelHint: hint,
      },
    ];
  }
  return [
    {
      id: `${stackId}-N`,
      aisleId,
      x: cx,
      z: cz - STACK_HALF,
      facing: Math.PI / 2,
      labelHint: hint,
    },
    {
      id: `${stackId}-S`,
      aisleId,
      x: cx,
      z: cz + STACK_HALF,
      facing: -Math.PI / 2,
      labelHint: hint,
    },
  ];
}

function stackCollider(stack: StackCenter): Collider {
  if (stack.alongZ) {
    return {
      minX: stack.x - STACK_HALF - 0.08,
      maxX: stack.x + STACK_HALF + 0.08,
      minZ: stack.z - STACK_HALF_LEN,
      maxZ: stack.z + STACK_HALF_LEN,
    };
  }
  return {
    minX: stack.x - STACK_HALF_LEN,
    maxX: stack.x + STACK_HALF_LEN,
    minZ: stack.z - STACK_HALF - 0.08,
    maxZ: stack.z + STACK_HALF + 0.08,
  };
}

/** World pose for a wall window: pane lies in the wall plane. */
export function windowWorldPose(
  win: WallWindow,
  floor: FloorPlan["floor"],
): { x: number; y: number; z: number; yaw: number; inwardX: number; inwardZ: number } {
  const y = 1.55;
  if (win.wall === "west") {
    return {
      x: floor.minX + 0.08,
      y,
      z: win.along,
      yaw: Math.PI / 2,
      inwardX: 1,
      inwardZ: 0,
    };
  }
  if (win.wall === "east") {
    return {
      x: floor.maxX - 0.08,
      y,
      z: win.along,
      yaw: -Math.PI / 2,
      inwardX: -1,
      inwardZ: 0,
    };
  }
  if (win.wall === "north") {
    return {
      x: win.along,
      y,
      z: floor.minZ + 0.08,
      yaw: 0,
      inwardX: 0,
      inwardZ: 1,
    };
  }
  return {
    x: win.along,
    y,
    z: floor.maxZ - 0.08,
    yaw: Math.PI,
    inwardX: 0,
    inwardZ: -1,
  };
}

/**
 * Book-face normal in XZ. ShelfBay rotates around Y so local +X (spines) maps to
 * (cos(facing), −sin(facing)).
 */
export function shelfFaceNormal(facing: number): { x: number; z: number } {
  return { x: Math.cos(facing), z: -Math.sin(facing) };
}

/** Small POV-height signs at the ends of each stack, naming that section. */
export function buildAisleSigns(placed: PlacedShelf[]): AisleSign[] {
  const signs: AisleSign[] = [];
  const seen = new Set<string>();

  for (const slot of placed) {
    if (!slot.shelf) continue;
    // One sign pair per double-sided stack (use the east/south face as key).
    const stackKey = slot.id.replace(/-(W|E|N|S)$/, "");
    if (seen.has(stackKey)) continue;
    seen.add(stackKey);

    const mates = placed.filter((p) => p.id.startsWith(stackKey) && p.shelf);
    if (mates.length === 0) continue;
    const label =
      mates
        .map((m) => m.shelf!.label)
        .find(Boolean) ?? slot.shelf.label;

    // Stack long axis from first mate facing.
    const face = shelfFaceNormal(mates[0].facing);
    // End direction = perpendicular to face (along the bay).
    const endX = -face.z;
    const endZ = face.x;
    const cx = mates.reduce((s, m) => s + m.x, 0) / mates.length;
    const cz = mates.reduce((s, m) => s + m.z, 0) / mates.length;
    const along = STACK_HALF_LEN + 0.35;
    // Sign faces into the nearer aisle (same as the first mate's face).
    const signFacing = mates[0].facing;

    signs.push({
      id: `sign-${stackKey}-a`,
      x: cx + endX * along + face.x * 0.15,
      z: cz + endZ * along + face.z * 0.15,
      y: 1.38,
      facing: signFacing,
      text: `${label} →`,
    });
    signs.push({
      id: `sign-${stackKey}-b`,
      x: cx - endX * along + face.x * 0.15,
      z: cz - endZ * along + face.z * 0.15,
      y: 1.38,
      facing: signFacing,
      text: `← ${label}`,
    });
  }
  return signs;
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
    if (dist > 5.5 || dist < 0.45) continue;

    const { x: faceX, z: faceZ } = shelfFaceNormal(slot.facing);
    const along = (x - slot.x) * faceX + (z - slot.z) * faceZ;
    // Stand in front of the spines, not behind the case.
    if (along < 0.7 || along > 4.2) continue;

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
