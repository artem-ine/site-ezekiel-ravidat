"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { shortTitle, spineCloth } from "@/lib/spine-style";
import { useWoodTexture } from "@/components/room/woodTexture";
import {
  BAY_SPACING,
  coverTextureUrl,
  EYE_HEIGHT,
  FOV_AISLE,
  FOV_SHELF,
  MAX_SPINES_PER_SIDE,
  NEAR_RADIUS,
  SHELF_X,
  YAW_MAX,
} from "@/components/room/roomConfig";

const ROW_YS = [0.55, 1.0, 1.45, 1.9, 2.35];

type Props = {
  shelves: ShelfGroup[];
  depth: number;
  yaw: number;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
};

export function RoomCanvas({
  shelves,
  depth,
  yaw,
  selectedUid,
  onSelect,
  preferReducedMotion,
}: Props) {
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
      camera={{ fov: FOV_AISLE, near: 0.1, far: 80, position: [0, EYE_HEIGHT, 2] }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={["#2a1d14"]} />
      <fog attach="fog" args={["#2a1d14", 10, 26]} />
      <hemisphereLight args={["#f3e2c0", "#3a2818", 0.55]} />
      <ambientLight intensity={0.38} />
      <directionalLight position={[2, 5, 3]} intensity={0.32} color="#ffe0b0" />

      <WalkCamera depth={depth} yaw={yaw} />
      <RoomShell bayCount={Math.max(shelves.length, 1)} />

      {nearby.map(({ shelf, index }) => (
        <ShelfBay
          key={shelf.id}
          shelf={shelf}
          index={index}
          yaw={yaw}
          active={Math.round(depth) === index}
          selectedUid={selectedUid}
          onSelect={onSelect}
          preferReducedMotion={preferReducedMotion}
        />
      ))}
    </Canvas>
  );
}

function WalkCamera({ depth, yaw }: { depth: number; yaw: number }) {
  const smoothed = useRef({ z: 1.8, x: 0, yaw: 0, fov: FOV_AISLE });

  useFrame((state) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const face = Math.min(1, Math.abs(yaw) / YAW_MAX);
    const targetZ = 1.8 - depth * BAY_SPACING;
    // Ease toward the shelf face as yaw grows so the bay fills the frame square-on.
    const targetX = Math.sin(yaw) * (0.15 + face * 0.55);
    const targetFov = THREE.MathUtils.lerp(FOV_AISLE, FOV_SHELF, face);

    smoothed.current.z += (targetZ - smoothed.current.z) * 0.14;
    smoothed.current.x += (targetX - smoothed.current.x) * 0.12;
    smoothed.current.yaw += (yaw - smoothed.current.yaw) * 0.14;
    smoothed.current.fov += (targetFov - smoothed.current.fov) * 0.1;

    const { x, z, yaw: lookYaw, fov } = smoothed.current;
    camera.position.set(x, EYE_HEIGHT, z);
    camera.fov = fov;
    camera.updateProjectionMatrix();

    // When facing a wall, look straight at the shelf centre; otherwise down the aisle.
    const lookDist = THREE.MathUtils.lerp(6.2, SHELF_X + 0.2 - Math.abs(x), face);
    const lookX = x + Math.sin(lookYaw) * lookDist;
    const lookZ = z - Math.cos(lookYaw) * lookDist;
    const lookY = THREE.MathUtils.lerp(EYE_HEIGHT - 0.05, 1.35, face);
    camera.lookAt(lookX, lookY, lookZ);
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
        <meshStandardMaterial map={wood} roughness={0.92} metalness={0} color="#8a6240" />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 3.2, -length / 2 + 4]}>
        <planeGeometry args={[8, length]} />
        <meshStandardMaterial color="#3a2a1c" roughness={1} />
      </mesh>
      <mesh position={[0, 1.5, -bayCount * BAY_SPACING - 2]}>
        <boxGeometry args={[7.5, 3.2, 0.3]} />
        <meshStandardMaterial color="#2c1e14" roughness={1} />
      </mesh>
    </group>
  );
}

function ShelfBay({
  shelf,
  index,
  yaw,
  active,
  selectedUid,
  onSelect,
  preferReducedMotion,
}: {
  shelf: ShelfGroup;
  index: number;
  yaw: number;
  active: boolean;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
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
        selectedUid={selectedUid}
        onSelect={onSelect}
        preferReducedMotion={preferReducedMotion}
      />
      <Bookcase
        side="right"
        books={rightBooks}
        label={shelf.label}
        count={shelf.books.length}
        yaw={yaw}
        showLabels={active}
        selectedUid={selectedUid}
        onSelect={onSelect}
        preferReducedMotion={preferReducedMotion}
      />
      <pointLight
        position={[0, 2.55, 0.3]}
        intensity={active ? 1.15 : 0.5}
        distance={7}
        color="#ffd9a0"
      />
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
  selectedUid,
  onSelect,
  preferReducedMotion,
}: {
  side: "left" | "right";
  books: LibraryBook[];
  label: string;
  count: number;
  yaw: number;
  showLabels: boolean;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
}) {
  const wood = useWoodTexture(side === "left" ? 1 : 2);
  wood.repeat.set(1.4, 1.8);
  const x = side === "left" ? -SHELF_X : SHELF_X;
  const face = side === "left" ? 1 : -1;
  const facing = showLabels && (side === "left" ? yaw < -0.45 : yaw > 0.45);

  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 1.45, 0]}>
        <boxGeometry args={[0.5, 2.9, 3.5]} />
        <meshStandardMaterial map={wood} roughness={0.9} metalness={0} color="#6e4a2e" />
      </mesh>

      {ROW_YS.map((y) => (
        <mesh key={y} position={[face * 0.1, y - 0.2, 0]}>
          <boxGeometry args={[0.38, 0.05, 3.3]} />
          <meshStandardMaterial color="#4e341f" roughness={0.95} />
        </mesh>
      ))}

      <Html
        position={[face * 0.4, 2.82, 0]}
        center
        distanceFactor={facing ? 3.2 : 4.5}
        style={{ pointerEvents: "none" }}
      >
        <div className="room-sign-3d">
          <span className="label">{label}</span>
          <span className="room-sign-3d__count">{count}</span>
        </div>
      </Html>

      <Spines
        side={side}
        books={books}
        facing={facing}
        selectedUid={selectedUid}
        onSelect={onSelect}
        preferReducedMotion={preferReducedMotion}
      />
    </group>
  );
}

