/**
 * Train / calibrate AI policy against real match event corpora.
 * Does not fit neural weights — derives play-style targets and scores
 * agreement of current FreeKick + pass-geometry policies vs labeled frames.
 */

import type { PlayerAttributes } from "../../data/schema";
import { HALF_LENGTH } from "../constants";
import { Player } from "../players/Player";
import { decideFreeKick, type FreeKickAction } from "../ai/FreeKickDecision";
import { isFlatCrossFieldPass } from "../ai/PassingAI";
import type { PlayStyleTargets, RealMatchCorpus, RealMatchEvent } from "./RealMatchEvent";

const TRAIN_ATTRS: PlayerAttributes = {
  pace: 72,
  passing: 74,
  longPassing: 70,
  vision: 72,
  control: 70,
  dribbling: 68,
  shooting: 72,
  finishing: 74,
  shotPower: 70,
  longShots: 68,
  defending: 55,
  strength: 70,
  stamina: 80,
  composure: 72,
  setPieces: 76,
};

function makeTaker(event: RealMatchEvent): Player {
  const side = event.actingTeamIsHome ? "home" : "away";
  const p = new Player({
    id: event.playerId ?? event.playerSlot ?? "taker",
    name: "train",
    displayName: "train",
    shirtNumber: 10,
    position: "CM",
    slot: event.playerSlot ?? "CM",
    side,
    attrs: TRAIN_ATTRS,
    overall: 74,
  });
  p.x = event.start.x;
  p.z = event.start.z;
  return p;
}

export function derivePlayStyleTargets(corpus: RealMatchCorpus): PlayStyleTargets {
  const events = corpus.events;
  const passes = events.filter((e) => e.type === "pass" || e.type === "cross" || e.type === "through");
  const shots = events.filter((e) => e.type === "shot" || e.labelAction === "SHOT" || e.labelAction === "LONG_SHOT");
  const shortLabeled = passes.filter((e) => e.subtype === "short" || e.labelAction === "PASS");
  const longLabeled = passes.filter(
    (e) => e.subtype === "long" || e.subtype === "switch" || e.labelAction === "LONG_PASS",
  );
  const crossField = passes.filter((e) => e.crossField === true);
  const progressive = passes.filter((e) => e.progressive === true);
  const hold = events.filter((e) => e.labelAction === "HOLD");
  const withLen = passes.filter((e) => typeof e.lengthM === "number" && (e.lengthM as number) > 0);
  const avgPassLengthM =
    withLen.length === 0 ? 0 : withLen.reduce((s, e) => s + (e.lengthM as number), 0) / withLen.length;
  const shortLen = withLen.filter((e) => (e.lengthM as number) < 18);

  const fks = events.filter((e) => e.type === "free_kick");
  const fkShots = fks.filter((e) => e.labelAction === "SHOT");
  const nearBoxFk = fks.filter((e) => {
    const goalX = e.actingTeamIsHome ? HALF_LENGTH : -HALF_LENGTH;
    const dist = Math.hypot(goalX - e.start.x, e.start.z);
    return dist < 24 && Math.abs(e.start.z) < 18;
  });
  const nearBoxFkShots = nearBoxFk.filter((e) => e.labelAction === "SHOT");

  const n = Math.max(1, events.length);
  const pn = Math.max(1, passes.length);
  const fkn = Math.max(1, fks.length);
  const nbn = Math.max(1, nearBoxFk.length);

  return {
    matchId: corpus.match.id,
    eventCount: events.length,
    labeledDecisionCount: events.length,
    shortPassShare: shortLabeled.length / pn,
    longPassShare: longLabeled.length / pn,
    crossFieldShare: crossField.length / pn,
    progressivePassShare: progressive.length / pn,
    shotShare: shots.length / n,
    holdOrRecycleShare: hold.length / n,
    avgPassLengthM,
    freeKickShotShare: fkShots.length / fkn,
    freeKickNearBoxShotShare: nearBoxFkShots.length / nbn,
    shortPassLengthShare: withLen.length ? shortLen.length / withLen.length : 0,
  };
}

export interface FreeKickAgreementReport {
  total: number;
  matched: number;
  agreement: number;
  details: Array<{ id: string; label: FreeKickAction; predicted: FreeKickAction; ok: boolean }>;
}

/** Score FreeKickDecision against labeled free_kick frames. */
export function evaluateFreeKickAgreement(corpus: RealMatchCorpus): FreeKickAgreementReport {
  const details: FreeKickAgreementReport["details"] = [];
  for (const event of corpus.events) {
    if (event.type !== "free_kick") continue;
    const label = event.labelAction as FreeKickAction;
    if (label !== "SHOT" && label !== "CROSS" && label !== "PASS") continue;
    const taker = makeTaker(event);
    // Wide deliveries need a box target in context — mirror real set-piece shape.
    const teammates = [taker];
    if (label === "CROSS") {
      const box = makeTaker({
        ...event,
        id: `${event.id}_box`,
        playerId: `${event.id}_box`,
        playerSlot: "ST",
        start: {
          x: event.actingTeamIsHome ? HALF_LENGTH - 10 : -HALF_LENGTH + 10,
          z: 2,
        },
      });
      teammates.push(box);
    }
    const decision = decideFreeKick({
      taker,
      ballX: event.start.x,
      ballZ: event.start.z,
      teammates,
      opponents: [],
    });
    details.push({
      id: event.id,
      label,
      predicted: decision.action,
      ok: decision.action === label,
    });
  }
  const matched = details.filter((d) => d.ok).length;
  return {
    total: details.length,
    matched,
    agreement: details.length ? matched / details.length : 1,
    details,
  };
}

