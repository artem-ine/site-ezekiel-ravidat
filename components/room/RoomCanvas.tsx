"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { LibraryBook } from "@/lib/books";
import type { ShelfGroup } from "@/components/library/groupBooks";
import { shortTitle, spineCloth, STATUS_LABEL } from "@/lib/spine-style";
import { useWoodTexture } from "@/components/room/woodTexture";
import {
  BAY_SPACING,
  CAMERA_DISTANCE,
  EYE_HEIGHT,
  FOV,
  MAX_SPINES_PER_SIDE,
  NEAR_RADIUS,
  SHELF_X,
  type ShelfSide,
} from "@/components/room/roomConfig";

const ROW_YS = [0.42, 0.82, 1.22, 1.62, 2.02]; // five reachable rows

type Props = {
  shelves: ShelfGroup[];
  bay: number;
  side: ShelfSide;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
};

export function RoomCanvas({
  shelves,
  bay,
  side,
  selectedUid,
  onSelect,
  preferReducedMotion,
}: Props) {
  const nearby = useMemo(
    () =>
      shelves
        .map((shelf, index) => ({ shelf, index }))
        .filter(({ index }) => Math.abs(index - bay) <= NEAR_RADIUS),
    [shelves, bay],
  );

  return (
    <Canvas
      className="room-canvas"
      dpr={[1, 1.4]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      camera={{ fov: FOV, near: 0.1, far: 60, position: [0, EYE_HEIGHT, 2] }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={["#2a1d14"]} />
      <fog attach="fog" args={["#2a1d14", 10, 22]} />
      <hemisphereLight args={["#f3e2c0", "#3a2818", 0.55]} />
      <ambientLight intensity={0.38} />
      <directionalLight
        position={[2, 5, 3]}
        intensity={0.35}
        color="#ffe0b0"
        castShadow={false}
      />

      <StationCamera bay={bay} side={side} />
      <RoomShell bayCount={Math.max(shelves.length, 1)} />

      {nearby.map(({ shelf, index }) => (
        <ShelfBay
          key={shelf.id}
          shelf={shelf}
          index={index}
          active={index === bay}
          activeSide={side}
          selectedUid={selectedUid}
          onSelect={onSelect}
          preferReducedMotion={preferReducedMotion}
        />
      ))}
    </Canvas>
  );
}

function StationCamera({ bay, side }: { bay: number; side: ShelfSide }) {
  const smoothed = useRef({ x: 0, y: EYE_HEIGHT, z: 0 });

  useFrame((state) => {
    const shelfX = side === "left" ? -SHELF_X : SHELF_X;
    const targetX = side === "left" ? shelfX + CAMERA_DISTANCE : shelfX - CAMERA_DISTANCE;
    const targetZ = -bay * BAY_SPACING;

    smoothed.current.x += (targetX - smoothed.current.x) * 0.1;
    smoothed.current.y += (EYE_HEIGHT - smoothed.current.y) * 0.1;
    smoothed.current.z += (targetZ - smoothed.current.z) * 0.1;

    state.camera.position.set(
      smoothed.current.x,
      smoothed.current.y,
      smoothed.current.z,
    );
    state.camera.fov = FOV;
    state.camera.updateProjectionMatrix();
    // Square-on: look straight at the shelf face, same height.
    state.camera.lookAt(shelfX, EYE_HEIGHT, targetZ);
  });

  return null;
}

function RoomShell({ bayCount }: { bayCount: number }) {
  const wood = useWoodTexture(3);
  const length = Math.max(bayCount, 3) * BAY_SPACING + 8;
  wood.repeat.set(length / 4, 2);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -length / 2 + 3]} receiveShadow>
        <planeGeometry args={[9, length]} />
        <meshStandardMaterial map={wood} roughness={0.92} metalness={0} color="#8a6240" />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 3.1, -length / 2 + 3]}>
        <planeGeometry args={[9, length]} />
        <meshStandardMaterial color="#3a2a1c" roughness={1} />
      </mesh>
      <mesh position={[0, 1.5, -bayCount * BAY_SPACING - 2]}>
        <boxGeometry args={[8, 3.1, 0.25]} />
        <meshStandardMaterial color="#2c1e14" roughness={1} />
      </mesh>
    </group>
  );
}

function ShelfBay({
  shelf,
  index,
  active,
  activeSide,
  selectedUid,
  onSelect,
  preferReducedMotion,
}: {
  shelf: ShelfGroup;
  index: number;
  active: boolean;
  activeSide: ShelfSide;
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
        lit={active && activeSide === "left"}
        selectedUid={selectedUid}
        onSelect={onSelect}
        preferReducedMotion={preferReducedMotion}
      />
      <Bookcase
        side="right"
        books={rightBooks}
        label={shelf.label}
        count={shelf.books.length}
        lit={active && activeSide === "right"}
        selectedUid={selectedUid}
        onSelect={onSelect}
        preferReducedMotion={preferReducedMotion}
      />
      <pointLight
        position={[0, 2.5, 0]}
        intensity={active ? 1.1 : 0.45}
        distance={6}
        color="#ffd9a0"
        castShadow={false}
      />
    </group>
  );
}

