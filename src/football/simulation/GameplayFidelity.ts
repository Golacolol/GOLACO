/**
 * Absolute gameplay fidelity gates for REAL autoplay (pass delivery, possession, loft, shape).
 * Complements TrainAgainstRealMatch pass-mix comparison.
 */

export interface GameplayFidelitySample {
  matchSeconds: number;
  passes: number;
  completedPasses: number;
  /** Mean of possessionDurations (seconds). */
  meanPossessionSpell: number;
  /** Median approximate pass apex (m). */
  medianPassApex: number;
  /** Median approximate shot apex (m); 0 if no shots. */
  medianShotApex: number;
  /** Mean outfield width (m). */
  meanTeamWidth: number;
  passApexCount: number;
  shotApexCount: number;
  widthCount: number;
}

export interface GameplayFidelityReport {
  sample: GameplayFidelitySample;
  passCompletion: number;
  passesPerMinute: number;
  completionOk: boolean;
  possessionOk: boolean;
  tempoOk: boolean;
  passApexOk: boolean;
  shotApexOk: boolean;
  widthOk: boolean;
  /** All absolute gates that apply to the sample. */
  ok: boolean;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) * 0.5;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarizeGameplayFidelity(input: {
  matchSeconds: number;
  passes: number;
  completedPasses: number;
  possessionDurations: number[];
  passApexSamples: number[];
  shotApexSamples: number[];
  teamWidthSamples: number[];
}): GameplayFidelitySample {
  return {
    matchSeconds: input.matchSeconds,
    passes: input.passes,
    completedPasses: input.completedPasses,
    meanPossessionSpell: mean(input.possessionDurations),
    medianPassApex: median(input.passApexSamples),
    medianShotApex: median(input.shotApexSamples),
    meanTeamWidth: mean(input.teamWidthSamples),
    passApexCount: input.passApexSamples.length,
    shotApexCount: input.shotApexSamples.length,
    widthCount: input.teamWidthSamples.length,
  };
}

/**
 * Absolute floors for REAL gameplay health.
 * Short probe runs use slightly softer completion/possession floors than full 30-min criteria.
 */
export function evaluateGameplayFidelity(
  sample: GameplayFidelitySample,
  opts?: { shortProbe?: boolean },
): GameplayFidelityReport {
  const short = !!opts?.shortProbe;
  const passCompletion = sample.passes > 0 ? sample.completedPasses / sample.passes : 0;
  const passesPerMinute = sample.matchSeconds > 0 ? (sample.passes / sample.matchSeconds) * 60 : 0;
  // Short CI probes (~60–90s) are noisier than 30-min aggregate criteria.
  const completionOk = sample.passes < 8 || passCompletion >= (short ? 0.32 : 0.6);
  const possessionOk = sample.meanPossessionSpell >= (short ? 0.35 : 1.0);
  const tempoOk = sample.matchSeconds < 45 || passesPerMinute <= (short ? 48 : 22);
  const passApexOk = sample.passApexCount < 5 || sample.medianPassApex >= (short ? 0.55 : 0.7);
  const shotApexOk = sample.shotApexCount < 1 || sample.medianShotApex >= (short ? 0.7 : 0.85);
  const widthOk = sample.widthCount < 10 || sample.meanTeamWidth >= (short ? 28 : 40);
  return {
    sample,
    passCompletion,
    passesPerMinute,
    completionOk,
    possessionOk,
    tempoOk,
    passApexOk,
    shotApexOk,
    widthOk,
    ok: completionOk && possessionOk && tempoOk && passApexOk && shotApexOk && widthOk,
  };
}
