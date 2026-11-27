export type Sprite = {
  /** Left half of every row, centre column last. The right half is mirrored. */
  half: readonly string[];
  palette: Readonly<Record<string, string>>;
};

type Rect = { x: number; y: number; w: number; fill: string };

function spriteRects(sprite: Sprite): { rects: Rect[]; width: number; height: number } {
  const rects: Rect[] = [];
  const width = sprite.half[0]!.length * 2;

  sprite.half.forEach((half, y) => {
    const row = half + [...half].reverse().join("");
    let x = 0;
    while (x < row.length) {
      const key = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === key) end += 1;
      const fill = sprite.palette[key];
      if (fill) rects.push({ x, y, w: end - x, fill });
      x = end;
    }
  });

  return { rects, width, height: sprite.half.length };
}

/** Crisp pixel art drawn as merged SVG rects, so it scales to any size. */
export function PixelSprite({ sprite, className }: { sprite: Sprite; className?: string }) {
  const { rects, width, height } = spriteRects(sprite);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {rects.map((rect) => (
        <rect key={`${rect.x}-${rect.y}`} x={rect.x} y={rect.y} width={rect.w} height={1} fill={rect.fill} />
      ))}
    </svg>
  );
}