function Bookcase({
  side,
  books,
  label,
  count,
  lit,
  selectedUid,
  onSelect,
  preferReducedMotion,
}: {
  side: ShelfSide;
  books: LibraryBook[];
  label: string;
  count: number;
  lit: boolean;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
}) {
  const wood = useWoodTexture(side === "left" ? 1 : 2);
  wood.repeat.set(1.2, 1.8);
  const x = side === "left" ? -SHELF_X : SHELF_X;
  const face = side === "left" ? 1 : -1;

  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[0.5, 2.7, 3.6]} />
        <meshStandardMaterial map={wood} roughness={0.9} metalness={0} color="#6e4a2e" />
      </mesh>

      {ROW_YS.map((y) => (
        <mesh key={y} position={[face * 0.1, y - 0.18, 0]}>
          <boxGeometry args={[0.38, 0.05, 3.4]} />
          <meshStandardMaterial color="#4e341f" roughness={0.95} />
        </mesh>
      ))}

      <Html
        position={[face * 0.4, 2.55, 0]}
        center
        distanceFactor={4}
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
        lit={lit}
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
  lit,
  selectedUid,
  onSelect,
  preferReducedMotion,
}: {
  side: ShelfSide;
  books: LibraryBook[];
  lit: boolean;
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
        const height = 0.32;
        const z = -1.45 + col * (2.9 / Math.max(perRow - 1, 1));
        const rest = new THREE.Vector3(face * 0.32, ROW_YS[row] + height / 2, z);

        return (
          <BookSpine3D
            key={book.uid}
            book={book}
            rest={rest}
            face={face}
            width={width}
            height={height}
            lit={lit}
            selected={selectedUid === book.uid}
            onSelect={onSelect}
            preferReducedMotion={preferReducedMotion}
          />
        );
      })}
    </group>
  );
}

function useCoverMap(url: string | null) {
  const [map, setMap] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setMap(null);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        // Vertical strip from the cover centre for a spine look.
        texture.repeat.set(0.16, 1);
        texture.offset.set(0.42, 0);
        setMap(texture);
      },
      undefined,
      () => {
        if (!cancelled) setMap(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(
    () => () => {
      map?.dispose();
    },
    [map],
  );

  return map;
}

function BookSpine3D({
  book,
  rest,
  face,
  width,
  height,
  lit,
  selected,
  onSelect,
  preferReducedMotion,
}: {
  book: LibraryBook;
  rest: THREE.Vector3;
  face: number;
  width: number;
  height: number;
  lit: boolean;
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
  const open = selected ? 1 : 0;
  const progress = useRef(preferReducedMotion && selected ? 1 : 0);

  useFrame((_, delta) => {
    const target = open;
    if (preferReducedMotion) {
      progress.current = target;
    } else {
      progress.current += (target - progress.current) * Math.min(1, delta * 6);
    }
    const t = progress.current;
    if (!group.current) return;

    group.current.position.set(
      rest.x + face * t * 0.55,
      rest.y + t * 0.08,
      rest.z,
    );
    group.current.rotation.y = face * (Math.PI / 2) * t;

    if (coverRef.current) {
      coverRef.current.rotation.y = -face * (Math.PI * 0.72) * t;
    }
  });

  return (
    <group
      ref={group}
      position={rest.toArray()}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(selected ? null : book.uid);
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
      <mesh>
        <boxGeometry args={[0.11, height, width]} />
        <meshStandardMaterial
          map={coverMap ?? undefined}
          color={coverMap ? "#ffffff" : cloth}
          roughness={0.8}
          metalness={0}
        />
      </mesh>

      {lit && !selected && (hovered || !coverMap) && (
        <Html position={[face * 0.1, 0, 0]} center distanceFactor={2.6} style={{ pointerEvents: "none" }}>
          <div className="room-spine-label">
            <p className="room-spine-label__title">{shortTitle(book.title, 32)}</p>
            <p className="room-spine-label__author">{authors}</p>
          </div>
        </Html>
      )}

      <mesh
        ref={coverRef}
        position={[face * 0.06, 0, width * 0.35]}
        visible={selected || progress.current > 0.02}
      >
        <boxGeometry args={[0.02, height * 1.05, width * 1.7]} />
        <meshStandardMaterial
          map={coverMap ?? undefined}
          color={coverMap ? "#ffffff" : cloth}
          roughness={0.75}
        />
      </mesh>

      {selected && (
        <Html position={[face * 0.35, 0.05, 0]} distanceFactor={3.2} style={{ pointerEvents: "auto" }}>
          <BookCard book={book} onClose={() => onSelect(null)} />
        </Html>
      )}
    </group>
  );
}

function BookCard({ book, onClose }: { book: LibraryBook; onClose: () => void }) {
  const authors = book.authors.join(", ") || "Unknown author";

  return (
    <div className="room-book-card" role="dialog" aria-label={book.title}>
      <button type="button" className="room-book-card__close" onClick={onClose}>
        Close
      </button>
      <h2>{book.title}</h2>
      {book.subtitle && <p className="room-book-card__sub">{book.subtitle}</p>}
      <p className="room-book-card__by">{authors}</p>
      <dl>
        {book.readStatus && (
          <>
            <dt>Status</dt>
            <dd>{STATUS_LABEL[book.readStatus]}</dd>
          </>
        )}
        {book.genres.length > 0 && (
          <>
            <dt>Genre</dt>
            <dd>{book.genres.map((g) => g.name).join(", ")}</dd>
          </>
        )}
        {book.series && (
          <>
            <dt>Series</dt>
            <dd>
              {book.series}
              {book.seriesPosition != null ? ` · ${book.seriesPosition}` : ""}
            </dd>
          </>
        )}
        {book.pageCount != null && (
          <>
            <dt>Pages</dt>
            <dd>{book.pageCount}</dd>
          </>
        )}
        {book.yearRead != null && (
          <>
            <dt>Year read</dt>
            <dd>{book.yearRead}</dd>
          </>
        )}
        {book.publishYear != null && (
          <>
            <dt>Published</dt>
            <dd>{book.publishYear}</dd>
          </>
        )}
      </dl>
      {book.description && <p className="room-book-card__blurb">{book.description}</p>}
      <a className="room-book-card__link" href={`/books/${book.uid}`}>
        Full page
      </a>
    </div>
  );
}