function Spines({
  side,
  books,
  facing,
  selectedUid,
  onSelect,
  preferReducedMotion,
}: {
  side: "left" | "right";
  books: LibraryBook[];
  facing: boolean;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
}) {
  const face = side === "left" ? 1 : -1;
  const perRow = Math.ceil(books.length / ROW_YS.length) || 1;

  return (
    <group>
      {books.map((book, i) => {
        const row = Math.min(ROW_YS.length - 1, Math.floor(i / perRow));
        const col = i % perRow;
        const width = THREE.MathUtils.clamp((book.pageCount ?? 280) / 1400, 0.07, 0.16);
        const height = 0.34;
        const z = -1.4 + col * (2.8 / Math.max(perRow - 1, 1));
        const rest = new THREE.Vector3(face * 0.34, ROW_YS[row] + height / 2 - 0.05, z);

        return (
          <BookSpine3D
            key={book.uid}
            book={book}
            rest={rest}
            face={face}
            width={width}
            height={height}
            facing={facing}
            selected={selectedUid === book.uid}
            onSelect={onSelect}
            preferReducedMotion={preferReducedMotion}
          />
        );
      })}
    </group>
  );
}

function useCoverMap(coverUrl: string | null) {
  const [map, setMap] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const proxied = coverTextureUrl(coverUrl);
    if (!proxied) {
      setMap(null);
      return;
    }

    let cancelled = false;
    let texture: THREE.Texture | null = null;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.repeat.set(0.22, 1);
      texture.offset.set(0.39, 0);
      texture.needsUpdate = true;
      setMap(texture);
    };
    image.onerror = () => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[room] cover texture failed:", coverUrl, "→", proxied);
      }
      if (!cancelled) setMap(null);
    };
    image.src = proxied;

    return () => {
      cancelled = true;
      texture?.dispose();
    };
  }, [coverUrl]);

  return map;
}

function BookSpine3D({
  book,
  rest,
  face,
  width,
  height,
  facing,
  selected,
  onSelect,
  preferReducedMotion,
}: {
  book: LibraryBook;
  rest: THREE.Vector3;
  face: number;
  width: number;
  height: number;
  facing: boolean;
  selected: boolean;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const coverRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const coverMap = useCoverMap(book.coverUrl);
  const cloth = spineCloth(book);
  const authors = book.authors.join(", ") || "Unknown author";
  const progress = useRef(preferReducedMotion && selected ? 1 : 0);

  useFrame((_, delta) => {
    const target = selected ? 1 : 0;
    if (preferReducedMotion) {
      progress.current = target;
    } else {
      progress.current += (target - progress.current) * Math.min(1, delta * 6);
    }
    const t = progress.current;
    if (!group.current) return;

    group.current.position.set(rest.x + face * t * 0.55, rest.y + t * 0.08, rest.z);
    group.current.rotation.y = face * (Math.PI / 2) * t;
    if (coverRef.current) {
      coverRef.current.rotation.y = -face * (Math.PI * 0.72) * t;
    }
  });

  const pick = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    // Mark the DOM event so the aisle drag handler ignores this gesture.
    const native = event.nativeEvent as PointerEvent & { __roomBookPick?: boolean };
    native.__roomBookPick = true;
    onSelect(selected ? null : book.uid);
  };

  return (
    <group ref={group} position={rest.toArray()}>
      <mesh
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          pick(event);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "grab";
        }}
      >
        <boxGeometry args={[facing ? 0.14 : 0.12, height, facing ? width * 1.2 : width]} />
        <meshStandardMaterial
          map={coverMap ?? undefined}
          color={coverMap ? "#ffffff" : cloth}
          roughness={0.8}
          metalness={0}
        />
      </mesh>

      {facing && !selected && (hovered || !coverMap) && (
        <Html position={[face * 0.12, 0, 0]} center distanceFactor={2.5} style={{ pointerEvents: "none" }}>
          <div className={`room-spine-label ${hovered ? "is-hot" : ""}`}>
            <p className="room-spine-label__title">{shortTitle(book.title, 36)}</p>
            <p className="room-spine-label__author">{authors}</p>
          </div>
        </Html>
      )}

      <mesh
        ref={coverRef}
        position={[face * 0.07, 0, width * 0.4]}
        visible={selected || progress.current > 0.02}
      >
        <boxGeometry args={[0.02, height * 1.05, width * 1.8]} />
        <meshStandardMaterial
          map={coverMap ?? undefined}
          color={coverMap ? "#ffffff" : cloth}
          roughness={0.75}
        />
      </mesh>

    </group>
  );
}
