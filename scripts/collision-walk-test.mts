/**
 * Headless walk of every aisle junction / stack corner on the current floor plan.
 * Paths follow clear corridors (L-shaped), never cut through stack colliders.
 * Run: npx tsx scripts/collision-walk-test.mts
 */
import {
  buildFloorPlan,
  hitsAny,
  moveWithCollision,
  nudgeFromColliders,
  PLAYER_R,
} from "../components/room/floorPlan";

const plan = buildFloorPlan();
const { colliders, stacks, entrance, floor } = plan;

type Pt = { x: number; z: number; label: string };

function assertFree(x: number, z: number, label: string) {
  if (hitsAny(x, z, colliders)) {
    throw new Error(`TRAPPED at ${label} (${x.toFixed(2)}, ${z.toFixed(2)})`);
  }
}

/** Straight walk; fail if we stall short of the goal. */
function walkStraight(from: Pt, to: Pt) {
  let x = from.x;
  let z = from.z;
  assertFree(x, z, `start ${from.label}`);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.15) return;
  const step = 0.1;
  const steps = Math.ceil(dist / step);
  let stalled = 0;

  for (let i = 0; i < steps; i += 1) {
    const sx = dx / steps;
    const sz = dz / steps;
    const next = moveWithCollision(x, z, sx, sz, colliders);
    const moved = Math.hypot(next.x - x, next.z - z);
    if (moved < 0.008) {
      stalled += 1;
      const nudged = nudgeFromColliders(x, z, colliders);
      const retry = moveWithCollision(nudged.x, nudged.z, sx, sz, colliders);
      if (Math.hypot(retry.x - x, retry.z - z) < 0.008) {
        if (stalled > 4) {
          throw new Error(
            `STUCK walking ${from.label} → ${to.label} near (${x.toFixed(2)}, ${z.toFixed(2)})`,
          );
        }
      } else {
        x = retry.x;
        z = retry.z;
        stalled = 0;
      }
    } else {
      x = next.x;
      z = next.z;
      stalled = 0;
    }
  }

  const remain = Math.hypot(to.x - x, to.z - z);
  if (remain > 0.45) {
    throw new Error(
      `SHORT walk ${from.label} → ${to.label}: stopped ${remain.toFixed(2)} from goal at (${x.toFixed(2)}, ${z.toFixed(2)})`,
    );
  }
  assertFree(x, z, `end ${to.label}`);
}

