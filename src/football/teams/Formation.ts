export type FormationName = "4-2-3-1" | "4-3-3" | "4-4-2" | "3-4-2-1" | "4-4-2-W";

export interface FormationSlot {
  id: string;
  role: "GK" | "DEF" | "MID" | "FWD";
  x: number;
  z: number;
}

const FORMATIONS: Record<FormationName, FormationSlot[]> = {
  "4-2-3-1": [
    { id: "GK", role: "GK", x: 0.07, z: 0 },
    { id: "RB", role: "DEF", x: 0.22, z: 0.38 },
    { id: "RCB", role: "DEF", x: 0.18, z: 0.13 },
    { id: "LCB", role: "DEF", x: 0.18, z: -0.13 },
    { id: "LB", role: "DEF", x: 0.22, z: -0.38 },
    { id: "RDM", role: "MID", x: 0.42, z: 0.12 },
    { id: "LDM", role: "MID", x: 0.42, z: -0.12 },
    { id: "RAM", role: "MID", x: 0.58, z: 0.32 },
    { id: "CAM", role: "MID", x: 0.58, z: 0 },
    { id: "LAM", role: "MID", x: 0.58, z: -0.32 },
    { id: "ST", role: "FWD", x: 0.82, z: 0 },
  ],
  "4-3-3": [
    { id: "GK", role: "GK", x: 0.07, z: 0 },
    { id: "RB", role: "DEF", x: 0.22, z: 0.38 },
    { id: "RCB", role: "DEF", x: 0.18, z: 0.13 },
    { id: "LCB", role: "DEF", x: 0.18, z: -0.13 },
    { id: "LB", role: "DEF", x: 0.22, z: -0.38 },
    { id: "RCM", role: "MID", x: 0.46, z: 0.22 },
    { id: "CM", role: "MID", x: 0.46, z: 0 },
    { id: "LCM", role: "MID", x: 0.46, z: -0.22 },
    { id: "RW", role: "FWD", x: 0.78, z: 0.3 },
    { id: "ST", role: "FWD", x: 0.84, z: 0 },
    { id: "LW", role: "FWD", x: 0.78, z: -0.3 },
  ],
  "4-4-2": [
    { id: "GK", role: "GK", x: 0.07, z: 0 },
    { id: "RB", role: "DEF", x: 0.22, z: 0.38 },
    { id: "RCB", role: "DEF", x: 0.18, z: 0.13 },
    { id: "LCB", role: "DEF", x: 0.18, z: -0.13 },
    { id: "LB", role: "DEF", x: 0.22, z: -0.38 },
    { id: "RM", role: "MID", x: 0.5, z: 0.36 },
    { id: "RCM", role: "MID", x: 0.5, z: 0.1 },
    { id: "LCM", role: "MID", x: 0.5, z: -0.1 },
    { id: "LM", role: "MID", x: 0.5, z: -0.36 },
    { id: "RST", role: "FWD", x: 0.82, z: 0.15 },
    { id: "LST", role: "FWD", x: 0.82, z: -0.15 },
  ],
  "3-4-2-1": [
    { id: "GK", role: "GK", x: 0.07, z: 0 },
    { id: "RCB", role: "DEF", x: 0.2, z: 0.22 },
    { id: "CB", role: "DEF", x: 0.16, z: 0 },
    { id: "LCB", role: "DEF", x: 0.2, z: -0.22 },
    { id: "RM", role: "MID", x: 0.42, z: 0.4 },
    { id: "RCM", role: "MID", x: 0.42, z: 0.1 },
    { id: "LCM", role: "MID", x: 0.42, z: -0.1 },
    { id: "LM", role: "MID", x: 0.42, z: -0.4 },
    { id: "RAM", role: "MID", x: 0.62, z: 0.16 },
    { id: "LAM", role: "MID", x: 0.62, z: -0.16 },
    { id: "ST", role: "FWD", x: 0.84, z: 0 },
  ],
  "4-4-2-W": [
    { id: "GK", role: "GK", x: 0.07, z: 0 },
    { id: "LB", role: "DEF", x: 0.22, z: -0.4 },
    { id: "LCB", role: "DEF", x: 0.18, z: -0.13 },
    { id: "RCB", role: "DEF", x: 0.18, z: 0.13 },
    { id: "RB", role: "DEF", x: 0.22, z: 0.4 },
    { id: "LM", role: "MID", x: 0.5, z: -0.36 },
    { id: "LCM", role: "MID", x: 0.5, z: -0.1 },
    { id: "RCM", role: "MID", x: 0.5, z: 0.1 },
    { id: "RM", role: "MID", x: 0.5, z: 0.36 },
    { id: "LST", role: "FWD", x: 0.82, z: -0.15 },
    { id: "RST", role: "FWD", x: 0.82, z: 0.15 },
  ],
};

