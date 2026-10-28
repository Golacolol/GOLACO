#!/usr/bin/env python3
"""Emit the 12 Classic Teams V3 modules and rewrite index.ts for all 42."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/data/classicTeams/teams"
INDEX = ROOT / "src/data/classicTeams/index.ts"

V1 = [
    "pace", "acceleration", "agility", "balance",
    "control", "dribbling",
    "passing", "longPassing", "vision", "crossing",
    "shooting", "finishing", "shotPower", "longShots",
    "heading", "penalties", "setPieces",
    "defending", "defensiveAwareness", "tackling", "aggression",
    "strength", "stamina", "composure", "attackingAwareness", "reactions", "jumping",
]
GK = ["gkDiving", "gkHandling", "gkPositioning", "gkReflexes", "gkKicking"]
GROUPS = [
    ["pace", "acceleration", "agility", "balance"],
    ["control", "dribbling"],
    ["passing", "longPassing", "vision", "crossing"],
    ["shooting", "finishing", "shotPower", "longShots"],
    ["heading", "penalties", "setPieces"],
    ["defending", "defensiveAwareness", "tackling", "aggression"],
    ["strength", "stamina", "composure", "attackingAwareness", "reactions", "jumping"],
]
SLOTS = {
    "4-2-3-1": ["GK", "RB", "RCB", "LCB", "LB", "RDM", "LDM", "RAM", "CAM", "LAM", "ST"],
    "4-3-3": ["GK", "RB", "RCB", "LCB", "LB", "RCM", "CM", "LCM", "RW", "ST", "LW"],
    "4-4-2": ["GK", "RB", "RCB", "LCB", "LB", "RM", "RCM", "LCM", "LM", "RST", "LST"],
    "3-4-2-1": ["GK", "RCB", "CB", "LCB", "RM", "RCM", "LCM", "LM", "RAM", "LAM", "ST"],
}
ARCH = {
    "GK": dict(pace=-26, acceleration=-26, agility=-12, balance=-8, control=-24, dribbling=-34, passing=-24, longPassing=-18, vision=-22, crossing=-40, shooting=-44, finishing=-46, shotPower=-24, longShots=-40, heading=-30, penalties=-34, setPieces=-34, defending=-34, defensiveAwareness=-18, tackling=-40, aggression=-24, strength=-4, stamina=-16, composure=-2, attackingAwareness=-40, reactions=1, jumping=-2),
    "FB": dict(pace=3, acceleration=3, agility=1, balance=0, control=-3, dribbling=-4, passing=-3, longPassing=-6, vision=-7, crossing=1, shooting=-18, finishing=-21, shotPower=-10, longShots=-14, heading=-6, penalties=-20, setPieces=-14, defending=1, defensiveAwareness=0, tackling=1, aggression=1, strength=-4, stamina=3, composure=-3, attackingAwareness=-8, reactions=-1, jumping=-4),
    "CB": dict(pace=-9, acceleration=-10, agility=-13, balance=-2, control=-8, dribbling=-17, passing=-7, longPassing=-8, vision=-10, crossing=-22, shooting=-24, finishing=-28, shotPower=-6, longShots=-22, heading=3, penalties=-22, setPieces=-20, defending=3, defensiveAwareness=3, tackling=2, aggression=3, strength=4, stamina=-2, composure=0, attackingAwareness=-20, reactions=-1, jumping=3),
    "DM": dict(pace=-6, acceleration=-6, agility=-6, balance=-1, control=-2, dribbling=-7, passing=-1, longPassing=-3, vision=-3, crossing=-12, shooting=-14, finishing=-18, shotPower=-6, longShots=-10, heading=-6, penalties=-16, setPieces=-12, defending=2, defensiveAwareness=2, tackling=2, aggression=3, strength=0, stamina=3, composure=-1, attackingAwareness=-12, reactions=0, jumping=-4),
    "CM": dict(pace=-5, acceleration=-5, agility=-3, balance=-1, control=1, dribbling=-2, passing=2, longPassing=1, vision=2, crossing=-6, shooting=-8, finishing=-11, shotPower=-5, longShots=-5, heading=-10, penalties=-10, setPieces=-6, defending=-6, defensiveAwareness=-5, tackling=-6, aggression=-3, strength=-6, stamina=2, composure=0, attackingAwareness=-5, reactions=0, jumping=-8),
    "AM": dict(pace=-3, acceleration=-2, agility=2, balance=1, control=3, dribbling=3, passing=2, longPassing=0, vision=3, crossing=-3, shooting=-2, finishing=-4, shotPower=-4, longShots=0, heading=-14, penalties=-4, setPieces=-2, defending=-20, defensiveAwareness=-18, tackling=-22, aggression=-12, strength=-12, stamina=-3, composure=1, attackingAwareness=1, reactions=0, jumping=-12),
    "WM": dict(pace=2, acceleration=2, agility=2, balance=0, control=0, dribbling=2, passing=-3, longPassing=-6, vision=-4, crossing=3, shooting=-8, finishing=-9, shotPower=-6, longShots=-5, heading=-14, penalties=-10, setPieces=-6, defending=-12, defensiveAwareness=-12, tackling=-12, aggression=-6, strength=-10, stamina=3, composure=-2, attackingAwareness=-2, reactions=-1, jumping=-10),
    "W": dict(pace=5, acceleration=5, agility=4, balance=1, control=2, dribbling=5, passing=-5, longPassing=-10, vision=-4, crossing=0, shooting=-2, finishing=-3, shotPower=-5, longShots=-4, heading=-15, penalties=-8, setPieces=-8, defending=-26, defensiveAwareness=-24, tackling=-28, aggression=-12, strength=-12, stamina=-1, composure=-1, attackingAwareness=2, reactions=0, jumping=-10),
    "ST": dict(pace=1, acceleration=1, agility=0, balance=0, control=0, dribbling=-2, passing=-8, longPassing=-14, vision=-7, crossing=-14, shooting=3, finishing=4, shotPower=1, longShots=-4, heading=-2, penalties=-2, setPieces=-12, defending=-30, defensiveAwareness=-28, tackling=-32, aggression=-6, strength=-2, stamina=-3, composure=1, attackingAwareness=3, reactions=1, jumping=-2),
}
GK_ARCH = dict(gkDiving=0, gkHandling=-2, gkPositioning=-1, gkReflexes=1, gkKicking=-6)

RATINGS_NOTE = "Historic gameplay ratings independently authored for this simulation; season/tournament-specific and not copied from commercial football videogame ratings."
DATA_VERSION = "3.0"

# The 30 Classic Teams already shipped (V1 + V2), in index order.
EXISTING = [
    ("CLASSIC_JUVENTUS_1995_96", "juventus199596"),
    ("CLASSIC_MILAN_2004_05", "milan200405"),
    ("CLASSIC_INTER_2009_10", "inter200910"),
    ("CLASSIC_LIVERPOOL_1987_88", "liverpool198788"),
    ("CLASSIC_MANUTD_1998_99", "manutd199899"),
    ("CLASSIC_REAL_MADRID_2002_03", "realMadrid200203"),
    ("CLASSIC_BARCELONA_1993_94", "barcelona199394"),
    ("CLASSIC_BARCELONA_2008_09", "barcelona200809"),
    ("CLASSIC_BARCELONA_2014_15", "barcelona201415"),
    ("CLASSIC_ARSENAL_2003_04", "arsenal200304"),
    ("CLASSIC_CHELSEA_2004_05", "chelsea200405"),
    ("CLASSIC_AJAX_1994_95", "ajax199495"),
    ("CLASSIC_INTER_1997_98", "inter199798"),
    ("CLASSIC_MANCITY_2018_19", "manCity201819"),
    ("CLASSIC_PLYMOUTH_ARGYLE_1995_96", "plymouthArgyle199596"),
    ("CLASSIC_PLYMOUTH_ARGYLE_2003_04", "plymouthArgyle200304"),
    ("CLASSIC_PLYMOUTH_ARGYLE_2016_17", "plymouthArgyle201617"),
    ("CLASSIC_COVENTRY_1997_98", "coventry199798"),
    ("CLASSIC_ASTON_VILLA_1995_96", "astonVilla199596"),
    ("CLASSIC_JUVENTUS_2016_17", "juventus201617"),
    ("CLASSIC_CELTIC_1997_98", "celtic199798"),
    ("CLASSIC_RANGERS_1992_93", "rangers199293"),
    ("CLASSIC_NEWCASTLE_1995_96", "newcastle199596"),
    ("CLASSIC_ENGLAND_1996", "england1996"),
    ("CLASSIC_ENGLAND_2002", "england2002"),
    ("CLASSIC_BRAZIL_1994", "brazil1994"),
    ("CLASSIC_BRAZIL_2002", "brazil2002"),
    ("CLASSIC_FRANCE_2000", "france2000"),
    ("CLASSIC_SPAIN_2010", "spain2010"),
    ("CLASSIC_ARGENTINA_1986", "argentina1986"),
]


def clamp(n: float) -> int:
    return max(1, min(100, round(n)))


def ratings_for(player: dict) -> dict:
    arch = ARCH[player["arch"]]
    overrides = player.get("r") or {}
    out = {}
    for k in V1:
        out[k] = clamp(overrides[k] if k in overrides else player["o"] + arch[k])
    return out


def gk_for(player: dict) -> dict:
    overrides = player.get("gk") or {}
    return {k: clamp(overrides[k] if k in overrides else player["o"] + GK_ARCH[k]) for k in GK}


def short_name(player: dict) -> str:
    if player.get("short"):
        return player["short"]
    parts = player["name"].split()
    return " ".join(parts[1:]) if len(parts) > 1 else parts[0]


def build(team: dict):
    slots = SLOTS[team["formation"]]
    players, xi, bench = [], [], []
    seen_ids, seen_nums, seen_slots = set(), set(), set()
    gks = 0
    for pl in team["squad"]:
        pid = f"{team['playerPrefix']}_{pl['key']}"
        assert pid not in seen_ids, pid
        assert pl["num"] not in seen_nums, f"{team['teamId']} duplicate shirt {pl['num']}"
        seen_ids.add(pid)
        seen_nums.add(pl["num"])
        if pl["pos"] == "GK":
            gks += 1
        for key in (pl.get("r") or {}):
            assert key in V1, f"{pid} unknown rating override {key}"
        players.append({
            "id": pid,
            "name": pl["name"],
            "displayName": short_name(pl),
            "primaryPosition": pl["pos"],
            "secondaryPositions": pl.get("sec"),
            "preferredFoot": pl["foot"],
            "heightCm": pl["h"],
            "weightKg": pl["w"],
            "ratings": ratings_for(pl),
            "gk": gk_for(pl) if pl["pos"] == "GK" else None,
        })
        if pl.get("slot"):
            assert pl["slot"] in slots, f"{team['teamId']} bad slot {pl['slot']}"
            assert pl["slot"] not in seen_slots, f"{team['teamId']} duplicate slot {pl['slot']}"
            seen_slots.add(pl["slot"])
            xi.append({"id": pid, "shirtNumber": pl["num"], "slot": pl["slot"], "captain": bool(pl.get("captain"))})
        else:
            bench.append({"id": pid, "shirtNumber": pl["num"]})
    missing = [s for s in slots if s not in seen_slots]
    assert not missing, f"{team['teamId']} missing {missing}"
    assert len(xi) == 11, f"{team['teamId']} xi {len(xi)}"
    assert len(bench) >= 9, f"{team['teamId']} bench {len(bench)}"
    assert len(players) >= 20, f"{team['teamId']} players {len(players)}"
    assert gks >= 2, f"{team['teamId']} gks {gks}"
    assert sum(1 for x in xi if x["captain"]) == 1, f"{team['teamId']} captains"
    xi.sort(key=lambda r: slots.index(r["slot"]))
    return players, xi, bench, gks


def emit_player(pl: dict) -> str:
    lines = ["    {"]
    lines.append(f'      id: {json.dumps(pl["id"])},')
    lines.append(f'      name: {json.dumps(pl["name"])},')
    lines.append(f'      displayName: {json.dumps(pl["displayName"])},')
    lines.append(f'      primaryPosition: {json.dumps(pl["primaryPosition"])},')
    if pl.get("secondaryPositions"):
        secs = ", ".join(json.dumps(s) for s in pl["secondaryPositions"])
        lines.append(f"      secondaryPositions: [{secs}],")
    lines.append(f'      preferredFoot: {json.dumps(pl["preferredFoot"])},')
    lines.append(f'      heightCm: {pl["heightCm"]},')
    lines.append(f'      weightKg: {pl["weightKg"]},')
    for g in GROUPS:
        lines.append("      " + ", ".join(f"{k}: {pl['ratings'][k]}" for k in g) + ",")
    if pl["gk"]:
        lines.append("      gk: { " + ", ".join(f"{k}: {pl['gk'][k]}" for k in GK) + " },")
    lines.append("    },")
    return "\n".join(lines)


def emit_team(team: dict, players, xi, bench) -> str:
    lines = [
        'import type { ClassicTeamDefinition } from "../types";',
        "",
        f"export const {team['constName']}: ClassicTeamDefinition = {{",
        f'  teamId: {json.dumps(team["teamId"])},',
        f'  lineupId: {json.dumps(team["teamId"] + "_xi")},',
        f'  playerPrefix: {json.dumps(team["playerPrefix"])},',
        f'  displayName: {json.dumps(team["displayName"])},',
        f'  abbreviation: {json.dumps(team["abbreviation"])},',
        f'  eraLabel: {json.dumps(team["eraLabel"])},',
        f'  season: {json.dumps(team["season"])},',
        f'  manager: {json.dumps(team["manager"])},',
        f'  formation: {json.dumps(team["formation"])},',
        f'  dataVersion: {json.dumps(DATA_VERSION)},',
        f"  ratingsNote:",
        f"    {json.dumps(RATINGS_NOTE)},",
        f'  primaryColor: {json.dumps(team["primaryColor"])},',
        f'  secondaryColor: {json.dumps(team["secondaryColor"])},',
        f'  kitShirt: {json.dumps(team["kitShirt"])},',
        f'  kitShorts: {json.dumps(team["kitShorts"])},',
        f'  kitSocks: {json.dumps(team["kitSocks"])},',
        f'  stadiumId: {json.dumps(team["stadiumId"])},',
    ]
    if team.get("teamCategory"):
        lines.append(f'  teamCategory: {json.dumps(team["teamCategory"])},')
    if team.get("tournament"):
        lines.append(f'  tournament: {json.dumps(team["tournament"])},')
    lines.append("  players: [")
    for pl in players:
        lines.append(emit_player(pl))
    lines.append("  ],")
    lines.append("  xi: [")
    for row in xi:
        cap = ", captain: true" if row["captain"] else ""
        lines.append(f'    {{ id: {json.dumps(row["id"])}, shirtNumber: {row["shirtNumber"]}, slot: {json.dumps(row["slot"])}{cap} }},')
    lines.append("  ],")
    lines.append("  bench: [")
    for row in bench:
        lines.append(f'    {{ id: {json.dumps(row["id"])}, shirtNumber: {row["shirtNumber"]} }},')
    lines.append("  ],")
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def emit_index(new_teams: list[dict]) -> str:
    all_entries = list(EXISTING) + [(t["constName"], t["fileName"]) for t in new_teams]
    lines = ['import type { ClassicTeamDefinition } from "./types";']
    for const, file in all_entries:
        lines.append(f'import {{ {const} }} from "./teams/{file}";')
    lines.append("")
    lines.append('export * from "./types";')
    for const, file in all_entries:
        lines.append(f'export {{ {const} }} from "./teams/{file}";')
    lines.append("")
    lines.append("export const CLASSIC_TEAM_DEFINITIONS: ClassicTeamDefinition[] = [")
    for const, _ in all_entries:
        lines.append(f"  {const},")
    lines.append("];")
    lines.append("")
    lines.append("export function getClassicTeamDefinitions(): ClassicTeamDefinition[] {")
    lines.append("  return CLASSIC_TEAM_DEFINITIONS;")
    lines.append("}")
    lines.append("")
    lines.append("export function getClassicTeamDefinition(teamId: string): ClassicTeamDefinition | undefined {")
    lines.append("  return CLASSIC_TEAM_DEFINITIONS.find((team) => team.teamId === teamId);")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def P(key, name, pos, arch, o, num, foot, h, w, **kw):
    d = dict(key=key, name=name, pos=pos, arch=arch, o=o, num=num, foot=foot, h=h, w=w)
    d.update(kw)
    return d


# Load squads from sidecar module to keep this file readable
from classic_teams_v3_squads import TEAMS  # noqa: E402


def check_stadiums(teams: list[dict]) -> None:
    path = ROOT / "public/data/stadiums.json"
    known = {s["id"] for s in json.loads(path.read_text())}
    missing = sorted({t["stadiumId"] for t in teams} - known)
    assert not missing, f"stadiums.json missing: {missing}"


def main():
    assert len(TEAMS) == 12, f"expected 12 V3 teams, got {len(TEAMS)}"
    assert len(EXISTING) == 30, f"expected 30 existing teams, got {len(EXISTING)}"
    check_stadiums(TEAMS)
    OUT.mkdir(parents=True, exist_ok=True)
    global_ids, team_ids, file_names = set(), set(), set()
    summary = []
    for team in TEAMS:
        assert team["teamId"] not in team_ids, team["teamId"]
        assert team["fileName"] not in file_names, team["fileName"]
        team_ids.add(team["teamId"])
        file_names.add(team["fileName"])
        players, xi, bench, gks = build(team)
        for pl in players:
            assert pl["id"] not in global_ids, pl["id"]
            global_ids.add(pl["id"])
        path = OUT / f"{team['fileName']}.ts"
        path.write_text(emit_team(team, players, xi, bench))
        summary.append((team["displayName"], path.name, len(players), len(xi), len(bench), gks))
    INDEX.write_text(emit_index(TEAMS))
    print(f"Wrote {len(TEAMS)} new classic teams; index has {len(EXISTING) + len(TEAMS)} total")
    for row in summary:
        print(f"  {row[1]:28} {row[2]:2}p XI{row[3]} B{row[4]} GK{row[5]}  {row[0]}")


if __name__ == "__main__":
    main()
