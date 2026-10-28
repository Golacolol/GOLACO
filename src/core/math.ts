export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function length2(x: number, z: number): number {
  return Math.hypot(x, z);
}

export function normalize2(x: number, z: number): { x: number; z: number } {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 0, z: 0 };
  return { x: x / len, z: z / len };
}

export function dot2(ax: number, az: number, bx: number, bz: number): number {
  return ax * bx + az * bz;
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export function signedAngle(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(fromX * toZ - fromZ * toX, fromX * toX + fromZ * toZ);
}

export function rotate2(x: number, z: number, angle: number): { x: number; z: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c - z * s, z: x * s + z * c };
}

export function stat01(stat: number): number {
  return clamp(stat / 100, 0, 1);
}

export function boundedNoise(scale: number): number {
  const u = Math.random() * 2 - 1;
  const v = Math.random() * 2 - 1;
  return clamp((u + v) * 0.5 * scale, -scale, scale);
}

export function hexColor(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}
