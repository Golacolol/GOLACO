export type {
  PlayStyleTargets,
  PitchPoint,
  RealLabeledAction,
  RealMatchCorpus,
  RealMatchEvent,
  RealMatchEventType,
  RealMatchMeta,
  RealEventOutcome,
  RealPassSubtype,
} from "./RealMatchEvent";
export { REAL_MATCH_EVENT_SCHEMA_VERSION } from "./RealMatchEvent";
export {
  fetchRealMatchCorpus,
  listBundledCorpusIds,
  loadBundledCorpus,
  parseRealMatchCorpus,
  validateRealMatchCorpus,
} from "./loadRealMatchCorpus";
export {
  compareSimPassMixToReal,
  compareSimToReal,
  derivePlayStyleTargets,
  evaluateFreeKickAgreement,
  evaluatePassGeometry,
  trainAgainstRealMatch,
  type CompareSimOpts,
  type FreeKickAgreementReport,
  type PassGeometryReport,
  type RealMatchTrainingReport,
  type SimPassMix,
  type SimVsRealReport,
} from "./TrainAgainstRealMatch";
