import type { CSSProperties } from "react";
import {
  WallWindow,
  WallWindowPatch,
  windowSpec,
  type WindowKind,
} from "@/components/library2d/WallWindow";

export type InterludeKind = "stairs" | "table" | "hearth" | "globe" | "garden";

type Fixture = "stairs" | "landing" | "table";

type PropKind =
  | "hearth"
  | "armchair"
  | "globe"
  | "desk"
  | "planter"
  | "bench"
  | "vase"
  | "cushion"
  | "bonsai"
  | "hangplant"
  | "map"
  | "lantern";

type Placed = {
  kind: PropKind;
  /** Distance from the interlude's left edge, in rem. */
  x: number;
  /** Hangs on the wall instead of standing on the floor. */
  wall?: boolean;
};

type StoreyScene = {
  window?: WindowKind;
  fixture?: Fixture;
  props?: Placed[];
};

/**
 * Each interlude is a short room between two genre columns, drawn on both floors.
 * Furniture lives here, not in the genre bays, so the shelves stay uncluttered and
 * every window sits clear of them.
 */
export const INTERLUDE_SCENES: Record<InterludeKind, { upper: StoreyScene; ground: StoreyScene }> = {
  stairs: {
    ground: { fixture: "stairs" },
    upper: {
      window: "tall",
      fixture: "landing",
      props: [
        { kind: "lantern", x: 1.3, wall: true },
        { kind: "vase", x: 8.7 },
      ],
    },
  },
  table: {
    ground: { window: "arch", fixture: "table" },
    upper: {
      props: [
        { kind: "bench", x: 3.4 },
        { kind: "hangplant", x: 1, wall: true },
        { kind: "hangplant", x: 8.4, wall: true },
      ],
    },
  },
  hearth: {
    ground: {
      props: [
        { kind: "hearth", x: 1 },
        { kind: "armchair", x: 6.4 },
      ],
    },
    upper: {
      window: "round",
      props: [
        { kind: "cushion", x: 1.4 },
        { kind: "bonsai", x: 6.8 },
      ],
    },
  },
  globe: {
    ground: {
      props: [
        { kind: "map", x: 3.5, wall: true },
        { kind: "globe", x: 1 },
        { kind: "desk", x: 5.7 },
      ],
    },
    upper: {
      window: "triple",
      props: [
        { kind: "planter", x: 1.4 },
        { kind: "bench", x: 5.8 },
      ],
    },
  },
  garden: {
    ground: {
      window: "arch",
      props: [
        { kind: "planter", x: 1.2 },
        { kind: "bench", x: 6 },
      ],
    },
    upper: {
      window: "round",
      props: [
        { kind: "vase", x: 1.8 },
        { kind: "armchair", x: 6.2 },
      ],
    },
  },
};

export const INTERLUDE_ORDER: InterludeKind[] = ["stairs", "table", "hearth", "globe", "garden"];

/** Consecutive slots always differ, so no two neighbouring interludes look the same. */
export function interludeKind(slot: number): InterludeKind {
  return INTERLUDE_ORDER[slot % INTERLUDE_ORDER.length]!;
}

/** One CSS-drawn sprite; its parts are the numbered children styled per kind. */
function Prop({ kind, x, wall }: Placed) {
  return (
    <div
      className={`walk-prop walk-prop--${kind}${wall ? " walk-prop--wall" : ""}`}
      style={{ left: `${x}rem` } as CSSProperties}
    >
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

function FixtureView({ fixture }: { fixture: Fixture }) {
  return (
    <div className={`walk-fix walk-fix--${fixture}`}>
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

function Storey({
  id,
  upper,
  scene,
}: {
  id: string;
  upper: boolean;
  scene: StoreyScene;
}) {
  const win = scene.window ? windowSpec(id, scene.window) : null;
  return (
    <div className={`walk-gap__storey walk-gap__storey--${upper ? "upper" : "ground"}`}>
      <div className="walk-gap__wall">{win && <WallWindow spec={win} />}</div>
      {scene.fixture && <FixtureView fixture={scene.fixture} />}
      {scene.props?.map((prop) => (
        <Prop key={`${prop.kind}-${prop.x}`} {...prop} />
      ))}
      <div className="walk-gap__deck" />
      {win && <WallWindowPatch spec={win} />}
    </div>
  );
}

/** A half-floor room where the genre changes on one floor; `index` counts the rooms along the walk. */
export function Interlude({ index, upper }: { index: number; upper: boolean }) {
  const kind = interludeKind(index);
  const scene = INTERLUDE_SCENES[kind];
  return (
    <div className={`walk-gap walk-gap--${kind}`} aria-hidden="true">
      <Storey id={`gap-${index}-${upper ? "up" : "down"}`} upper={upper} scene={upper ? scene.upper : scene.ground} />
    </div>
  );
}
