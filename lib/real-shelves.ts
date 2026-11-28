export type RealShelfPhoto = {
  /** Path under /public, e.g. "/real-shelves/living-room.jpg". */
  src: string;
  /** Short caption written under the photo; also used as its alt text. */
  caption: string;
};

/**
 * Photos of the real shelves at home, pinned to the corkboard before the backrooms door.
 * To add one: drop the image in public/real-shelves/ and add a line here.
 * With an empty list the board shows blank polaroids.
 */
export const REAL_SHELF_PHOTOS: RealShelfPhoto[] = [];