export function getFormation(name: string): FormationSlot[] {
  return FORMATIONS[(name as FormationName) ?? "4-2-3-1"] ?? FORMATIONS["4-2-3-1"];
}

export const FORMATION_NAMES: FormationName[] = ["4-4-2-W", "4-4-2", "4-3-3", "4-2-3-1", "3-4-2-1"];

export function playerFormationRole(isGK: boolean, slotId: string, formation?: string): FormationSlot["role"] {
  if (isGK) return "GK";
  return slotRole(slotId, formation);
}

function slotSide(slotId: string): "L" | "R" | "C" {
  if (slotId.startsWith("L")) return "L";
  if (slotId.startsWith("R")) return "R";
  return "C";
}

function slotFamily(slotId: string, formation?: string): string {
  const role = slotRole(slotId, formation);
  if (role === "DEF") {
    if (["RCB", "LCB", "CB"].includes(slotId)) return "CB";
    return "FB";
  }
  if (role === "FWD") return slotId.includes("ST") ? "ST" : "W";
  if (slotId.includes("DM")) return "DM";
  if (slotId.includes("AM") || slotId === "CAM") return "AM";
  if (["LM", "RM"].includes(slotId)) return "WM";
  return "CM";
}

export function remapPlayersToFormation(
  players: { id: string; slot: string; isGK: boolean }[],
  formation: string,
  fromFormation?: string,
): { id: string; slot: string }[] {
  const form = getFormation(formation);
  const taken = new Set<string>();
  const out: { id: string; slot: string }[] = [];
  const unused = () => players.filter((p) => !taken.has(p.id));
  const roleOf = (p: { slot: string; isGK: boolean }) => playerFormationRole(p.isGK, p.slot, fromFormation);
  for (const slot of form) {
    const match =
      unused().find((p) => p.slot === slot.id && roleOf(p) === slot.role) ??
      unused().find(
        (p) =>
          roleOf(p) === slot.role &&
          slotFamily(p.slot, fromFormation) === slotFamily(slot.id, formation) &&
          slotSide(p.slot) === slotSide(slot.id),
      ) ??
      unused().find((p) => roleOf(p) === slot.role && slotFamily(p.slot, fromFormation) === slotFamily(slot.id, formation)) ??
      unused().find((p) => roleOf(p) === slot.role && slotSide(p.slot) === slotSide(slot.id)) ??
      unused().find((p) => roleOf(p) === slot.role) ??
      unused().find((p) => !p.isGK) ??
      unused()[0];
    if (!match) continue;
    taken.add(match.id);
    out.push({ id: match.id, slot: slot.id });
  }
  return out;
}

export function slotRole(slotId: string, _formation?: string): FormationSlot["role"] {
  if (slotId === "GK") return "GK";
  if (["RB", "RCB", "CB", "LCB", "LB", "RWB", "LWB"].includes(slotId)) return "DEF";
  if (["ST", "RST", "LST", "RW", "LW"].includes(slotId)) return "FWD";
  return "MID";
}