/** Snap Z to a clear east-west corridor (never along a bay centre line). */
function safeCrossZ(z: number): number {
  // Must sit in the gaps between bay rows (and north of the back stack ends).
  const crosses = [3.2, -2.2, -8.1, -13.2];
  let best = crosses[0];
  let bestD = Infinity;
  for (const c of crosses) {
    const d = Math.abs(c - z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Snap X to the centre aisle or a between-column aisle. */
function safeAisleX(x: number): number {
  const aisles = [0, ...xs.slice(0, -1).map((v, i) => (v + xs[i + 1]) / 2)];
  let best = 0;
  let bestD = Infinity;
  for (const a of aisles) {
    const d = Math.abs(a - x);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/**
 * Route only along clear corridors: vertical aisle X, then horizontal cross Z.
 * Never walks along a bay's Z midline (that would hit the cases).
 */
function walkViaAisle(from: Pt, to: Pt) {
  const fromCross = safeCrossZ(from.z);
  const toCross = safeCrossZ(to.z);
  const fromAisle = safeAisleX(from.x);
  const toAisle = safeAisleX(to.x);

  const wps: Pt[] = [
    from,
    { x: from.x, z: fromCross, label: `${from.label}>cross` },
    { x: fromAisle, z: fromCross, label: `${from.label}>aisle` },
    { x: 0, z: fromCross, label: `${from.label}>center` },
    { x: 0, z: toCross, label: `center>${to.label}` },
    { x: toAisle, z: toCross, label: `aisle>${to.label}` },
    { x: to.x, z: toCross, label: `cross>${to.label}` },
    to,
  ];
  for (let i = 0; i < wps.length - 1; i += 1) {
    walkStraight(wps[i], wps[i + 1]);
  }
}

function spinInPlace(x: number, z: number, label: string) {
  let px = x;
  let pz = z;
  for (let i = 0; i < 24; i += 1) {
    const nudged = nudgeFromColliders(px, pz, colliders);
    px = nudged.x;
    pz = nudged.z;
    assertFree(px, pz, `spin ${label} step ${i}`);
    // Tiny forward step while "facing" different ways — must slide, not lodge.
    const yaw = (i / 24) * Math.PI * 2;
    const step = moveWithCollision(
      px,
      pz,
      Math.sin(yaw) * 0.08,
      -Math.cos(yaw) * 0.08,
      colliders,
    );
    px = step.x;
    pz = step.z;
    assertFree(px, pz, `spin-step ${label} ${i}`);
  }
}

const xs = [...new Set(stacks.map((s) => s.x))].sort((a, b) => a - b);
const zs = [...new Set(stacks.map((s) => s.z))].sort((a, b) => b - a);

// Clear standing points in aisle centres and cross-aisles.
const probes: Pt[] = [
  { x: entrance.x, z: entrance.z, label: "entrance" },
  { x: 0, z: 2, label: "center-south" },
  { x: 0, z: -2.5, label: "center-mid" },
  { x: 0, z: -8, label: "center-north" },
  { x: 0, z: -12.4, label: "north-stacks" },
];

for (let i = 0; i < xs.length - 1; i += 1) {
  const midX = (xs[i] + xs[i + 1]) / 2;
  for (const z of zs) {
    probes.push({ x: midX, z, label: `aisle ${midX.toFixed(1)}@${z}` });
  }
  // Crossings between bay rows
  for (let j = 0; j < zs.length - 1; j += 1) {
    const midZ = (zs[j] + zs[j + 1]) / 2;
    probes.push({ x: midX, z: midZ, label: `junction ${midX.toFixed(1)}@${midZ.toFixed(1)}` });
  }
}

for (let j = 0; j < zs.length - 1; j += 1) {
  const midZ = (zs[j] + zs[j + 1]) / 2;
  probes.push({ x: 0, z: midZ, label: `cross-center@${midZ.toFixed(1)}` });
}

// Stand beside stack ends in the cross-aisle (not inside the case).
const endClear = 1.85; // beyond STACK_HALF_LEN 1.5 + radius
for (const s of stacks) {
  const zPlus = s.z + endClear;
  const zMinus = s.z - endClear;
  // Skip end probes that land in the desk alcove / south wall clutter.
  if (zPlus < floor.maxZ - 1.2 && zPlus > floor.minZ + 1.2) {
    probes.push({ x: s.x + 1.15, z: zPlus, label: `end+ ${s.id}` });
  }
  if (zMinus < floor.maxZ - 1.2 && zMinus > floor.minZ + 1.2) {
    probes.push({ x: s.x - 1.15, z: zMinus, label: `end- ${s.id}` });
  }
}

probes.push({ x: floor.minX + 2.0, z: -5, label: "near-west" });
probes.push({ x: floor.maxX - 2.0, z: -5, label: "near-east" });
probes.push({ x: -6.2, z: 3.8, label: "desk-path" });

console.log(`PLAYER_R=${PLAYER_R} colliders=${colliders.length} probes=${probes.length}`);

const free: Pt[] = [];
for (const p of probes) {
  if (hitsAny(p.x, p.z, colliders)) {
    console.warn(`BLOCKED probe (will widen layout if critical): ${p.label}`);
  } else {
    free.push(p);
    spinInPlace(p.x, p.z, p.label);
  }
}

if (free.length < probes.length * 0.85) {
  throw new Error(`Too many blocked probes: ${probes.length - free.length}/${probes.length}`);
}

const start = free[0];
for (const p of free) {
  if (p === start) continue;
  walkViaAisle(start, p);
  walkViaAisle(p, start);
}

// Full perimeter loop along clear aisles.
const loop: Pt[] = [
  { x: 0, z: 4, label: "loop-s" },
  { x: 0, z: -13.2, label: "loop-n" },
  { x: -5.6, z: -13.2, label: "loop-nw" },
  { x: -5.6, z: 3.2, label: "loop-sw" },
  { x: 5.6, z: 3.2, label: "loop-se" },
  { x: 5.6, z: -13.2, label: "loop-ne" },
  { x: 0, z: -13.2, label: "loop-n2" },
  { x: 0, z: 4, label: "loop-s2" },
];
for (const p of loop) assertFree(p.x, p.z, p.label);
for (let i = 0; i < loop.length - 1; i += 1) {
  walkStraight(loop[i], loop[i + 1]);
}

// Deliberately walk into a stack face then slide along it.
const intoStack = stacks[0];
const face: Pt = {
  x: intoStack.x + 1.4,
  z: intoStack.z,
  label: "face-approach",
};
assertFree(face.x, face.z, face.label);
let x = face.x;
let z = face.z;
for (let i = 0; i < 20; i += 1) {
  const next = moveWithCollision(x, z, -0.1, 0.05, colliders);
  // Must keep moving along Z even while X is blocked.
  if (i > 5 && Math.abs(next.z - z) < 1e-4 && Math.abs(next.x - x) < 1e-4) {
    throw new Error(`No slide along stack face at (${x.toFixed(2)}, ${z.toFixed(2)})`);
  }
  x = next.x;
  z = next.z;
  assertFree(x, z, `slide ${i}`);
}

console.log(`OK free=${free.length}/${probes.length} corridor walks + spins + slide passed`);
