import type { PositionCode, PlayerAttributes, PlayerPhysicalFacts, PlayerRecord, RatingOverride } from "../../data/schema";
import { clamp } from "../../core/math";

type WeightMap = Partial<Record<keyof PlayerAttributes, number>>;

/**
 * Position overall weights — DISPLAY / SUMMARY ONLY.
 * Must never be used as a gameplay multiplier.
 */
export const OVERALL_WEIGHTS: Record<string, WeightMap> = {
  GK: {
    gkReflexes: 0.22,
    gkDiving: 0.2,
    gkHandling: 0.18,
    gkPositioning: 0.18,
    gkKicking: 0.08,
    reactions: 0.08,
    composure: 0.06,
  },
  CB: {
    defensiveAwareness: 0.18,
    defending: 0.16,
    tackling: 0.14,
    strength: 0.12,
    heading: 0.1,
    jumping: 0.08,
    composure: 0.08,
    reactions: 0.06,
    pace: 0.04,
    acceleration: 0.02,
    passing: 0.02,
  },
  LB: {
    pace: 0.14,
    acceleration: 0.12,
    stamina: 0.12,
    defensiveAwareness: 0.12,
    tackling: 0.1,
    crossing: 0.1,
    passing: 0.08,
    control: 0.06,
    agility: 0.06,
    reactions: 0.05,
    strength: 0.03,
    attackingAwareness: 0.02,
  },
  RB: {
    pace: 0.14,
    acceleration: 0.12,
    stamina: 0.12,
    defensiveAwareness: 0.12,
    tackling: 0.1,
    crossing: 0.1,
    passing: 0.08,
    control: 0.06,
    agility: 0.06,
    reactions: 0.05,
    strength: 0.03,
    attackingAwareness: 0.02,
  },
  LWB: {
    pace: 0.15,
    acceleration: 0.12,
    stamina: 0.13,
    crossing: 0.12,
    defensiveAwareness: 0.1,
    tackling: 0.08,
    passing: 0.08,
    control: 0.06,
    attackingAwareness: 0.06,
    agility: 0.05,
    reactions: 0.05,
  },
  RWB: {
    pace: 0.15,
    acceleration: 0.12,
    stamina: 0.13,
    crossing: 0.12,
    defensiveAwareness: 0.1,
    tackling: 0.08,
    passing: 0.08,
    control: 0.06,
    attackingAwareness: 0.06,
    agility: 0.05,
    reactions: 0.05,
  },
  DM: {
    defensiveAwareness: 0.16,
    tackling: 0.14,
    defending: 0.12,
    passing: 0.12,
    stamina: 0.1,
    reactions: 0.08,
    strength: 0.08,
    composure: 0.06,
    control: 0.06,
    longPassing: 0.05,
    aggression: 0.03,
  },
  CM: {
    passing: 0.18,
    vision: 0.16,
    control: 0.12,
    stamina: 0.1,
    composure: 0.1,
    reactions: 0.08,
    longPassing: 0.08,
    dribbling: 0.06,
    defensiveAwareness: 0.06,
    attackingAwareness: 0.04,
    agility: 0.02,
  },
  AM: {
    vision: 0.16,
    passing: 0.14,
    control: 0.12,
    dribbling: 0.12,
    attackingAwareness: 0.12,
    composure: 0.1,
    longPassing: 0.06,
    shooting: 0.06,
    longShots: 0.05,
    agility: 0.04,
    reactions: 0.03,
  },
  RM: {
    pace: 0.14,
    acceleration: 0.1,
    passing: 0.12,
    dribbling: 0.12,
    crossing: 0.12,
    stamina: 0.1,
    control: 0.08,
    attackingAwareness: 0.08,
    vision: 0.06,
    defending: 0.04,
    agility: 0.04,
  },
  LM: {
    pace: 0.14,
    acceleration: 0.1,
    passing: 0.12,
    dribbling: 0.12,
    crossing: 0.12,
    stamina: 0.1,
    control: 0.08,
    attackingAwareness: 0.08,
    vision: 0.06,
    defending: 0.04,
    agility: 0.04,
  },
  RW: {
    pace: 0.14,
    acceleration: 0.12,
    dribbling: 0.14,
    control: 0.1,
    attackingAwareness: 0.1,
    crossing: 0.1,
    passing: 0.08,
    vision: 0.06,
    finishing: 0.06,
    agility: 0.05,
    stamina: 0.03,
    longShots: 0.02,
  },
  LW: {
    pace: 0.14,
    acceleration: 0.12,
    dribbling: 0.14,
    control: 0.1,
    attackingAwareness: 0.1,
    crossing: 0.1,
    passing: 0.08,
    vision: 0.06,
    finishing: 0.06,
    agility: 0.05,
    stamina: 0.03,
    longShots: 0.02,
  },
  ST: {
    finishing: 0.18,
    attackingAwareness: 0.14,
    shooting: 0.12,
    composure: 0.1,
    control: 0.1,
    pace: 0.08,
    acceleration: 0.06,
    shotPower: 0.06,
    heading: 0.06,
    strength: 0.05,
    dribbling: 0.05,
  },
};

