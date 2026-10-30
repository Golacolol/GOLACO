/** Official 2026/27 league results and remaining listed fixtures (baked baseline + live overlay). */

import overlayJson from "../../public/data/officialResultsOverlay.json";

/**
 * Floor date for accepting brand-new overlay pairings not present in the baked baseline.
 * Overlay played rows always win on merge for score/date even when earlier than this.
 * Championship 2026/27 opened on 14 Aug — keep the floor at season start, not mid-August.
 */
export const OFFICIAL_RESULTS_AS_OF = "2026-08-01";

export type OfficialCompetition =
  | "Premier League"
  | "Championship"
  | "League One"
  | "La Liga"
  | "Serie A";

export interface OfficialMatch {
  competition: OfficialCompetition;
  date: string;
  time?: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  played: boolean;
}

export const POINTS_DEDUCTIONS: Record<string, number> = {
  southampton_current: 4,
};

const PL = "Premier League" as const;
const CH = "Championship" as const;
const L1 = "League One" as const;

const T = {
  ars: "arsenal_current",
  avl: "aston_villa_current",
  bou: "bournemouth_current",
  bre: "brentford_current",
  bha: "brighton_current",
  che: "chelsea_current",
  cov: "coventry_city_current",
  cry: "crystal_palace_current",
  eve: "everton_current",
  ful: "fulham_current",
  hul: "hull_city_current",
  ips: "ipswich_town_current",
  lee: "leeds_united_current",
  liv: "liverpool_current",
  mci: "manchester_city_current",
  mun: "manchester_united_current",
  new: "newcastle_united_current",
  nfo: "nottingham_forest_current",
  sun: "sunderland_current",
  tot: "tottenham_hotspur_current",
  bir: "birmingham_city_current",
  blb: "blackburn_rovers_current",
  bol: "bolton_wanderers_current",
  bri: "bristol_city_current",
  burc: "burnley_current",
  car: "cardiff_city_current",
  cha: "charlton_athletic_current",
  der: "derby_county_current",
  lin: "lincoln_city_current",
  mid: "middlesbrough_current",
  mil: "millwall_current",
  nor: "norwich_city_current",
  por: "portsmouth_current",
  pne: "preston_north_end_current",
  qpr: "queens_park_rangers_current",
  shu: "sheffield_united_current",
  sou: "southampton_current",
  stok: "stoke_city_current",
  swa: "swansea_city_current",
  wat: "watford_current",
  wba: "west_bromwich_albion_current",
  whu: "west_ham_united_current",
  wol: "wolverhampton_wanderers_current",
  wrx: "wrexham_current",
  wim: "afc_wimbledon_current",
  bar: "barnsley_current",
  blp: "blackpool_current",
  bra: "bradford_city_current",
  brm: "bromley_current",
  burt: "burton_albion_current",
  cam: "cambridge_united_current",
  don: "doncaster_rovers_current",
  hud: "huddersfield_town_current",
  lei: "leicester_city_current",
  ley: "leyton_orient_current",
  lut: "luton_town_current",
  man: "mansfield_town_current",
  mkd: "mk_dons_current",
  nco: "notts_county_current",
  oxf: "oxford_united_current",
  pet: "peterborough_united_current",
  ply: "plymouth_argyle_current",
  rea: "reading_current",
  shw: "sheffield_wednesday_current",
  ste: "stevenage_current",
  sto: "stockport_county_current",
  wig: "wigan_athletic_current",
  wyc: "wycombe_wanderers_current",
};

function played(
  competition: OfficialCompetition,
  date: string,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  time?: string,
): OfficialMatch {
  return { competition, date, homeTeamId: home, awayTeamId: away, homeScore, awayScore, played: true, time };
}

function upcoming(
  competition: OfficialCompetition,
  date: string,
  home: string,
  away: string,
  time?: string,
): OfficialMatch {
  return { competition, date, homeTeamId: home, awayTeamId: away, played: false, time };
}

const LOCKED_DATES = new Set([
  "2026-08-20",
  "2026-08-23",
  "2026-08-28",
  "2026-08-30",
  "2026-09-01",
  "2026-09-02",
  "2026-09-05",
  "2026-09-06",
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
  "2026-09-14",
]);

