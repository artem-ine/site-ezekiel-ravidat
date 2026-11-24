"use client";

import { useMemo } from "react";
import * as THREE from "three";

/** Tiny procedural wood map — no external assets, free to use. */
export function useWoodTexture(seed = 1) {
  return useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return new THREE.CanvasTexture(document.createElement("canvas"));
    }

    ctx.fillStyle = "#5a3b24";
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 28; i += 1) {
      const y = ((i * 17 + seed * 13) % size) + 0.5;
      ctx.strokeStyle = i % 3 === 0 ? "#6b4a2e" : "#4a2f1c";
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1 + (i % 2);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 8) {
        ctx.lineTo(x, y + Math.sin((x + seed) * 0.08) * 2);
      }
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [seed]);
}
