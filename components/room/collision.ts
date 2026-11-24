/** Circle-vs-AABB slide collision for the library walk. No React / Three deps. */

export type Vec2 = { x: number; z: number };

export type Collider = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/** Small body radius — easy to slip through aisles and furniture gaps. */
export const PLAYER_R = 0.14;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function overlaps(x: number, z: number, box: Collider, radius: number): boolean {
  return (
    x + radius > box.minX &&
    x - radius < box.maxX &&
    z + radius > box.minZ &&
    z - radius < box.maxZ
  );
}

export function hitsAny(
  x: number,
  z: number,
  colliders: Collider[],
  radius = PLAYER_R,
): boolean {
  for (const box of colliders) {
    if (overlaps(x, z, box, radius)) return true;
  }
  return false;
}

/**
 * Push the circle fully out of every overlapping AABB.
 * Handles concave corners by iterating (resolve A, then B, …).
 */
export function depenetrate(
  x: number,
  z: number,
  colliders: Collider[],
  radius = PLAYER_R,
): Vec2 {
  let px = x;
  let pz = z;

  for (let iter = 0; iter < 8; iter += 1) {
    let moved = false;
    for (const box of colliders) {
      const closestX = clamp(px, box.minX, box.maxX);
      const closestZ = clamp(pz, box.minZ, box.maxZ);
      let dx = px - closestX;
      let dz = pz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < 1e-10) {
        // Centre inside the box — escape along the shallowest face.
        const left = px - box.minX;
        const right = box.maxX - px;
        const south = pz - box.minZ;
        const north = box.maxZ - pz;
        const minPen = Math.min(left, right, south, north);
        if (minPen === left) px = box.minX - radius - 1e-3;
        else if (minPen === right) px = box.maxX + radius + 1e-3;
        else if (minPen === south) pz = box.minZ - radius - 1e-3;
        else pz = box.maxZ + radius + 1e-3;
        moved = true;
        continue;
      }

      const dist = Math.sqrt(distSq);
      if (dist < radius) {
        const push = (radius - dist) / dist + 1e-4;
        px += dx * push;
        pz += dz * push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return { x: px, z: pz };
}

/**
 * Translate with axis slide + corner resolution.
 * Turning is never gated by this — only (dx, dz) are constrained.
 */
export function moveWithCollision(
  x: number,
  z: number,
  dx: number,
  dz: number,
  colliders: Collider[],
  radius = PLAYER_R,
): Vec2 {
  let pos = depenetrate(x, z, colliders, radius);
  const travel = Math.hypot(dx, dz);
  if (travel < 1e-8) return pos;

  const steps = Math.max(1, Math.ceil(travel / Math.max(0.05, radius * 0.45)));
  const sx = dx / steps;
  const sz = dz / steps;

  for (let i = 0; i < steps; i += 1) {
    const fullX = pos.x + sx;
    const fullZ = pos.z + sz;
    if (!hitsAny(fullX, fullZ, colliders, radius)) {
      pos = { x: fullX, z: fullZ };
      continue;
    }

    // Prefer the freer axis.
    const freeX = !hitsAny(pos.x + sx, pos.z, colliders, radius);
    const freeZ = !hitsAny(pos.x, pos.z + sz, colliders, radius);

    if (freeX && !freeZ) {
      pos = { x: pos.x + sx, z: pos.z };
      continue;
    }
    if (freeZ && !freeX) {
      pos = { x: pos.x, z: pos.z + sz };
      continue;
    }
    if (freeX && freeZ) {
      // Both free alone but not together — pick the longer residual.
      pos =
        Math.abs(sx) >= Math.abs(sz)
          ? { x: pos.x + sx, z: pos.z }
          : { x: pos.x, z: pos.z + sz };
      continue;
    }

    // Corner lock: try move-then-depenetrate on each axis (slides out of the wedge).
    const tryX = depenetrate(pos.x + sx, pos.z, colliders, radius);
    if (Math.hypot(tryX.x - pos.x, tryX.z - pos.z) > 1e-4) {
      pos = tryX;
      continue;
    }
    const tryZ = depenetrate(pos.x, pos.z + sz, colliders, radius);
    if (Math.hypot(tryZ.x - pos.x, tryZ.z - pos.z) > 1e-4) {
      pos = tryZ;
      continue;
    }

    // Half-step last resort.
    const hx = depenetrate(pos.x + sx * 0.5, pos.z, colliders, radius);
    if (Math.hypot(hx.x - pos.x, hx.z - pos.z) > 1e-4) {
      pos = hx;
      continue;
    }
    const hz = depenetrate(pos.x, pos.z + sz * 0.5, colliders, radius);
    if (Math.hypot(hz.x - pos.x, hz.z - pos.z) > 1e-4) {
      pos = hz;
      continue;
    }

    pos = depenetrate(pos.x, pos.z, colliders, radius);
    break;
  }

  return depenetrate(pos.x, pos.z, colliders, radius);
}

/**
 * Soft push away from nearby surfaces — call after turning so the camera
 * never pivots into a wall and lodges.
 */
export function nudgeFromColliders(
  x: number,
  z: number,
  colliders: Collider[],
  radius = PLAYER_R,
): Vec2 {
  const sense = radius + 0.16;
  let px = x;
  let pz = z;

  for (const box of colliders) {
    const closestX = clamp(px, box.minX, box.maxX);
    const closestZ = clamp(pz, box.minZ, box.maxZ);
    let dx = px - closestX;
    let dz = pz - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < 1e-10) {
      return depenetrate(px, pz, colliders, radius);
    }

    const dist = Math.sqrt(distSq);
    if (dist < sense) {
      const push = (sense - dist) * 0.4;
      px += (dx / dist) * push;
      pz += (dz / dist) * push;
    }
  }

  return depenetrate(px, pz, colliders, radius);
}
