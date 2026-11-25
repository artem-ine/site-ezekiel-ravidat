/** Shared walk motion constants + pure step for the duplex keyboard walker. */

export const WALK_STEP = 72;
export const WALK_MAX_SPEED = 220;
export const WALK_ACCEL = 900;
export const WALK_DECEL = 1000;
/** Seed velocity on press: decelerating from this covers ~WALK_STEP. */
export const WALK_TAP_IMPULSE = Math.sqrt(2 * WALK_DECEL * WALK_STEP);
export const WALK_STOP_EPS = 8;

export type WalkKeys = { left: boolean; right: boolean };

/**
 * Resolve intent when one or both directions are down.
 * Prefer the most recently pressed direction so opposite-key mid-hold
 * does not cancel motion (heldDir === 0) and kill the rAF loop.
 */
export function heldDirection(
  keys: WalkKeys,
  lastDir: -1 | 0 | 1,
): -1 | 0 | 1 {
  if (keys.right && keys.left) {
    return lastDir === 0 ? 1 : lastDir;
  }
  if (keys.right) return 1;
  if (keys.left) return -1;
  return 0;
}

export function approach(current: number, target: number, maxDelta: number) {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

export type WalkStepInput = {
  velocity: number;
  keys: WalkKeys;
  lastDir: -1 | 0 | 1;
  dt: number;
  reducedMotion: boolean;
};

export type WalkStepResult = {
  velocity: number;
  dx: number;
  heldDir: -1 | 0 | 1;
  /** True when the rAF loop should keep running. */
  keepGoing: boolean;
};

/**
 * One integration step. Pure — safe to unit-test without a browser.
 * While any walk key is down, keepGoing stays true even if velocity is ~0
 * (so we can accelerate again after a direction switch).
 */
export function stepWalk(input: WalkStepInput): WalkStepResult {
  const heldDir = heldDirection(input.keys, input.lastDir);
  const dt = Math.min(Math.max(input.dt, 0), 0.05);
  let velocity = input.velocity;

  if (input.reducedMotion) {
    if (heldDir === 0) {
      return { velocity: 0, dx: 0, heldDir, keepGoing: false };
    }
    velocity = heldDir * WALK_MAX_SPEED;
    return { velocity, dx: velocity * dt, heldDir, keepGoing: true };
  }

  if (heldDir !== 0) {
    velocity = approach(velocity, heldDir * WALK_MAX_SPEED, WALK_ACCEL * dt);
  } else {
    velocity = approach(velocity, 0, WALK_DECEL * dt);
  }

  const moving = Math.abs(velocity) > WALK_STOP_EPS;
  const keepGoing = heldDir !== 0 || moving;
  if (!keepGoing) velocity = 0;

  return { velocity, dx: velocity * dt, heldDir, keepGoing };
}

/** Seed / reinforce tap impulse in `dir` without clobbering faster same-way speed. */
export function seedTapImpulse(velocity: number, dir: -1 | 1): number {
  const seeded = dir * WALK_TAP_IMPULSE;
  return dir > 0 ? Math.max(velocity, seeded) : Math.min(velocity, seeded);
}
