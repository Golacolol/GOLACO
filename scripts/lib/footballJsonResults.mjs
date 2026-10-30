/**
 * openfootball/football.json → OfficialMatch-shaped rows (CC0 public domain).
 */

export function normalizeClubName(name) {
  return String(name || "")
    .replace(/\bFC\b/gi, "")
    .replace(/\bAFC\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {unknown} score
 * @returns {[number, number] | null}
 */
export function parseFootballJsonScore(score) {
  if (!score) return null;
  if (Array.isArray(score)) {
    if (score.length >= 2 && Number.isFinite(score[0]) && Number.isFinite(score[1])) {
      return [Number(score[0]), Number(score[1])];
    }
    return null;
  }
  if (typeof score === "object") {
    const ft = score.ft;
    if (Array.isArray(ft) && ft.length >= 2) return [Number(ft[0]), Number(ft[1])];
  }
  return null;
}

/**
 * @param {object} payload football.json league file
 * @param {string} competition
 * @param {(name: string) => string | null} resolveTeamId
 */
export function mapFootballJsonMatches(payload, competition, resolveTeamId) {
  const matches = [];
  for (const row of payload?.matches ?? []) {
    const homeTeamId = resolveTeamId(row.team1);
    const awayTeamId = resolveTeamId(row.team2);
    if (!homeTeamId || !awayTeamId) continue;
    const ft = parseFootballJsonScore(row.score);
    const played = !!ft;
    matches.push({
      competition,
      date: row.date,
      time: row.time,
      homeTeamId,
      awayTeamId,
      ...(played ? { homeScore: ft[0], awayScore: ft[1], played: true } : { played: false }),
    });
  }
  return matches;
}

export const FOOTBALL_JSON_FILES = [
  { path: "2026-27/en.1.json", competition: "Premier League" },
  { path: "2026-27/en.2.json", competition: "Championship" },
  { path: "2026-27/en.3.json", competition: "League One" },
  { path: "2026-27/es.1.json", competition: "La Liga" },
  { path: "2026-27/it.1.json", competition: "Serie A" },
];

export const FOOTBALL_JSON_BASE =
  "https://raw.githubusercontent.com/openfootball/football.json/master/";
