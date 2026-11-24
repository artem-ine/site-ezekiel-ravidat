import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { MAX_SPINES_PER_SIDE } from "@/components/room/roomConfig";

export type Vec2 = { x: number; z: number };

export type AisleId =
  | "center"
  | "west-nook"
  | "east-nook"
  | "cross-s"
  | "cross-m"
  | "cross-n"
  | "desk"
  | "hearth";

/** How books for a section are arranged in the cozy room. */
export type BookDisplay = "pile" | "low-shelf" | "table";

export type ShelfSlot = {
  id: string;
  aisleId: AisleId;
  x: number;
  z: number;
  facing: number;
  labelHint: string;
  display: BookDisplay;
};

export type WallSide = "west" | "east" | "north" | "south";

export type WallWindow = {
  id: string;
  wall: WallSide;
  along: number;
  width: number;
  height: number;
};

export type AisleSign = {
  id: string;
  x: number;
  z: number;
  y: number;
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

export type Collider = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/** Mini-map markers for reading nooks / piles. */
export type StackCenter = {
  id: string;
  x: number;
  z: number;
  alongZ: boolean;
};

export type FurnitureKind =
  | "sofa"
  | "armchair"
  | "beanbag"
  | "cushion"
  | "low-table"
  | "side-table"
  | "floor-lamp"
  | "reading-lamp"
  | "plant"
  | "fireplace"
  | "cat"
  | "rug";

export type FurniturePiece = {
  id: string;
  kind: FurnitureKind;
  x: number;
  z: number;
  yaw: number;
  /** Optional uniform scale (bean bags / cushions). */
  scale?: number;
};

export type FloorPlan = {
  aisles: { id: AisleId; from: Vec2; to: Vec2; width: number }[];
  slots: ShelfSlot[];
  stacks: StackCenter[];
  furniture: FurniturePiece[];
  landmarks: Landmark[];
  colliders: Collider[];
  windows: WallWindow[];
  floor: { minX: number; maxX: number; minZ: number; maxZ: number };
  entrance: Landmark;
};

/** Forgiving player radius — slides past furniture edges. */
export const PLAYER_R = 0.2;

function box(cx: number, cz: number, hx: number, hz: number): Collider {
  return { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz };
}

/**
 * Lived-in reading room: walkable paths between furniture islands,
 * with books in floor piles, on tables, and a few low shelves.
 */
export function buildFloorPlan(): FloorPlan {
  const floor = { minX: -11, maxX: 11, minZ: -12, maxZ: 5.5 };

  const entrance: Landmark = {
    id: "entrance",
    label: "Entrance",
    x: 0,
    z: 3.8,
    yaw: 0,
  };

  const landmarks: Landmark[] = [
    entrance,
    { id: "desk", label: "Reading desk", x: -7.5, z: 2.8, yaw: Math.PI / 2 },
    { id: "catalogue", label: "Hearth", x: -7.2, z: -3.5, yaw: Math.PI / 2 },
    { id: "north", label: "Quiet shelves", x: 0, z: -9.5, yaw: 0 },
  ];

  // Clear walk ribbons (also drawn on the mini-map / floor rugs).
  const aisles: FloorPlan["aisles"] = [
    { id: "center", from: { x: 0, z: 4.5 }, to: { x: 0, z: -10.5 }, width: 2.8 },
    { id: "cross-s", from: { x: -8, z: 1.2 }, to: { x: 8, z: 1.2 }, width: 2.4 },
    { id: "cross-m", from: { x: -8, z: -3.2 }, to: { x: 8, z: -3.2 }, width: 2.4 },
    { id: "cross-n", from: { x: -6, z: -7.5 }, to: { x: 6, z: -7.5 }, width: 2.2 },
    { id: "west-nook", from: { x: -5.5, z: 2 }, to: { x: -5.5, z: -6 }, width: 2.0 },
    { id: "east-nook", from: { x: 5.5, z: 2 }, to: { x: 5.5, z: -6 }, width: 2.0 },
    { id: "desk", from: { x: 0, z: 2.6 }, to: { x: -7.5, z: 2.6 }, width: 2.0 },
    { id: "hearth", from: { x: -5, z: -3.2 }, to: { x: -8.5, z: -3.2 }, width: 2.0 },
  ];

  // Genre / section placements — order matches groupIntoShelves output.
  const slots: ShelfSlot[] = [
    // North low shelves (quiet end)
    slot("low-n1", "center", -3.2, -9.8, 0, "A–C", "low-shelf"),
    slot("low-n2", "center", 0, -9.8, 0, "D–G", "low-shelf"),
    slot("low-n3", "center", 3.2, -9.8, 0, "H–L", "low-shelf"),
    // Floor piles along the west hearth nook
    slot("pile-w1", "hearth", -6.4, -1.2, Math.PI / 2, "M–R", "pile"),
    slot("pile-w2", "hearth", -8.2, -5.2, Math.PI / 2, "S–Z", "pile"),
    slot("pile-w3", "west-nook", -4.2, -5.5, 0.4, "Recent", "pile"),
    // East bean-bag corner piles
    slot("pile-e1", "east-nook", 6.2, -0.8, -Math.PI / 2, "Fiction", "pile"),
    slot("pile-e2", "east-nook", 7.4, -4.4, -Math.PI / 2, "Nonfic", "pile"),
    slot("pile-e3", "east-nook", 4.6, -5.8, -0.3, "Poetry", "pile"),
    // Table stacks in the middle clearings
    slot("table-c1", "cross-m", -2.4, -3.2, 0, "Essays", "table"),
    slot("table-c2", "cross-m", 2.6, -3.2, Math.PI, "Art", "table"),
    slot("table-s1", "cross-s", 3.2, 1.0, -0.6, "Kids", "table"),
    // More floor piles near entrance / sofa
    slot("pile-s1", "desk", -4.8, 2.0, 0.8, "Mystery", "pile"),
    slot("pile-s2", "center", 2.2, -0.4, -0.5, "Sci-Fi", "pile"),
    slot("pile-n1", "cross-n", -4.0, -7.2, 0.2, "History", "pile"),
    slot("pile-n2", "cross-n", 4.2, -7.0, -0.2, "Travel", "pile"),
  ];

  const stacks: StackCenter[] = slots.map((s) => ({
    id: s.id,
    x: s.x,
    z: s.z,
    alongZ: s.display === "low-shelf",
  }));

  const furniture: FurniturePiece[] = [
    // Rugs under living zones
    { id: "rug-hearth", kind: "rug", x: -7.0, z: -3.0, yaw: 0.1, scale: 1.15 },
    { id: "rug-east", kind: "rug", x: 6.0, z: -3.0, yaw: -0.08, scale: 1.0 },
    { id: "rug-center", kind: "rug", x: 0.2, z: -3.2, yaw: 0.05, scale: 0.85 },
    // Hearth + sofa
    { id: "fireplace", kind: "fireplace", x: -9.6, z: -3.2, yaw: Math.PI / 2 },
    { id: "sofa", kind: "sofa", x: -6.6, z: -3.2, yaw: -Math.PI / 2 },
    { id: "armchair-w", kind: "armchair", x: -7.4, z: -0.6, yaw: -0.4 },
    { id: "side-hearth", kind: "side-table", x: -7.8, z: -5.0, yaw: 0.2 },
    { id: "lamp-hearth", kind: "floor-lamp", x: -8.6, z: -5.6, yaw: 0 },
    { id: "plant-hearth", kind: "plant", x: -9.0, z: -1.0, yaw: 0.3 },
    { id: "cat", kind: "cat", x: -5.6, z: -4.4, yaw: 0.7 },
    { id: "cushion-cat", kind: "cushion", x: -5.6, z: -4.4, yaw: 0.5, scale: 1.1 },
    // East lounge
    { id: "bean-1", kind: "beanbag", x: 6.8, z: -2.0, yaw: -0.8, scale: 1.05 },
    { id: "bean-2", kind: "beanbag", x: 5.2, z: -4.2, yaw: 0.6, scale: 0.95 },
    { id: "bean-3", kind: "beanbag", x: 7.6, z: -5.2, yaw: 2.2, scale: 1.0 },
    { id: "cushion-e1", kind: "cushion", x: 4.8, z: -1.4, yaw: 0.4 },
    { id: "cushion-e2", kind: "cushion", x: 7.2, z: -3.6, yaw: -0.5 },
    { id: "armchair-e", kind: "armchair", x: 4.4, z: 0.4, yaw: Math.PI * 0.7 },
    { id: "lamp-east", kind: "floor-lamp", x: 8.4, z: -1.2, yaw: 0 },
    // Centre tables (books sit on matching slots)
    { id: "table-mid-l", kind: "low-table", x: -2.4, z: -3.2, yaw: 0.1 },
    { id: "table-mid-r", kind: "low-table", x: 2.6, z: -3.2, yaw: -0.05 },
    { id: "table-south", kind: "side-table", x: 3.2, z: 1.0, yaw: 0.3 },
    { id: "lamp-read", kind: "reading-lamp", x: 3.8, z: 1.5, yaw: -0.4 },
    // Desk corner extras
    { id: "side-desk", kind: "side-table", x: -6.2, z: 3.2, yaw: 0 },
    { id: "cushion-desk", kind: "cushion", x: -5.0, z: 3.4, yaw: 0.2 },
    { id: "plant-entrance", kind: "plant", x: 4.6, z: 3.4, yaw: -0.2 },
  ];

  const windows: WallWindow[] = [
    { id: "w-w1", wall: "west", along: 1.5, width: 3.2, height: 1.75 },
    { id: "w-w2", wall: "west", along: -4.0, width: 3.2, height: 1.75 },
    { id: "w-w3", wall: "west", along: -8.5, width: 3.0, height: 1.7 },
    { id: "w-e1", wall: "east", along: 1.5, width: 3.2, height: 1.75 },
    { id: "w-e2", wall: "east", along: -4.0, width: 3.2, height: 1.75 },
    { id: "w-e3", wall: "east", along: -8.5, width: 3.0, height: 1.7 },
    { id: "w-n1", wall: "north", along: -4.5, width: 3.0, height: 1.6 },
    { id: "w-n2", wall: "north", along: 4.5, width: 3.0, height: 1.6 },
    { id: "w-s1", wall: "south", along: -4.5, width: 3.0, height: 1.6 },
    { id: "w-s2", wall: "south", along: 4.5, width: 3.0, height: 1.6 },
  ];

  const wallColliders: Collider[] = [
    { minX: floor.minX - 0.4, maxX: floor.maxX + 0.4, minZ: floor.maxZ, maxZ: floor.maxZ + 0.8 },
    { minX: floor.minX - 0.4, maxX: floor.maxX + 0.4, minZ: floor.minZ - 0.8, maxZ: floor.minZ },
    { minX: floor.minX - 0.8, maxX: floor.minX, minZ: floor.minZ, maxZ: floor.maxZ },
    { minX: floor.maxX, maxX: floor.maxX + 0.8, minZ: floor.minZ, maxZ: floor.maxZ },
  ];

  const colliders: Collider[] = [
    ...wallColliders,
    ...furniture.flatMap((piece) => furnitureColliders(piece)),
    ...slots.map((s) => slotCollider(s)),
    // Reading desk / catalogue (DeskAlcove meshes)
    box(-7.5, 2.8, 1.0, 0.55),
    box(-5.8, 3.0, 0.5, 0.4),
  ];

  return {
    aisles,
    slots,
    stacks,
    furniture,
    landmarks,
    colliders,
    windows,
    floor,
    entrance,
  };
}

function slot(
  id: string,
  aisleId: AisleId,
  x: number,
  z: number,
  facing: number,
  labelHint: string,
  display: BookDisplay,
): ShelfSlot {
  return { id, aisleId, x, z, facing, labelHint, display };
}

/** Tight, forgiving colliders so paths stay walkable. */
function furnitureColliders(piece: FurniturePiece): Collider[] {
  const s = piece.scale ?? 1;
  switch (piece.kind) {
    case "sofa":
      return [box(piece.x, piece.z, 0.55, 1.35)];
    case "armchair":
      return [box(piece.x, piece.z, 0.45, 0.45)];
    case "beanbag":
      return [box(piece.x, piece.z, 0.42 * s, 0.42 * s)];
    case "cushion":
      return []; // walkable / soft — no block
    case "low-table":
      return [box(piece.x, piece.z, 0.7, 0.45)];
    case "side-table":
      return [box(piece.x, piece.z, 0.32, 0.32)];
    case "floor-lamp":
      return [box(piece.x, piece.z, 0.18, 0.18)];
    case "reading-lamp":
      return [box(piece.x, piece.z, 0.14, 0.14)];
    case "plant":
      return [box(piece.x, piece.z, 0.22, 0.22)];
    case "fireplace":
      return [box(piece.x, piece.z, 0.45, 0.9)];
    case "cat":
      return [];
    case "rug":
      return [];
    default:
      return [];
  }
}

function slotCollider(s: ShelfSlot): Collider {
  if (s.display === "low-shelf") {
    return box(s.x, s.z, 0.32, 1.15);
  }
  if (s.display === "table") {
    // Table furniture already collides; books need no extra block.
    return box(s.x, s.z, 0.15, 0.15);
  }
  // Floor pile — small footprint so you can stand beside it.
  return box(s.x, s.z, 0.38, 0.38);
}

export function windowWorldPose(
  win: WallWindow,
  floor: FloorPlan["floor"],
): { x: number; y: number; z: number; yaw: number; inwardX: number; inwardZ: number } {
  const y = 1.55;
  if (win.wall === "west") {
    return { x: floor.minX + 0.08, y, z: win.along, yaw: Math.PI / 2, inwardX: 1, inwardZ: 0 };
  }
  if (win.wall === "east") {
    return { x: floor.maxX - 0.08, y, z: win.along, yaw: -Math.PI / 2, inwardX: -1, inwardZ: 0 };
  }
  if (win.wall === "north") {
    return { x: win.along, y, z: floor.minZ + 0.08, yaw: 0, inwardX: 0, inwardZ: 1 };
  }
  return { x: win.along, y, z: floor.maxZ - 0.08, yaw: Math.PI, inwardX: 0, inwardZ: -1 };
}

export function shelfFaceNormal(facing: number): { x: number; z: number } {
  return { x: Math.cos(facing), z: -Math.sin(facing) };
}

/** Eye-height signs near each reading nook / pile. */
export function buildAisleSigns(placed: PlacedShelf[]): AisleSign[] {
  const signs: AisleSign[] = [];
  for (const slot of placed) {
    if (!slot.shelf) continue;
    const face = shelfFaceNormal(slot.facing);
    const sideX = -face.z;
    const sideZ = face.x;
    const standOff = slot.display === "low-shelf" ? 1.35 : 0.85;
    signs.push({
      id: `sign-${slot.id}`,
      x: slot.x + face.x * 0.35 + sideX * standOff,
      z: slot.z + face.z * 0.35 + sideZ * standOff,
      y: 1.32,
      facing: slot.facing,
      text: `${slot.shelf.label} →`,
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

function overlaps(x: number, z: number, box: Collider, radius: number): boolean {
  return (
    x + radius > box.minX &&
    x - radius < box.maxX &&
    z + radius > box.minZ &&
    z - radius < box.maxZ
  );
}

function hitsAny(x: number, z: number, colliders: Collider[], radius = PLAYER_R): boolean {
  for (const c of colliders) {
    if (overlaps(x, z, c, radius)) return true;
  }
  return false;
}

function unstick(x: number, z: number, colliders: Collider[]): Vec2 {
  if (!hitsAny(x, z, colliders)) return { x, z };
  const steps = [
    [0.3, 0],
    [-0.3, 0],
    [0, 0.3],
    [0, -0.3],
    [0.45, 0.45],
    [-0.45, 0.45],
    [0.45, -0.45],
    [-0.45, -0.45],
  ];
  for (const [sx, sz] of steps) {
    if (!hitsAny(x + sx, z + sz, colliders)) return { x: x + sx, z: z + sz };
  }
  return { x, z };
}

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

  const freeX = !hitsAny(tryX, z, colliders);
  const freeZ = !hitsAny(x, tryZ, colliders);
  if (freeX && freeZ) {
    return Math.abs(dx) >= Math.abs(dz) ? { x: tryX, z } : { x, z: tryZ };
  }
  if (freeX) return { x: tryX, z };
  if (freeZ) return { x, z: tryZ };

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
    const maxDist = slot.display === "low-shelf" ? 5.5 : 4.2;
    if (dist > maxDist || dist < 0.4) continue;

    const { x: faceX, z: faceZ } = shelfFaceNormal(slot.facing);
    const along = (x - slot.x) * faceX + (z - slot.z) * faceZ;
    if (slot.display === "low-shelf") {
      if (along < 0.7 || along > 4.2) continue;
    } else if (along < -0.2 || along > 3.2) {
      continue;
    }

    const lookX = Math.sin(yaw);
    const lookZ = -Math.cos(yaw);
    const towardX = toX / dist;
    const towardZ = toZ / dist;
    const align = lookX * towardX + lookZ * towardZ;
    if (align < 0.5) continue;

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
