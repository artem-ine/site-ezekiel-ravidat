"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { LibraryBook } from "@/lib/books";
import { shortTitle, spineCloth } from "@/lib/spine-style";
import {
  makeSpineTexture,
  pixelateImage,
  useLampTexture,
  useRugTexture,
  useWoodTexture,
} from "@/components/room/woodTexture";
import { enqueueCover } from "@/components/room/coverQueue";
import {
  BAY_MID_Y,
  coverTextureUrl,
  EYE_HEIGHT,
  FOV_AISLE,
  FOV_SHELF,
  hashUid,
  MAX_SPINES_PER_SIDE,
  PALETTE,
  PIXEL_SCALE,
  RENDER_RADIUS,
  shelfViewDistance,
} from "@/components/room/roomConfig";
import {
  shelfFaceAmount,
  type FloorPlan,
  type PlacedShelf,
} from "@/components/room/floorPlan";

const ROW_YS = [0.42, 0.88, 1.34, 1.8, 2.26];
const SHELF_DIST = shelfViewDistance(FOV_SHELF);

type Props = {
  plan: FloorPlan;
  placed: PlacedShelf[];
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
};

export function RoomCanvas({
  plan,
  placed,
  x,
  z,
  yaw,
  pitch,
  selectedUid,
  onSelect,
  preferReducedMotion,
}: Props) {
  const nearby = useMemo(
    () => placed.filter((slot) => Math.hypot(slot.x - x, slot.z - z) <= RENDER_RADIUS),
    [placed, x, z],
  );

  const nearbyJunctions = useMemo(
    () => plan.junctions.filter((j) => Math.hypot(j.x - x, j.z - z) <= RENDER_RADIUS),
    [plan.junctions, x, z],
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
      camera={{ fov: FOV_AISLE, near: 0.1, far: 90, position: [0, EYE_HEIGHT, 4] }}
      onPointerMissed={() => onSelect(null)}
    >
      <PixelScale />
      <color attach="background" args={[PALETTE.fog]} />
      <fog attach="fog" args={[PALETTE.fog, 12, 30]} />
      <hemisphereLight args={["#e8eef6", PALETTE.walnut, 0.5]} />
      <ambientLight intensity={0.32} color="#e4eaf2" />
      {/* Cool daylight through the windows — lamps on bays stay warm separately */}
      <directionalLight position={[-9, 11, 3]} intensity={0.62} color="#e7eef8" />
      <directionalLight position={[7, 9, -3]} intensity={0.28} color="#d9e4f2" />

      <WalkCamera x={x} z={z} yaw={yaw} pitch={pitch} placed={nearby} />
      <RoomShell plan={plan} preferReducedMotion={preferReducedMotion} />
      <EntrancePlate landmark={plan.entrance} />
      <DeskAlcove />

      {nearbyJunctions.map((junction) => (
        <JunctionSign key={junction.id} junction={junction} />
      ))}

      {nearby.map((slot) =>
        slot.shelf ? (
          <ShelfBay
            key={slot.id}
            slot={slot}
            playerX={x}
            playerZ={z}
            selectedUid={selectedUid}
            onSelect={onSelect}
            preferReducedMotion={preferReducedMotion}
          />
        ) : null,
      )}
    </Canvas>
  );
}

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
  x,
  z,
  yaw,
  pitch,
  placed,
}: {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  placed: PlacedShelf[];
}) {
  const smoothed = useRef({
    x: 0,
    y: EYE_HEIGHT,
    z: 4,
    yaw: 0,
    pitch: 0,
    fov: FOV_AISLE,
  });

  useFrame((state) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const face = shelfFaceAmount(x, z, yaw, placed);
    const amount = face.amount;

    let targetX = x;
    let targetZ = z;
    let targetY = EYE_HEIGHT;
    if (face.slot && amount > 0.05) {
      const fx = Math.sin(face.slot.facing);
      const fz = -Math.cos(face.slot.facing);
      // Stand back from the case so the full bay fits.
      targetX = THREE.MathUtils.lerp(x, face.slot.x + fx * SHELF_DIST, amount * 0.85);
      targetZ = THREE.MathUtils.lerp(z, face.slot.z + fz * SHELF_DIST, amount * 0.85);
      targetY = THREE.MathUtils.lerp(EYE_HEIGHT, BAY_MID_Y, amount * 0.85);
    }

    const targetFov = THREE.MathUtils.lerp(FOV_AISLE, FOV_SHELF, amount);
    const s = smoothed.current;
    s.x += (targetX - s.x) * 0.14;
    s.y += (targetY - s.y) * 0.12;
    s.z += (targetZ - s.z) * 0.14;
    s.yaw += shortestAngle(s.yaw, yaw) * 0.16;
    s.pitch += (pitch - s.pitch) * 0.14;
    s.fov += (targetFov - s.fov) * 0.1;

    camera.position.set(s.x, s.y, s.z);
    camera.fov = s.fov;
    camera.updateProjectionMatrix();

    const lookDist = THREE.MathUtils.lerp(5.5, Math.max(1.2, face.dist || SHELF_DIST), amount);
    const lookX = s.x + Math.sin(s.yaw) * lookDist;
    const lookZ = s.z - Math.cos(s.yaw) * lookDist;
    const lookY = s.y + Math.sin(s.pitch) * 2.2;
    camera.lookAt(lookX, lookY, lookZ);
  });

  return null;
}

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function RoomShell({
  plan,
  preferReducedMotion,
}: {
  plan: FloorPlan;
  preferReducedMotion: boolean;
}) {
  const wood = useWoodTexture(3);
  const rug = useRugTexture();
  const { minX, maxX, minZ, maxZ } = plan.floor;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  wood.repeat.set(width / 2, depth / 2);
  rug.repeat.set(2, depth / 4);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial map={wood} roughness={1} metalness={0} color={PALETTE.honey} />
      </mesh>
      {plan.aisles.map((aisle) => {
        const mx = (aisle.from.x + aisle.to.x) / 2;
        const mz = (aisle.from.z + aisle.to.z) / 2;
        const len = Math.hypot(aisle.to.x - aisle.from.x, aisle.to.z - aisle.from.z) || 1;
        const angle = Math.atan2(aisle.to.x - aisle.from.x, aisle.to.z - aisle.from.z);
        return (
          <mesh
            key={aisle.id}
            rotation={[-Math.PI / 2, 0, -angle]}
            position={[mx, 0.015, mz]}
          >
            <planeGeometry args={[aisle.width * 0.85, len]} />
            <meshStandardMaterial map={rug} roughness={1} metalness={0} />
          </mesh>
        );
      })}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, 3.05, cz]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={PALETTE.walnut} roughness={1} />
      </mesh>
      <mesh position={[cx, 1.5, maxZ + 0.2]}>
        <boxGeometry args={[width + 1, 3.1, 0.4]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={1} />
      </mesh>
      <mesh position={[cx, 1.5, minZ - 0.2]}>
        <boxGeometry args={[width + 1, 3.1, 0.4]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={1} />
      </mesh>
      <mesh position={[minX - 0.2, 1.5, cz]}>
        <boxGeometry args={[0.4, 3.1, depth + 1]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={1} />
      </mesh>
      <mesh position={[maxX + 0.2, 1.5, cz]}>
        <boxGeometry args={[0.4, 3.1, depth + 1]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={1} />
      </mesh>

      {plan.windows.map((win, index) => (
        <DayWindow
          key={`win-${index}`}
          window={win}
          preferReducedMotion={preferReducedMotion}
        />
      ))}
    </group>
  );
}

function DayWindow({
  window: win,
  preferReducedMotion,
}: {
  window: FloorPlan["windows"][number];
  preferReducedMotion: boolean;
}) {
  const shaftRef = useRef<THREE.Mesh>(null);
  const moteRef = useRef<THREE.Points>(null);

  useFrame(({ clock }) => {
    if (preferReducedMotion) return;
    const t = clock.elapsedTime;
    if (shaftRef.current) {
      const mat = shaftRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.11 + Math.sin(t * 0.35 + win.z) * 0.025;
    }
    if (moteRef.current) {
      moteRef.current.position.y = 1.15 + Math.sin(t * 0.28) * 0.04;
    }
  });

  const motePositions = useMemo(() => {
    const arr = new Float32Array(24);
    for (let i = 0; i < 8; i += 1) {
      arr[i * 3] = 0.8 + (i % 3) * 0.35;
      arr[i * 3 + 1] = (i % 4) * 0.18;
      arr[i * 3 + 2] = ((i % 5) - 2) * 0.12;
    }
    return arr;
  }, []);

  return (
    <group position={[win.x, 1.55, win.z]} rotation={[0, win.facing, 0]}>
      {/* Cool daylight pane set into the wall */}
      <mesh position={[0.02, 0, 0]}>
        <planeGeometry args={[win.width, win.height]} />
        <meshStandardMaterial
          color="#e8eef6"
          emissive="#b9cce0"
          emissiveIntensity={0.95}
          roughness={1}
          metalness={0}
        />
      </mesh>
      <mesh position={[0, win.height / 2, 0.02]}>
        <boxGeometry args={[win.width + 0.14, 0.09, 0.08]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.8} />
      </mesh>
      <mesh position={[0, -win.height / 2, 0.02]}>
        <boxGeometry args={[win.width + 0.14, 0.09, 0.08]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.8} />
      </mesh>
      {/* Shaft falls inward from the wall (local +X), not as a floor plaque */}
      <mesh
        ref={shaftRef}
        position={[2.1, -0.55, 0]}
        rotation={[0, 0, -0.42]}
      >
        <boxGeometry args={[3.2, 0.015, win.width * 0.4]} />
        <meshBasicMaterial
          color="#d2e0f0"
          transparent
          opacity={0.13}
          depthWrite={false}
        />
      </mesh>
      {!preferReducedMotion && (
        <points ref={moteRef} position={[1.4, 1.0, 0]}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[motePositions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            color="#e8f0fa"
            size={0.035}
            sizeAttenuation
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </points>
      )}
    </group>
  );
}

function EntrancePlate({ landmark }: { landmark: FloorPlan["entrance"] }) {
  return (
    <group position={[landmark.x, 0, landmark.z]}>
      <mesh position={[0, 1.1, 0.3]}>
        <boxGeometry args={[1.4, 0.7, 0.08]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.7} metalness={0.25} />
      </mesh>
      <Html position={[0, 1.1, 0.4]} center distanceFactor={4} style={{ pointerEvents: "none" }}>
        <div className="room-sign-3d">
          <span className="label">Library of</span>
          <span className="room-sign-3d__count">Ezekiel Ravidat</span>
        </div>
      </Html>
    </group>
  );
}

function DeskAlcove() {
  const wood = useWoodTexture(5);
  return (
    <group position={[-5.2, 0, 2]}>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.6, 0.12, 0.9]} />
        <meshStandardMaterial map={wood} color={PALETTE.walnut} roughness={1} />
      </mesh>
      <mesh position={[-0.6, 0.28, 0]}>
        <boxGeometry args={[0.12, 0.55, 0.12]} />
        <meshStandardMaterial color={PALETTE.walnut} roughness={1} />
      </mesh>
      <mesh position={[0.6, 0.28, 0]}>
        <boxGeometry args={[0.12, 0.55, 0.12]} />
        <meshStandardMaterial color={PALETTE.walnut} roughness={1} />
      </mesh>
      <Html position={[0, 1.1, 0]} center distanceFactor={3.5} style={{ pointerEvents: "none" }}>
        <div className="room-sign-3d">
          <span className="label">Reading desk</span>
        </div>
      </Html>
      <mesh position={[1.7, 0.7, 0.6]}>
        <boxGeometry args={[0.9, 1.1, 0.45]} />
        <meshStandardMaterial color={PALETTE.oxblood} roughness={1} />
      </mesh>
      <Html position={[1.7, 1.4, 0.6]} center distanceFactor={3.5} style={{ pointerEvents: "none" }}>
        <div className="room-sign-3d">
          <span className="label">Catalogue</span>
        </div>
      </Html>
    </group>
  );
}

function JunctionSign({
  junction,
}: {
  junction: FloorPlan["junctions"][number];
}) {
  return (
    <group position={[junction.x, 0, junction.z]}>
      <mesh position={[0, 2.55, 0]}>
        <boxGeometry args={[0.08, 0.5, 0.08]} />
        <meshStandardMaterial color={PALETTE.walnut} roughness={1} />
      </mesh>
      <mesh position={[0, 2.85, 0]}>
        <boxGeometry args={[1.5, 0.55, 0.06]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.75} metalness={0.2} />
      </mesh>
      <Html position={[0, 2.85, 0.08]} center distanceFactor={4} style={{ pointerEvents: "none" }}>
        <div className="room-junction-sign">
          {junction.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </Html>
    </group>
  );
}

function ShelfBay({
  slot,
  playerX,
  playerZ,
  selectedUid,
  onSelect,
  preferReducedMotion,
}: {
  slot: PlacedShelf;
  playerX: number;
  playerZ: number;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
}) {
  const shelf = slot.shelf!;
  const wood = useWoodTexture(hashUid(slot.id) % 5);
  const lamp = useLampTexture();
  const dist = Math.hypot(slot.x - playerX, slot.z - playerZ);
  const active = dist < 5.5;
  const books = shelf.books.slice(0, MAX_SPINES_PER_SIDE);

  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.facing, 0]}>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[0.55, 2.85, 3.4]} />
        <meshStandardMaterial map={wood} roughness={1} metalness={0} color={PALETTE.honey} />
      </mesh>
      {ROW_YS.map((y) => (
        <mesh key={y} position={[0.12, y - 0.18, 0]}>
          <boxGeometry args={[0.42, 0.07, 3.2]} />
          <meshStandardMaterial color={PALETTE.walnut} roughness={1} />
        </mesh>
      ))}
      <mesh position={[0.4, 2.78, 0]}>
        <boxGeometry args={[0.06, 0.22, 1.05]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.85} metalness={0.2} />
      </mesh>
      <Html position={[0.42, 2.78, 0]} center distanceFactor={active ? 3.1 : 4.4} style={{ pointerEvents: "none" }}>
        <div className="room-sign-3d">
          <span className="label">{shelf.label}</span>
          <span className="room-sign-3d__count">{shelf.books.length}</span>
        </div>
      </Html>
      {active && (
        <pointLight
          position={[0.8, 2.4, 0]}
          intensity={0.75}
          distance={5.5}
          color={PALETTE.lamp}
        />
      )}
      <mesh position={[0.7, 2.65, 0]}>
        <boxGeometry args={[0.3, 0.1, 0.3]} />
        <meshStandardMaterial
          map={lamp}
          emissive={PALETTE.lamp}
          emissiveIntensity={active ? 0.8 : 0.25}
          color={PALETTE.brass}
        />
      </mesh>
      <Spines
        books={books}
        facing={active}
        loadCovers={dist < 7}
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
  books,
  facing,
  loadCovers,
  selectedUid,
  onSelect,
  preferReducedMotion,
}: {
  books: LibraryBook[];
  facing: boolean;
  loadCovers: boolean;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
}) {
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
        const z = -1.35 + col * (2.7 / Math.max(perRow - 1, 1));
        const shelfY = ROW_YS[row];
        const rest =
          pose === "flat"
            ? new THREE.Vector3(0.28, shelfY + 0.04, z)
            : new THREE.Vector3(0.34, shelfY + height / 2 - 0.02, z);

        return (
          <BookSpine3D
            key={book.uid}
            book={book}
            rest={rest}
            thickness={thickness}
            height={height}
            depth={depth}
            pose={pose}
            seed={seed}
            facing={facing}
            loadCover={loadCovers}
            selected={selectedUid === book.uid}
            onSelect={onSelect}
            preferReducedMotion={preferReducedMotion}
          />
        );
      })}
    </group>
  );
}

