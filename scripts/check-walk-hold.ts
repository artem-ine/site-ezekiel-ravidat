/**
 * Scripted checks for duplex walk hold / tap physics (no browser required).
 * Run: npx tsx scripts/check-walk-hold.ts
 */
import {
  WALK_MAX_SPEED,
  WALK_STEP,
  WALK_TAP_IMPULSE,
  heldDirection,
  seedTapImpulse,
  stepWalk,
} from "../components/library2d/walkPhysics";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

function simulate(
  seconds: number,
  keys: { left: boolean; right: boolean },
  lastDir: -1 | 0 | 1,
  startVelocity = 0,
  reducedMotion = false,
) {
  const dt = 1 / 60;
  let velocity = startVelocity;
  let x = 0;
  let frames = 0;
  const total = Math.round(seconds * 60);
  for (let i = 0; i < total; i++) {
    const stepped = stepWalk({
      velocity,
      keys,
      lastDir,
      dt,
      reducedMotion,
    });
    velocity = stepped.velocity;
    x += stepped.dx;
    frames += 1;
    if (!stepped.keepGoing && !keys.left && !keys.right) break;
  }
  return { x, velocity, frames };
}

// --- heldDirection ---
assert(heldDirection({ left: false, right: true }, 0) === 1, "right only");
assert(heldDirection({ left: true, right: false }, 0) === -1, "left only");
assert(
  heldDirection({ left: true, right: true }, 1) === 1,
  "both down prefers lastDir right",
);
assert(
  heldDirection({ left: true, right: true }, -1) === -1,
  "both down prefers lastDir left",
);
assert(heldDirection({ left: false, right: false }, 1) === 0, "none down");

// --- tap impulse coasts ~WALK_STEP ---
{
  let velocity = seedTapImpulse(0, 1);
  let x = 0;
  for (let i = 0; i < 120; i++) {
    const stepped = stepWalk({
      velocity,
      keys: { left: false, right: false },
      lastDir: 0,
      dt: 1 / 60,
      reducedMotion: false,
    });
    velocity = stepped.velocity;
    x += stepped.dx;
    if (!stepped.keepGoing) break;
  }
  assert(Math.abs(x - WALK_STEP) < 8, `tap coast ≈ ${WALK_STEP}px (got ${x.toFixed(1)})`);
}

// --- hold for 1s travels near cruise distance ---
{
  const impulse = seedTapImpulse(0, 1);
  const held = simulate(1, { left: false, right: true }, 1, impulse);
  // Should be well above one tap and near ~MAX_SPEED * ~0.85s after accel
  assert(held.x > WALK_STEP * 2, `hold 1s moves more than two taps (got ${held.x.toFixed(1)})`);
  assert(
    held.x > WALK_MAX_SPEED * 0.5,
    `hold 1s reaches cruise scale (got ${held.x.toFixed(1)})`,
  );
  assert(held.frames >= 50, "hold keeps rAF running for ~1s");
}

// --- opposite keys mid-hold must NOT zero intent ---
{
  const dir = heldDirection({ left: true, right: true }, 1);
  assert(dir === 1, "mid-hold opposite keys keep last direction");
  const mid = simulate(0.5, { left: true, right: true }, 1, WALK_MAX_SPEED);
  assert(mid.x > 50, `both-keys mid-hold still moves (got ${mid.x.toFixed(1)})`);
}

// --- after velocity hits 0 with a key still down, keepGoing stays true ---
{
  const stepped = stepWalk({
    velocity: 0,
    keys: { left: false, right: true },
    lastDir: 1,
    dt: 1 / 60,
    reducedMotion: false,
  });
  assert(stepped.keepGoing, "key still down ⇒ keepGoing even at 0 velocity");
  assert(stepped.velocity > 0, "accelerates from rest while held");
}

// --- reduced motion: no glide after release ---
{
  const stepped = stepWalk({
    velocity: WALK_MAX_SPEED,
    keys: { left: false, right: false },
    lastDir: 0,
    dt: 1 / 60,
    reducedMotion: true,
  });
  assert(stepped.velocity === 0 && !stepped.keepGoing, "reduced motion hard-stops");
}

// --- impulse magnitude ---
assert(WALK_TAP_IMPULSE > WALK_MAX_SPEED, "tap impulse exceeds cruise (for short coast)");

if (process.exitCode) {
  console.error("\ncheck-walk-hold: FAILED");
  process.exit(1);
}
console.log("\ncheck-walk-hold: all passed");