export function officialSeasonMatches(): OfficialMatch[] {
  const overlay = overlayMatches();
  const overlayKeys = new Set(
    overlay.map((match) => pairingKey(match.homeTeamId, match.awayTeamId, match.competition)),
  );
  const overlayTeamDates = new Set<string>();
  const overlayPlayedUndirected = new Set<string>();
  for (const match of overlay) {
    // Unplayed overlay rows also occupy the calendar so baked/generator rows cannot invent rivals.
    overlayTeamDates.add(`${match.date}|${match.homeTeamId}`);
    overlayTeamDates.add(`${match.date}|${match.awayTeamId}`);
    if (!match.played) continue;
    overlayPlayedUndirected.add(undirectedPairingKey(match.homeTeamId, match.awayTeamId, match.competition));
  }
  // Live overlay owns completed pairings. Drop baked rows for the same pairing, drop
  // baked played reverse-legs (home/away swap of an overlay result), and drop baked
  // "mirror" legs that would double-book a club already playing that day.
  const bakedGaps = [...premierLeaguePlayed(), ...championshipPlayed(), ...leagueOnePlayed()].filter((match) => {
    const key = pairingKey(match.homeTeamId, match.awayTeamId, match.competition);
    if (overlayKeys.has(key)) return false;
    if (
      match.played &&
      overlayPlayedUndirected.has(undirectedPairingKey(match.homeTeamId, match.awayTeamId, match.competition))
    ) {
      return false;
    }
    if (overlayTeamDates.has(`${match.date}|${match.homeTeamId}`)) return false;
    if (overlayTeamDates.has(`${match.date}|${match.awayTeamId}`)) return false;
    return true;
  });
  const played = packPlayedDates(bakedGaps, new Set(["plymouth_argyle_current"]));
  const upcoming = upcomingListed().filter((match) => {
    const key = pairingKey(match.homeTeamId, match.awayTeamId, match.competition);
    if (overlayKeys.has(key)) return false;
    // Overlay already recorded this encounter (possibly home/away swapped).
    if (overlayPlayedUndirected.has(undirectedPairingKey(match.homeTeamId, match.awayTeamId, match.competition))) {
      return false;
    }
    return true;
  });
  return dedupeTeamDates(mergeOfficialMatches([...played, ...upcoming], overlay), overlayKeys);
}

/** Prefer overlay (or earliest listing) when a club is somehow booked twice on one day. */
export function dedupeTeamDates(matches: OfficialMatch[], overlayKeys: Set<string>): OfficialMatch[] {
  const byKey = new Map<string, OfficialMatch>();
  for (const match of matches) {
    byKey.set(pairingKey(match.homeTeamId, match.awayTeamId, match.competition), match);
  }
  const kept = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date));
  const busy = new Set<string>();
  const out: OfficialMatch[] = [];
  // Pass 1: lock overlay-backed rows.
  for (const match of kept) {
    const key = pairingKey(match.homeTeamId, match.awayTeamId, match.competition);
    if (!overlayKeys.has(key)) continue;
    const home = `${match.date}|${match.homeTeamId}`;
    const away = `${match.date}|${match.awayTeamId}`;
    if (busy.has(home) || busy.has(away)) continue;
    busy.add(home);
    busy.add(away);
    out.push(match);
  }
  // Pass 2: keep remaining rows that do not collide.
  for (const match of kept) {
    const key = pairingKey(match.homeTeamId, match.awayTeamId, match.competition);
    if (overlayKeys.has(key)) continue;
    const home = `${match.date}|${match.homeTeamId}`;
    const away = `${match.date}|${match.awayTeamId}`;
    if (busy.has(home) || busy.has(away)) continue;
    busy.add(home);
    busy.add(away);
    out.push(match);
  }
  return out;
}

/**
 * Overlay / later refresh results are authoritative for completed fixtures.
 * - Fill unplayed baked rows
 * - Correct already-played baked scores/dates when TheFishy disagrees
 * - Add brand-new completed pairings from the live season
 */
