export type BindAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "pass"
  | "shoot"
  | "through"
  | "chip"
  | "cross"
  | "tackle"
  | "switch"
  | "sprint"
  | "boost"
  | "jockey"
  | "secondaryPress"
  | "view"
  | "track"
  | "homePortraits"
  | "awayPortraits"
  | "homePlayers"
  | "awayPlayers"
  | "pause";

export type KeyBindings = Record<BindAction, string>;

export const BIND_LABELS: Record<BindAction, string> = {
  up: "Move forward",
  down: "Move back",
  left: "Move left",
  right: "Move right",
  pass: "Pass / Press (hold)",
  shoot: "Shoot",
  through: "Through ball",
  chip: "Chip / lofted pass",
  cross: "Cross",
  tackle: "Tackle",
  switch: "Switch player",
  sprint: "Sprint",
  boost: "Speed burst",
  jockey: "Jockey / Close control",
  secondaryPress: "Second presser",
  view: "Cycle camera view",
  track: "Cycle camera track",
  homePortraits: "Toggle home PNGs",
  awayPortraits: "Toggle away PNGs",
  homePlayers: "Toggle home 3D players",
  awayPlayers: "Toggle away 3D players",
  pause: "Pause",
};

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  up: "KeyW",
  down: "KeyS",
  left: "KeyA",
  right: "KeyD",
  pass: "Space",
  shoot: "KeyX",
  through: "ShiftLeft",
  chip: "KeyF",
  cross: "KeyC",
  tackle: "KeyT",
  switch: "KeyQ",
  sprint: "KeyE",
  boost: "KeyR",
  jockey: "ControlLeft",
  secondaryPress: "KeyB",
  view: "KeyV",
  track: "KeyG",
  homePortraits: "KeyO",
  awayPortraits: "KeyP",
  homePlayers: "KeyU",
  awayPlayers: "KeyI",
  pause: "Escape",
};

export function mergeKeyBindings(partial?: Partial<KeyBindings> | null): KeyBindings {
  return { ...DEFAULT_KEY_BINDINGS, ...(partial ?? {}) };
}

export function codeLabel(code: string): string {
  if (code === "Space") return "Space";
  if (code === "Escape") return "Esc";
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "ControlLeft" || code === "ControlRight") return "Ctrl";
  if (code === "AltLeft" || code === "AltRight") return "Alt";
  if (code.startsWith("Arrow")) return code.slice(5);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Key")) return code.slice(3);
  return code;
}

export function controlsLegend(bindings: KeyBindings): string {
  const b = mergeKeyBindings(bindings);
  return [
    `${codeLabel(b.up)}${codeLabel(b.left)}${codeLabel(b.down)}${codeLabel(b.right)} move`,
    `${codeLabel(b.pass)} pass/press`,
    `${codeLabel(b.shoot)} shoot`,
    `${codeLabel(b.cross)} cross`,
    `${codeLabel(b.through)} through`,
    `${codeLabel(b.chip)} chip`,
    `${codeLabel(b.tackle)} tackle`,
    `${codeLabel(b.secondaryPress)} 2nd press`,
    `${codeLabel(b.switch)} switch`,
    `${codeLabel(b.boost)} burst`,
    `${codeLabel(b.pause)} pause`,
  ].join(" · ");
}