export interface PassGeometryReport {
  total: number;
  crossFieldMatched: number;
  crossFieldAgreement: number;
  shortDominant: boolean;
  targets: PlayStyleTargets;
}

/** Check pass geometry labels vs engine helpers + short-pass dominance from real data. */
export function evaluatePassGeometry(corpus: RealMatchCorpus): PassGeometryReport {
  const targets = derivePlayStyleTargets(corpus);
  let total = 0;
  let matched = 0;
  for (const event of corpus.events) {
    if (event.type !== "pass" && event.type !== "cross" && event.type !== "through") continue;
    if (event.end == null || event.crossField == null) continue;
    const passer = makeTaker(event);
    const predicted = isFlatCrossFieldPass(passer, event.end.x, event.end.z);
    total += 1;
    if (predicted === event.crossField) matched += 1;
  }
  return {
    total,
    crossFieldMatched: matched,
    crossFieldAgreement: total ? matched / total : 1,
    shortDominant: targets.shortPassShare > targets.longPassShare && targets.crossFieldShare < 0.28,
    targets,
  };
}

export interface SimPassMix {
  passes: number;
  shortPasses: number;
  longPasses: number;
  crossFieldPasses: number;
}

export interface SimVsRealReport {
  matchId: string;
  targets: PlayStyleTargets;
  simShortShare: number;
  simLongShare: number;
  simCrossFieldShare: number;
  shortDelta: number;
  crossFieldDelta: number;
  /** True when sim short share is within tolerance of real short share and cross-field is not spamming. */
  withinTolerance: boolean;
}

/** Compare a simulated pass mix to real-match derived targets. */
export function compareSimPassMixToReal(
  corpus: RealMatchCorpus,
  sim: SimPassMix,
  opts: { shortTolerance?: number; crossFieldMax?: number } = {},
): SimVsRealReport {
  const targets = derivePlayStyleTargets(corpus);
  const shortTol = opts.shortTolerance ?? 0.22;
  const crossMax = opts.crossFieldMax ?? Math.max(0.28, targets.crossFieldShare + 0.12);
  const passes = Math.max(1, sim.passes);
  const simShortShare = sim.shortPasses / passes;
  const simLongShare = sim.longPasses / passes;
  const simCrossFieldShare = sim.crossFieldPasses / passes;
  const shortDelta = simShortShare - targets.shortPassShare;
  const crossFieldDelta = simCrossFieldShare - targets.crossFieldShare;
  const withinTolerance =
    Math.abs(shortDelta) <= shortTol &&
    simShortShare > simLongShare &&
    simCrossFieldShare <= crossMax;

  return {
    matchId: corpus.match.id,
    targets,
    simShortShare,
    simLongShare,
    simCrossFieldShare,
    shortDelta,
    crossFieldDelta,
    withinTolerance,
  };
}

export interface RealMatchTrainingReport {
  matchId: string;
  targets: PlayStyleTargets;
  freeKick: FreeKickAgreementReport;
  passGeometry: PassGeometryReport;
  /** Overall readiness score 0..1 for using this corpus as a training gate. */
  readiness: number;
  hints: string[];
}

/** Full offline training report for one real match corpus. */
export function trainAgainstRealMatch(corpus: RealMatchCorpus): RealMatchTrainingReport {
  const targets = derivePlayStyleTargets(corpus);
  const freeKick = evaluateFreeKickAgreement(corpus);
  const passGeometry = evaluatePassGeometry(corpus);
  const hints: string[] = [];

  if (freeKick.agreement < 0.67) {
    hints.push("Free-kick policy disagrees with real near-box / wide labels — retune FREE_KICK_POLICY.");
  }
  if (passGeometry.crossFieldAgreement < 0.75) {
    hints.push("Cross-field detector disagrees with labeled switches — check isFlatCrossFieldPass thresholds.");
  }
  if (!passGeometry.shortDominant) {
    hints.push("Real match is not short-pass dominant in this corpus — review annotations or opponent style.");
  }
  if (targets.crossFieldShare > 0.22) {
    hints.push("Corpus switch rate is high — allow progressive switches but keep them rare in sims.");
  }

  const readiness =
    0.35 * freeKick.agreement +
    0.35 * passGeometry.crossFieldAgreement +
    0.3 * (passGeometry.shortDominant ? 1 : 0.4);

  return {
    matchId: corpus.match.id,
    targets,
    freeKick,
    passGeometry,
    readiness,
    hints,
  };
}
