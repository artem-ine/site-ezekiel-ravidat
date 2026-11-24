"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { shortTitle, spineCloth } from "@/lib/spine-style";
import {
  makeSpineTexture,
  pixelateImage,
  useLampTexture,
  useRugTexture,
  useWoodTexture,
} from "@/components/room/woodTexture";
import {
  BAY_MID_Y,
  BAY_SPACING,
  coverTextureUrl,
  EYE_HEIGHT,
  FOV_AISLE,
  FOV_SHELF,
  hashUid,
  MAX_SPINES_PER_SIDE,
  NEAR_RADIUS,
  PALETTE,
  PIXEL_SCALE,
  SHELF_X,
  shelfViewDistance,
  YAW_MAX,
} from "@/components/room/roomConfig";

const ROW_YS = [0.42, 0.88, 1.34, 1.8, 2.26];
const SHELF_DIST = shelfViewDistance(FOV_SHELF);

type Props = {
  shelves: ShelfGroup[];
  depth: number;
  yaw: number;
  pitch: number;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
};

export function RoomCanvas({
  shelves,
  depth,
  yaw,
  pitch,
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
      className="room-canvas room-canvas--pixel"
      dpr={1}
      flat
      gl={{
        antialias: false,
        powerPreference: "high-performance",
        alpha: false,
        depth: true,
      }}
      camera={{ fov: FOV_AISLE, near: 0.1, far: 80, position: [0, EYE_HEIGHT, 2] }}
      onPointerMissed={() => onSelect(null)}
    >
      <PixelScale />
      <color attach="background" args={[PALETTE.fog]} />
      <fog attach="fog" args={[PALETTE.fog, 8, 22]} />
      <hemisphereLight args={[PALETTE.paper, PALETTE.walnut, 0.55]} />
      <ambientLight intensity={0.42} color={PALETTE.paper} />
      <directionalLight position={[1.5, 4, 2]} intensity={0.28} color={PALETTE.lamp} />

      <WalkCamera depth={depth} yaw={yaw} pitch={pitch} />
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

/** Render at ~1/3 resolution; CSS nearest-neighbour upscales the canvas. */
function PixelScale() {
  const { gl, size, camera } = useThree();

  useLayoutEffect(() => {
    const w = Math.max(1, Math.floor(size.width / PIXEL_SCALE));
    const h = Math.max(1, Math.floor(size.height / PIXEL_SCALE));
    gl.setPixelRatio(1);
    gl.setSize(w, h, false);
    const canvas = gl.domElement;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    canvas.style.imageRendering = "pixelated";
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = size.width / size.height;
      camera.updateProjectionMatrix();
    }
  }, [gl, size.width, size.height, camera]);

  return null;
}

function WalkCamera({
  depth,
  yaw,
  pitch,
}: {
  depth: number;
  yaw: number;
  pitch: number;
}) {
  const smoothed = useRef({
    z: 1.8,
    x: 0,
    y: EYE_HEIGHT,
    yaw: 0,
    pitch: 0,
    fov: FOV_AISLE,
  });

  useFrame((state) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const face = Math.min(1, Math.abs(yaw) / YAW_MAX);
    const targetZ = 1.8 - depth * BAY_SPACING;
    const side = yaw < 0 ? -1 : 1;
    // Aisle: near centre. Facing a wall: stand back so the full bay fits in FOV_SHELF.
    const aisleX = Math.sin(yaw) * 0.2;
    const framedX = side * (SHELF_X - SHELF_DIST);
    const targetX = THREE.MathUtils.lerp(aisleX, framedX, face);
    const targetY = THREE.MathUtils.lerp(EYE_HEIGHT, BAY_MID_Y, face * 0.85);
    const targetFov = THREE.MathUtils.lerp(FOV_AISLE, FOV_SHELF, face);

    const s = smoothed.current;
    s.z += (targetZ - s.z) * 0.14;
    s.x += (targetX - s.x) * 0.12;
    s.y += (targetY - s.y) * 0.12;
    s.yaw += (yaw - s.yaw) * 0.14;
    s.pitch += (pitch - s.pitch) * 0.14;
    s.fov += (targetFov - s.fov) * 0.1;

    camera.position.set(s.x, s.y, s.z);
    camera.fov = s.fov;
    camera.updateProjectionMatrix();

    const lookDist = THREE.MathUtils.lerp(6.2, Math.max(0.8, Math.abs(side * SHELF_X - s.x)), face);
    const lookX = s.x + Math.sin(s.yaw) * lookDist;
    const lookZ = s.z - Math.cos(s.yaw) * lookDist;
    const lookY = s.y + Math.sin(s.pitch) * 2.2 + (face > 0.5 ? 0 : -0.05);
    camera.lookAt(lookX, lookY, lookZ);
  });

  return null;
}

