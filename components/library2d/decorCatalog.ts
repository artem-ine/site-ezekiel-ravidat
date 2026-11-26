import type { ThemeId } from "@/components/library2d/sectionTheme";
import { hash } from "@/lib/spine-style";

export type WindowKind = "square" | "arch" | "round" | "tall" | "triple";

/** Things that stand on the floor beside a cabinet. */
export type FloorProp =
  | "crystal"
  | "cauldron"
  | "hearth"
  | "console"
  | "robot"
  | "loveseat"
  | "vase"
  | "hatstand"
  | "desk"
  | "candelabra"
  | "grandclock"
  | "armchair"
  | "bust"
  | "catbasket"
  | "armor"
  | "globe"
  | "planter"
  | "bench"
  | "beanbag"
  | "stereo"
  | "podium"
  | "placards"
  | "bonsai"
  | "cushion";

/** Things that hang on the wall (or from the ceiling) where a bay has no window. */
export type WallProp =
  | "torch"
  | "screen"
  | "bunting"
  | "corkboard"
  | "portrait"
  | "portraits"
  | "map"
  | "hangplant"
  | "posters"
  | "noticeboard"
  | "lantern";

type Scene = {
  floor: readonly FloorProp[];
  wall: readonly WallProp[];
  /** Window shapes this room can have; they differ from room to room. */
  windows: readonly WindowKind[];
};

export const SCENES: Record<ThemeId, Scene> = {
  fantasy: {
    floor: ["crystal", "cauldron", "hearth"],
    wall: ["torch"],
    windows: ["arch", "round", "tall"],
  },
  scifi: {
    floor: ["console", "robot"],
    wall: ["screen"],
    windows: ["round", "triple"],
  },
  romance: {
    floor: ["loveseat", "vase"],
    wall: ["bunting"],
    windows: ["arch", "square"],
  },
  mystery: {
    floor: ["hatstand", "desk"],
    wall: ["corkboard"],
    windows: ["tall", "square"],
  },
  horror: {
    floor: ["candelabra", "grandclock"],
    wall: ["portrait"],
    windows: ["tall", "arch"],
  },
  literary: {
    floor: ["armchair", "bust", "catbasket"],
    wall: ["portraits"],
    windows: ["square", "triple", "arch"],
  },
  history: {
    floor: ["armor", "globe"],
    wall: ["map"],
    windows: ["arch", "tall"],
  },
  nature: {
    floor: ["planter", "bench"],
    wall: ["hangplant"],
    windows: ["round", "triple", "square"],
  },
  ya: {
    floor: ["beanbag", "stereo"],
    wall: ["posters"],
    windows: ["square", "round"],
  },
  civic: {
    floor: ["podium", "placards"],
    wall: ["noticeboard"],
    windows: ["triple", "square"],
  },
  mind: {
    floor: ["bonsai", "cushion"],
    wall: ["lantern"],
    windows: ["square", "round"],
  },
};

/**
 * Pick this bay's props. The index moves with the column and the floor, so
 * neighbouring bays of one genre show different pieces from the same set.
 */
export function pickProps(
  theme: ThemeId,
  slot: number,
  floor: number,
  windowless: boolean,
): { floor: FloorProp; wall: WallProp | null } {
  const scene = SCENES[theme];
  const step = slot + floor * 2 + (hash(theme) % 7);
  return {
    floor: scene.floor[step % scene.floor.length]!,
    wall: windowless ? scene.wall[(step + 1) % scene.wall.length]! : null,
  };
}
