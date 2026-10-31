import * as THREE from "three";
import { assetUrl } from "../../core/assetUrl";
import { clamp, hexColor, lerp, stat01 } from "../../core/math";
import type { TeamKit } from "../../data/schema";
import { playerInitials } from "../../ui/Portrait";
import type { Player } from "./Player";
import { gaitCadence, gaitFromSpeed, gaitStride } from "./PlayerAnimation";
import {
  divePhase,
  diveRoll01,
  firstTouchCushion01,
  headerLean01,
  jumpLiftMetres,
  kickPhase,
  kickPlant01,
  kickSwing01,
  slideFlat01,
  slidePhase,
  timerProgress,
} from "./PoseMotion";
import {
  applyKitToSkinned,
  cloneSkinnedPlayer,
  resolvePlayerModelUrl,
  setSkinnedShirtMap,
  syncSkinnedAnimation,
  type SkinnedPlayerInstance,
} from "./PlayerModelLoader";

const SLIDE_FALLBACK = 0.32;
const DIVE_FALLBACK = 0.55;
const JUMP_FALLBACK = 0.24;

/** Shared geometries — higher segment counts for cleaner silhouettes in match cameras. */
const geo = {
  /**
   * Open cylinder — rectangular UVs (u around, v up) so kit photos wrap without
   * the polar stretch you get from CapsuleGeometry end-caps.
   */
  torso: new THREE.CylinderGeometry(0.155, 0.178, 0.5, 28, 1, true),
  collar: new THREE.TorusGeometry(0.095, 0.026, 10, 20),
  shorts: new THREE.CylinderGeometry(0.155, 0.185, 0.28, 16),
  hip: new THREE.SphereGeometry(0.155, 14, 12),
  head: new THREE.SphereGeometry(0.128, 22, 18),
  neck: new THREE.CylinderGeometry(0.048, 0.055, 0.07, 12),
  /** Upper sleeve — slightly thicker at the top so it reads as a shoulder without a ball joint. */
  upperArm: new THREE.CapsuleGeometry(0.052, 0.26, 8, 12),
  forearm: new THREE.CapsuleGeometry(0.04, 0.18, 8, 12),
  hand: new THREE.SphereGeometry(0.042, 12, 10),
  thigh: new THREE.CapsuleGeometry(0.07, 0.26, 8, 12),
  calf: new THREE.CapsuleGeometry(0.048, 0.24, 8, 12),
  knee: new THREE.SphereGeometry(0.052, 10, 8),
  boot: new THREE.BoxGeometry(0.095, 0.065, 0.23),
  bootToe: new THREE.BoxGeometry(0.085, 0.05, 0.1),
  sole: new THREE.BoxGeometry(0.105, 0.028, 0.255),
  hairCap: new THREE.SphereGeometry(0.134, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
  hairFade: new THREE.SphereGeometry(0.132, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
  hairCurl: new THREE.SphereGeometry(0.142, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
  hairLong: new THREE.SphereGeometry(0.125, 14, 12),
  ear: new THREE.SphereGeometry(0.028, 8, 6),
  eye: new THREE.SphereGeometry(0.016, 8, 6),
  sleeveBand: new THREE.TorusGeometry(0.055, 0.014, 8, 16),
  portrait: new THREE.CircleGeometry(0.55, 48),
};

const portraitTextures = new Map<string, THREE.Texture>();
const kitShirtTextures = new Map<string, THREE.CanvasTexture>();
/**
 * Front torso panel as a fraction of cylinder circumference (~160°).
 * Sides/back stay solid kit colour.
 */
const KIT_FRONT_COVER = 0.44;
/** Vertical fill of the cylinder for the jersey face. */
const KIT_FRONT_HEIGHT = 0.88;

function skinColor(tone: number): number {
  const t = Math.min(1, Math.max(0, tone));
  const r = 78 + t * 155;
  const g = 44 + t * 125;
  const b = 30 + t * 92;
  return (r << 16) | (g << 8) | b;
}

function parseBootColor(style: string | undefined, seed: string): number {
  const s = (style ?? "").toLowerCase().trim();
  if (s.startsWith("#") && (s.length === 7 || s.length === 4)) return hexColor(s);
  if (s.includes("white") || s.includes("silver")) return 0xe8e8ec;
  if (s.includes("red")) return 0x8b1520;
  if (s.includes("blue")) return 0x1a3a7a;
  if (s.includes("green")) return 0x0d5c38;
  if (s.includes("gold") || s.includes("yellow")) return 0xc9a227;
  if (s.includes("pink")) return 0xc45a8c;
  if (s.includes("orange")) return 0xc45a18;
  // Stable per-player accent so boots aren't all identical black.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const palette = [0x101214, 0x1a1a1e, 0x0e1520, 0x221810, 0x141816, 0x2a1014];
  return palette[Math.abs(h) % palette.length];
}

function luminance(hex: string): number {
  const c = hexColor(hex);
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function paintProceduralKitBase(ctx: CanvasRenderingContext2D, shirt: string, trim?: string): void {
  ctx.fillStyle = shirt;
  ctx.fillRect(0, 0, 512, 512);

  const trimCol = trim && trim.toLowerCase() !== shirt.toLowerCase() ? trim : null;
  if (trimCol) {
    const contrast = Math.abs(luminance(shirt) - luminance(trimCol));
    if (contrast > 0.12) {
      ctx.fillStyle = trimCol;
      ctx.globalAlpha = 0.42;
      for (let x = 18; x < 512; x += 56) ctx.fillRect(x, 0, 22, 512);
      ctx.globalAlpha = 1;
      ctx.fillStyle = trimCol;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(0, 0, 512, 36);
      ctx.fillRect(0, 476, 512, 36);
      ctx.globalAlpha = 1;
    }
  }

  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, "rgba(255,255,255,0.08)");
  grad.addColorStop(0.45, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.1)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
}

function imageSourceSize(img: CanvasImageSource): { w: number; h: number } {
  if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
    return { w: img.width || 512, h: img.height || 512 };
  }
  const el = img as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const w = el.naturalWidth || el.width || 512;
  const h = el.naturalHeight || el.height || 512;
  return { w, h };
}

/** Opaque / non-near-black content box for product-shot kit PNGs (transparent or black matte). */
export function kitPhotoContentBounds(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3]!;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Keep jersey pixels; drop empty / matte black.
      if (a > 18 && lum > 14) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return { x: 0, y: 0, w, h };
  const pad = Math.max(2, Math.floor(Math.min(w, h) * 0.02));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  return { x: minX, y: minY, w: Math.max(1, maxX - minX + 1), h: Math.max(1, maxY - minY + 1) };
}

function readKitImageData(img: CanvasImageSource): { data: Uint8ClampedArray; w: number; h: number } | null {
  const { w, h } = imageSourceSize(img);
  try {
    const probe = document.createElement("canvas");
    probe.width = w;
    probe.height = h;
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    if (!pctx) return null;
    pctx.drawImage(img, 0, 0, w, h);
    return { data: pctx.getImageData(0, 0, w, h).data, w, h };
  } catch {
    return null;
  }
}

function measureKitPhotoCrop(img: CanvasImageSource, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const probed = readKitImageData(img);
  if (!probed) return { x: 0, y: 0, w, h };
  return kitPhotoContentBounds(probed.data, probed.w, probed.h);
}

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/**
 * Dominant fabric colour from a kit product shot (torso crop).
 * Prefers saturated jersey pixels over black matte and pale sponsor logos so a
 * yellow away PNG does not fall back to a white schema `kit.shirt`.
 */
export function sampleKitBaseColor(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  fallback: string,
): string {
  const box = kitPhotoContentBounds(data, w, h);
  const insetX = Math.floor(box.w * 0.2);
  const insetTop = Math.floor(box.h * 0.08);
  const insetBot = Math.floor(box.h * 0.12);
  const x0 = box.x + insetX;
  const y0 = box.y + insetTop;
  const x1 = Math.max(x0 + 1, box.x + box.w - insetX);
  const y1 = Math.max(y0 + 1, box.y + box.h - insetBot);

  type Bin = { weight: number; r: number; g: number; b: number };
  const bins = new Map<number, Bin>();
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 48));

  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * w + x) * 4;
      const a = data[i + 3]!;
      if (a < 40) continue;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 28) continue;
      const sat = max === 0 ? 0 : (max - min) / max;
      // Saturated fabric outweighs near-white logos / print.
      const weight = 1 + sat * 4;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bin = bins.get(key);
      if (bin) {
        bin.weight += weight;
        bin.r += r * weight;
        bin.g += g * weight;
        bin.b += b * weight;
      } else {
        bins.set(key, { weight, r: r * weight, g: g * weight, b: b * weight });
      }
    }
  }

  let best: Bin | null = null;
  for (const bin of bins.values()) {
    if (!best || bin.weight > best.weight) best = bin;
  }
  if (!best || best.weight <= 0) return fallback;
  return `#${toHexByte(best.r / best.weight)}${toHexByte(best.g / best.weight)}${toHexByte(best.b / best.weight)}`;
}