export function mergeOfficialMatches(base: OfficialMatch[], overlay: OfficialMatch[]): OfficialMatch[] {
  const byPair = new Map<string, OfficialMatch>();
  for (const match of base) {
    byPair.set(pairingKey(match.homeTeamId, match.awayTeamId, match.competition), match);
  }
  for (const match of overlay) {
    const key = pairingKey(match.homeTeamId, match.awayTeamId, match.competition);
    const reverseKey = pairingKey(match.awayTeamId, match.homeTeamId, match.competition);
    const prev = byPair.get(key);
    if (prev) {
      if (match.played) {
        // Prefer live overlay score + calendar date over packed/baked rows.
        byPair.set(key, {
          ...prev,
          ...match,
          played: true,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          date: match.date,
          time: match.time ?? prev.time,
        });
        dropDuplicateReverse(byPair, reverseKey, match);
      } else if (!prev.played) {
        // Live upcoming listing wins date/time when both sides are still unplayed.
        byPair.set(key, { ...prev, ...match, played: false });
      }
      continue;
    }
    if (match.date >= OFFICIAL_RESULTS_AS_OF) {
      byPair.set(key, match);
      dropDuplicateReverse(byPair, reverseKey, match);
    }
  }
  return [...byPair.values()];
}

/** Drop a reverse-orientation duplicate of the same match — never a later return leg. */
function dropDuplicateReverse(
  byPair: Map<string, OfficialMatch>,
  reverseKey: string,
  match: OfficialMatch,
): void {
  const reverse = byPair.get(reverseKey);
  if (!reverse) return;
  if (reverse.date === match.date) {
    byPair.delete(reverseKey);
    return;
  }
  // Overlay correcting a baked swap a day or two apart (same encounter, not the return fixture).
  if (match.played && reverse.played && Math.abs(dateDiffDays(reverse.date, match.date)) <= 2) {
    byPair.delete(reverseKey);
  }
}