function RoomShell({ bayCount }: { bayCount: number }) {
  const wood = useWoodTexture(3);
  const rug = useRugTexture();
  const length = Math.max(bayCount, 4) * BAY_SPACING + 10;
  wood.repeat.set(length / 2, 2);
  rug.repeat.set(1, length / 3);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -length / 2 + 4]}>
        <planeGeometry args={[8, length]} />
        <meshStandardMaterial map={wood} roughness={1} metalness={0} color={PALETTE.honey} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -length / 2 + 4]}>
        <planeGeometry args={[1.6, length * 0.9]} />
        <meshStandardMaterial map={rug} roughness={1} metalness={0} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 3.05, -length / 2 + 4]}>
        <planeGeometry args={[8, length]} />
        <meshStandardMaterial color={PALETTE.walnut} roughness={1} />
      </mesh>
      <mesh position={[0, 1.5, -bayCount * BAY_SPACING - 2]}>
        <boxGeometry args={[7.5, 3.1, 0.35]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={1} />
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
  const lamp = useLampTexture();
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
        position={[0, 2.45, 0.25]}
        intensity={active ? 1.05 : 0.45}
        distance={6.5}
        color={PALETTE.lamp}
      />
      <mesh position={[0, 2.7, 0.2]}>
        <boxGeometry args={[0.35, 0.12, 0.35]} />
        <meshStandardMaterial
          map={lamp}
          emissive={PALETTE.lamp}
          emissiveIntensity={active ? 0.85 : 0.35}
          color={PALETTE.brass}
        />
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
  wood.repeat.set(1.2, 1.6);
  const x = side === "left" ? -SHELF_X : SHELF_X;
  const face = side === "left" ? 1 : -1;
  const facing = showLabels && (side === "left" ? yaw < -0.45 : yaw > 0.45);

  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[0.55, 2.85, 3.55]} />
        <meshStandardMaterial map={wood} roughness={1} metalness={0} color={PALETTE.honey} />
      </mesh>

      {ROW_YS.map((y) => (
        <mesh key={y} position={[face * 0.12, y - 0.18, 0]}>
          <boxGeometry args={[0.42, 0.07, 3.35]} />
          <meshStandardMaterial color={PALETTE.walnut} roughness={1} />
        </mesh>
      ))}

      {/* Chunked brass sign */}
      <mesh position={[face * 0.4, 2.78, 0]}>
        <boxGeometry args={[0.06, 0.22, 1.05]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.85} metalness={0.2} />
      </mesh>

      <Html
        position={[face * 0.42, 2.78, 0]}
        center
        distanceFactor={facing ? 3.1 : 4.4}
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

type Pose = "upright" | "lean" | "flat";