type KitTexUserData = {
  kitBaseColor?: string;
  kitBaseWaiters?: Array<(hex: string) => void>;
};

function notifyKitBaseColor(tex: THREE.CanvasTexture, hex: string): void {
  const ud = tex.userData as KitTexUserData;
  ud.kitBaseColor = hex;
  const waiters = ud.kitBaseWaiters;
  ud.kitBaseWaiters = undefined;
  if (waiters) for (const wait of waiters) wait(hex);
}

/** Side strips (solid kit colour + back number) when using a centered front PNG + tex.offset.x=0.5. */
export function kitSidePanelWidth(canvasW = 512): number {
  return Math.floor((canvasW * (1 - KIT_FRONT_COVER)) / 2);
}

export function kitFrontPanelBounds(canvasW = 512): { left: number; right: number; width: number } {
  const width = Math.floor(canvasW * KIT_FRONT_COVER);
  const left = Math.floor((canvasW - width) / 2);
  return { left, right: left + width, width };
}

/**
 * Paint a front jersey torso panel once (sleeves cropped out), aspect-correct.
 * Pair with texture.offset.x = 0.5 so canvas centre → cylinder +Z front.
 */
export function paintKitWrapImage(ctx: CanvasRenderingContext2D, img: CanvasImageSource, shirt: string): "front" | "atlas" {
  const { w, h } = imageSourceSize(img);
  ctx.fillStyle = shirt;
  ctx.fillRect(0, 0, 512, 512);
  const aspect = w / Math.max(1, h);

  if (aspect > 1.45) {
    const srcW = Math.floor(w * 0.4);
    const srcH = Math.floor(h * 0.72);
    const srcX = Math.floor(w * 0.02);
    const srcY = Math.floor(h * 0.04);
    const destH = Math.floor(512 * KIT_FRONT_HEIGHT);
    const destW = Math.min(kitFrontPanelBounds(512).width, Math.floor(destH * (srcW / Math.max(1, srcH))));
    const dx = Math.floor((512 - destW) / 2);
    const dy = Math.floor((512 - destH) / 2);
    ctx.drawImage(img, srcX, srcY, srcW, srcH, dx, dy, destW, destH);
    return "atlas";
  }

  const crop = measureKitPhotoCrop(img, w, h);
  // Cut sleeve wings — product shots include arms; we only want the torso panel.
  const insetX = Math.floor(crop.w * 0.2);
  const insetTop = Math.floor(crop.h * 0.04);
  const insetBot = Math.floor(crop.h * 0.06);
  const sx = crop.x + insetX;
  const sy = crop.y + insetTop;
  const sw = Math.max(1, crop.w - insetX * 2);
  const sh = Math.max(1, crop.h - insetTop - insetBot);

  const maxW = kitFrontPanelBounds(512).width;
  const maxH = Math.floor(512 * KIT_FRONT_HEIGHT);
  const panelAspect = sw / sh;
  let destW = maxW;
  let destH = Math.floor(destW / panelAspect);
  if (destH > maxH) {
    destH = maxH;
    destW = Math.floor(destH * panelAspect);
  }
  const dx = Math.floor((512 - destW) / 2);
  const dy = Math.floor((512 - destH) / 2);
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, destW, destH);

  // Keep side strips pure kit colour (back + under-arms).
  const side = kitSidePanelWidth(512);
  ctx.fillStyle = shirt;
  ctx.fillRect(0, 0, side, 512);
  ctx.fillRect(512 - side, 0, side, 512);
  return "front";
}

/**
 * Back number in the side strips (canvas edges = cylinder back with offset.x=0.5).
 */
export function paintKitNumberOnBack(ctx: CanvasRenderingContext2D, num: number, numberColor: string): void {
  const side = kitSidePanelWidth(512);
  const maxW = Math.max(32, side * 2 - 28);
  const label = String(num);
  const bandTop = Math.floor(512 * 0.22);
  const bandH = Math.floor(512 * 0.55);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bandTop, side, bandH);
  ctx.rect(512 - side, bandTop, side, bandH);
  ctx.clip();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 108;
  ctx.font = `bold ${size}px Impact, Arial Black, sans-serif`;
  while (size > 56 && ctx.measureText(label).width > maxW) {
    size -= 4;
    ctx.font = `bold ${size}px Impact, Arial Black, sans-serif`;
  }
  ctx.lineWidth = Math.max(6, Math.round(size * 0.07));
  ctx.strokeStyle = luminance(numberColor) > 0.55 ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.4)";
  ctx.fillStyle = numberColor;

  const cy = bandTop + Math.floor(bandH * 0.5);
  for (const x of [0, 512]) {
    ctx.strokeText(label, x, cy);
    ctx.fillText(label, x, cy);
  }
  ctx.restore();
}

