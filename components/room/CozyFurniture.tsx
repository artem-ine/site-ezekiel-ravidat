"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PALETTE, hashUid } from "@/components/room/roomConfig";
import { useWoodTexture, useLampTexture, useRugTexture } from "@/components/room/woodTexture";
import type { FurniturePiece } from "@/components/room/floorPlan";

/** Pixel-art furniture for the cozy reading room. Near-only rendering is handled by the parent. */
export function CozyFurniturePiece({
  piece,
  preferReducedMotion,
}: {
  piece: FurniturePiece;
  preferReducedMotion: boolean;
}) {
  const scale = piece.scale ?? 1;
  return (
    <group position={[piece.x, 0, piece.z]} rotation={[0, piece.yaw, 0]} scale={scale}>
      {piece.kind === "rug" && <RugMesh id={piece.id} />}
      {piece.kind === "sofa" && <SofaMesh />}
      {piece.kind === "armchair" && <ArmchairMesh />}
      {piece.kind === "beanbag" && <BeanbagMesh id={piece.id} />}
      {piece.kind === "cushion" && <CushionMesh id={piece.id} />}
      {piece.kind === "low-table" && <LowTableMesh />}
      {piece.kind === "side-table" && <SideTableMesh />}
      {piece.kind === "floor-lamp" && (
        <FloorLampMesh preferReducedMotion={preferReducedMotion} />
      )}
      {piece.kind === "reading-lamp" && (
        <ReadingLampMesh preferReducedMotion={preferReducedMotion} />
      )}
      {piece.kind === "plant" && <PlantMesh />}
      {piece.kind === "fireplace" && (
        <FireplaceMesh preferReducedMotion={preferReducedMotion} />
      )}
      {piece.kind === "cat" && <CatMesh preferReducedMotion={preferReducedMotion} />}
    </group>
  );
}

function RugMesh({ id }: { id: string }) {
  const rug = useRugTexture();
  const tint = hashUid(id) % 2 === 0 ? "#6b3a2a" : "#2f4a3c";
  // Distinct height per rug + polygonOffset — kills floor z-fighting flicker.
  const y = 0.04 + (hashUid(id) % 3) * 0.006;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} renderOrder={1}>
      <planeGeometry args={[3.2, 2.3]} />
      <meshStandardMaterial
        map={rug}
        color={tint}
        roughness={1}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

function SofaMesh() {
  const wood = useWoodTexture(2);
  return (
    <group>
      <mesh position={[0, 0.28, 0]}>
        <boxGeometry args={[0.9, 0.32, 2.4]} />
        <meshStandardMaterial color="#5c3a2e" roughness={1} />
      </mesh>
      <mesh position={[-0.32, 0.62, 0]}>
        <boxGeometry args={[0.22, 0.55, 2.35]} />
        <meshStandardMaterial color="#4a2c24" roughness={1} />
      </mesh>
      <mesh position={[0.05, 0.48, -1.05]}>
        <boxGeometry args={[0.7, 0.28, 0.22]} />
        <meshStandardMaterial color="#5c3a2e" roughness={1} />
      </mesh>
      <mesh position={[0.05, 0.48, 1.05]}>
        <boxGeometry args={[0.7, 0.28, 0.22]} />
        <meshStandardMaterial color="#5c3a2e" roughness={1} />
      </mesh>
      <mesh position={[0.35, 0.12, -1.0]}>
        <boxGeometry args={[0.12, 0.22, 0.12]} />
        <meshStandardMaterial map={wood} color={PALETTE.walnut} roughness={1} />
      </mesh>
      <mesh position={[0.35, 0.12, 1.0]}>
        <boxGeometry args={[0.12, 0.22, 0.12]} />
        <meshStandardMaterial map={wood} color={PALETTE.walnut} roughness={1} />
      </mesh>
    </group>
  );
}

function ArmchairMesh() {
  return (
    <group>
      <mesh position={[0, 0.26, 0]}>
        <boxGeometry args={[0.7, 0.28, 0.7]} />
        <meshStandardMaterial color="#6b2a24" roughness={1} />
      </mesh>
      <mesh position={[-0.22, 0.55, 0]}>
        <boxGeometry args={[0.18, 0.45, 0.68]} />
        <meshStandardMaterial color="#4a1e1a" roughness={1} />
      </mesh>
      <mesh position={[0.05, 0.42, -0.28]}>
        <boxGeometry args={[0.55, 0.22, 0.14]} />
        <meshStandardMaterial color="#6b2a24" roughness={1} />
      </mesh>
      <mesh position={[0.05, 0.42, 0.28]}>
        <boxGeometry args={[0.55, 0.22, 0.14]} />
        <meshStandardMaterial color="#6b2a24" roughness={1} />
      </mesh>
    </group>
  );
}

