import type { RealMatchCorpus, RealMatchEvent, RealMatchMeta } from "./RealMatchEvent";
import { REAL_MATCH_EVENT_SCHEMA_VERSION } from "./RealMatchEvent";
import plymouthWimbledonCorpus from "../../../public/data/training/plymouth_wimbledon_2026-10-10.json";

/** Bundled training corpora keyed by match id. */
const BUNDLED: Record<string, RealMatchCorpus> = {
  [plymouthWimbledonCorpus.match.id]: plymouthWimbledonCorpus as RealMatchCorpus,
};

export function listBundledCorpusIds(): string[] {
  return Object.keys(BUNDLED);
}

export function loadBundledCorpus(matchId: string): RealMatchCorpus {
  const corpus = BUNDLED[matchId];
  if (!corpus) {
    throw new Error(`No bundled real-match corpus for id "${matchId}". Known: ${listBundledCorpusIds().join(", ")}`);
  }
  return validateRealMatchCorpus(corpus);
}

/** Parse + validate an unknown JSON payload (file import / future API). */
export function parseRealMatchCorpus(raw: unknown): RealMatchCorpus {
  if (!raw || typeof raw !== "object") throw new Error("Corpus must be an object");
  return validateRealMatchCorpus(raw as RealMatchCorpus);
}

export function validateRealMatchCorpus(corpus: RealMatchCorpus): RealMatchCorpus {
  if (corpus.schemaVersion !== REAL_MATCH_EVENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported corpus schemaVersion ${String((corpus as { schemaVersion?: unknown }).schemaVersion)}`);
  }
  const match = corpus.match;
  if (!match?.id || !match.homeTeamId || !match.awayTeamId || !match.date) {
    throw new Error("Corpus match meta missing id/date/teams");
  }
  if (match.coordSystem !== "engine") {
    throw new Error(`coordSystem must be "engine" (got ${String(match.coordSystem)})`);
  }
  if (!Array.isArray(corpus.events) || corpus.events.length === 0) {
    throw new Error("Corpus must include at least one event");
  }
  for (const event of corpus.events) {
    assertEvent(event, match);
  }
  return corpus;
}

function assertEvent(event: RealMatchEvent, match: RealMatchMeta): void {
  if (!event.id || !event.type || !event.labelAction || !event.start) {
    throw new Error(`Invalid event in ${match.id}: missing id/type/labelAction/start`);
  }
  if (event.teamId !== match.homeTeamId && event.teamId !== match.awayTeamId) {
    throw new Error(`Event ${event.id} teamId ${event.teamId} not in match`);
  }
  const { x, z } = event.start;
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new Error(`Event ${event.id} has non-finite start coords`);
  }
}

/** Fetch a corpus JSON from /data/training/… at runtime (browser / lab). */
export async function fetchRealMatchCorpus(path: string): Promise<RealMatchCorpus> {
  const url = path.startsWith("/") || path.startsWith("http") ? path : `/data/training/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load corpus ${url}: ${res.status}`);
  return parseRealMatchCorpus(await res.json());
}
