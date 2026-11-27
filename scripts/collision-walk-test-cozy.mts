/**
 * Headless walk of cozy room corridors / furniture gaps.
 * Run: npx tsx scripts/collision-walk-test-cozy.mts
 */
import {
  buildFloorPlan,
  hitsAny,
  moveWithCollision,
  nudgeFromColliders,
  PLAYER_R,
} from "../components/room/floorPlan";

const plan = buildFloorPlan();
const { colliders, entrance } = plan;

type Pt = { x: number; z: number; label: string };

function assertFree(x: number, z: number, label: string) {
  if (hitsAny(x, z, colliders)) {
    throw new Error(`TRAPPED at ${label} (${x.toFixed(2)}, ${z.toFixed(2)})`);
  }
}

function walkStraight(from: Pt, to: Pt) {
  let x = from.x;
  let z = from.z;
  assertFree(x, z, `start ${from.label}`);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.15) return;
  const steps = Math.ceil(dist / 0.1);
  let stalled = 0;
  for (let i = 0; i < steps; i += 1) {
    const next = moveWithCollision(x, z, dx / steps, dz / steps, colliders);
    if (Math.hypot(next.x - x, next.z - z) < 0.008) {
      stalled += 1;
      const nudged = nudgeFromColliders(x, z, colliders);
      const retry = moveWithCollision(nudged.x, nudged.z, dx / steps, dz / steps, colliders);
      if (Math.hypot(retry.x - x, retry.z - z) < 0.008 && stalled > 4) {
        throw new Error(`STUCK ${from.label}→${to.label} near (${x.toFixed(2)}, ${z.toFixed(2)})`);
      }
      x = retry.x;
      z = retry.z;
    } else {
      x = next.x;
      z = next.z;
      stalled = 0;
    }
  }
  if (Math.hypot(to.x - x, to.z - z) > 0.5) {
    throw new Error(`SHORT ${from.label}→${to.label}: remain ${Math.hypot(to.x - x, to.z - z).toFixed(2)}`);
  }
}

function spin(x: number, z: number, label: string) {
  let px = x;
  let pz = z;
  for (let i = 0; i < 20; i += 1) {
    const n = nudgeFromColliders(px, pz, colliders);
    px = n.x;
    pz = n.z;
    assertFree(px, pz, `spin ${label}`);
    const yaw = (i / 20) * Math.PI * 2;
    const step = moveWithCollision(px, pz, Math.sin(yaw) * 0.07, -Math.cos(yaw) * 0.07, colliders);
    px = step.x;
    pz = step.z;
  }
}

const path: Pt[] = [
  { x: entrance.x, z: entrance.z, label: "entrance" },
  { x: 0, z: 0.6, label: "cross-s" },
  { x: -5.5, z: 0.6, label: "west-entry" },
  { x: -5.5, z: -3.2, label: "hearth-path" },
  { x: 0, z: -3.2, label: "cross-m" },
  { x: 5.5, z: -3.2, label: "east-nook" },
  { x: 5.5, z: 0.6, label: "east-entry" },
  { x: 0, z: 0.6, label: "cross-s2" },
  { x: 0, z: -7.5, label: "cross-n" },
  { x: 0, z: -8.4, label: "quiet-shelves" },
  { x: -5.5, z: -7.5, label: "nw" },
  { x: 5.5, z: -7.5, label: "ne" },
  { x: 0, z: -7.5, label: "cross-n2" },
  { x: 0, z: 3.8, label: "home" },
];

console.log(`cozy PLAYER_R=${PLAYER_R} colliders=${colliders.length}`);

for (const p of path) {
  assertFree(p.x, p.z, p.label);
  spin(p.x, p.z, p.label);
}
for (let i = 0; i < path.length - 1; i += 1) {
  walkStraight(path[i], path[i + 1]);
}

console.log("OK cozy corridor walks + spins passed");