function bookPose(seed: number): Pose {
  const roll = seed % 17;
  if (roll === 0) return "flat";
  if (roll === 1 || roll === 2) return "lean";
  return "upright";
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
        const seed = hashUid(book.uid);
        const row = Math.min(ROW_YS.length - 1, Math.floor(i / perRow));
        const col = i % perRow;
        const pose = bookPose(seed);
        const thickness = THREE.MathUtils.clamp((book.pageCount ?? 280) / 1300, 0.06, 0.15);
        const height = 0.28 + (seed % 7) * 0.018;
        const depth = 0.11 + (seed % 3) * 0.01;
        const z = -1.4 + col * (2.8 / Math.max(perRow - 1, 1));
        const shelfY = ROW_YS[row];
        const rest =
          pose === "flat"
            ? new THREE.Vector3(face * 0.28, shelfY + 0.04, z)
            : new THREE.Vector3(face * 0.34, shelfY + height / 2 - 0.02, z);

        return (
          <BookSpine3D
            key={book.uid}
            book={book}
            rest={rest}
            face={face}
            thickness={thickness}
            height={height}
            depth={depth}
            pose={pose}
            seed={seed}
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
      texture = pixelateImage(image, 20, 32);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.repeat.set(0.28, 1);
      texture.offset.set(0.36, 0);
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
  thickness,
  height,
  depth,
  pose,
  seed,
  facing,
  selected,
  onSelect,
  preferReducedMotion,
}: {
  book: LibraryBook;
  rest: THREE.Vector3;
  face: number;
  thickness: number;
  height: number;
  depth: number;
  pose: Pose;
  seed: number;
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
  const clothMap = useMemo(() => makeSpineTexture(cloth, seed), [cloth, seed]);
  const authors = book.authors.join(", ") || "Unknown author";
  const progress = useRef(preferReducedMotion && selected ? 1 : 0);
  const lean = pose === "lean" ? ((seed % 2 === 0 ? 1 : -1) * (0.12 + (seed % 5) * 0.02)) : 0;

  useEffect(
    () => () => {
      clothMap.dispose();
    },
    [clothMap],
  );

  useFrame((_, delta) => {
    const target = selected ? 1 : 0;
    if (preferReducedMotion) {
      progress.current = target;
    } else {
      progress.current += (target - progress.current) * Math.min(1, delta * 6);
    }
    const t = progress.current;
    if (!group.current) return;

    group.current.position.set(rest.x + face * t * 0.55, rest.y + t * 0.1, rest.z);
    if (pose === "flat" && t < 0.05) {
      group.current.rotation.set(Math.PI / 2, 0, lean * 0.3);
    } else {
      group.current.rotation.set(0, face * (Math.PI / 2) * t, lean * (1 - t));
    }
    if (coverRef.current) {
      coverRef.current.rotation.y = -face * (Math.PI * 0.72) * t;
    }
  });

  const pick = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const native = event.nativeEvent as PointerEvent & { __roomBookPick?: boolean };
    native.__roomBookPick = true;
    onSelect(selected ? null : book.uid);
  };

  const spineMap = coverMap ?? clothMap;
  // Bevelled profile: main block + slightly smaller front plate.
  const bodyW = facing ? depth + 0.02 : depth;
  const bodyH = pose === "flat" ? thickness : height;
  const bodyD = pose === "flat" ? height : thickness;

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
        <boxGeometry args={[bodyW, bodyH, bodyD]} />
        <meshStandardMaterial
          map={spineMap}
          color={coverMap ? "#ffffff" : cloth}
          roughness={0.92}
          metalness={0}
        />
      </mesh>

      {/* Bevel / rounded face plate */}
      {pose !== "flat" && (
        <mesh position={[face * (bodyW * 0.35), 0, 0]} scale={[0.55, 0.96, 0.92]}>
          <boxGeometry args={[bodyW, bodyH, bodyD]} />
          <meshStandardMaterial
            map={spineMap}
            color={coverMap ? "#f5efe0" : cloth}
            roughness={0.9}
          />
        </mesh>
      )}

      {/* Headband */}
      {pose !== "flat" && (
        <mesh position={[0, bodyH * 0.48, 0]}>
          <boxGeometry args={[bodyW * 1.02, 0.018, bodyD * 1.02]} />
          <meshStandardMaterial color={seed % 2 === 0 ? PALETTE.brass : PALETTE.paper} roughness={0.8} />
        </mesh>
      )}
      {/* Tail */}
      {pose !== "flat" && (
        <mesh position={[0, -bodyH * 0.48, 0]}>
          <boxGeometry args={[bodyW * 1.02, 0.016, bodyD * 1.02]} />
          <meshStandardMaterial
            color={seed % 3 === 0 ? PALETTE.deepGreen : PALETTE.brass}
            roughness={0.85}
          />
        </mesh>
      )}

      {facing && !selected && (hovered || !coverMap) && pose !== "flat" && (
        <Html position={[face * 0.12, 0, 0]} center distanceFactor={2.5} style={{ pointerEvents: "none" }}>
          <div className={`room-spine-label ${hovered ? "is-hot" : ""}`}>
            <p className="room-spine-label__title">{shortTitle(book.title, 36)}</p>
            <p className="room-spine-label__author">{authors}</p>
          </div>
        </Html>
      )}

      <mesh
        ref={coverRef}
        position={[face * 0.08, 0, bodyD * 0.45]}
        visible={selected || progress.current > 0.02}
      >
        <boxGeometry args={[0.03, bodyH * 1.05, bodyD * 1.7]} />
        <meshStandardMaterial
          map={coverMap ?? clothMap}
          color={coverMap ? "#ffffff" : cloth}
          roughness={0.88}
        />
      </mesh>
    </group>
  );
}
