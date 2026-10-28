import type { Match } from "../Match";
import { decisionTelemetry } from "../ai/DecisionTelemetry";

export class DebugOverlay {
  readonly el: HTMLElement;
  enabled = false;
  private last = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("pre");
    this.el.className = "debug-overlay";
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  render(match: Match, fps: number): void {
    if (!this.enabled) {
      this.el.hidden = true;
      return;
    }
    this.el.hidden = false;
    const now = performance.now();
    if (now - this.last < 80) return;
    this.last = now;
    const p = match.controlled;
    const d = match.lastDecision;
    const attrs = p.attrs;
    const passBits = d
      ? `PASS vis=${attrs.vision} pas=${attrs.passing} dist=${d.passTarget ? p.distTo(d.passTarget.x, d.passTarget.z).toFixed(1) : "-"} score=${d.scores.passScore.toFixed(2)}`
      : "PASS -";
    const runBits = `RUN aw=${attrs.attackingAwareness ?? "-"} pace=${attrs.pace} acc=${attrs.acceleration ?? "-"} -> ${p.runTargetX.toFixed(1)},${p.runTargetZ.toFixed(1)}`;
    const shotBits = `SHOT fin=${attrs.finishing} ls=${attrs.longShots} sp=${attrs.shotPower} cmp=${attrs.composure}`;
    this.el.textContent = [
      `FPS ${fps.toFixed(0)}`,
      `STATE ${match.state}`,
      `CTRL ${p.displayName} #${p.shirtNumber} ${p.position} OVR ${p.overall}`,
      `POS ${match.possessing?.displayName ?? "-"}`,
      `PRESS ${match.pressingId ?? "-"}`,
      `ENERGY ${p.energy.percent}%`,
      `GAIT ${p.gait}`,
      `VIEW ${match.camera.viewMode}`,
      `CAM ${match.camera.trackMode}`,
      `BALL ${match.ballState} ${match.debug.ballSpeed.toFixed(1)} stuck=${match.debug.stuckTimer.toFixed(1)}`,
      `OWNER ${match.possessing?.displayName ?? "-"} t=${match.possessionTime.toFixed(1)}`,
      `PRESSURE ${match.pressure.toFixed(2)}`,
      `TACKLER ${match.currentTacklerId ?? "-"} cd=${p.tackleCooldown.toFixed(2)}`,
      `MODE ${match.gameplayMode} ${match.env.timeOfDay}/${match.env.weather}`,
      `ACTION ${d?.action ?? "-"} space=${d?.space.kind ?? "-"}`,
      d
        ? `SCORES P${d.scores.passScore.toFixed(2)} R${d.scores.runScore.toFixed(2)} S${d.scores.shotScore.toFixed(2)} LS${d.scores.longShotScore.toFixed(2)} TH${d.scores.throughBallScore.toFixed(2)} LP${d.scores.longPassScore.toFixed(2)}`
        : "SCORES -",
      passBits,
      runBits,
      shotBits,
      `TEL ${decisionTelemetry.enabled ? `on n=${decisionTelemetry.getEvents().length}` : "off"}`,
      `STATS TK${match.stats.tackles}/${match.stats.successfulTackles} TO${match.stats.turnovers}`,
      `INPUT ${match.debug.inputX.toFixed(2)} ${match.debug.inputZ.toFixed(2)}`,
      `BALL ${match.ball.x.toFixed(1)} ${match.ball.z.toFixed(1)}`,
    ].join("\n");
  }

  dispose(): void {
    this.el.remove();
  }
}
