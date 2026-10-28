/**
 * Parse openfootball/players Football.TXT lines into bio records.
 * Format: `Name,  POS,  1.82 m,  b. 10 Nov 2002 @ Place`
 * Height may be `-` when unknown. Weight is not in this dataset.
 */

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export function normalizePlayerName(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Strip common suffixes for fuzzy match (Jr, II). */
export function nameMatchKeys(name) {
  const n = normalizePlayerName(name);
  const keys = new Set([n]);
  const noSuffix = n.replace(/\s+(jr|sr|ii|iii|iv)$/i, "").trim();
  if (noSuffix) keys.add(noSuffix);
  // Last-token key for "M. Cooper" vs "Michael Cooper" — only when surname is distinctive.
  const parts = noSuffix.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    keys.add(parts[parts.length - 1]);
    keys.add(`${parts[0][0]} ${parts[parts.length - 1]}`);
  }
  return [...keys];
}

export function parseOpenfootballPlayerLine(line) {
  const raw = String(line || "").trim();
  if (!raw || raw.startsWith("=") || raw.startsWith("#") || !raw.includes(",")) return null;
  // Name, POS (or POS|POS), height, b. date [@ place]
  const m = raw.match(
    /^([^,]+),\s*([A-Za-z]{1,3}(?:\|[A-Za-z]{1,3})?)\s*,\s*([^,]*),\s*b\.\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})(?:\s*@\s*(.+))?$/i,
  );
  if (!m) return null;
  const name = m[1].trim();
  const pos = m[2].trim().toUpperCase();
  const heightRaw = m[3].trim();
  const dobRaw = m[4].trim();
  const birthplace = (m[5] || "").trim() || undefined;
  let heightCm;
  const hm = heightRaw.match(/(\d)\.(\d{2})\s*m/i);
  if (hm) heightCm = Math.round(Number(hm[1]) * 100 + Number(hm[2]));
  const dob = parseDob(dobRaw);
  const age = dob ? ageFromDob(dob) : undefined;
  return {
    name,
    pos,
    heightCm,
    dob: dob ? dob.toISOString().slice(0, 10) : undefined,
    age,
    birthplace,
  };
}

export function parseDob(label) {
  const m = String(label).match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!m) return null;
  const mon = MONTHS[m[2]];
  if (mon === undefined) return null;
  const d = new Date(Date.UTC(Number(m[3]), mon, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ageFromDob(dob, asOf = new Date()) {
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const md = asOf.getUTCMonth() - dob.getUTCMonth();
  if (md < 0 || (md === 0 && asOf.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 15 && age <= 50 ? age : undefined;
}

/** Estimate playing weight when openfootball has no kg — used only as soft fill. */
export function estimateWeightKg(heightCm, posHint = "") {
  if (!heightCm) return undefined;
  const p = String(posHint).toUpperCase();
  let w = heightCm * 0.42;
  if (p === "G" || p === "GK") w += 4;
  else if (p === "D" || p === "CB") w += 2;
  else if (p === "F" || p === "ST" || p === "W") w -= 3;
  return Math.round(Math.min(110, Math.max(58, w)));
}

export function parseOpenfootballPlayersText(text) {
  const byKey = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const row = parseOpenfootballPlayerLine(line);
    if (!row) continue;
    for (const key of nameMatchKeys(row.name)) {
      // Prefer entries that include height when colliding on surname-only keys.
      const prev = byKey.get(key);
      if (!prev || ((row.heightCm ? 1 : 0) > (prev.heightCm ? 1 : 0))) {
        byKey.set(key, row);
      }
    }
  }
  return byKey;
}

/**
 * Merge bios into a player record. Does not overwrite existing real height/age/weight
 * unless `overwrite` is true. Synthetic seed heights (176–201 range from generator)
 * are replaced when openfootball has a measured height.
 */
export function applyBioToPlayer(player, bio, opts = {}) {
  if (!bio) return { player, changed: false };
  const overwrite = !!opts.overwrite;
  const next = { ...player };
  let changed = false;

  if (bio.heightCm && (overwrite || !player.heightCm || looksSyntheticHeight(player))) {
    if (player.heightCm !== bio.heightCm) {
      next.heightCm = bio.heightCm;
      changed = true;
    }
  }
  if (bio.age && (overwrite || !player.age)) {
    if (player.age !== bio.age) {
      next.age = bio.age;
      changed = true;
    }
  }
  const weight =
    bio.weightKg ??
    (next.heightCm ? estimateWeightKg(next.heightCm, bio.pos || player.primaryPosition) : undefined);
  if (weight && (overwrite || !player.weightKg)) {
    if (player.weightKg !== weight) {
      next.weightKg = weight;
      changed = true;
    }
  }
  {
    const appearance = { ...(next.appearance || player.appearance || {}) };
    let appearanceChanged = false;
    if (bio.name && (overwrite || !appearance.fullName)) {
      if (appearance.fullName !== bio.name) {
        appearance.fullName = bio.name;
        appearanceChanged = true;
      }
    }
    if (bio.birthplace && (overwrite || !appearance.birthplace)) {
      if (appearance.birthplace !== bio.birthplace) {
        appearance.birthplace = bio.birthplace;
        appearanceChanged = true;
      }
    }
    if (appearanceChanged) {
      next.appearance = appearance;
      changed = true;
    }
  }
  // Sync visual scale from measured height when appearance has no explicit scale.
  if (next.heightCm) {
    const appearance = { ...(next.appearance || {}) };
    if (appearance.heightScale == null || looksSyntheticHeight(player)) {
      const scale = heightScaleFromCm(next.heightCm);
      if (appearance.heightScale !== scale) {
        appearance.heightScale = scale;
        next.appearance = appearance;
        changed = true;
      }
    }
  }
  return { player: next, changed };
}

export function looksSyntheticHeight(player) {
  // Generator used 176+(seed%14) or 188+(seed%8) — still allow OF overwrite always when missing age.
  if (!player?.heightCm) return true;
  if (player.age) return false; // already enriched
  return true;
}

export function heightScaleFromCm(heightCm) {
  if (!heightCm || !Number.isFinite(heightCm)) return 1;
  const t = (heightCm - 165) / 35;
  return Math.round(Math.min(1.16, Math.max(0.88, 0.92 + t * 0.2)) * 1000) / 1000;
}

export function findBioForPlayer(player, bioIndex) {
  const full = normalizePlayerName(player.name);
  if (bioIndex.has(full)) return bioIndex.get(full);

  const parts = full.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const initialSurname = `${parts[0][0]} ${parts[parts.length - 1]}`;
    const hit = bioIndex.get(initialSurname);
    if (hit) {
      const hitParts = normalizePlayerName(hit.name).split(" ").filter(Boolean);
      if (
        hitParts.length >= 2 &&
        hitParts[hitParts.length - 1] === parts[parts.length - 1] &&
        hitParts[0][0] === parts[0][0]
      ) {
        return hit;
      }
    }
  }
  return null;
}
