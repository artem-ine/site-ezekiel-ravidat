import type { CSSProperties } from "react";
import type { WalkBay } from "@/components/library2d/floorLayout";
import { SCENES, type WindowKind } from "@/components/library2d/decorCatalog";
import { hash } from "@/lib/spine-style";

/** Share of bays that get a window at all; the rest keep a plain wall. */
const WINDOW_PERCENT = 55;

type Spec = {
  kind: WindowKind;
  leftPercent: number;
  topPercent: number;
  /** Sideways drift of the light on its way to the floor (rem, signed). */
  beamDxRem: number;
  curtains: boolean;
  plant: boolean;
  night: boolean;
  /** Sci-fi rooms look out on space rather than a sky. */
  space: boolean;
};

/** Deterministic per bay, so a window never jumps between renders. */
export function windowSpec(bay: WalkBay): Spec | null {
  const h = hash(`${bay.id}-window`);
  if (h % 100 >= WINDOW_PERCENT) return null;
  return {
    kind: SCENES[bay.theme.id].windows[(h >>> 7) % SCENES[bay.theme.id].windows.length]!,
    // Clear of the section sign on the left.
    leftPercent: 44 + ((h >>> 11) % 27),
    topPercent: 7 + ((h >>> 16) % 6),
    beamDxRem: ((h >>> 24) % 2 === 0 ? 1 : -1) * (2.2 + ((h >>> 26) % 4) * 0.4),
    curtains: (h >>> 20) % 3 === 0,
    plant: (h >>> 22) % 2 === 0,
    night: bay.theme.mood === "dark",
    space: bay.theme.id === "scifi",
  };
}

function varsFor(spec: Spec): CSSProperties {
  return {
    "--win-left": `${spec.leftPercent}%`,
    "--win-top": `${spec.topPercent}%`,
    "--beam-dx": `${spec.beamDxRem}rem`,
  } as CSSProperties;
}

/** The window and the shaft of light it throws down the wall. Drawn in the wall layer. */
export function WallWindow({ bay }: { bay: WalkBay }) {
  const spec = windowSpec(bay);
  if (!spec) return null;

  return (
    <div
      className={`walk-window-set walk-window-set--${spec.kind}${spec.night ? " is-night" : ""}${spec.space ? " is-space" : ""}`}
      style={varsFor(spec)}
    >
      <div className="walk-window">
        <div className="walk-window__glass" />
        {spec.curtains && (
          <>
            <span className="walk-window__curtain walk-window__curtain--l" />
            <span className="walk-window__curtain walk-window__curtain--r" />
          </>
        )}
        <div className="walk-window__sill">
          {spec.plant && <span className="walk-window__pot" />}
        </div>
      </div>
      <div className="walk-window__beam" />
    </div>
  );
}

/** The patch of light that lands on the floor; drawn above the deck. */
export function WallWindowPatch({ bay }: { bay: WalkBay }) {
  const spec = windowSpec(bay);
  if (!spec) return null;

  return (
    <div
      className={`walk-window-set walk-window-set--${spec.kind} walk-window-set--floor${spec.night ? " is-night" : ""}${spec.space ? " is-space" : ""}`}
      style={varsFor(spec)}
      aria-hidden="true"
    >
      <div className="walk-window__patch" />
    </div>
  );
}