function useCoverMap(coverUrl: string | null, enabled: boolean) {
  const [map, setMap] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const proxied = coverTextureUrl(coverUrl);
    if (!proxied) {
      setMap(null);
      return;
    }
    let cancelled = false;
    let texture: THREE.Texture | null = null;
    const cancel = enqueueCover(proxied, (image) => {
      if (cancelled || !image) {
        if (!cancelled && !image) setMap(null);
        return;
      }
      texture = pixelateImage(image, 16, 24);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.repeat.set(0.28, 1);
      texture.offset.set(0.36, 0);
      setMap(texture);
    });
    return () => {
      cancelled = true;
      cancel();
      texture?.dispose();
    };
  }, [coverUrl, enabled]);

  return map;
}

function BookSpine3D({
  book,
  rest,
  thickness,
  height,
  depth,
  pose,
  seed,
  facing,
  loadCover,
  selected,
  onSelect,
  preferReducedMotion,
}: {
  book: LibraryBook;
  rest: THREE.Vector3;
  thickness: number;
  height: number;
  depth: number;
  pose: Pose;
  seed: number;
  facing: boolean;
  loadCover: boolean;
  selected: boolean;
  onSelect: (uid: string | null) => void;
  preferReducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const coverRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const coverMap = useCoverMap(book.coverUrl, loadCover || selected);
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
    if (!selected && progress.current < 0.001 && !group.current) return;
    const target = selected ? 1 : 0;
    if (preferReducedMotion) progress.current = target;
    else {
      if (Math.abs(target - progress.current) < 0.001) {
        progress.current = target;
      } else {
        progress.current += (target - progress.current) * Math.min(1, delta * 6);
      }
    }
    const t = progress.current;
    if (!group.current) return;
    if (t < 0.001 && !selected) {
      group.current.position.copy(rest);
      group.current.rotation.set(pose === "flat" ? Math.PI / 2 : 0, 0, pose === "flat" ? lean * 0.3 : lean);
      return;
    }
    group.current.position.set(rest.x + t * 0.55, rest.y + t * 0.1, rest.z);
    if (pose === "flat" && t < 0.05) {
      group.current.rotation.set(Math.PI / 2, 0, lean * 0.3);
    } else {
      group.current.rotation.set(0, (Math.PI / 2) * t, lean * (1 - t));
    }
    if (coverRef.current) coverRef.current.rotation.y = -(Math.PI * 0.72) * t;
  });

  const pick = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const native = event.nativeEvent as PointerEvent & { __roomBookPick?: boolean };
    native.__roomBookPick = true;
    onSelect(selected ? null : book.uid);
  };

  const spineMap = coverMap ?? clothMap;
  const bodyW = facing ? depth + 0.02 : depth;
  const bodyH = pose === "flat" ? thickness : height;
  const bodyD = pose === "flat" ? height : thickness;
  // Generous hit volume covering bevel, lean, and headband/tail.
  const hitW = Math.max(bodyW, 0.14) + 0.1;
  const hitH = bodyH + 0.08;
  const hitD = bodyD + 0.1;

  return (
    <group ref={group} position={rest.toArray()}>
      {/* Invisible pick target — visuals do not raycast so bevels cannot steal clicks */}
      <mesh
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          pick(event);
        }}
        onClick={(event) => {
          event.stopPropagation();
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
        <boxGeometry args={[hitW, hitH, hitD]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <mesh raycast={noopRaycast}>
        <boxGeometry args={[bodyW, bodyH, bodyD]} />
        <meshStandardMaterial
          map={spineMap}
          color={coverMap ? "#ffffff" : cloth}
          roughness={0.92}
        />
      </mesh>
      {pose !== "flat" && (
        <mesh position={[bodyW * 0.35, 0, 0]} scale={[0.55, 0.96, 0.92]} raycast={noopRaycast}>
          <boxGeometry args={[bodyW, bodyH, bodyD]} />
          <meshStandardMaterial
            map={spineMap}
            color={coverMap ? "#f5efe0" : cloth}
            roughness={0.9}
          />
        </mesh>
      )}
      {pose !== "flat" && (
        <mesh position={[0, bodyH * 0.48, 0]} raycast={noopRaycast}>
          <boxGeometry args={[bodyW * 1.02, 0.018, bodyD * 1.02]} />
          <meshStandardMaterial color={seed % 2 === 0 ? PALETTE.brass : PALETTE.paper} />
        </mesh>
      )}
      {pose !== "flat" && (
        <mesh position={[0, -bodyH * 0.48, 0]} raycast={noopRaycast}>
          <boxGeometry args={[bodyW * 1.02, 0.016, bodyD * 1.02]} />
          <meshStandardMaterial color={seed % 3 === 0 ? PALETTE.deepGreen : PALETTE.brass} />
        </mesh>
      )}
      {facing && !selected && (hovered || !coverMap) && pose !== "flat" && (
        <Html position={[0.12, 0, 0]} center distanceFactor={2.5} style={{ pointerEvents: "none" }}>
          <div className={`room-spine-label ${hovered ? "is-hot" : ""}`}>
            <p className="room-spine-label__title">{shortTitle(book.title, 36)}</p>
            <p className="room-spine-label__author">{authors}</p>
          </div>
        </Html>
      )}
      <mesh
        ref={coverRef}
        position={[0.08, 0, bodyD * 0.45]}
        visible={selected || progress.current > 0.02}
        raycast={noopRaycast}
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

function noopRaycast() {
  /* decorative meshes must not steal spine picks */
}
