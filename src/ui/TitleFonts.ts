export interface TitleFontOption {
  id: string;
  label: string;
  family: string;
}

/** Shared catalogue for title + club-name pickers. */
export const TITLE_FONTS: TitleFontOption[] = [
  // Display / sport
  { id: "righteous", label: "Righteous", family: '"Righteous", Impact, sans-serif' },
  { id: "bebas", label: "Bebas Neue", family: '"Bebas Neue", "Arial Narrow", Impact, sans-serif' },
  { id: "oswald", label: "Oswald", family: '"Oswald", "Arial Narrow", sans-serif' },
  { id: "teko", label: "Teko", family: '"Teko", "Arial Narrow", sans-serif' },
  { id: "staatliches", label: "Staatliches", family: '"Staatliches", Impact, sans-serif' },
  { id: "barlowcond", label: "Barlow Condensed", family: '"Barlow Condensed", "Arial Narrow", sans-serif' },
  { id: "sairacond", label: "Saira Condensed", family: '"Saira Condensed", "Arial Narrow", sans-serif' },
  { id: "leaguegothic", label: "League Gothic", family: '"League Gothic", "Arial Narrow", Impact, sans-serif' },
  { id: "archivoblack", label: "Archivo Black", family: '"Archivo Black", Impact, sans-serif' },
  { id: "blackops", label: "Black Ops One", family: '"Black Ops One", Impact, sans-serif' },
  { id: "russo", label: "Russo One", family: '"Russo One", Impact, sans-serif' },
  { id: "squada", label: "Squada One", family: '"Squada One", Impact, sans-serif' },
  { id: "bungee", label: "Bungee", family: '"Bungee", Impact, sans-serif' },
  { id: "anton", label: "Anton", family: '"Anton", Impact, sans-serif' },
  { id: "impact", label: "Impact", family: 'Impact, "Arial Black", sans-serif' },
  { id: "arialblack", label: "Arial Black", family: '"Arial Black", "Helvetica Bold", sans-serif' },
  // Tech / futuristic
  { id: "orbitron", label: "Orbitron", family: '"Orbitron", "Arial Narrow", sans-serif' },
  { id: "exo2", label: "Exo 2", family: '"Exo 2", "Segoe UI", sans-serif' },
  { id: "audiowide", label: "Audiowide", family: '"Audiowide", Impact, sans-serif' },
  { id: "syncopate", label: "Syncopate", family: '"Syncopate", "Arial Narrow", sans-serif' },
  { id: "chakrapetch", label: "Chakra Petch", family: '"Chakra Petch", "Segoe UI", sans-serif' },
  { id: "quantico", label: "Quantico", family: '"Quantico", "Arial Narrow", sans-serif' },
  { id: "rajdhani", label: "Rajdhani", family: '"Rajdhani", "Segoe UI", sans-serif' },
  { id: "spacegrotesk", label: "Space Grotesk", family: '"Space Grotesk", "Segoe UI", sans-serif' },
  { id: "kanit", label: "Kanit", family: '"Kanit", "Segoe UI", sans-serif' },
  // Clean sans
  { id: "montserrat", label: "Montserrat", family: '"Montserrat", "Helvetica Neue", sans-serif' },
  { id: "poppins", label: "Poppins", family: '"Poppins", "Helvetica Neue", sans-serif' },
  { id: "inter", label: "Inter", family: '"Inter", "Segoe UI", sans-serif' },
  { id: "roboto", label: "Roboto", family: '"Roboto", "Helvetica Neue", sans-serif' },
  { id: "robotocond", label: "Roboto Condensed", family: '"Roboto Condensed", "Arial Narrow", sans-serif' },
  { id: "sourcesans", label: "Source Sans 3", family: '"Source Sans 3", "Segoe UI", sans-serif' },
  { id: "ibmplex", label: "IBM Plex Sans", family: '"IBM Plex Sans", "Segoe UI", sans-serif' },
  { id: "nunito", label: "Nunito", family: '"Nunito", "Segoe UI", sans-serif' },
  { id: "ubuntu", label: "Ubuntu", family: '"Ubuntu", "Segoe UI", sans-serif' },
  { id: "cabin", label: "Cabin", family: '"Cabin", "Segoe UI", sans-serif' },
  { id: "josefin", label: "Josefin Sans", family: '"Josefin Sans", "Segoe UI", sans-serif' },
  { id: "helvetica", label: "Helvetica Neue", family: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: "arial", label: "Arial", family: "Arial, Helvetica, sans-serif" },
  { id: "verdana", label: "Verdana", family: "Verdana, Geneva, sans-serif" },
  { id: "tahoma", label: "Tahoma", family: "Tahoma, Geneva, sans-serif" },
  { id: "trebuchet", label: "Trebuchet MS", family: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { id: "gillsans", label: "Gill Sans", family: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' },
  { id: "futura", label: "Futura", family: 'Futura, "Trebuchet MS", sans-serif' },
  { id: "optima", label: "Optima", family: 'Optima, "Segoe UI", sans-serif' },
  // Serif / editorial
  { id: "playfair", label: "Playfair Display", family: '"Playfair Display", Georgia, serif' },
  { id: "merriweather", label: "Merriweather", family: '"Merriweather", Georgia, serif' },
  { id: "librebaskerville", label: "Libre Baskerville", family: '"Libre Baskerville", Georgia, serif' },
  { id: "cinzel", label: "Cinzel", family: '"Cinzel", "Times New Roman", serif' },
  { id: "cinzeldec", label: "Cinzel Decorative", family: '"Cinzel Decorative", Cinzel, serif' },
  { id: "alfa", label: "Alfa Slab One", family: '"Alfa Slab One", "Rockwell", serif' },
  { id: "georgia", label: "Georgia", family: "Georgia, serif" },
  { id: "times", label: "Times New Roman", family: '"Times New Roman", Times, serif' },
  { id: "palatino", label: "Palatino", family: 'Palatino, "Palatino Linotype", "Book Antiqua", serif' },
  { id: "copperplate", label: "Copperplate", family: 'Copperplate, "Copperplate Gothic Light", serif' },
  // Soft / rounded
  { id: "comfortaa", label: "Comfortaa", family: '"Comfortaa", "Segoe UI", sans-serif' },
  { id: "fredoka", label: "Fredoka", family: '"Fredoka", "Segoe UI", sans-serif' },
  // Script / fun
  { id: "bangers", label: "Bangers", family: '"Bangers", Impact, cursive' },
  { id: "lobster", label: "Lobster", family: '"Lobster", Georgia, cursive' },
  { id: "pacifico", label: "Pacifico", family: '"Pacifico", Georgia, cursive' },
  { id: "permanentmarker", label: "Permanent Marker", family: '"Permanent Marker", "Comic Sans MS", cursive' },
  { id: "comicsans", label: "Comic Sans MS", family: '"Comic Sans MS", "Comic Sans", cursive' },
  // Retro / mono / pixel
  { id: "pressstart", label: "Press Start 2P", family: '"Press Start 2P", monospace' },
  { id: "vt323", label: "VT323", family: '"VT323", monospace' },
  { id: "silkscreen", label: "Silkscreen", family: '"Silkscreen", monospace' },
  { id: "specialelite", label: "Special Elite", family: '"Special Elite", "Courier New", monospace' },
  { id: "courier", label: "Courier New", family: '"Courier New", Courier, monospace' },
  { id: "consolas", label: "Consolas", family: 'Consolas, "Lucida Console", monospace' },
  // Decorative / heavy character
  { id: "unifraktur", label: "Unifraktur Maguntia", family: '"UnifrakturMaguntia", "Times New Roman", serif' },
  { id: "pirata", label: "Pirata One", family: '"Pirata One", Georgia, serif' },
  { id: "medieval", label: "MedievalSharp", family: '"MedievalSharp", Georgia, serif' },
  { id: "metal", label: "Metal Mania", family: '"Metal Mania", Impact, cursive' },
  { id: "monoton", label: "Monoton", family: '"Monoton", Impact, cursive' },
  { id: "fasterone", label: "Faster One", family: '"Faster One", Impact, cursive' },
  { id: "creepster", label: "Creepster", family: '"Creepster", Impact, cursive' },
  { id: "fascinate", label: "Fascinate Inline", family: '"Fascinate Inline", Impact, cursive' },
  { id: "fantasy", label: "Fantasy (Papyrus)", family: "Papyrus, Luminari, Herculanum, fantasy, serif" },
];

export const DEFAULT_TITLE_FONT = "righteous";
export const DEFAULT_CLUB_NAME_FONT = "oswald";
export const DEFAULT_CLUB_NAME_GLOW = true;
export const DEFAULT_CLUB_NAME_GLOW_DIFFUSION = 45;
export const DEFAULT_CLUB_NAME_INVERT_COLORS = false;

export function titleFontFamily(id: string | undefined): string {
  return (
    TITLE_FONTS.find((f) => f.id === id) ??
    TITLE_FONTS.find((f) => f.id === DEFAULT_TITLE_FONT) ??
    TITLE_FONTS[0]
  ).family;
}

export function clubNameFontFamily(id: string | undefined): string {
  return (
    TITLE_FONTS.find((f) => f.id === id) ??
    TITLE_FONTS.find((f) => f.id === DEFAULT_CLUB_NAME_FONT) ??
    TITLE_FONTS[0]
  ).family;
}

export function applyTitleFont(id: string | undefined): void {
  document.documentElement.style.setProperty("--title-font", titleFontFamily(id));
}

export function applyClubNameFont(id: string | undefined): void {
  document.documentElement.style.setProperty("--club-name-font", clubNameFontFamily(id));
}

export function clampClubNameGlowDiffusion(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_CLUB_NAME_GLOW_DIFFUSION;
  return Math.min(100, Math.max(0, Math.round(value as number)));
}

export interface ClubNameAppearance {
  clubNameFont?: string;
  clubNameGlow?: boolean;
  clubNameGlowDiffusion?: number;
  clubNameInvertColors?: boolean;
}

/** Applies font, glow on/off, glow diffusion, and primary/secondary invert for club names. */
export function applyClubNameAppearance(settings: ClubNameAppearance): void {
  applyClubNameFont(settings.clubNameFont);
  const root = document.documentElement;
  const glow = settings.clubNameGlow !== false;
  const invert = settings.clubNameInvertColors === true;
  const d = clampClubNameGlowDiffusion(settings.clubNameGlowDiffusion) / 100;
  root.classList.toggle("club-name-glow-off", !glow);
  root.classList.toggle("club-name-colors-invert", invert);
  root.style.setProperty("--club-name-glow-1", `${(1 + d * 5).toFixed(1)}px`);
  root.style.setProperty("--club-name-glow-2", `${(2.5 + d * 10).toFixed(1)}px`);
  root.style.setProperty("--club-name-glow-3", `${(5 + d * 20).toFixed(1)}px`);
  root.style.setProperty("--club-name-glow-4", `${(8 + d * 32).toFixed(1)}px`);
  root.style.setProperty("--club-name-glow-a3", `${Math.round((0.4 + d * 0.4) * 100)}%`);
  root.style.setProperty("--club-name-glow-a4", `${Math.round((0.18 + d * 0.4) * 100)}%`);
}
