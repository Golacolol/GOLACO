/** Relative luminance 0–1 for a CSS hex colour. */
export function hexLuminance(hex: string): number {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return 0.5;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Text colour for kit badges / formation markers.
 * Prefer the team's secondary when it contrasts; otherwise black/white.
 */
export function contrastingKitText(background: string, preferredSecondary?: string | null): string {
  const bg = background?.trim() || "#333333";
  const pref = preferredSecondary?.trim();
  const bgLum = hexLuminance(bg);
  if (pref && /^#?[0-9a-fA-F]{3,8}$/.test(pref)) {
    const normalized = pref.startsWith("#") ? pref : `#${pref}`;
    const pLum = hexLuminance(normalized);
    // Prefer kit secondary whenever it is meaningfully different from the shirt colour.
    if (Math.abs(bgLum - pLum) >= 0.22) return normalized;
  }
  return bgLum >= 0.55 ? "#111111" : "#ffffff";
}
