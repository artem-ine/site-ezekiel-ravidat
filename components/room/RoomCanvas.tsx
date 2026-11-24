"use client";

import { useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { spineCloth, spineWidthRem } from "@/lib/spine-style";
import { useWoodTexture } from "@/components/room/woodTexture";
import {
  BAY_SPACING,
  MAX_SPINES_PER_SIDE,
  NEAR_RADIUS,
} from "@/components/room/roomConfig";

type Props = {
  shelves: ShelfGroup[];
  depth: number;
};

export function RoomCanvas({ shelves, depth }: Props) {
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

      <WalkCamera depth={depth} />
      <RoomShell bayCount={Math.max(shelves.length, 1)} />

      {nearby.map(({ shelf, index }) => (
        <ShelfBay key={shelf.id} shelf={shelf} index={index} />
      ))}
    </Canvas>
  );
}

function WalkCamera({ depth }: { depth: number }) {
  useFrame((state) => {
    const targetZ = 1.8 - depth * BAY_SPACING;
    state.camera.position.x = 0;
    state.camera.position.y = 1.55;
    state.camera.position.z += (targetZ - state.camera.position.z) * 0.14;
    state.camera.lookAt(0, 1.35, state.camera.position.z - 7);
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

      {/* Ceiling beams */}
      {Array.from({ length: Math.ceil(bayCount / 2) + 2 }, (_, i) => (
        <mesh key={i} position={[0, 3.05, -i * BAY_SPACING * 2]} castShadow>
          <boxGeometry args={[7.2, 0.18, 0.28]} />
          <meshStandardMaterial color="#3d2818" roughness={0.95} />
        </mesh>
      ))}

      {/* Far wall */}
      <mesh position={[0, 1.5, -bayCount * BAY_SPACING - 2]}>
        <boxGeometry args={[7.5, 3.2, 0.3]} />
        <meshStandardMaterial color="#24160f" roughness={1} />
      </mesh>
    </group>
  );
}

function ShelfBay({ shelf, index }: { shelf: ShelfGroup; index: number }) {
  const z = -index * BAY_SPACING;
  const leftBooks = shelf.books.slice(0, MAX_SPINES_PER_SIDE);
  const rightSlice = shelf.books.slice(MAX_SPINES_PER_SIDE, MAX_SPINES_PER_SIDE * 2);
  const rightBooks =
    rightSlice.length > 0
      ? rightSlice
      : [...leftBooks].reverse().slice(0, Math.min(MAX_SPINES_PER_SIDE, leftBooks.length));

  return (
    <group position={[0, 0, z]}>
      <Bookcase side="left" books={leftBooks} label={shelf.label} count={shelf.books.length} />
      <Bookcase side="right" books={rightBooks} label={shelf.label} count={shelf.books.length} />
      <pointLight position={[0, 2.6, 0.4]} intensity={1.8} distance={7} color="#ffd28a" castShadow={false} />
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
}: {
  side: "left" | "right";
  books: LibraryBook[];
  label: string;
  count: number;
}) {
  const wood = useWoodTexture(side === "left" ? 1 : 2);
  wood.repeat.set(1.5, 2);
  const x = side === "left" ? -2.35 : 2.35;
  const face = side === "left" ? 1 : -1;

  return (
    <group position={[x, 0, 0]}>
      {/* Carcass */}
      <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.55, 2.9, 3.4]} />
        <meshStandardMaterial map={wood} roughness={0.88} metalness={0.04} color="#6b4428" />
      </mesh>

      {/* Shelves */}
      {[0.55, 1.15, 1.75, 2.35].map((y) => (
        <mesh key={y} position={[face * 0.12, y, 0]}>
          <boxGeometry args={[0.42, 0.06, 3.2]} />
          <meshStandardMaterial color="#4a301c" roughness={0.92} />
        </mesh>
      ))}

      {/* Sign */}
      <mesh position={[face * 0.4, 2.85, 0]}>
        <boxGeometry args={[0.04, 0.28, 1.1]} />
        <meshStandardMaterial color="#d8c39a" roughness={0.7} />
      </mesh>

      <Html
        position={[face * 0.42, 2.88, 0]}
        center
        distanceFactor={4.5}
        style={{ pointerEvents: "none" }}
      >
        <div className="room-sign-3d">
          <span className="label">{label}</span>
          <span className="room-sign-3d__count">{count}</span>
        </div>
      </Html>

      <Spines side={side} books={books} />
    </group>
  );
}

function Spines({ side, books }: { side: "left" | "right"; books: LibraryBook[] }) {
  const router = useRouter();
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

        return (
          <mesh
            key={book.uid}
            position={[face * 0.36, rows[row] + height / 2, z]}
            castShadow
            onClick={(event) => {
              event.stopPropagation();
              router.push(`/books/${book.uid}`);
            }}
            onPointerOver={(event) => {
              event.stopPropagation();
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              document.body.style.cursor = "grab";
            }}
          >
            <boxGeometry args={[0.12, height, width]} />
            <meshStandardMaterial color={color} roughness={0.75} metalness={0.05} />
          </mesh>
        );
      })}
    </group>
  );
}