/** Procedural kits (no PNG / no offset): number at canvas centre = cylinder back (u≈0.5). */
function paintKitNumberOnBackCentered(ctx: CanvasRenderingContext2D, num: number, numberColor: string): void {
  const backL = 256 - 64;
  const backR = 256 + 64;
  const bandTop = Math.floor(512 * 0.22);
  const bandH = Math.floor(512 * 0.55);
  const label = String(num);
  ctx.save();
  ctx.beginPath();
  ctx.rect(backL, bandTop, backR - backL, bandH);
  ctx.clip();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 108;
  ctx.font = `bold ${size}px Impact, Arial Black, sans-serif`;
  while (size > 56 && ctx.measureText(label).width > backR - backL - 12) {
    size -= 4;
    ctx.font = `bold ${size}px Impact, Arial Black, sans-serif`;
  }
  ctx.lineWidth = Math.max(6, Math.round(size * 0.07));
  ctx.strokeStyle = luminance(numberColor) > 0.55 ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.4)";
  ctx.strokeText(label, 256, bandTop + Math.floor(bandH * 0.5));
  ctx.fillStyle = numberColor;
  ctx.fillText(label, 256, bandTop + Math.floor(bandH * 0.5));
  ctx.restore();
}

/** Torso wrap map: one front PNG + back number. Chest/arms use solid kit colour instead. */
function kitShirtTexture(
  num: number,
  numberColor: string,
  shirt: string,
  trim?: string,
  shirtAsset?: string | null,
  onBaseColor?: (hex: string) => void,
): THREE.CanvasTexture {
  const asset = assetUrl(shirtAsset?.trim() || "");
  const key = `shirt|v8|${shirt}|${trim ?? ""}|${numberColor}|${num}|${asset}`;
  const hit = kitShirtTextures.get(key);
  if (hit) {
    if (onBaseColor) {
      const ud = hit.userData as KitTexUserData;
      if (ud.kitBaseColor) onBaseColor(ud.kitBaseColor);
      else if (asset) (ud.kitBaseWaiters ??= []).push(onBaseColor);
      else onBaseColor(shirt);
    }
    return hit;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  paintProceduralKitBase(ctx, shirt, trim);
  paintKitNumberOnBackCentered(ctx, num, numberColor);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.offset.x = 0;
  kitShirtTextures.set(key, tex);

  if (asset) {
    if (onBaseColor) (tex.userData as KitTexUserData).kitBaseWaiters = [onBaseColor];
    new THREE.TextureLoader().load(
      asset,
      (loaded) => {
        const img = loaded.image as CanvasImageSource | undefined;
        if (!img) {
          notifyKitBaseColor(tex, shirt);
          return;
        }
        let base = shirt;
        const probed = readKitImageData(img);
        if (probed) base = sampleKitBaseColor(probed.data, probed.w, probed.h, shirt);
        const mode = paintKitWrapImage(ctx, img, base);
        if (mode === "front") {
          // Canvas centre → Lathe +Z front; side strips → back.
          tex.offset.x = 0.5;
          paintKitNumberOnBack(ctx, num, numberColor);
        } else {
          tex.offset.x = 0;
          paintKitNumberOnBackCentered(ctx, num, numberColor);
        }
        tex.needsUpdate = true;
        notifyKitBaseColor(tex, base);
      },
      undefined,
      () => {
        /* Missing kit PNG — keep procedural stripes + number. */
        notifyKitBaseColor(tex, shirt);
      },
    );
  } else if (onBaseColor) {
    onBaseColor(shirt);
  }
  return tex;
}

function portraitTexture(url: string, fallback?: () => THREE.Texture): THREE.Texture {
  const hit = portraitTextures.get(url);
  if (hit) return hit;
  const tex = new THREE.TextureLoader().load(
    url,
    undefined,
    undefined,
    () => {
      if (!fallback) return;
      const badge = fallback();
      tex.image = (badge as THREE.CanvasTexture).image;
      tex.needsUpdate = true;
    },
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  portraitTextures.set(url, tex);
  return tex;
}

function badgePortraitTexture(number: number, initials: string, color: string): THREE.CanvasTexture {
  const key = `badge:${number}:${initials}:${color.toLowerCase()}`;
  const hit = portraitTextures.get(key);
  if (hit) return hit as THREE.CanvasTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 110px Arial Black, Impact, sans-serif";
  ctx.fillText(String(number), 128, 108);
  ctx.globalAlpha = 0.92;
  ctx.font = "bold 52px Arial, Helvetica, sans-serif";
  ctx.fillText(initials, 128, 178);
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  portraitTextures.set(key, tex);
  return tex;
}

function resolvePortraitMap(player: Player, kitColor: string): THREE.Texture {
  const initials = playerInitials(player.displayName || player.name || "?");
  const badge = () => badgePortraitTexture(player.shirtNumber, initials, kitColor);
  const url = assetUrl(player.appearance.portraitAsset?.trim() || "");
  if (url) return portraitTexture(url, badge);
  return badge();
}

export interface PlayerRig {
  group: THREE.Group;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  torso: THREE.Object3D;
}

interface InternalRig {
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftFore: THREE.Object3D;
  rightFore: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftCalf: THREE.Object3D;
  rightCalf: THREE.Object3D;
  torso: THREE.Object3D;
  head: THREE.Object3D;
}

function std(color: number, extra?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.04,
    ...extra,
  });
}

