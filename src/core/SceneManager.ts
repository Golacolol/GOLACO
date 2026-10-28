import { GameMode } from "./GameMode";

export class SceneManager {
  mode: GameMode = GameMode.FOOTBALL;

  requestMode(mode: GameMode): { ok: boolean; reason?: string } {
    if (mode === GameMode.FOOTBALL) {
      this.mode = mode;
      return { ok: true };
    }
    return { ok: false, reason: `${mode} is an expansion point and is not implemented in v0.3.` };
  }
}
