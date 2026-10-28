import { describe, expect, it } from "vitest";
import { REAL_PLYMOUTH_WIMBLEDON_2026_10_10 } from "../simulation/ReplayFixtures";
import {
  compareSimPassMixToReal,
  derivePlayStyleTargets,
  listBundledCorpusIds,
  loadBundledCorpus,
  trainAgainstRealMatch,
} from "./index";

describe("real match training corpus", () => {
  it("bundles the Plymouth–Wimbledon official result as train data", () => {
    expect(listBundledCorpusIds()).toContain(REAL_PLYMOUTH_WIMBLEDON_2026_10_10.id);
    const corpus = loadBundledCorpus(REAL_PLYMOUTH_WIMBLEDON_2026_10_10.id);
    expect(corpus.match.homeTeamId).toBe("plymouth_argyle_current");
    expect(corpus.match.awayTeamId).toBe("afc_wimbledon_current");
    expect(corpus.match.homeScore).toBe(2);
    expect(corpus.match.awayScore).toBe(1);
    expect(corpus.events.length).toBeGreaterThan(20);
  });

  it("derives short-pass-dominant play-style targets from real events", () => {
    const corpus = loadBundledCorpus(REAL_PLYMOUTH_WIMBLEDON_2026_10_10.id);
    const targets = derivePlayStyleTargets(corpus);
    expect(targets.shortPassShare).toBeGreaterThan(targets.longPassShare);
    expect(targets.crossFieldShare).toBeLessThan(0.28);
    expect(targets.shortPassLengthShare).toBeGreaterThan(0.5);
    expect(targets.freeKickNearBoxShotShare).toBeGreaterThan(0.5);
  });

  it("trains against the corpus — FK + pass geometry agree with labels", () => {
    const corpus = loadBundledCorpus(REAL_PLYMOUTH_WIMBLEDON_2026_10_10.id);
    const report = trainAgainstRealMatch(corpus);
    expect(report.freeKick.total).toBeGreaterThanOrEqual(3);
    expect(report.freeKick.agreement).toBeGreaterThanOrEqual(0.67);
    expect(report.passGeometry.crossFieldAgreement).toBeGreaterThanOrEqual(0.75);
    expect(report.passGeometry.shortDominant).toBe(true);
    expect(report.readiness).toBeGreaterThan(0.7);
  });

  it("gates a simulated pass mix against real-match targets", () => {
    const corpus = loadBundledCorpus(REAL_PLYMOUTH_WIMBLEDON_2026_10_10.id);
    const good = compareSimPassMixToReal(corpus, {
      passes: 40,
      shortPasses: 28,
      longPasses: 8,
      crossFieldPasses: 4,
    });
    expect(good.withinTolerance).toBe(true);

    const spamSwitches = compareSimPassMixToReal(corpus, {
      passes: 40,
      shortPasses: 12,
      longPasses: 20,
      crossFieldPasses: 16,
    });
    expect(spamSwitches.withinTolerance).toBe(false);
  });
});