/** Alias CDM → DM, CAM → AM, CF → ST for weight lookup. */
const POSITION_ALIAS: Record<string, string> = {
  CDM: "DM",
  CAM: "AM",
  CF: "ST",
  RCB: "CB",
  LCB: "CB",
  RST: "ST",
  LST: "ST",
  LAM: "AM",
  RAM: "AM",
  LCM: "CM",
  RCM: "CM",
};

export type InferredAttrKey =
  | "acceleration"
  | "agility"
  | "balance"
  | "crossing"
  | "heading"
  | "penalties"
  | "setPieces"
  | "aggression"
  | "attackingAwareness"
  | "reactions"
  | "defensiveAwareness"
  | "tackling"
  | "jumping";

export interface ResolveResult {
  attrs: PlayerAttributes;
  /** Attribute keys filled from compatibility defaults (not authored). */
  inferred: InferredAttrKey[];
}

function roundStat(n: number): number {
  return Math.round(clamp(n, 1, 100));
}

function blend(...parts: number[]): number {
  const vals = parts.filter((n) => Number.isFinite(n));
  if (!vals.length) return 60;
  return roundStat(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function isAttackingPos(pos: PositionCode | string): boolean {
  const p = String(pos);
  return p.includes("ST") || p === "CF" || p.includes("W") || p === "AM" || p === "CAM" || p === "LAM" || p === "RAM";
}

/**
 * Resolve authored + inferred attributes. Explicit values always win.
 * Inferred keys are reported so callers never treat defaults as authoritative.
 */
export function resolveAttributesDetailed(
  player: PlayerRecord | (Partial<PlayerAttributes> & { primaryPosition?: PositionCode }),
): ResolveResult {
  const pos = ("primaryPosition" in player && player.primaryPosition) || "CM";
  const inferred: InferredAttrKey[] = [];
  const take = <K extends InferredAttrKey>(key: K, fallback: number): number => {
    const raw = (player as PlayerAttributes)[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return roundStat(raw);
    inferred.push(key);
    return roundStat(fallback);
  };

  const pace = roundStat(player.pace ?? 60);
  const passing = roundStat(player.passing ?? 60);
  const longPassing = roundStat(player.longPassing ?? passing);
  const vision = roundStat(player.vision ?? 60);
  const control = roundStat(player.control ?? 60);
  const dribbling = roundStat(player.dribbling ?? 60);
  const shooting = roundStat(player.shooting ?? 60);
  const finishing = roundStat(player.finishing ?? 60);
  const shotPower = roundStat(player.shotPower ?? 60);
  const longShots = roundStat(player.longShots ?? 60);
  const defending = roundStat(player.defending ?? 60);
  const strength = roundStat(player.strength ?? 60);
  const stamina = roundStat(player.stamina ?? 60);
  const composure = roundStat(player.composure ?? 60);

  const attrs: PlayerAttributes = {
    pace,
    passing,
    longPassing,
    vision,
    control,
    dribbling,
    shooting,
    finishing,
    shotPower,
    longShots,
    defending,
    strength,
    stamina,
    composure,
    acceleration: take("acceleration", pace),
    agility: take("agility", blend(dribbling, control, pace)),
    balance: take("balance", blend(strength, control)),
    crossing: take("crossing", blend(passing, longPassing)),
    heading: take(
      "heading",
      isAttackingPos(pos) ? blend(finishing, player.jumping ?? blend(strength, pace)) : blend(defending, player.jumping ?? blend(strength, pace)),
    ),
    penalties: take("penalties", blend(finishing, composure)),
    setPieces: take("setPieces", blend(passing, shooting)),
    aggression: take("aggression", blend(defending, strength)),
    attackingAwareness: take(
      "attackingAwareness",
      isAttackingPos(pos) ? blend(vision, composure, finishing) : blend(vision, composure),
    ),
    reactions: take("reactions", blend(composure, vision)),
    defensiveAwareness: take("defensiveAwareness", defending),
    tackling: take("tackling", defending),
    jumping: take("jumping", blend(strength, pace)),
    gkDiving: typeof player.gkDiving === "number" ? roundStat(player.gkDiving) : player.gkDiving,
    gkHandling: typeof player.gkHandling === "number" ? roundStat(player.gkHandling) : player.gkHandling,
    gkPositioning: typeof player.gkPositioning === "number" ? roundStat(player.gkPositioning) : player.gkPositioning,
    gkReflexes: typeof player.gkReflexes === "number" ? roundStat(player.gkReflexes) : player.gkReflexes,
    gkKicking: typeof player.gkKicking === "number" ? roundStat(player.gkKicking) : player.gkKicking,
  };

  return { attrs, inferred };
}

export function resolveAttributes(player: PlayerRecord | (Partial<PlayerAttributes> & { primaryPosition?: PositionCode })): PlayerAttributes {
  return resolveAttributesDetailed(player).attrs;
}

/** Players still relying on inferred defaults for one or more V1 fields. */
export function playersWithInferredDefaults(players: Iterable<PlayerRecord>): { id: string; name: string; inferred: InferredAttrKey[] }[] {
  const out: { id: string; name: string; inferred: InferredAttrKey[] }[] = [];
  for (const p of players) {
    const { inferred } = resolveAttributesDetailed(p);
    if (inferred.length) out.push({ id: p.id, name: p.name, inferred });
  }
  return out;
}

export function applyOverride(base: PlayerAttributes, override?: RatingOverride): PlayerAttributes {
  if (!override) return { ...base };
  const next = { ...base };
  for (const key of Object.keys(override) as (keyof RatingOverride)[]) {
    if (key === "overall") continue;
    const value = override[key];
    if (typeof value === "number") {
      (next as Record<string, number | undefined>)[key] = roundStat(value);
    }
  }
  return next;
}

function attr(source: PlayerAttributes, key: keyof PlayerAttributes): number {
  const value = source[key];
  if (typeof value === "number") return value;
  if (String(key).startsWith("gk")) return source.composure;
  return 60;
}

/**
 * Display/summary overall only — NEVER multiply into gameplay systems.
 */
export function deriveOverall(position: PositionCode | string, attrs: PlayerAttributes): number {
  const key = POSITION_ALIAS[position] ?? position;
  const weights = OVERALL_WEIGHTS[key] ?? OVERALL_WEIGHTS.CM;
  let sum = 0;
  let weightTotal = 0;
  for (const [attrKey, weight] of Object.entries(weights)) {
    if (!weight) continue;
    sum += attr(attrs, attrKey as keyof PlayerAttributes) * weight;
    weightTotal += weight;
  }
  return Math.round(clamp(sum / Math.max(1e-6, weightTotal), 1, 100));
}

export function passStatForDistance(attrs: PlayerAttributes, distance: number): number {
  const blendT = clamp((distance - 12) / 28, 0, 1);
  return attrs.passing + (attrs.longPassing - attrs.passing) * blendT;
}

export function crossingStat(attrs: PlayerAttributes): number {
  return attrs.crossing ?? blend(attrs.passing, attrs.longPassing);
}

export function normalizePreferredFoot(foot?: string | null): "L" | "R" {
  if (!foot) return "R";
  const f = foot.toLowerCase();
  if (f === "l" || f === "left") return "L";
  return "R";
}

export interface AttributeValidationIssue {
  field: string;
  message: string;
  value: unknown;
}

/** Validate ratings 1–100 and sensible physical facts. */
export function validatePlayerAttributes(
  player: Partial<PlayerAttributes> & PlayerPhysicalFacts & { id?: string },
): AttributeValidationIssue[] {
  const issues: AttributeValidationIssue[] = [];
  const ratingKeys: (keyof PlayerAttributes)[] = [
    "pace", "acceleration", "agility", "balance", "passing", "longPassing", "vision", "crossing",
    "control", "dribbling", "shooting", "finishing", "shotPower", "longShots", "heading", "penalties",
    "setPieces", "defending", "defensiveAwareness", "tackling", "jumping", "aggression", "strength",
    "stamina", "composure", "attackingAwareness", "reactions",
    "gkDiving", "gkHandling", "gkPositioning", "gkReflexes", "gkKicking",
  ];
  for (const key of ratingKeys) {
    const v = player[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 100) {
      issues.push({ field: key, message: "rating must be 1–100", value: v });
    }
  }
  if (player.heightCm !== undefined) {
    if (typeof player.heightCm !== "number" || player.heightCm < 150 || player.heightCm > 220) {
      issues.push({ field: "heightCm", message: "expected 150–220 cm", value: player.heightCm });
    }
  }
  if (player.weightKg !== undefined) {
    if (typeof player.weightKg !== "number" || player.weightKg < 50 || player.weightKg > 120) {
      issues.push({ field: "weightKg", message: "expected 50–120 kg", value: player.weightKg });
    }
  }
  if (player.preferredFoot !== undefined) {
    const f = String(player.preferredFoot).toLowerCase();
    if (!["l", "r", "left", "right"].includes(f)) {
      issues.push({ field: "preferredFoot", message: "expected L/R/left/right", value: player.preferredFoot });
    }
  }
  return issues;
}

/** Map measured height (cm) onto the procedural mesh heightScale (180cm ≈ 1.0). */
export function heightScaleFromCm(heightCm?: number): number {
  if (heightCm === undefined || !Number.isFinite(heightCm)) return 1;
  const t = (heightCm - 165) / 35;
  return clamp(0.92 + t * 0.2, 0.88, 1.16);
}

/** Soft contact mass factor from weight + strength (1 = average). */
export function contactMassFactor(attrs: PlayerAttributes, weightKg?: number): number {
  const w = weightKg ?? 75;
  const weightTerm = clamp((w - 70) / 40, -0.2, 0.25);
  const strengthTerm = (stat01Safe(attrs.strength) - 0.5) * 0.35;
  return clamp(1 + weightTerm + strengthTerm, 0.75, 1.35);
}

function stat01Safe(n: number): number {
  return clamp(n / 100, 0, 1);
}

/** Aerial reach index (not heading accuracy). */
export function aerialReachIndex(attrs: PlayerAttributes, heightCm?: number): number {
  const h = heightCm ?? 180;
  const heightTerm = clamp((h - 170) / 40, 0, 1);
  return clamp(
    heightTerm * 0.35 + stat01Safe(attrs.jumping ?? 60) * 0.4 + stat01Safe(attrs.reactions ?? 60) * 0.25,
    0,
    1,
  );
}
