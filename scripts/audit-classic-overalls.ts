import { CLASSIC_TEAM_DEFINITIONS, buildClassicTeamArtifacts } from "../src/data/classicTeams/index";
import { deriveOverall, resolveAttributes } from "../src/football/players/PlayerStats";

for (const def of CLASSIC_TEAM_DEFINITIONS) {
  const built = buildClassicTeamArtifacts(def);
  const rows = def.players.map((p) => {
    const rec = built.players.find((x) => x.id === p.id)!;
    const attrs = resolveAttributes(rec);
    const ovr = deriveOverall(p.primaryPosition, attrs);
    return { id: p.id, name: p.displayName, pos: p.primaryPosition, ovr };
  });
  const xi = def.xi.map((x) => rows.find((r) => r.id === x.id)!);
  const xiMean = xi.reduce((s, r) => s + r.ovr, 0) / xi.length;
  const squadMean = rows.reduce((s, r) => s + r.ovr, 0) / rows.length;
  const hi = [...rows].sort((a, b) => b.ovr - a.ovr)[0];
  const lo = [...rows].sort((a, b) => a.ovr - b.ovr)[0];
  console.log(
    `${def.displayName} | XI ${xiMean.toFixed(1)} | Squad ${squadMean.toFixed(1)} | Hi ${hi.name} ${hi.ovr} | Lo ${lo.name} ${lo.ovr}`,
  );
}
