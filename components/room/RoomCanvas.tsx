"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { shortTitle, spineCloth, spineWidthRem } from "@/lib/spine-style";
import { useWoodTexture } from "@/components/room/woodTexture";
import {
  BAY_SPACING,
  MAX_SPINES_PER_SIDE,
  NEAR_RADIUS,
  YAW_MAX,
} from "@/components/room/roomConfig";

type Props = {
  shelves: ShelfGroup[];
  depth: number;
  yaw: number;
};

export function RoomCanvas({ shelves, depth, yaw }: Props) {
  const nearby = useMemo(
    () =>
      shelves
        .map((shelf, index) => ({ shelf, index }))
        .filter(({ index }) => Math.abs(index - depth) <= NEAR_RADIUS),
    [shelves, depth],
  );

  return (
    <Canvas
      className="room-canvas"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      camera={{ fov: 58, near: 0.1, far: 80, position: [0, 1.55, 2] }}
    >
      <color attach="background" args={["#1a110c"]} />
      <fog attach="fog" args={["#1a110c", 8, 28]} />
      <hemisphereLight args={["#f0d9a8", "#2a1a10", 0.45]} />
      <ambientLight intensity={0.22} />

      <WalkCamera depth={depth} yaw={yaw} />
      <RoomShell bayCount={Math.max(shelves.length, 1)} />

      {nearby.map(({ shelf, index }) => (
        <ShelfBay
          key={shelf.id}
          shelf={shelf}
          index={index}
          yaw={yaw}
          active={Math.round(depth) === index}
        />
      ))}
    </Canvas>
  );
}

function WalkCamera({ depth, yaw }: { depth: number; yaw: number }) {
  const smoothed = useRef({ z: 1.8, x: 0, yaw: 0 });

  useFrame((state) => {
    const targetZ = 1.8 - depth * BAY_SPACING;
    const face = Math.min(1, Math.abs(yaw) / YAW_MAX);
    const targetX = Math.sin(yaw) * (0.1 + face * 0.7);

    smoothed.current.z += (targetZ - smoothed.current.z) * 0.14;
    smoothed.current.x += (targetX - smoothed.current.x) * 0.12;
    smoothed.current.yaw += (yaw - smoothed.current.yaw) * 0.14;

    const { x, z, yaw: lookYaw } = smoothed.current;
    state.camera.position.set(x, 1.55, z);

    const lookDist = 6.5 - face * 4.2;
    const lookX = x + Math.sin(lookYaw) * lookDist;
    const lookZ = z - Math.cos(lookYaw) * lookDist;
    state.camera.lookAt(lookX, 1.35 + face * 0.05, lookZ);
  });

  return null;
}

function RoomShell({ bayCount }: { bayCount: number }) {
  const wood = useWoodTexture(3);
  const length = Math.max(bayCount, 4) * BAY_SPACING + 10;
  wood.repeat.set(length / 3, 2);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -length / 2 + 4]} receiveShadow>
        <planeGeometry args={[8, length]} />
        <meshStandardMaterial map={wood} roughness={0.9} metalness={0.05} color="#7a5533" />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 3.2, -length / 2 + 4]}>
        <planeGeometry args={[8, length]} />
        <meshStandardMaterial color="#2a1c12" roughness={1} />
      </mesh>

      {Array.from({ length: Math.ceil(bayCount / 2) + 2 }, (_, i) => (
        <mesh key={i} position={[0, 3.05, -i * BAY_SPACING * 2]} castShadow>
          <boxGeometry args={[7.2, 0.18, 0.28]} />
          <meshStandardMaterial color="#3d2818" roughness={0.95} />
        </mesh>
      ))}

      <mesh position={[0, 1.5, -bayCount * BAY_SPACING - 2]}>
        <boxGeometry args={[7.5, 3.2, 0.3]} />
        <meshStandardMaterial color="#24160f" roughness={1} />
      </mesh>
    </group>
  );
}

