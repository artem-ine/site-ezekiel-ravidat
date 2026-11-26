import type { WalkBay } from "@/components/library2d/floorLayout";
import { pickProps, type FloorProp, type WallProp } from "@/components/library2d/decorCatalog";
import { windowSpec } from "@/components/library2d/WallWindow";

/** One CSS-drawn sprite; its parts are the numbered children styled per kind. */
function Prop({ kind, wall }: { kind: FloorProp | WallProp; wall?: boolean }) {
  return (
    <div className={`walk-prop walk-prop--${kind}${wall ? " walk-prop--wall" : ""}`}>
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

/**
 * The furniture of a genre's room: a rug and one standing piece beside the
 * cabinet, plus a wall piece where the bay has no window. What is drawn depends
 * on the genre, not on where the column happens to sit.
 */
export function ThemeDecor({ bay }: { bay: WalkBay }) {
  const props = pickProps(bay.theme.id, bay.slot, bay.floor, windowSpec(bay) === null);

  return (
    <div className="walk-decor" aria-hidden="true">
      <div className="walk-rug" />
      <Prop kind={props.floor} />
      {props.wall && <Prop kind={props.wall} wall />}
    </div>
  );
}