function lit(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addHair(bodyRoot: THREE.Group, style: string, hairMat: THREE.Material): void {
  if (style === "bald") return;

  if (style === "fade") {
    const cap = lit(new THREE.Mesh(geo.hairFade, hairMat));
    cap.position.y = 1.655;
    cap.rotation.x = -0.08;
    cap.scale.set(1.02, 0.78, 1.02);
    bodyRoot.add(cap);
    return;
  }

  if (style === "curl") {
    const bun = lit(new THREE.Mesh(geo.hairCurl, hairMat));
    bun.position.y = 1.67;
    bun.scale.set(1.08, 0.95, 1.1);
    bodyRoot.add(bun);
    // Soft side volume.
    for (const side of [-1, 1] as const) {
      const puff = lit(new THREE.Mesh(geo.ear, hairMat));
      puff.position.set(side * 0.11, 1.6, 0.02);
      puff.scale.set(1.6, 1.8, 1.4);
      bodyRoot.add(puff);
    }
    return;
  }

  const hair = lit(new THREE.Mesh(geo.hairCap, hairMat));
  hair.position.y = 1.62;
  hair.rotation.x = -0.12;
  bodyRoot.add(hair);

  if (style === "long") {
    const tail = lit(new THREE.Mesh(geo.hairLong, hairMat));
    tail.position.set(0, 1.46, -0.09);
    tail.scale.set(0.82, 1.35, 0.88);
    bodyRoot.add(tail);
  }
}

export function createPlayerVisual(player: Player, kit: TeamKit, keeper: boolean): PlayerRig {
  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  bodyRoot.name = "bodyRoot";
  const scale = player.appearance.heightScale;
  const wide =
    typeof player.appearance.bodyWidth === "number" && Number.isFinite(player.appearance.bodyWidth)
      ? player.appearance.bodyWidth
      : player.appearance.bodyType === "stocky"
        ? 1.1
        : player.appearance.bodyType === "lean"
          ? 0.92
          : 1;
  group.scale.set(scale * wide, scale, scale * wide);

  const shirtHex = kit.shirt;
  const numberCol = kit.numberColor ?? "#ffffff";
  const trimHex = kit.trim ?? numberCol;
  // PNG wrap on the torso cylinder; arms / sides use solid kit colour (sampled from PNG when present).
  const shirtSolidMat = std(hexColor(shirtHex), { roughness: 0.42, metalness: 0.08 });
  const shirtMap = kitShirtTexture(
    player.shirtNumber,
    numberCol,
    shirtHex,
    kit.trim,
    kit.shirtAsset,
    kit.shirtAsset
      ? (hex) => {
          shirtSolidMat.color.setHex(hexColor(hex));
        }
      : undefined,
  );
  const shirtWrapMat = std(kit.shirtAsset ? 0xffffff : hexColor(shirtHex), {
    roughness: 0.42,
    metalness: 0.08,
    map: shirtMap,
    side: THREE.FrontSide,
  });
  const shortMat = std(hexColor(kit.shorts), { roughness: 0.58, metalness: 0.03 });
  const sockMat = std(hexColor(kit.socks), { roughness: 0.68 });
  const skinMat = std(skinColor(player.appearance.skinTone), { roughness: 0.68, metalness: 0.02 });
  const bootCol = parseBootColor(player.appearance.bootStyle, player.id);
  const bootMat = std(bootCol, { roughness: 0.28, metalness: 0.22 });
  const soleMat = std(0x1a1a1a, { roughness: 0.9, metalness: 0.02 });
  const hairMat = std(hexColor(player.appearance.hairColor), { roughness: 0.82, metalness: 0.02 });
  const trimMat = std(hexColor(trimHex), { roughness: 0.38, metalness: 0.1 });
  const eyeWhite = std(0xf4f4f2, { roughness: 0.45 });
  const eyeDark = std(0x1a1410, { roughness: 0.35 });
  const longSleeve = player.appearance.sleeveStyle === "long";
  const sleeveMat = longSleeve || keeper ? shirtSolidMat : skinMat;

  // —— Torso / kit (open cylinder — clean wrap UVs) ——
  const torso = new THREE.Group();
  torso.position.y = 1.18;
  const body = lit(new THREE.Mesh(geo.torso, shirtWrapMat));
  body.position.y = 0;
  body.scale.set(1.08, 1, 1.02);
  // Trim piping down the sides of the shirt.
  const pipeL = lit(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.42, 0.018), trimMat));
  pipeL.position.set(-0.16, 0, 0.04);
  const pipeR = pipeL.clone();
  pipeR.position.x = 0.16;
  torso.add(body, pipeL, pipeR);
  if (!kit.shirtAsset) {
    const collar = lit(new THREE.Mesh(geo.collar, trimMat));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.24;
    torso.add(collar);
  }
  bodyRoot.add(torso);

  const hips = lit(new THREE.Mesh(geo.hip, shortMat));
  hips.position.y = 0.88;
  hips.scale.set(1.18, 0.68, 0.88);
  const shorts = lit(new THREE.Mesh(geo.shorts, shortMat));
  shorts.position.y = 0.78;
  // Shorts hem trim.
  const hem = lit(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 8, 20), trimMat));
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.64;
  bodyRoot.add(hips, shorts, hem);

  // —— Short neck + head ——
  const neck = lit(new THREE.Mesh(geo.neck, skinMat));
  neck.position.y = 1.45;
  const head = new THREE.Group();
  head.position.y = 1.58;
  const skull = lit(new THREE.Mesh(geo.head, skinMat));
  const earL = lit(new THREE.Mesh(geo.ear, skinMat));
  earL.position.set(-0.12, 0, 0);
  earL.scale.set(0.7, 1.1, 0.85);
  const earR = earL.clone();
  earR.position.x = 0.12;
  const eyeWL = lit(new THREE.Mesh(geo.eye, eyeWhite));
  eyeWL.position.set(-0.042, 0.015, 0.11);
  eyeWL.scale.set(1.15, 0.9, 0.7);
  const eyeWR = eyeWL.clone();
  eyeWR.position.x = 0.042;
  const pupilL = lit(new THREE.Mesh(geo.eye, eyeDark));
  pupilL.position.set(-0.042, 0.015, 0.122);
  pupilL.scale.set(0.55, 0.55, 0.45);
  const pupilR = pupilL.clone();
  pupilR.position.x = 0.042;
  head.add(skull, earL, earR, eyeWL, eyeWR, pupilL, pupilR);
  bodyRoot.add(neck, head);
  addHair(bodyRoot, player.appearance.hairStyle, hairMat);

  // —— Arms: sleeve capsules tuck into the torso (no giant shoulder ball) ——
  const makeArm = (side: number) => {
    const arm = new THREE.Group();
    // Origin sits against the torso so the upper capsule reads as a continuous sleeve.
    arm.position.set(side * 0.175, 1.38, 0.01);
    arm.rotation.z = side * 0.18;
    const upper = lit(new THREE.Mesh(geo.upperArm, shirtSolidMat));
    upper.position.set(side * 0.015, -0.16, 0);
    // Slight taper toward the elbow — thicker near the torso, no separate joint mesh.
    upper.scale.set(1.12, 1.05, 1.12);
    const fore = new THREE.Group();
    fore.position.y = -0.34;
    const lower = lit(new THREE.Mesh(geo.forearm, sleeveMat));
    lower.position.y = -0.12;
    const hand = lit(new THREE.Mesh(geo.hand, keeper ? std(0xf2f2f2, { roughness: 0.5 }) : skinMat));
    hand.position.y = -0.28;
    if (!longSleeve && !keeper) {
      const cuff = lit(new THREE.Mesh(geo.sleeveBand, trimMat));
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.02;
      fore.add(cuff);
    }
    fore.add(lower, hand);
    arm.add(upper, fore);
    return { arm, fore };
  };

  // —— Legs with knee joints ——
  const makeLeg = (side: number) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.095, 0.78, 0);
    const thigh = lit(new THREE.Mesh(geo.thigh, skinMat));
    thigh.position.y = -0.16;
    const knee = lit(new THREE.Mesh(geo.knee, skinMat));
    knee.position.y = -0.34;
    const calfG = new THREE.Group();
    calfG.position.y = -0.34;
    const calf = lit(new THREE.Mesh(geo.calf, sockMat));
    calf.position.y = -0.18;
    const boot = lit(new THREE.Mesh(geo.boot, bootMat));
    boot.position.set(0, -0.42, 0.04);
    const toe = lit(new THREE.Mesh(geo.bootToe, bootMat));
    toe.position.set(0, -0.405, 0.14);
    const sole = lit(new THREE.Mesh(geo.sole, soleMat));
    sole.position.set(0, -0.455, 0.05);
    // Sock cuff trim.
    const sockTop = lit(new THREE.Mesh(geo.sleeveBand, trimMat));
    sockTop.rotation.x = Math.PI / 2;
    sockTop.position.y = -0.02;
    sockTop.scale.set(1.15, 1.15, 1.15);
    calfG.add(calf, boot, toe, sole, sockTop);
    leg.add(thigh, knee, calfG);
    return { leg, calf: calfG };
  };

  const leftA = makeArm(-1);
  const rightA = makeArm(1);
  const leftL = makeLeg(-1);
  const rightL = makeLeg(1);
  bodyRoot.add(leftA.arm, rightA.arm, leftL.leg, rightL.leg);
  group.add(bodyRoot);

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.54, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.03;
  marker.name = "controlMarker";
  group.add(marker);

  const hudMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.58, 0.78, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  hudMarker.rotation.x = -Math.PI / 2;
  hudMarker.position.y = 0.04;
  hudMarker.name = "hudMarker";
  hudMarker.renderOrder = 3;
  group.add(hudMarker);

  const passTargetMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.68, 32),
    new THREE.MeshBasicMaterial({
      color: 0x7dffc2,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  passTargetMarker.rotation.x = -Math.PI / 2;
  passTargetMarker.position.y = 0.045;
  passTargetMarker.name = "passTargetMarker";
  passTargetMarker.renderOrder = 4;
  passTargetMarker.visible = false;
  group.add(passTargetMarker);

  const portraitMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  portraitMat.map = resolvePortraitMap(player, shirtHex);
  portraitMat.needsUpdate = true;
  const portrait = new THREE.Mesh(geo.portrait, portraitMat);
  portrait.position.set(0, 0.1, 0);
  portrait.rotation.x = -Math.PI / 2;
  portrait.name = "portraitDecal";
  portrait.visible = false;
  portrait.frustumCulled = false;
  portrait.renderOrder = 4;
  group.add(portrait);

  const rig: InternalRig = {
    leftArm: leftA.arm,
    rightArm: rightA.arm,
    leftFore: leftA.fore,
    rightFore: rightA.fore,
    leftLeg: leftL.leg,
    rightLeg: rightL.leg,
    leftCalf: leftL.calf,
    rightCalf: rightL.calf,
    torso,
    head,
  };
  group.userData.rig = rig;

  // Prefer skinned humanoid whenever the GLB is ready; procedural mannequin is fallback.
  const modelUrl = resolvePlayerModelUrl(player);
  try {
    const skinned = cloneSkinnedPlayer(modelUrl);
    if (skinned) {
      attachSkinnedBody(group, bodyRoot, skinned, player, kit, shirtMap, bootCol);
    } else {
      bodyRoot.visible = true;
    }
  } catch (err) {
    console.warn("[PlayerVisual] skinned clone failed — using procedural body", err);
    bodyRoot.visible = true;
  }

  return {
    group,
    leftArm: leftA.arm,
    rightArm: rightA.arm,
    leftLeg: leftL.leg,
    rightLeg: rightL.leg,
    torso,
  };
}

function attachSkinnedBody(
  group: THREE.Group,
  bodyRoot: THREE.Group,
  skinned: SkinnedPlayerInstance,
  player: Player,
  kit: TeamKit,
  shirtMap: THREE.Texture,
  bootCol: number,
): void {
  try {
    const skinHex = skinColor(player.appearance.skinTone);
    // Same kit colours / wrap texture as the procedural (referee) path — painted onto
    // the existing skinned mesh only. Never parent kit cylinders/boxes onto the GLB.
    const applyWrap = () =>
      applyKitToSkinned(skinned, kit, skinHex, bootCol, skinned.bodyTintFallback ? shirtMap : null);
    applyWrap();
    if (skinned.bodyTintFallback) {
      const ud = shirtMap.userData as { kitBaseWaiters?: Array<(hex: string) => void>; kitBaseColor?: string };
      if (ud.kitBaseColor) applyWrap();
      else (ud.kitBaseWaiters ??= []).push(() => applyWrap());
    } else if (kit.shirtAsset && skinned.kitMaterials.shirt.length > 0) {
      const hasDedicatedShirt = skinned.kitMaterials.shirt.some((m) =>
        /shirt|jersey|cloth|outfit|gear/i.test(m.name || ""),
      );
      if (hasDedicatedShirt) setSkinnedShirtMap(skinned, shirtMap);
    }
    skinned.root.name = "skinnedBody";
    // Mixamo Vanguard faces −Z; gameplay yaw assumes mannequin forward = +Z.
    skinned.root.rotation.y = Math.PI;
    skinned.root.visible = true;
    bodyRoot.visible = false;
    group.add(skinned.root);
    group.userData.skinned = skinned;
    group.userData.useSkinned = true;
    // Kick an idle pose immediately so the first frame isn't an unbound T-pose flash.
    syncSkinnedAnimation(skinned, player, 0);
  } catch (err) {
    console.warn("[PlayerVisual] skinned attach failed — keeping procedural body", err);
    bodyRoot.visible = true;
    group.userData.useSkinned = false;
    group.userData.skinned = null;
  }
}

function asRig(mesh: THREE.Group): InternalRig | null {
  return (mesh.userData.rig as InternalRig) ?? null;
}

export function updatePlayerAnimation(player: Player, dt: number, _time: number): void {
  const mesh = player.mesh;
  if (!mesh) return;
  mesh.position.set(player.x, player.y, player.z);
  mesh.rotation.y = player.facing;

  const gait = gaitFromSpeed(player.speed, player.sprinting || player.boosting, player.jockeying);
  player.gait = gait;

  const skinned = mesh.userData.skinned as SkinnedPlayerInstance | undefined;
  if (mesh.userData.useSkinned && skinned) {
    // Root yaw already set; Mixer drives limbs. Soft bob from speed for grounded feel.
    const bob =
      gait === "IDLE"
        ? 0
        : Math.abs(Math.sin((player.stridePhase += dt * gaitCadence(gait)) * 2)) *
          (gait === "SPRINT" || player.boosting ? 0.03 : 0.015);
    if (player.jumpTimer <= 0 && !player.sliding) {
      player.y = bob;
      mesh.position.y = bob;
    }
    syncSkinnedAnimation(skinned, player, dt);
    return;
  }

  const rig = asRig(mesh);
  if (!rig) return;
  const cadence = gaitCadence(gait);
  const amp = gaitStride(gait);

  const poseLimbs = (opts: {
    la: number;
    ra: number;
    ll: number;
    rl: number;
    lf?: number;
    rf?: number;
    lc?: number;
    rc?: number;
    lean?: number;
    headPitch?: number;
  }) => {
    rig.leftArm.rotation.x = opts.la;
    rig.rightArm.rotation.x = opts.ra;
    rig.leftLeg.rotation.x = opts.ll;
    rig.rightLeg.rotation.x = opts.rl;
    rig.leftFore.rotation.x = opts.lf ?? Math.max(0.15, Math.abs(opts.la) * 0.35);
    rig.rightFore.rotation.x = opts.rf ?? Math.max(0.15, Math.abs(opts.ra) * 0.35);
    rig.leftCalf.rotation.x = opts.lc ?? Math.max(0, -opts.ll * 0.55);
    rig.rightCalf.rotation.x = opts.rc ?? Math.max(0, -opts.rl * 0.55);
    const lean = opts.lean ?? 0.02;
    rig.torso.rotation.x = lean;
    rig.head.rotation.x = opts.headPitch ?? -lean * 0.35;
  };

  if (player.celebrating) {
    const pose = player.celebrationKind;
    player.stridePhase += dt * (pose === "slide" ? 1.4 : pose === "jump" ? 10 : Math.max(cadence, 8));
    const swing = Math.sin(player.stridePhase) * Math.max(amp, gait === "IDLE" ? 0.42 : amp);
    if (pose === "jump") player.y = Math.abs(Math.sin(player.stridePhase * 8)) * 0.38;
    else if (pose !== "slide" && gait !== "IDLE") {
      player.y = Math.abs(Math.sin(player.stridePhase * 2)) * (gait === "SPRINT" || player.boosting ? 0.08 : 0.04);
    } else if (pose === "slide") {
      player.y = 0.06;
    }
    if (pose === "slide") {
      // Knee-slide: flat, arms wide for the cameras.
      mesh.rotation.z = 1.15;
      mesh.rotation.x = 0.42;
      poseLimbs({
        la: 1.15,
        ra: 1.05,
        ll: 0.75,
        rl: 0.2,
        lean: 0.28,
        lc: 0.45,
        rc: 0.2,
        lf: 0.35,
        rf: 0.25,
        headPitch: 0.18,
      });
    } else if (pose === "jump") {
      mesh.rotation.z = 0;
      mesh.rotation.x = -0.06;
      poseLimbs({
        la: -2.65,
        ra: -2.55,
        ll: -0.85,
        rl: -0.75,
        lf: 0.55,
        rf: 0.5,
        lean: 0.12,
        headPitch: -0.2,
      });
    } else if (pose === "team") {
      // Hug lean-in toward the pack — arms forward-low, short stride.
      mesh.rotation.z = 0;
      mesh.rotation.x = 0.08;
      poseLimbs({
        la: -1.35,
        ra: -1.45,
        ll: -swing * 0.55,
        rl: swing * 0.55,
        lf: 0.45,
        rf: 0.45,
        lean: 0.22,
        headPitch: 0.12,
      });
    } else {
      // Arms aloft (default / "arms").
      mesh.rotation.z = 0;
      mesh.rotation.x = 0;
      poseLimbs({
        la: -2.45,
        ra: -2.35,
        ll: -swing,
        rl: swing,
        lf: 0.4,
        rf: 0.4,
        lean: 0.08,
        headPitch: -0.1,
      });
    }
    mesh.position.y = player.y;
    return;
  }

  if (player.sliding || player.slideRecoverTimer > 0) {
    const slideProg = timerProgress(player.slideTimer, player.slideDuration || SLIDE_FALLBACK);
    const recoverProg =
      player.slideRecoverMax > 0.05
        ? 1 - player.slideRecoverTimer / player.slideRecoverMax
        : player.sliding
          ? 0
          : 1;
    const flat = slideFlat01(player.sliding, slideProg, clamp(recoverProg, 0, 1));
    const phase = slidePhase(player.sliding, slideProg, recoverProg);
    player.y = lerp(0.02, 0.08, flat * 0.5);
    mesh.position.y = player.y;
    // Lead with the sliding foot — roll onto the hip, not a static 90° tip.
    const lead = Math.sign(player.slideDirZ || player.diveDirZ || 1) || 1;
    mesh.rotation.z = lead * lerp(0.25, 1.22, flat);
    mesh.rotation.x = lerp(0.05, 0.55, flat);
    if (phase === "launch") {
      poseLimbs({
        la: 0.85,
        ra: -0.35,
        ll: 0.95,
        rl: -0.45,
        lean: 0.55,
        lc: 0.55,
        rc: 0.2,
        lf: 0.35,
        rf: 0.25,
      });
    } else if (phase === "prone") {
      poseLimbs({
        la: 0.65,
        ra: 0.25,
        ll: 1.05,
        rl: 0.15,
        lean: 0.62,
        lc: 0.55,
        rc: 0.25,
        lf: 0.4,
        rf: 0.2,
      });
    } else {
      // Recover — plant free hand, tuck trail leg, rise.
      const up = clamp(recoverProg, 0, 1);
      poseLimbs({
        la: lerp(0.55, 0.2, up),
        ra: lerp(0.35, 0.15, up),
        ll: lerp(0.85, 0.1, up),
        rl: lerp(0.25, -0.05, up),
        lean: lerp(0.5, 0.08, up),
        lc: lerp(0.45, 0.1, up),
        rc: lerp(0.2, 0.08, up),
      });
      mesh.rotation.x = lerp(0.45, 0.02, up);
    }
    return;
  }

  if (player.throwTimer > 0) {
    // Overhead throw-in: both arms up and forward, plant the feet.
    mesh.rotation.z = 0;
    mesh.rotation.x = 0;
    player.y = 0.04;
    mesh.position.y = player.y;
    poseLimbs({ la: -2.55, ra: -2.55, ll: -0.08, rl: 0.06, lf: 0.2, rf: 0.18, lean: -0.12 });
    rig.leftFore.rotation.x = -0.55;
    rig.rightFore.rotation.x = -0.55;
    return;
  }

  if (player.diveTimer > 0) {
    const side = player.diveDirZ || 1;
    const prog = timerProgress(player.diveTimer, player.diveDuration || DIVE_FALLBACK);
    const phase = divePhase(prog);
    const roll = diveRoll01(prog);
    mesh.rotation.z = side * lerp(0.35, 1.35, roll);
    mesh.rotation.x = phase === "stretch" ? 0.42 : phase === "land" ? 0.22 : 0.18;
    // Stretch lifts slightly off the turf; land settles low.
    player.y = phase === "stretch" ? 0.18 : phase === "launch" ? 0.1 : 0.06;
    mesh.position.y = player.y;
    if (phase === "launch") {
      poseLimbs({
        la: side > 0 ? -1.55 : 0.55,
        ra: side > 0 ? 0.55 : -1.55,
        ll: side > 0 ? 0.35 : -0.25,
        rl: side > 0 ? -0.25 : 0.35,
        lean: 0.28,
        lc: 0.3,
        rc: 0.3,
        headPitch: -0.15,
      });
    } else if (phase === "stretch") {
      // Full reach — near arm toward ball, far arm brace, legs scissor.
      poseLimbs({
        la: side > 0 ? -2.45 : 1.05,
        ra: side > 0 ? 1.05 : -2.45,
        ll: side > 0 ? 0.85 : -0.35,
        rl: side > 0 ? -0.35 : 0.85,
        lean: 0.22,
        lc: 0.45,
        rc: 0.45,
        lf: 0.35,
        rf: 0.35,
        headPitch: side * 0.25,
      });
      if (side > 0) rig.leftFore.rotation.x = -0.85;
      else rig.rightFore.rotation.x = -0.85;
    } else {
      // Land / smother — gather, elbows in.
      poseLimbs({
        la: side > 0 ? -1.35 : 0.45,
        ra: side > 0 ? 0.45 : -1.35,
        ll: 0.35,
        rl: 0.25,
        lean: 0.18,
        lc: 0.35,
        rc: 0.3,
        headPitch: -0.08,
      });
    }
    return;
  }

  if (player.isGK && player.hasBall && player.kickTimer <= 0) {
    // Cradle the ball in both hands at chest height.
    mesh.rotation.z = 0;
    mesh.rotation.x = 0;
    poseLimbs({ la: -1.15, ra: -1.15, ll: -0.06, rl: 0.06, lf: 0.22, rf: 0.22, lean: 0.02 });
    rig.leftFore.rotation.x = -1.35;
    rig.rightFore.rotation.x = -1.35;
    player.y = 0.02;
    mesh.position.y = player.y;
    return;
  }

  if (player.jumpTimer > 0) {
    // Aerial challenge — quick spring, brief peak, snappy land (no float).
    const prog = timerProgress(player.jumpTimer, player.jumpDuration || JUMP_FALLBACK);
    const jump01 = stat01(player.attrs.jumping ?? 55);
    const lift = jumpLiftMetres(prog, jump01);
    const leanAmt = headerLean01(prog);
    // Lean torso toward facing / attack so the header reads as directed contact.
    const sideLean = Math.sin(player.facing) * leanAmt * 0.18;
    mesh.rotation.z = sideLean;
    mesh.rotation.x = prog < 0.5 ? -0.08 - leanAmt * 0.1 : 0.04;
    const armsUp = prog < 0.55 ? -1.75 : -1.15;
    const knees = prog < 0.48 ? -0.95 : lerp(-0.95, -0.25, (prog - 0.48) / 0.52);
    poseLimbs({
      la: armsUp,
      ra: armsUp * 0.95,
      ll: knees,
      rl: knees * 0.92,
      lf: 0.55,
      rf: 0.5,
      lean: (prog < 0.4 ? 0.16 : 0.06) + leanAmt * 0.14,
      headPitch: -0.12 - leanAmt * 0.22,
    });
    player.y = lift;
    mesh.position.y = lift;
    return;
  }

  mesh.rotation.x = 0;

  mesh.rotation.z = 0;
  player.stridePhase += dt * cadence * (player.boosting ? 1.12 : 1);
  const swing = Math.sin(player.stridePhase) * amp;
  // Softer vertical bob — less "bobble" bounce at match camera distance.
  const bob =
    gait === "IDLE"
      ? 0
      : Math.abs(Math.sin(player.stridePhase * 2)) *
        (gait === "SPRINT" || player.boosting ? 0.045 : gait === "RUN" ? 0.028 : 0.016);
  player.y = bob;
  mesh.position.y = bob;
  const lean = player.boosting ? 0.22 : player.sprinting ? 0.16 : player.speed > 5 ? 0.1 : 0.02;
  // Subtle torso twist opposite the lead leg.
  const torsoTwist = gait === "IDLE" ? 0 : -swing * 0.12;
  rig.torso.rotation.y = torsoTwist;

  if (player.firstTouchTimer > 0 && player.kickTimer <= 0) {
    const cush = firstTouchCushion01(player.firstTouchTimer, 0.4);
    poseLimbs({
      la: 0.55 + cush * 0.35,
      ra: 0.5 + cush * 0.3,
      ll: -0.12,
      rl: 0.08,
      lf: 0.35,
      rf: 0.3,
      lean: 0.1 + cush * 0.12,
      headPitch: -0.08,
    });
    player.y = 0.02;
    mesh.position.y = player.y;
    return;
  }

  if (player.jockeying) {
    poseLimbs({
      la: 0.75,
      ra: 0.75,
      ll: -0.25 + swing * 0.35,
      rl: -0.25 - swing * 0.35,
      lf: 0.55,
      rf: 0.55,
      lean: 0.08,
    });
  } else if (gait === "IDLE") {
    const idle = Math.sin(player.stridePhase * 0.35) * 0.04;
    poseLimbs({
      la: 0.12 + idle,
      ra: 0.1 - idle,
      ll: -0.04,
      rl: 0.04,
      lf: 0.2,
      rf: 0.2,
      lean: 0.01,
      headPitch: idle * 0.5,
    });
  } else {
    // Opposite arm/leg with stronger plant bend on the trailing side.
    const legAmp = amp * (gait === "SPRINT" ? 1.05 : 0.92);
    const armAmp = amp * 0.72;
    poseLimbs({
      la: swing * armAmp,
      ra: -swing * armAmp,
      ll: -swing * legAmp,
      rl: swing * legAmp,
      lf: 0.22 + Math.max(0, swing) * 0.42,
      rf: 0.22 + Math.max(0, -swing) * 0.42,
      lc: Math.max(0.08, swing > 0 ? swing * 0.72 : 0.12),
      rc: Math.max(0.08, swing < 0 ? -swing * 0.72 : 0.12),
      lean,
    });
  }

  if (player.kickTimer > 0) {
    if (player.handRelease) {
      // Underarm roll / hand throw from the keeper.
      poseLimbs({
        la: -0.35,
        ra: -1.85,
        ll: -0.05,
        rl: 0.08,
        lf: 0.2,
        rf: 0.2,
        lean: 0.12,
      });
      rig.rightFore.rotation.x = -0.85;
      rig.leftFore.rotation.x = -0.25;
    } else {
      // Phased kick: wind-up → strike → follow-through. Swing the chosen foot.
      const estDur = player.kickTimer > 0.35 ? 0.95 : player.kickTimer > 0.25 ? 0.42 : 0.28;
      const p = timerProgress(player.kickTimer, Math.max(estDur, player.kickTimer + 0.01));
      const phase = kickPhase(p);
      const plant = kickPlant01(p);
      const swingLeg = kickSwing01(p);
      const right = player.kickSwingRight;
      const plantLeg = -plant * 0.42;
      const followArm = phase === "windup" ? 0.55 : phase === "strike" ? 0.35 : 0.2;
      const driveArm = phase === "windup" ? -0.45 : phase === "strike" ? -0.25 : 0.1;
      poseLimbs({
        la: right ? followArm : driveArm,
        ra: right ? driveArm : followArm,
        ll: right ? plantLeg : swingLeg,
        rl: right ? swingLeg : plantLeg,
        lf: right ? 0.25 + plant * 0.28 : phase === "strike" ? 0.55 : 0.3,
        rf: right ? (phase === "strike" ? 0.55 : 0.3) : 0.25 + plant * 0.28,
        lc: right ? plant * 0.45 : phase === "strike" ? 0.65 : Math.max(0.1, Math.abs(swingLeg) * 0.35),
        rc: right ? (phase === "strike" ? 0.65 : Math.max(0.1, Math.abs(swingLeg) * 0.35)) : plant * 0.45,
        lean: 0.1 + plant * 0.22,
        headPitch: phase === "strike" ? -0.14 : -0.04,
      });
    }
  }
}

export function setControlledMarker(player: Player, active: boolean, color: number): void {
  const marker = player.mesh?.getObjectByName("controlMarker") as THREE.Mesh | undefined;
  if (!marker) return;
  const mat = marker.material as THREE.MeshBasicMaterial;
  mat.color.setHex(color);
  mat.opacity = active ? 0.9 : 0;
}

export function setHudMarker(player: Player, active: boolean, color: number): void {
  const marker = player.mesh?.getObjectByName("hudMarker") as THREE.Mesh | undefined;
  if (!marker) return;
  const mat = marker.material as THREE.MeshBasicMaterial;
  mat.color.setHex(color);
  mat.opacity = active ? 0.95 : 0;
  marker.visible = active;
}

export function setPassTargetMarker(player: Player, active: boolean): void {
  const marker = player.mesh?.getObjectByName("passTargetMarker") as THREE.Mesh | undefined;
  if (!marker) return;
  const mat = marker.material as THREE.MeshBasicMaterial;
  mat.opacity = active ? 0.9 : 0;
  marker.visible = active;
}

const _parentPos = new THREE.Vector3();
const _parentQuat = new THREE.Quaternion();
const _parentScale = new THREE.Vector3();
const _desiredQuat = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);

