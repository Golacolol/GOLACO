import { assetUrl } from "../core/assetUrl";

export type PlayerImageList = string[];

async function readManifest(): Promise<PlayerImageList> {
  try {
    const res = await fetch(assetUrl("/data/playerImages.json"), { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { images?: string[] };
    const images = Array.isArray(data.images) ? data.images : [];
    return images.map((p) => assetUrl(p));
  } catch {
    return [];
  }
}

/** Paths like `/images/l1.png` from the project `images/` folder. */
export async function listPlayerImages(): Promise<PlayerImageList> {
  try {
    const res = await fetch("/api/player-images", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { images?: string[] };
      if (Array.isArray(data.images)) return data.images.map((p) => assetUrl(p));
    }
  } catch {
    /* fall through to static manifest */
  }
  return readManifest();
}

export async function uploadPlayerImage(file: File): Promise<string> {
  const data = await Promise.resolve(
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
      reader.readAsDataURL(file);
    }),
  );

  const res = await fetch("/api/player-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, data }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? `Upload failed (${res.status})`);
  }
  const body = (await res.json()) as { path?: string };
  if (!body.path) throw new Error("Upload did not return a path");
  return assetUrl(body.path);
}

export function imageLabel(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name;
}
