"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { PALETTE } from "@/components/room/roomConfig";

function pixelCanvas(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  paint(ctx, size);
  return canvas;
}

function nearestTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Chunked pixel wood — walnut / honey grain. */
export function useWoodTexture(seed = 1) {
  return useMemo(() => {
    const canvas = pixelCanvas(32, (ctx, size) => {
      ctx.fillStyle = PALETTE.walnut;
      ctx.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y += 1) {
        const tone = (y * 3 + seed * 7) % 5;
        ctx.fillStyle = tone === 0 ? "#5c3a22" : tone === 1 ? PALETTE.honey : "#3d2616";
        ctx.globalAlpha = tone === 1 ? 0.35 : 0.55;
        ctx.fillRect(0, y, size, 1);
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 6; i += 1) {
        const x = (i * 11 + seed * 3) % size;
        ctx.fillStyle = "#2a1810";
        ctx.fillRect(x, 0, 1, size);
      }
    });
    return nearestTexture(canvas);
  }, [seed]);
}

/** Pixel rug strip for the aisle floor. */
export function useRugTexture() {
  return useMemo(() => {
    const canvas = pixelCanvas(16, (ctx, size) => {
      ctx.fillStyle = PALETTE.oxblood;
      ctx.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y += 2) {
        ctx.fillStyle = y % 4 === 0 ? PALETTE.deepGreen : "#5a2430";
        ctx.fillRect(0, y, size, 1);
      }
      ctx.fillStyle = PALETTE.brass;
      ctx.fillRect(0, 0, size, 1);
      ctx.fillRect(0, size - 1, size, 1);
    });
    return nearestTexture(canvas);
  }, []);
}

/** Soft banded lamp glow (dithered). */
export function useLampTexture() {
  return useMemo(() => {
    const canvas = pixelCanvas(8, (ctx, size) => {
      for (let y = 0; y < size; y += 1) {
        const t = y / (size - 1);
        ctx.fillStyle = t < 0.4 ? "#fff1c8" : t < 0.7 ? PALETTE.lamp : "#e0a050";
        ctx.fillRect(0, y, size, 1);
        if (y % 2 === 1) {
          ctx.fillStyle = "rgba(0,0,0,0.15)";
          ctx.fillRect(0, y, size, 1);
        }
      }
    });
    return nearestTexture(canvas);
  }, []);
}

/** Cloth spine with headband, gilt title band, and tail. */
export function makeSpineTexture(cloth: string, seed: number) {
  const canvas = pixelCanvas(16, (ctx, size) => {
    ctx.fillStyle = cloth;
    ctx.fillRect(0, 0, size, size);
    // Headband
    ctx.fillStyle = seed % 2 === 0 ? PALETTE.brass : PALETTE.paper;
    ctx.fillRect(0, 0, size, 2);
    // Tail
    ctx.fillStyle = seed % 3 === 0 ? PALETTE.deepGreen : PALETTE.brass;
    ctx.fillRect(0, size - 2, size, 2);
    // Gilt title band
    const bandY = 5 + (seed % 4);
    ctx.fillStyle = PALETTE.brass;
    ctx.fillRect(2, bandY, size - 4, 3);
    ctx.fillStyle = PALETTE.ink;
    for (let x = 3; x < size - 3; x += 2) {
      ctx.fillRect(x, bandY + 1, 1, 1);
    }
  });
  return nearestTexture(canvas);
}

/** Downsample a cover into chunky pixels for spine/open faces. */
export function pixelateImage(image: HTMLImageElement, cols = 24, rows = 36): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, cols, rows);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