/** Stable 0–199 stack index so overlapping portraits keep a fixed draw order. */
export function portraitStackIndex(player: Player): number {
  let h = 2166136261;
  for (let i = 0; i < player.id.length; i++) {
    h ^= player.id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (Math.abs(h) + player.shirtNumber * 13) % 200;
}

/**
 * Circular portrait at the player.
 * - `under`: flat on the pitch (world +Y normal) — correct for bird's-eye
 * - `avatar`: upright, world-locked so it does not spin with the player
 * `stack` lifts and orders overlapping discs so they do not flicker.
 */
export function setPortraitDecal(
  player: Player,
  show: boolean,
  opacity: number,
  mode: "under" | "avatar" = "under",
  scale = 1,
  stack = 0,
): void {
  const mesh = player.mesh;
  const decal = mesh?.getObjectByName("portraitDecal") as THREE.Mesh | undefined;
  if (!decal || !mesh) return;
  const mat = decal.material as THREE.MeshBasicMaterial;
  const hasMap = !!mat.map;
  const alpha = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0.85;
  const size = Number.isFinite(scale) ? Math.min(5, Math.max(0.4, scale)) : 1;
  const on = show && hasMap && alpha > 0.01;
  decal.visible = on;
  mat.opacity = on ? alpha : 0;
  if (!on) return;

  const layer = Math.max(0, Math.floor(stack));
  decal.renderOrder = 20 + layer;
  mat.depthTest = true;
  mat.depthWrite = false;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -(1 + (layer % 200));

  mesh.updateWorldMatrix(true, false);
  mesh.matrixWorld.decompose(_parentPos, _parentQuat, _parentScale);

  // Undo parent non-uniform scale so the disc stays circular in world space.
  const sx = Math.max(0.001, Math.abs(_parentScale.x));
  const sy = Math.max(0.001, Math.abs(_parentScale.y));
  const sz = Math.max(0.001, Math.abs(_parentScale.z));

  if (mode === "avatar") {
    // Slight depth separation when upright cutouts overlap.
    const zBias = (layer % 200) * 0.002;
    decal.position.set(0, (0.55 * size) / sy, zBias / sz);
    decal.quaternion.copy(_parentQuat).invert();
    decal.scale.set(size / sx, size / sy, size / sz);
    return;
  }

  // Flat on the pitch; stack height stops z-fighting when discs overlap.
  const yWorld = 0.12 + (layer % 200) * 0.0012;
  _desiredQuat.setFromAxisAngle(_xAxis, -Math.PI / 2);
  decal.quaternion.copy(_parentQuat).invert().multiply(_desiredQuat);
  decal.position.set(0, yWorld / sy, 0);
  decal.scale.set(size / sx, size / sy, size / sz);
}

export function setBodyVisible(player: Player, visible: boolean): void {
  const mesh = player.mesh;
  if (!mesh) return;
  const body = mesh.getObjectByName("bodyRoot");
  const skinned = mesh.getObjectByName("skinnedBody");
  if (mesh.userData.useSkinned && skinned) {
    skinned.visible = visible;
    if (body) body.visible = false;
  } else if (body) {
    body.visible = visible;
  }
}
