import * as THREE from "three";
import type { AppearanceData } from "../data/schema";

export class AssetManager {
  readonly missing = new Set<string>();

  async tryGltf(_url: string): Promise<THREE.Group | null> {
    try {
      return null;
    } catch {
      this.missing.add(_url);
      return null;
    }
  }

  portraitFallback(appearance?: AppearanceData): string {
    void appearance;
    return "";
  }
}
