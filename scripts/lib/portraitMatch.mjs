/** Portrait title / metadata matching for Wikimedia imports. */

const FOOTBALL_HINT =
  /\b(football|soccer|footballer|goalkeeper|midfielder|striker|defender|winger|kit|match|league|championship|premier|epl|efl|fa cup|yeovil|nottingham|plymouth|orient|forest|argyle|club)\b/i;
const NON_FOOTBALL =
  /\b(nba|basketball|nfl|mlb|nhl|tennis|rugby|cricket|navy|camp lemonnier|university of maryland|chalmers jack)\b/i;

/** Require surname + first name (or first initial) so "M. Cooper" ≠ "John Cooper". */
export function nameInTitle(playerName, fileTitle) {
  const parts = playerName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const t = fileTitle
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^file:/, "");
  if (parts.length < 2) return false;
  const surname = parts[parts.length - 1];
  const first = parts[0];
  if (surname.length < 3 || !t.includes(surname)) return false;
  if (first.length === 1) {
    const re = new RegExp(`(^|[^a-z])${first}[a-z]*[^a-z]+${surname}([^a-z]|$)`);
    return re.test(t);
  }
  return t.includes(first) && t.includes(surname);
}

/** Reject PD celebrity/homonym hits that are not association football. */
export function isFootballPortrait(info) {
  const blob = `${info.title || ""} ${info.objectName || ""} ${info.description || ""}`;
  if (NON_FOOTBALL.test(blob) && !FOOTBALL_HINT.test(blob)) return false;
  if (FOOTBALL_HINT.test(blob)) return true;
  return /\bfootballer\b/i.test(info.title || "");
}
