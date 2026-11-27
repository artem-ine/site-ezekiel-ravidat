import { STATUS_MARK } from "@/lib/spine-style";
import type { LibraryBook } from "@/lib/books";

export const MAX_SPINES_PER_SIDE = 22;

/** Look up / down enough to see top and bottom shelf rows. */
export const PITCH_MAX = 0.48;

export const FOV_AISLE = 52;
export const FOV_SHELF = 40;
export const EYE_HEIGHT = 1.4;

/** Floor → top of bookcase, for framing math. */
export const BAY_HEIGHT = 2.75;
export const BAY_MID_Y = BAY_HEIGHT / 2;
export const FRAME_MARGIN = 1.14;

/** Internal render scale — 1/3, upscaled with nearest-neighbour. */
export const PIXEL_SCALE = 3;

/** How close a bay must be to render. */
export const RENDER_RADIUS = 14;

export const PALETTE = {
  walnut: "#4a2f1c",
  honey: "#c4a35a",
  oxblood: "#6b2a24",
  brass: "#c9a227",
  paper: "#e8d9b5",
  deepGreen: "#2f4a3c",
  ink: "#1e140e",
  lamp: "#ffd28a",
  fog: "#2a1d14",
} as const;

export function clampPitch(pitch: number): number {
  return Math.min(PITCH_MAX, Math.max(-PITCH_MAX, pitch));
}

/** Distance from shelf face so the full bay fits in FOV_SHELF with margin. */
export function shelfViewDistance(fovDeg = FOV_SHELF): number {
  const half = ((fovDeg * Math.PI) / 180) / 2;
  return ((BAY_HEIGHT / 2) / Math.tan(half)) * FRAME_MARGIN;
}

export function statusMark(book: LibraryBook): string {
  return book.readStatus ? STATUS_MARK[book.readStatus] : "?";
}

/** Same-origin cover URL for WebGL textures. */
export function coverTextureUrl(coverUrl: string | null): string | null {
  if (!coverUrl) return null;
  try {
    const host = new URL(coverUrl).hostname;
    if (host !== "images.prismic.io" && host !== "images.cdn.prismic.io") return null;
  } catch {
    return null;
  }
  return `/api/cover?u=${encodeURIComponent(coverUrl)}`;
}

export function hashUid(uid: string): number {
  let value = 0;
  for (let i = 0; i < uid.length; i += 1) {
    value = (value * 31 + uid.charCodeAt(i)) >>> 0;
  }
  return value;
}
