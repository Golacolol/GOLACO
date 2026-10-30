/**
 * ESPN site API scoreboard harvest for La Liga / Serie A.
 * Used to fill played results (and near-term fixtures) when openfootball lags.
 */

const ESPN_HEADERS = {
  "User-Agent": "golaco-results-refresh/1.0",
  Accept: "application/json",
};

/** @type {{ slug: string, competition: string, seasonStart: string }[]} */
export const ESPN_LEAGUES = [
  { slug: "esp.1", competition: "La Liga", seasonStart: "2026-08-15" },
  { slug: "ita.1", competition: "Serie A", seasonStart: "2026-08-22" },
];

function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdCompact(iso) {
  return String(iso).replace(/-/g, "");
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

function kickoffTime(isoDate) {
  // ESPN returns e.g. 2026-10-25T17:30Z
  const m = String(isoDate || "").match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : undefined;
}

/**
 * @param {(name: string) => string | null} resolveTeamId
 * @param {{ throughDate?: string, aheadDays?: number }} [opts]
 */
export async function fetchEspnLeagueMatches(resolveTeamId, opts = {}) {
  const throughDate = opts.throughDate ?? ymd(new Date());
  const aheadDays = opts.aheadDays ?? 21;
  const out = [];

  for (const league of ESPN_LEAGUES) {
    const end = addDaysIso(throughDate, aheadDays);
    process.stdout.write(`  ESPN ${league.slug} (${league.competition})… `);
    let played = 0;
    let upcoming = 0;
    let missed = 0;
    try {
      for (let cursor = league.seasonStart; cursor <= end; cursor = addDaysIso(cursor, 1)) {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/scoreboard?dates=${ymdCompact(cursor)}`;
        const res = await fetch(url, { headers: ESPN_HEADERS });
        if (!res.ok) continue;
        const json = await res.json();
        for (const event of json.events ?? []) {
          const comp = event.competitions?.[0];
          if (!comp) continue;
          const home = (comp.competitors ?? []).find((c) => c.homeAway === "home");
          const away = (comp.competitors ?? []).find((c) => c.homeAway === "away");
          const homeName = home?.team?.displayName || home?.team?.name;
          const awayName = away?.team?.displayName || away?.team?.name;
          const homeTeamId = resolveTeamId(homeName);
          const awayTeamId = resolveTeamId(awayName);
          if (!homeTeamId || !awayTeamId) {
            missed += 1;
            continue;
          }
          const date = String(event.date || cursor).slice(0, 10);
          const time = kickoffTime(event.date);
          const completed =
            !!event.status?.type?.completed ||
            /final|full.?time|status_full_time/i.test(String(event.status?.type?.name || ""));
          const hs = home?.score;
          const as = away?.score;
          const hasScore =
            completed &&
            hs != null &&
            as != null &&
            String(hs) !== "" &&
            String(as) !== "" &&
            Number.isFinite(Number(hs)) &&
            Number.isFinite(Number(as));
          if (hasScore) {
            played += 1;
            out.push({
              competition: league.competition,
              date,
              time,
              homeTeamId,
              awayTeamId,
              homeScore: Number(hs),
              awayScore: Number(as),
              played: true,
            });
          } else {
            upcoming += 1;
            out.push({
              competition: league.competition,
              date,
              time,
              homeTeamId,
              awayTeamId,
              played: false,
            });
          }
        }
      }
      console.log(`${played + upcoming} (${played} played, ${upcoming} listed${missed ? `, ${missed} unresolved` : ""})`);
    } catch (err) {
      console.warn(`failed (${err instanceof Error ? err.message : err})`);
    }
  }
  return out;
}