function BeanbagMesh({ id }: { id: string }) {
  const colors = ["#2f4a3c", "#6b2a24", "#3a4a6b", "#5c3a2e"];
  const color = colors[hashUid(id) % colors.length];
  return (
    <mesh position={[0, 0.28, 0]} scale={[1, 0.72, 1]}>
      <sphereGeometry args={[0.55, 8, 6]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
  );
}

function CushionMesh({ id }: { id: string }) {
  const colors = ["#c4a35a", "#6b2a24", "#2f4a3c", "#e8d9b5"];
  const color = colors[hashUid(id) % colors.length];
  return (
    <mesh position={[0, 0.08, 0]} rotation={[0, 0.3, 0]}>
      <boxGeometry args={[0.55, 0.12, 0.55]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function LowTableMesh() {
  const wood = useWoodTexture(4);
  return (
    <group>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[1.35, 0.08, 0.8]} />
        <meshStandardMaterial map={wood} color={PALETTE.honey} roughness={1} />
      </mesh>
      {[
        [-0.55, -0.28],
        [0.55, -0.28],
        [-0.55, 0.28],
        [0.55, 0.28],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.18, z]}>
          <boxGeometry args={[0.08, 0.36, 0.08]} />
          <meshStandardMaterial color={PALETTE.walnut} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function SideTableMesh() {
  const wood = useWoodTexture(1);
  return (
    <group>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.55, 0.06, 0.55]} />
        <meshStandardMaterial map={wood} color={PALETTE.honey} roughness={1} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color={PALETTE.walnut} roughness={1} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.35, 0.04, 0.35]} />
        <meshStandardMaterial color={PALETTE.walnut} roughness={1} />
      </mesh>
    </group>
  );
}

function FloorLampMesh({ preferReducedMotion }: { preferReducedMotion: boolean }) {
  const lamp = useLampTexture();
  return (
    <group>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 1.4, 6]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.7} metalness={0.25} />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.28, 6]} />
        <meshStandardMaterial
          map={lamp}
          color={PALETTE.paper}
          emissive={PALETTE.lamp}
          emissiveIntensity={preferReducedMotion ? 0.35 : 0.7}
          roughness={1}
        />
      </mesh>
      {!preferReducedMotion && (
        <pointLight position={[0, 1.35, 0]} intensity={1.1} distance={5} color={PALETTE.lamp} />
      )}
    </group>
  );
}

function ReadingLampMesh({ preferReducedMotion }: { preferReducedMotion: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.7, 6]} />
        <meshStandardMaterial color={PALETTE.brass} roughness={0.65} metalness={0.3} />
      </mesh>
      <mesh position={[0.12, 0.72, 0]} rotation={[0, 0, 0.6]}>
        <boxGeometry args={[0.22, 0.08, 0.22]} />
        <meshStandardMaterial
          color={PALETTE.ink}
          emissive={PALETTE.lamp}
          emissiveIntensity={preferReducedMotion ? 0.3 : 0.65}
          roughness={1}
        />
      </mesh>
      {!preferReducedMotion && (
        <pointLight
          position={[0.15, 0.65, 0]}
          intensity={0.85}
          distance={3.2}
          color={PALETTE.lamp}
        />
      )}
    </group>
  );
}

function PlantMesh() {
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.16, 0.14, 0.32, 6]} />
        <meshStandardMaterial color="#6b2a24" roughness={1} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.32, 6, 5]} />
        <meshStandardMaterial color="#2f4a3c" roughness={1} flatShading />
      </mesh>
      <mesh position={[0.18, 0.7, 0.05]}>
        <sphereGeometry args={[0.18, 5, 4]} />
        <meshStandardMaterial color="#3a5c48" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

function FireplaceMesh({ preferReducedMotion }: { preferReducedMotion: boolean }) {
  const glow = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (preferReducedMotion || !glow.current) return;
    const mat = glow.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.55 + Math.sin(clock.elapsedTime * 3.2) * 0.2;
  });

  return (
    <group>
      <mesh position={[0, 0.85, 0]}>
        <boxGeometry args={[0.55, 1.7, 1.6]} />
        <meshStandardMaterial color="#3a2a22" roughness={1} />
      </mesh>
      <mesh position={[0.22, 0.55, 0]}>
        <boxGeometry args={[0.2, 0.85, 1.05]} />
        <meshStandardMaterial color={PALETTE.ink} roughness={1} />
      </mesh>
      <mesh ref={glow} position={[0.28, 0.4, 0]}>
        <boxGeometry args={[0.08, 0.45, 0.7]} />
        <meshStandardMaterial
          color="#ff8a3a"
          emissive="#ff6a20"
          emissiveIntensity={0.7}
          roughness={1}
        />
      </mesh>
      {!preferReducedMotion && (
        <pointLight position={[0.5, 0.5, 0]} intensity={0.9} distance={4.5} color="#ff9a4a" />
      )}
      <mesh position={[0, 1.75, 0]}>
        <boxGeometry args={[0.7, 0.2, 1.8]} />
        <meshStandardMaterial color="#2a1c16" roughness={1} />
      </mesh>
    </group>
  );
}

function CatMesh({ preferReducedMotion }: { preferReducedMotion: boolean }) {
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (preferReducedMotion || !body.current) return;
    body.current.position.y = 0.14 + Math.sin(clock.elapsedTime * 1.1) * 0.008;
  });

  const fur = useMemo(() => "#c9b39a", []);
  return (
    <group ref={body} position={[0, 0.14, 0]}>
      <mesh position={[0, 0.06, 0]} rotation={[0, 0, 0.15]}>
        <boxGeometry args={[0.28, 0.16, 0.42]} />
        <meshStandardMaterial color={fur} roughness={1} />
      </mesh>
      <mesh position={[0.02, 0.14, 0.2]}>
        <boxGeometry args={[0.16, 0.14, 0.16]} />
        <meshStandardMaterial color={fur} roughness={1} />
      </mesh>
      <mesh position={[-0.02, 0.22, 0.24]}>
        <boxGeometry args={[0.05, 0.08, 0.04]} />
        <meshStandardMaterial color={fur} roughness={1} />
      </mesh>
      <mesh position={[0.06, 0.22, 0.24]}>
        <boxGeometry args={[0.05, 0.08, 0.04]} />
        <meshStandardMaterial color={fur} roughness={1} />
      </mesh>
      <mesh position={[-0.05, 0.08, -0.22]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.22]} />
        <meshStandardMaterial color={fur} roughness={1} />
      </mesh>
    </group>
  );
}