function dateDiffDays(a: string, b: string): number {
  const ms = Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function overlayMatches(): OfficialMatch[] {
  const matches = (overlayJson as { matches?: OfficialMatch[] }).matches;
  return Array.isArray(matches) ? matches : [];
}

function packPlayedDates(matches: OfficialMatch[], alwaysLock: Set<string>): OfficialMatch[] {
  const used = new Map<string, Set<string>>();
  const placed: OfficialMatch[] = [];
  const flexible: OfficialMatch[] = [];
  for (const match of matches) {
    const lock =
      LOCKED_DATES.has(match.date) ||
      alwaysLock.has(match.homeTeamId) ||
      alwaysLock.has(match.awayTeamId);
    if (lock && canPlace(used, match.date, match.homeTeamId, match.awayTeamId)) {
      place(used, match.date, match.homeTeamId, match.awayTeamId);
      placed.push(match);
    } else {
      flexible.push(match);
    }
  }
  const spill = [
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-22",
    "2026-08-23",
    "2026-08-24",
    "2026-08-29",
    "2026-08-30",
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
  ];
  for (const match of flexible) {
    const dates = [match.date, ...spill.filter((d) => d !== match.date)];
    const date = dates.find((d) => canPlace(used, d, match.homeTeamId, match.awayTeamId)) ?? match.date;
    place(used, date, match.homeTeamId, match.awayTeamId);
    placed.push(date === match.date ? match : { ...match, date });
  }
  return placed;
}

function canPlace(used: Map<string, Set<string>>, date: string, home: string, away: string): boolean {
  const teams = used.get(date);
  return !teams || (!teams.has(home) && !teams.has(away));
}

function place(used: Map<string, Set<string>>, date: string, home: string, away: string): void {
  const teams = used.get(date) ?? new Set<string>();
  teams.add(home);
  teams.add(away);
  used.set(date, teams);
}

function premierLeaguePlayed(): OfficialMatch[] {
  return [
    played(PL, "2026-08-22", T.ars, T.cov, 3, 0),
    played(PL, "2026-08-23", T.bha, T.avl, 4, 0),
    played(PL, "2026-08-22", T.bre, T.tot, 3, 0),
    played(PL, "2026-08-22", T.cov, T.hul, 0, 1),
    played(PL, "2026-08-22", T.eve, T.cry, 2, 0),
    played(PL, "2026-08-22", T.ful, T.che, 2, 3),
    played(PL, "2026-08-22", T.hul, T.mun, 2, 0),
    played(PL, "2026-08-22", T.ips, T.sun, 2, 1),
    played(PL, "2026-08-22", T.lee, T.bre, 1, 1),
    played(PL, "2026-08-22", T.liv, T.nfo, 2, 2),
    played(PL, "2026-08-22", T.mci, T.bou, 2, 1),
    played(PL, "2026-08-22", T.new, T.liv, 2, 2),
    played(PL, "2026-08-22", T.nfo, T.lee, 0, 1),
    played(PL, "2026-08-22", T.sun, T.ful, 1, 0),
    played(PL, "2026-08-22", T.tot, T.new, 0, 2),
    played(PL, "2026-08-28", T.cry, T.mci, 1, 4),
    played(PL, "2026-08-29", T.avl, T.ars, 0, 1),
    played(PL, "2026-08-29", T.bou, T.eve, 1, 1),
    played(PL, "2026-08-30", T.che, T.bha, 4, 3),
    played(PL, "2026-08-30", T.mun, T.ips, 5, 2),
    played(PL, "2026-09-05", T.mci, T.cov, 1, 0),
    played(PL, "2026-09-05", T.hul, T.avl, 0, 0),
    played(PL, "2026-09-05", T.nfo, T.tot, 0, 0),
    played(PL, "2026-09-05", T.cry, T.ful, 3, 2),
    played(PL, "2026-09-05", T.bou, T.new, 2, 2),
    played(PL, "2026-09-05", T.bha, T.lee, 1, 1),
    played(PL, "2026-09-05", T.sun, T.bre, 1, 1),
    played(PL, "2026-09-05", T.eve, T.mun, 2, 2),
    played(PL, "2026-09-05", T.liv, T.ips, 2, 0),
    played(PL, "2026-09-06", T.ars, T.che, 2, 1),
    // Matchweek 4 — 12–14 September
    played(PL, "2026-09-12", T.avl, T.nfo, 1, 2),
    played(PL, "2026-09-12", T.bou, T.bre, 2, 2),
    played(PL, "2026-09-12", T.che, T.hul, 2, 2),
    played(PL, "2026-09-12", T.cry, T.ips, 2, 3),
    played(PL, "2026-09-12", T.liv, T.ful, 0, 0),
    played(PL, "2026-09-12", T.tot, T.eve, 0, 0, "17:30"),
    played(PL, "2026-09-12", T.sun, T.ars, 0, 2, "20:00"),
    played(PL, "2026-09-13", T.cov, T.bha, 0, 5),
    played(PL, "2026-09-13", T.mun, T.mci, 0, 1),
    played(PL, "2026-09-14", T.lee, T.new, 4, 1),
  ];
}

function championshipPlayed(): OfficialMatch[] {
  return [
    played(CH, "2026-08-16", T.bir, T.bri, 2, 2),
    played(CH, "2026-08-16", T.wat, T.sou, 2, 1),
    played(CH, "2026-08-16", T.blb, T.mid, 2, 1),
    played(CH, "2026-08-16", T.bol, T.lin, 0, 1),
    played(CH, "2026-08-16", T.bri, T.mil, 0, 2),
    played(CH, "2026-08-16", T.car, T.shu, 2, 2),
    played(CH, "2026-08-16", T.cha, T.der, 2, 1),
    played(CH, "2026-08-16", T.mid, T.lin, 2, 1),
    played(CH, "2026-08-16", T.nor, T.burc, 4, 1),
    played(CH, "2026-08-16", T.pne, T.bri, 1, 3),
    played(CH, "2026-08-16", T.qpr, T.bol, 0, 0),
    played(CH, "2026-08-16", T.shu, T.bir, 0, 0),
    played(CH, "2026-08-16", T.swa, T.shu, 0, 0),
    played(CH, "2026-08-16", T.wba, T.burc, 3, 1),
    played(CH, "2026-08-16", T.wrx, T.bir, 1, 2),
    played(CH, "2026-08-22", T.sou, T.stok, 3, 1),
    played(CH, "2026-08-22", T.whu, T.cha, 1, 2),
    played(CH, "2026-08-22", T.bir, T.sou, 1, 1),
    played(CH, "2026-08-22", T.blb, T.qpr, 1, 2),
    played(CH, "2026-08-22", T.bol, T.pne, 2, 1),
    played(CH, "2026-08-22", T.bri, T.por, 2, 1),
    played(CH, "2026-08-22", T.burc, T.mid, 1, 1),
    played(CH, "2026-08-22", T.car, T.wrx, 1, 1),
    played(CH, "2026-08-22", T.cha, T.pne, 1, 0),
    played(CH, "2026-08-22", T.der, T.car, 2, 2),
    played(CH, "2026-08-22", T.lin, T.por, 1, 3),
    played(CH, "2026-08-22", T.mid, T.wba, 3, 1),
    played(CH, "2026-08-22", T.mil, T.nor, 3, 0),
    played(CH, "2026-08-22", T.por, T.qpr, 1, 3),
    played(CH, "2026-08-22", T.qpr, T.car, 2, 1),
    played(CH, "2026-08-22", T.shu, T.bol, 3, 2),
    played(CH, "2026-08-22", T.stok, T.nor, 1, 0),
    played(CH, "2026-08-22", T.swa, T.wat, 2, 0),
    played(CH, "2026-08-22", T.wat, T.whu, 1, 1),
    played(CH, "2026-08-22", T.wba, T.cha, 1, 1),
    played(CH, "2026-08-22", T.wol, T.blb, 2, 2),
    played(CH, "2026-08-29", T.sou, T.mil, 5, 1),
    played(CH, "2026-08-29", T.der, T.swa, 0, 3),
    played(CH, "2026-08-29", T.burc, T.whu, 2, 2),
    played(CH, "2026-08-29", T.lin, T.blb, 0, 0),
    played(CH, "2026-08-29", T.nor, T.wba, 1, 2),
    played(CH, "2026-08-29", T.por, T.der, 0, 2),
    played(CH, "2026-08-29", T.pne, T.wol, 1, 3),
    played(CH, "2026-08-29", T.stok, T.swa, 1, 2),
    played(CH, "2026-08-29", T.whu, T.wol, 4, 2),
    played(CH, "2026-08-29", T.wol, T.stok, 4, 1),
    played(CH, "2026-08-29", T.wrx, T.wat, 1, 1),
    played(CH, "2026-09-02", T.mil, T.wrx, 0, 3),
    played(CH, "2026-09-05", T.swa, T.wrx, 0, 0),
    played(CH, "2026-09-05", T.qpr, T.mid, 0, 1),
    played(CH, "2026-09-05", T.lin, T.sou, 1, 1),
    played(CH, "2026-09-05", T.stok, T.cha, 4, 0),
    played(CH, "2026-09-05", T.burc, T.bri, 1, 2),
    played(CH, "2026-09-05", T.whu, T.der, 3, 0),
    played(CH, "2026-09-05", T.mil, T.bol, 4, 0),
    played(CH, "2026-09-05", T.pne, T.blb, 2, 1),
    played(CH, "2026-09-05", T.shu, T.nor, 1, 3),
    played(CH, "2026-09-05", T.wba, T.wat, 1, 0),
    played(CH, "2026-09-05", T.por, T.car, 2, 0),
    // Midweek — 8–11 September
    played(CH, "2026-09-08", T.sou, T.swa, 3, 1, "19:45"),
    played(CH, "2026-09-09", T.cha, T.qpr, 0, 0, "20:00"),
    played(CH, "2026-09-09", T.der, T.wba, 0, 1, "19:45"),
    played(CH, "2026-09-09", T.nor, T.bir, 2, 1, "19:45"),
    played(CH, "2026-09-11", T.whu, T.wrx, 6, 0, "20:00"),
    // Weekend — 12–13 September
    played(CH, "2026-09-12", T.bol, T.car, 1, 0, "12:30"),
    played(CH, "2026-09-12", T.der, T.bir, 1, 2, "12:30"),
    played(CH, "2026-09-12", T.wba, T.qpr, 1, 1, "12:30"),
    played(CH, "2026-09-12", T.blb, T.mil, 3, 1),
    played(CH, "2026-09-12", T.cha, T.por, 0, 0),
    played(CH, "2026-09-12", T.mid, T.nor, 4, 3),
    played(CH, "2026-09-12", T.pne, T.lin, 0, 1),
    played(CH, "2026-09-12", T.sou, T.bri, 4, 1),
    played(CH, "2026-09-12", T.swa, T.burc, 3, 1),
    played(CH, "2026-09-12", T.wat, T.stok, 1, 2),
    played(CH, "2026-09-13", T.shu, T.wol, 0, 1, "12:00"),
  ];
}

function leagueOnePlayed(): OfficialMatch[] {
  return [
    played(L1, "2026-08-15", T.ply, T.sto, 1, 3),
    played(L1, "2026-08-15", T.burt, T.ste, 1, 1),
    played(L1, "2026-08-15", T.rea, T.lut, 3, 4),
    played(L1, "2026-08-15", T.wim, T.rea, 0, 0),
    played(L1, "2026-08-15", T.wim, T.wig, 1, 0),
    played(L1, "2026-08-15", T.blp, T.pet, 4, 0),
    played(L1, "2026-08-15", T.bra, T.cam, 1, 2),
    played(L1, "2026-08-15", T.brm, T.cam, 1, 1),
    played(L1, "2026-08-15", T.burt, T.wim, 4, 1),
    played(L1, "2026-08-15", T.cam, T.hud, 1, 2),
    played(L1, "2026-08-15", T.don, T.bar, 0, 0),
    played(L1, "2026-08-15", T.hud, T.wim, 3, 0),
    played(L1, "2026-08-15", T.lei, T.burt, 1, 2),
    played(L1, "2026-08-15", T.ley, T.bar, 1, 3),
    played(L1, "2026-08-15", T.man, T.don, 2, 1),
    played(L1, "2026-08-15", T.nco, T.burt, 2, 1),
    played(L1, "2026-08-15", T.pet, T.man, 2, 1),
    played(L1, "2026-08-15", T.ste, T.don, 2, 2),
    played(L1, "2026-08-15", T.sto, T.blp, 1, 2),
    played(L1, "2026-08-15", T.wig, T.ley, 0, 2),
    played(L1, "2026-08-20", T.shw, T.bra, 0, 1),
    played(L1, "2026-08-22", T.wyc, T.ply, 1, 1),
    played(L1, "2026-08-22", T.bar, T.brm, 0, 1),
    played(L1, "2026-08-22", T.blp, T.wyc, 1, 1),
    played(L1, "2026-08-22", T.bra, T.pet, 2, 0),
    played(L1, "2026-08-22", T.cam, T.wig, 3, 2),
    played(L1, "2026-08-22", T.don, T.nco, 1, 1),
    played(L1, "2026-08-22", T.hud, T.oxf, 3, 1),
    played(L1, "2026-08-22", T.lut, T.nco, 2, 2),
    played(L1, "2026-08-22", T.lut, T.sto, 2, 0),
    played(L1, "2026-08-22", T.mkd, T.hud, 1, 1),
    played(L1, "2026-08-22", T.mkd, T.lei, 0, 0),
    played(L1, "2026-08-22", T.nco, T.lei, 1, 1),
    played(L1, "2026-08-22", T.oxf, T.mkd, 2, 2),
    played(L1, "2026-08-22", T.pet, T.ste, 0, 0),
    played(L1, "2026-08-22", T.ste, T.oxf, 1, 2),
    played(L1, "2026-08-22", T.sto, T.wyc, 5, 1),
    played(L1, "2026-08-22", T.wig, T.mkd, 3, 1),
    played(L1, "2026-08-29", T.ply, T.bra, 2, 0),
    played(L1, "2026-08-29", T.shw, T.brm, 7, 2),
    played(L1, "2026-08-29", T.ley, T.shw, 1, 2),
    played(L1, "2026-08-30", T.man, T.lut, 5, 2),
    played(L1, "2026-09-01", T.lei, T.ply, 2, 0, "19:45"),
    played(L1, "2026-09-01", T.wyc, T.shw, 1, 2),
    played(L1, "2026-09-01", T.brm, T.ley, 0, 5),
    played(L1, "2026-09-02", T.bar, T.blp, 2, 1),
    played(L1, "2026-09-02", T.rea, T.man, 5, 0),
    played(L1, "2026-09-05", T.don, T.ply, 2, 3),
    played(L1, "2026-09-05", T.lei, T.oxf, 0, 4),
    played(L1, "2026-09-05", T.pet, T.shw, 1, 2),
    played(L1, "2026-09-05", T.rea, T.blp, 3, 1),
    played(L1, "2026-09-05", T.hud, T.nco, 1, 1),
    played(L1, "2026-09-05", T.wig, T.sto, 0, 4),
    played(L1, "2026-09-05", T.bra, T.man, 1, 0),
    played(L1, "2026-09-05", T.wyc, T.mkd, 3, 3),
    played(L1, "2026-09-05", T.bar, T.ste, 1, 5),
    played(L1, "2026-09-05", T.lut, T.ley, 1, 1),
    played(L1, "2026-09-05", T.burt, T.cam, 2, 2),
    // Midweek — 7 & 10 September
    played(L1, "2026-09-07", T.brm, T.wim, 0, 2, "20:00"),
    played(L1, "2026-09-10", T.ste, T.lut, 2, 1, "19:45"),
    // Saturday 12 September
    played(L1, "2026-09-12", T.ley, T.wyc, 2, 3, "12:30"),
    played(L1, "2026-09-12", T.nco, T.bra, 0, 1, "12:30"),
    played(L1, "2026-09-12", T.wim, T.don, 1, 0),
    played(L1, "2026-09-12", T.blp, T.brm, 2, 2),
    played(L1, "2026-09-12", T.cam, T.rea, 2, 1),
    played(L1, "2026-09-12", T.man, T.hud, 0, 0),
    played(L1, "2026-09-12", T.mkd, T.pet, 1, 1),
    played(L1, "2026-09-12", T.oxf, T.burt, 3, 0),
    played(L1, "2026-09-12", T.ply, T.bar, 3, 0),
    played(L1, "2026-09-12", T.shw, T.wig, 0, 0),
    played(L1, "2026-09-12", T.sto, T.lei, 3, 4),
  ];
}

function upcomingListed(): OfficialMatch[] {
  return [
    // Remaining Argyle League One dates (full weeks filled by generator from REMAINDER_START)
    upcoming(L1, "2026-09-19", T.blp, T.ply),
    upcoming(L1, "2026-09-26", T.ply, T.burt),
    upcoming(L1, "2026-10-03", T.ley, T.ply),
    upcoming(L1, "2026-10-10", T.ply, T.wim, "12:30"),
    upcoming(L1, "2026-10-17", T.ply, T.hud),
    // 20 Oct / 24 Oct are overlay-owned played results (Stevenage 3–0, Cambridge 2–3).
    upcoming(L1, "2026-10-31", T.ply, T.rea, "12:30"),
    upcoming(L1, "2026-11-14", T.shw, T.ply),
    upcoming(L1, "2026-11-21", T.ply, T.pet),
    upcoming(L1, "2026-11-28", T.wig, T.ply),
    upcoming(L1, "2026-12-01", T.ply, T.brm, "19:45"),
    upcoming(L1, "2026-12-12", T.nco, T.ply),
    upcoming(L1, "2026-12-19", T.ply, T.man),
    upcoming(L1, "2026-12-26", T.oxf, T.ply),
    upcoming(L1, "2026-12-29", T.ply, T.mkd, "19:45"),
    upcoming(L1, "2027-01-02", T.ply, T.lut),
  ];
}

export function pairingKey(homeTeamId: string, awayTeamId: string, competition: string): string {
  return `${competition}|${homeTeamId}|${awayTeamId}`;
}

/** Season encounter identity ignoring home/away orientation. */
export function undirectedPairingKey(homeTeamId: string, awayTeamId: string, competition: string): string {
  return homeTeamId < awayTeamId
    ? `${competition}|${homeTeamId}|${awayTeamId}`
    : `${competition}|${awayTeamId}|${homeTeamId}`;
}
