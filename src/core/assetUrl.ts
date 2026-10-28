/**
 * Resolve a public asset path against Vite's `BASE_URL`.
 * Accepts absolute (`/assets/x.png`), root-relative, or already-relative paths
 * so the same build works on `file://`, GitHub Pages, and `vite`/`preview`.
 */
export function assetUrl(path: string | null | undefined): string {
  if (!path) return "";
  const raw = path.trim();
  if (!raw) return "";
  // Already absolute http(s) / data / blob — leave alone.
  if (/^(?:[a-z]+:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) {
    return raw;
  }
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const rel = raw.replace(/^\/+/, "");
  // Avoid double-prefix when callers already baked in BASE_URL.
  if (raw.startsWith(normalizedBase)) return raw;
  if (normalizedBase !== "/" && raw.startsWith(base) && !raw.startsWith("//")) return raw;
  return `${normalizedBase}${rel}`;
}

/** Map a list of candidate paths through `assetUrl`. */
export function assetUrls(paths: string[]): string[] {
  return paths.map((p) => assetUrl(p)).filter(Boolean);
}