function ShelfBay({
  shelf,
  index,
  yaw,
  active,
}: {
  shelf: ShelfGroup;
  index: number;
  yaw: number;
  active: boolean;
}) {
  const z = -index * BAY_SPACING;
  const leftBooks = shelf.books.slice(0, MAX_SPINES_PER_SIDE);
  const rightSlice = shelf.books.slice(MAX_SPINES_PER_SIDE, MAX_SPINES_PER_SIDE * 2);
  const rightBooks =
    rightSlice.length > 0
      ? rightSlice
      : [...leftBooks].reverse().slice(0, Math.min(MAX_SPINES_PER_SIDE, leftBooks.length));

  return (
    <group position={[0, 0, z]}>
      <Bookcase
        side="left"
        books={leftBooks}
        label={shelf.label}
        count={shelf.books.length}
        yaw={yaw}
        showLabels={active}
      />
      <Bookcase
        side="right"
        books={rightBooks}
        label={shelf.label}
        count={shelf.books.length}
        yaw={yaw}
        showLabels={active}
      />
      <pointLight
        position={[0, 2.6, 0.4]}
        intensity={1.8}
        distance={7}
        color="#ffd28a"
        castShadow={false}
      />
      <mesh position={[0, 2.75, 0.35]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial emissive="#ffcc77" emissiveIntensity={2} color="#e2c57a" />
      </mesh>
    </group>
  );
}

function Bookcase({
  side,
  books,
  label,
  count,
  yaw,
  showLabels,
}: {
  side: "left" | "right";
  books: LibraryBook[];
  label: string;
  count: number;
  yaw: number;
  showLabels: boolean;
}) {
  const wood = useWoodTexture(side === "left" ? 1 : 2);
  wood.repeat.set(1.5, 2);
  const x = side === "left" ? -2.35 : 2.35;
  const face = side === "left" ? 1 : -1;
  const facing = showLabels && (side === "left" ? yaw < -0.45 : yaw > 0.45);

  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.55, 2.9, 3.4]} />
        <meshStandardMaterial map={wood} roughness={0.88} metalness={0.04} color="#6b4428" />
      </mesh>

      {[0.55, 1.15, 1.75, 2.35].map((y) => (
        <mesh key={y} position={[face * 0.12, y, 0]}>
          <boxGeometry args={[0.42, 0.06, 3.2]} />
          <meshStandardMaterial color="#4a301c" roughness={0.92} />
        </mesh>
      ))}

      <mesh position={[face * 0.4, 2.85, 0]}>
        <boxGeometry args={[0.04, 0.28, 1.1]} />
        <meshStandardMaterial color="#d8c39a" roughness={0.7} />
      </mesh>

      <Html
        position={[face * 0.42, 2.88, 0]}
        center
        distanceFactor={facing ? 3.2 : 4.5}
        style={{ pointerEvents: "none" }}
      >
        <div className="room-sign-3d">
          <span className="label">{label}</span>
          <span className="room-sign-3d__count">{count}</span>
        </div>
      </Html>

      <Spines side={side} books={books} facing={facing} />
    </group>
  );
}

function Spines({
  side,
  books,
  facing,
}: {
  side: "left" | "right";
  books: LibraryBook[];
  facing: boolean;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const face = side === "left" ? 1 : -1;
  const rows = [0.7, 1.3, 1.9];
  const perRow = Math.ceil(books.length / rows.length) || 1;

  return (
    <group>
      {books.map((book, i) => {
        const row = Math.min(rows.length - 1, Math.floor(i / perRow));
        const col = i % perRow;
        const width = THREE.MathUtils.clamp(spineWidthRem(book.pageCount) * 0.09, 0.06, 0.18);
        const height = 0.42 + ((book.uid.charCodeAt(0) || 1) % 5) * 0.02;
        const z = -1.35 + col * (2.7 / Math.max(perRow - 1, 1));
        const color = spineCloth(book);
        const authors = book.authors.join(", ") || "Unknown author";
        const isHovered = hovered === book.uid;

        return (
          <group key={book.uid} position={[face * 0.36, rows[row] + height / 2, z]}>
            <mesh
              castShadow
              onClick={(event) => {
                event.stopPropagation();
                router.push(`/books/${book.uid}`);
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHovered(book.uid);
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                setHovered(null);
                document.body.style.cursor = "grab";
              }}
            >
              <boxGeometry args={[facing ? 0.14 : 0.12, height, facing ? width * 1.15 : width]} />
              <meshStandardMaterial color={color} roughness={0.75} metalness={0.05} />
            </mesh>

            {facing && (
              <Html
                position={[face * 0.12, 0, 0]}
                center
                distanceFactor={2.4}
                occlude={false}
                style={{ pointerEvents: "none" }}
              >
                <div className={`room-spine-label ${isHovered ? "is-hot" : ""}`}>
                  <p className="room-spine-label__title">{shortTitle(book.title, 36)}</p>
                  <p className="room-spine-label__author">{authors}</p>
                  {isHovered && book.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="room-spine-label__cover"
                      src={book.coverUrl}
                      alt=""
                    />
                  )}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
