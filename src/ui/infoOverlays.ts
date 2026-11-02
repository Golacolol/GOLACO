/**
 * Options → Display → Info overlays (default off).
 * When off, UI help `title` tooltips stay hidden; aria-labels remain for a11y.
 */

let enabled = false;

export function setInfoOverlaysEnabled(on: boolean): void {
  enabled = !!on;
}

export function infoOverlaysEnabled(): boolean {
  return enabled;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** ` title="…"` when overlays are on, otherwise empty. */
export function titleAttr(text: string | null | undefined): string {
  if (!enabled) return "";
  const t = (text ?? "").trim();
  if (!t) return "";
  return ` title="${escapeAttr(t)}"`;
}
