import type { CSSProperties } from "react";
import { hash } from "@/lib/spine-style";

export type WindowKind = "arch" | "round" | "tall" | "triple";

export type WindowSpec = {
  kind: WindowKind;
  /** Sideways drift of the light on its way to the floor (rem, signed). */
  beamDxRem: number;
  curtains: boolean;
  plant: boolean;
};

/** Deterministic per interlude, so a window never changes between renders. */
export function windowSpec(id: string, kind: WindowKind): WindowSpec {
  const h = hash(`${id}-window`);
  return {
    kind,
    beamDxRem: (h % 2 === 0 ? 1 : -1) * (1.4 + ((h >>> 3) % 3) * 0.4),
    curtains: (h >>> 5) % 2 === 0,
    plant: (h >>> 7) % 2 === 0,
  };
}

/** Windows are centred in their interlude, so no cabinet can ever stand in front of one. */
function varsFor(spec: WindowSpec): CSSProperties {
  return {
    "--win-left": "calc(50% - var(--win-w) / 2)",
    "--win-top": "9%",
    "--beam-dx": `${spec.beamDxRem}rem`,
  } as CSSProperties;
}

/** The window and the shaft of light it throws down the wall. Drawn in the wall layer. */
export function WallWindow({ spec }: { spec: WindowSpec }) {
  return (
    <div className={`walk-window-set walk-window-set--${spec.kind}`} style={varsFor(spec)}>
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
export function WallWindowPatch({ spec }: { spec: WindowSpec }) {
  return (
    <div
      className={`walk-window-set walk-window-set--${spec.kind} walk-window-set--floor`}
      style={varsFor(spec)}
      aria-hidden="true"
    >
      <div className="walk-window__patch" />
    </div>
  );
}
