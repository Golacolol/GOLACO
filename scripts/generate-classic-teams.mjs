#!/usr/bin/env node
/**
 * Emits src/data/classicTeams/teams/*.ts and index.ts for the 11 Classic Teams.
 *
 * Squads are authored below as an overall rating plus a positional archetype of
 * per-attribute offsets, with explicit per-player overrides for the traits that
 * define each player in that specific season. The emitted TypeScript always
 * contains every V1 attribute as a literal number.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src", "data", "classicTeams", "teams");
const indexFile = path.join(root, "src", "data", "classicTeams", "index.ts");

const V1_KEYS = [
  "pace", "acceleration", "agility", "balance",
  "control", "dribbling",
  "passing", "longPassing", "vision", "crossing",
  "shooting", "finishing", "shotPower", "longShots",
  "heading", "penalties", "setPieces",
  "defending", "defensiveAwareness", "tackling", "aggression",
  "strength", "stamina", "composure", "attackingAwareness", "reactions", "jumping",
];

const GK_KEYS = ["gkDiving", "gkHandling", "gkPositioning", "gkReflexes", "gkKicking"];

/** Emitted line groups, purely for readability of the generated files. */
const KEY_GROUPS = [
  ["pace", "acceleration", "agility", "balance"],
  ["control", "dribbling"],
  ["passing", "longPassing", "vision", "crossing"],
  ["shooting", "finishing", "shotPower", "longShots"],
  ["heading", "penalties", "setPieces"],
  ["defending", "defensiveAwareness", "tackling", "aggression"],
  ["strength", "stamina", "composure", "attackingAwareness", "reactions", "jumping"],
];

const FORMATION_SLOTS = {
  "4-2-3-1": ["GK", "RB", "RCB", "LCB", "LB", "RDM", "LDM", "RAM", "CAM", "LAM", "ST"],
  "4-3-3": ["GK", "RB", "RCB", "LCB", "LB", "RCM", "CM", "LCM", "RW", "ST", "LW"],
  "4-4-2": ["GK", "RB", "RCB", "LCB", "LB", "RM", "RCM", "LCM", "LM", "RST", "LST"],
};

const POSITIONS = new Set(["GK", "RB", "CB", "LB", "RWB", "LWB", "DM", "CM", "AM", "RM", "LM", "RW", "LW", "ST"]);

/** Offsets applied to a player's overall rating, per positional archetype. */
const ARCH = {
  GK: {
    pace: -26, acceleration: -26, agility: -12, balance: -8,
    control: -24, dribbling: -34,
    passing: -24, longPassing: -18, vision: -22, crossing: -40,
    shooting: -44, finishing: -46, shotPower: -24, longShots: -40,
    heading: -30, penalties: -34, setPieces: -34,
    defending: -34, defensiveAwareness: -18, tackling: -40, aggression: -24,
    strength: -4, stamina: -16, composure: -2, attackingAwareness: -40, reactions: 1, jumping: -2,
  },
  FB: {
    pace: 3, acceleration: 3, agility: 1, balance: 0,
    control: -3, dribbling: -4,
    passing: -3, longPassing: -6, vision: -7, crossing: 1,
    shooting: -18, finishing: -21, shotPower: -10, longShots: -14,
    heading: -6, penalties: -20, setPieces: -14,
    defending: 1, defensiveAwareness: 0, tackling: 1, aggression: 1,
    strength: -4, stamina: 3, composure: -3, attackingAwareness: -8, reactions: -1, jumping: -4,
  },
  CB: {
    pace: -9, acceleration: -10, agility: -13, balance: -2,
    control: -8, dribbling: -17,
    passing: -7, longPassing: -8, vision: -10, crossing: -22,
    shooting: -24, finishing: -28, shotPower: -6, longShots: -22,
    heading: 3, penalties: -22, setPieces: -20,
    defending: 3, defensiveAwareness: 3, tackling: 2, aggression: 3,
    strength: 4, stamina: -2, composure: 0, attackingAwareness: -20, reactions: -1, jumping: 3,
  },
  DM: {
    pace: -6, acceleration: -6, agility: -6, balance: -1,
    control: -2, dribbling: -7,
    passing: -1, longPassing: -3, vision: -3, crossing: -12,
    shooting: -14, finishing: -18, shotPower: -6, longShots: -10,
    heading: -6, penalties: -16, setPieces: -12,
    defending: 2, defensiveAwareness: 2, tackling: 2, aggression: 3,
    strength: 0, stamina: 3, composure: -1, attackingAwareness: -12, reactions: 0, jumping: -4,
  },
  CM: {
    pace: -5, acceleration: -5, agility: -3, balance: -1,
    control: 1, dribbling: -2,
    passing: 2, longPassing: 1, vision: 2, crossing: -6,
    shooting: -8, finishing: -11, shotPower: -5, longShots: -5,
    heading: -10, penalties: -10, setPieces: -6,
    defending: -6, defensiveAwareness: -5, tackling: -6, aggression: -3,
    strength: -6, stamina: 2, composure: 0, attackingAwareness: -5, reactions: 0, jumping: -8,
  },
  AM: {
    pace: -3, acceleration: -2, agility: 2, balance: 1,
    control: 3, dribbling: 3,
    passing: 2, longPassing: 0, vision: 3, crossing: -3,
    shooting: -2, finishing: -4, shotPower: -4, longShots: 0,
    heading: -14, penalties: -4, setPieces: -2,
    defending: -20, defensiveAwareness: -18, tackling: -22, aggression: -12,
    strength: -12, stamina: -3, composure: 1, attackingAwareness: 1, reactions: 0, jumping: -12,
  },
  WM: {
    pace: 2, acceleration: 2, agility: 2, balance: 0,
    control: 0, dribbling: 2,
    passing: -3, longPassing: -6, vision: -4, crossing: 3,
    shooting: -8, finishing: -9, shotPower: -6, longShots: -5,
    heading: -14, penalties: -10, setPieces: -6,
    defending: -12, defensiveAwareness: -12, tackling: -12, aggression: -6,
    strength: -10, stamina: 3, composure: -2, attackingAwareness: -2, reactions: -1, jumping: -10,
  },
  W: {
    pace: 5, acceleration: 5, agility: 4, balance: 1,
    control: 2, dribbling: 5,
    passing: -5, longPassing: -10, vision: -4, crossing: 0,
    shooting: -2, finishing: -3, shotPower: -5, longShots: -4,
    heading: -15, penalties: -8, setPieces: -8,
    defending: -26, defensiveAwareness: -24, tackling: -28, aggression: -12,
    strength: -12, stamina: -1, composure: -1, attackingAwareness: 2, reactions: 0, jumping: -10,
  },
  ST: {
    pace: 1, acceleration: 1, agility: 0, balance: 0,
    control: 0, dribbling: -2,
    passing: -8, longPassing: -14, vision: -7, crossing: -14,
    shooting: 3, finishing: 4, shotPower: 1, longShots: -4,
    heading: -2, penalties: -2, setPieces: -12,
    defending: -30, defensiveAwareness: -28, tackling: -32, aggression: -6,
    strength: -2, stamina: -3, composure: 1, attackingAwareness: 3, reactions: 1, jumping: -2,
  },
};

const GK_ARCH = { gkDiving: 0, gkHandling: -2, gkPositioning: -1, gkReflexes: 1, gkKicking: -6 };

const RATINGS_NOTE =
  "Historic gameplay ratings authored for this simulation; subjective and season-specific, not official EA/Konami ratings.";
const DATA_VERSION = "1.0";
const STADIUM_ID = "home_park";

// ---------------------------------------------------------------------------
// Squads
// ---------------------------------------------------------------------------

const TEAMS = [
  {
    teamId: "classic_juventus_1995_96",
    playerPrefix: "classic_juve_9596",
    fileName: "juventus199596",
    constName: "CLASSIC_JUVENTUS_1995_96",
    displayName: "Juventus",
    abbreviation: "JUV",
    eraLabel: "Juventus 1995/96",
    season: "1995/96",
    manager: "Marcello Lippi",
    formation: "4-2-3-1",
    primaryColor: "#111111",
    secondaryColor: "#f4f4f4",
    kitShirt: "#151515",
    kitShorts: "#f4f4f4",
    kitSocks: "#151515",
    squad: [
      {
        key: "peruzzi", name: "Angelo Peruzzi", pos: "GK", arch: "GK", o: 88, num: 1, foot: "R", h: 191, w: 88,
        slot: "GK",
        gk: { gkDiving: 88, gkHandling: 87, gkPositioning: 89, gkReflexes: 90, gkKicking: 78 },
        r: { reactions: 90, composure: 88, strength: 86, jumping: 82, agility: 80 },
      },
      {
        key: "ferrara", name: "Ciro Ferrara", pos: "CB", sec: ["RB"], arch: "CB", o: 86, num: 2, foot: "R", h: 178, w: 76,
        slot: "RB",
        r: { defensiveAwareness: 90, tackling: 88, pace: 80, acceleration: 80, agility: 78, heading: 84, strength: 82, composure: 86 },
      },
      {
        key: "torricelli", name: "Moreno Torricelli", pos: "RB", sec: ["CB"], arch: "FB", o: 80, num: 3, foot: "R", h: 177, w: 74,
        r: { aggression: 86, tackling: 84, stamina: 86, crossing: 76 },
      },
      {
        key: "deschamps", name: "Didier Deschamps", short: "Deschamps", pos: "DM", sec: ["CM"], arch: "DM", o: 85, num: 4, foot: "R", h: 174, w: 72,
        slot: "RDM",
        r: { passing: 87, longPassing: 84, vision: 84, defensiveAwareness: 90, tackling: 86, stamina: 90, composure: 88, pace: 74, shooting: 62, finishing: 56 },
      },
      {
        key: "carrera", name: "Massimo Carrera", pos: "CB", arch: "CB", o: 81, num: 5, foot: "R", h: 183, w: 78,
        slot: "RCB",
        r: { heading: 84, strength: 84, tackling: 82, pace: 72 },
      },
      {
        key: "vierchowod", name: "Pietro Vierchowod", pos: "CB", arch: "CB", o: 85, num: 6, foot: "R", h: 180, w: 78,
        slot: "LCB",
        r: { pace: 86, acceleration: 84, strength: 90, aggression: 88, tackling: 88, defensiveAwareness: 87, stamina: 84, passing: 72, control: 72 },
      },
      {
        key: "dilivio", name: "Angelo Di Livio", pos: "RM", sec: ["CM"], arch: "WM", o: 81, num: 7, foot: "R", h: 170, w: 65,
        r: { stamina: 92, pace: 84, acceleration: 84, crossing: 82, defending: 76, aggression: 80 },
      },
      {
        key: "conte", name: "Antonio Conte", pos: "CM", sec: ["DM"], arch: "DM", o: 84, num: 8, foot: "R", h: 179, w: 76,
        slot: "LDM", captain: false,
        r: { stamina: 91, aggression: 88, longShots: 82, shotPower: 84, attackingAwareness: 80, tackling: 84, passing: 82, shooting: 78 },
      },
      {
        key: "vialli", name: "Gianluca Vialli", pos: "ST", sec: ["AM"], arch: "ST", o: 88, num: 9, foot: "R", h: 180, w: 78,
        slot: "CAM", captain: true,
        r: { finishing: 89, shooting: 88, strength: 86, heading: 85, dribbling: 84, passing: 82, vision: 84, attackingAwareness: 90, aggression: 84, composure: 87 },
      },
      {
        key: "delpiero", name: "Alessandro Del Piero", short: "Del Piero", pos: "AM", sec: ["ST", "LW"], arch: "AM", o: 89, num: 10, foot: "R", h: 173, w: 73,
        slot: "LAM",
        r: { agility: 92, balance: 90, control: 91, dribbling: 91, finishing: 89, shooting: 88, setPieces: 93, penalties: 92, longShots: 87, vision: 88, passing: 87, pace: 82, acceleration: 85, strength: 68, composure: 90 },
      },
      {
        key: "marocchi", name: "Giancarlo Marocchi", pos: "CM", sec: ["DM"], arch: "CM", o: 79, num: 11, foot: "R", h: 182, w: 77,
        r: { strength: 80, heading: 76, tackling: 78 },
      },
      {
        key: "rampulla", name: "Michelangelo Rampulla", pos: "GK", arch: "GK", o: 77, num: 12, foot: "R", h: 187, w: 84,
        gk: { gkDiving: 76, gkHandling: 77, gkPositioning: 78, gkReflexes: 76, gkKicking: 74 },
      },
      {
        key: "pessotto", name: "Gianluca Pessotto", pos: "LB", sec: ["RB", "LM"], arch: "FB", o: 82, num: 13, foot: "R", h: 176, w: 70,
        slot: "LB",
        r: { stamina: 88, crossing: 82, pace: 83, defensiveAwareness: 82, tackling: 82, passing: 80 },
      },
      {
        key: "padovano", name: "Michele Padovano", pos: "ST", arch: "ST", o: 80, num: 14, foot: "R", h: 183, w: 79,
        r: { heading: 82, strength: 82, finishing: 82 },
      },
      {
        key: "tacchinardi", name: "Alessio Tacchinardi", pos: "CM", sec: ["DM", "CB"], arch: "DM", o: 80, num: 15, foot: "R", h: 186, w: 80,
        r: { strength: 82, heading: 78, tackling: 82, passing: 78 },
      },
      {
        key: "jugovic", name: "Vladimir Jugović", pos: "CM", sec: ["AM"], arch: "CM", o: 82, num: 16, foot: "R", h: 176, w: 73,
        r: { longShots: 84, shotPower: 84, setPieces: 82, penalties: 86, passing: 84, stamina: 86 },
      },
      {
        key: "ravanelli", name: "Fabrizio Ravanelli", pos: "ST", arch: "ST", o: 85, num: 17, foot: "R", h: 185, w: 81,
        slot: "ST",
        r: { finishing: 88, shooting: 86, shotPower: 86, attackingAwareness: 88, heading: 84, pace: 83, aggression: 86, strength: 82, reactions: 88 },
      },
      {
        key: "porrini", name: "Sergio Porrini", pos: "RB", sec: ["CB"], arch: "FB", o: 78, num: 18, foot: "R", h: 179, w: 76,
        r: { tackling: 80, aggression: 80 },
      },
      {
        key: "sousa", name: "Paulo Sousa", pos: "CM", sec: ["DM", "AM"], arch: "CM", o: 84, num: 19, foot: "R", h: 177, w: 73,
        slot: "RAM",
        r: { passing: 88, longPassing: 87, vision: 87, control: 87, composure: 87, setPieces: 84, dribbling: 82, pace: 74 },
      },
      {
        key: "jarni", name: "Robert Jarni", pos: "LM", sec: ["LB"], arch: "WM", o: 81, num: 20, foot: "L", h: 178, w: 74,
        r: { pace: 86, acceleration: 85, crossing: 85, shotPower: 84, stamina: 86 },
      },
    ],
  },

  {
    teamId: "classic_milan_2004_05",
    playerPrefix: "classic_milan_0405",
    fileName: "milan200405",
    constName: "CLASSIC_MILAN_2004_05",
    displayName: "AC Milan",
    abbreviation: "MIL",
    eraLabel: "AC Milan 2004/05",
    season: "2004/05",
    manager: "Carlo Ancelotti",
    formation: "4-3-3",
    primaryColor: "#c8102e",
    secondaryColor: "#111111",
    kitShirt: "#c8102e",
    kitShorts: "#111111",
    kitSocks: "#111111",
    squad: [
      {
        key: "dida", name: "Nélson Dida", short: "Dida", pos: "GK", arch: "GK", o: 88, num: 1, foot: "R", h: 195, w: 90,
        slot: "GK",
        gk: { gkDiving: 90, gkHandling: 86, gkPositioning: 87, gkReflexes: 89, gkKicking: 80 },
        r: { reactions: 89, jumping: 88, strength: 87, composure: 86, agility: 79 },
      },
      {
        key: "cafu", name: "Cafu", short: "Cafu", pos: "RB", sec: ["RM"], arch: "FB", o: 89, num: 2, foot: "R", h: 176, w: 74,
        slot: "RB",
        r: { pace: 89, acceleration: 89, stamina: 94, crossing: 88, dribbling: 84, defending: 84, defensiveAwareness: 85, tackling: 86, attackingAwareness: 84, composure: 86 },
      },
      {
        key: "maldini", name: "Paolo Maldini", pos: "LB", sec: ["CB"], arch: "CB", o: 94, num: 3, foot: "R", h: 186, w: 85,
        slot: "LB", captain: true,
        r: { defensiveAwareness: 98, tackling: 94, defending: 96, composure: 97, reactions: 93, heading: 90, strength: 88, pace: 78, acceleration: 76, agility: 82, balance: 90, passing: 86, longPassing: 84, crossing: 82, vision: 84, aggression: 84 },
      },
      {
        key: "kaladze", name: "Kakha Kaladze", short: "Kaladze", pos: "CB", sec: ["LB"], arch: "CB", o: 80, num: 4, foot: "L", h: 187, w: 81,
        r: { heading: 82, strength: 82, pace: 76 },
      },
      {
        key: "shevchenko", name: "Andriy Shevchenko", pos: "ST", arch: "ST", o: 94, num: 7, foot: "L", h: 183, w: 79,
        slot: "ST",
        r: { pace: 92, acceleration: 92, finishing: 96, shooting: 94, shotPower: 92, longShots: 87, attackingAwareness: 95, reactions: 93, heading: 87, strength: 85, dribbling: 87, control: 88, composure: 92, penalties: 89, balance: 87 },
      },
      {
        key: "gattuso", name: "Gennaro Gattuso", pos: "DM", sec: ["CM"], arch: "DM", o: 87, num: 8, foot: "R", h: 177, w: 77,
        slot: "RCM",
        r: { aggression: 96, tackling: 92, defending: 90, defensiveAwareness: 88, stamina: 94, strength: 85, reactions: 88, passing: 78, longPassing: 72, vision: 74, control: 78, dribbling: 72, shooting: 62, finishing: 54, setPieces: 56, composure: 80 },
      },
      {
        key: "inzaghi", name: "Filippo Inzaghi", short: "Inzaghi", pos: "ST", arch: "ST", o: 87, num: 9, foot: "R", h: 181, w: 75,
        r: { attackingAwareness: 96, finishing: 90, reactions: 93, pace: 85, acceleration: 87, control: 78, dribbling: 74, passing: 68, strength: 72, heading: 82 },
      },
      {
        key: "seedorf", name: "Clarence Seedorf", pos: "CM", sec: ["AM"], arch: "CM", o: 88, num: 10, foot: "R", h: 176, w: 78,
        slot: "LCM",
        r: { shotPower: 91, longShots: 88, passing: 88, longPassing: 86, vision: 87, control: 88, dribbling: 86, strength: 84, balance: 86, stamina: 86, composure: 87, defending: 78, tackling: 78 },
      },
      {
        key: "crespo", name: "Hernán Crespo", pos: "ST", sec: ["LW"], arch: "ST", o: 89, num: 11, foot: "R", h: 184, w: 78,
        slot: "LW",
        r: { finishing: 92, shooting: 90, attackingAwareness: 92, heading: 86, reactions: 90, pace: 84, acceleration: 84, strength: 82, control: 84, penalties: 86 },
      },
      {
        key: "tomasson", name: "Jon Dahl Tomasson", pos: "ST", sec: ["AM"], arch: "ST", o: 82, num: 12, foot: "R", h: 184, w: 76,
        r: { attackingAwareness: 86, passing: 80, vision: 80, finishing: 84 },
      },
      {
        key: "nesta", name: "Alessandro Nesta", pos: "CB", arch: "CB", o: 93, num: 13, foot: "R", h: 187, w: 79,
        slot: "LCB",
        r: { defending: 96, defensiveAwareness: 97, tackling: 96, pace: 86, acceleration: 84, agility: 84, balance: 88, composure: 93, reactions: 92, heading: 88, strength: 86, jumping: 88, control: 84, passing: 82, aggression: 84 },
      },
      {
        key: "ruicosta", name: "Manuel Rui Costa", short: "Rui Costa", pos: "AM", arch: "AM", o: 85, num: 18, foot: "R", h: 180, w: 76,
        r: { passing: 89, vision: 89, longPassing: 86, control: 88, dribbling: 85, setPieces: 84, pace: 72, acceleration: 72 },
      },
      {
        key: "dhorasoo", name: "Vikash Dhorasoo", pos: "CM", sec: ["AM"], arch: "CM", o: 80, num: 20, foot: "R", h: 174, w: 68,
        r: { passing: 84, vision: 83, control: 83, pace: 72 },
      },
      {
        key: "pirlo", name: "Andrea Pirlo", pos: "DM", sec: ["CM"], arch: "DM", o: 91, num: 21, foot: "R", h: 177, w: 68,
        slot: "CM",
        r: { passing: 95, longPassing: 97, vision: 95, control: 92, setPieces: 95, penalties: 90, longShots: 90, shotPower: 88, composure: 94, crossing: 86, dribbling: 82, pace: 66, acceleration: 64, agility: 74, strength: 66, stamina: 80, aggression: 62, tackling: 72, defending: 72, defensiveAwareness: 80 },
      },
      {
        key: "kaka", name: "Ricardo Kaká", short: "Kaká", pos: "AM", sec: ["RW", "CM"], arch: "AM", o: 91, num: 22, foot: "R", h: 186, w: 82,
        slot: "RW",
        r: { pace: 91, acceleration: 92, agility: 89, balance: 88, control: 91, dribbling: 91, passing: 88, vision: 90, longPassing: 84, finishing: 87, shooting: 87, shotPower: 88, longShots: 86, attackingAwareness: 89, composure: 89, stamina: 88, strength: 78, reactions: 88 },
      },
      {
        key: "ambrosini", name: "Massimo Ambrosini", pos: "CM", sec: ["DM"], arch: "DM", o: 83, num: 23, foot: "R", h: 189, w: 79,
        r: { heading: 82, jumping: 82, strength: 82, tackling: 84, stamina: 86 },
      },
      {
        key: "serginho", name: "Serginho", short: "Serginho", pos: "LB", sec: ["LM"], arch: "FB", o: 80, num: 27, foot: "L", h: 180, w: 74,
        r: { pace: 84, crossing: 84, stamina: 86, defending: 74, defensiveAwareness: 74, tackling: 76 },
      },
      {
        key: "stam", name: "Jaap Stam", pos: "CB", arch: "CB", o: 90, num: 31, foot: "R", h: 191, w: 96,
        slot: "RCB",
        r: { strength: 96, defending: 93, defensiveAwareness: 92, tackling: 92, heading: 90, jumping: 87, aggression: 88, pace: 79, acceleration: 76, agility: 70, composure: 88, passing: 78, control: 76 },
      },
      {
        key: "abbiati", name: "Christian Abbiati", pos: "GK", arch: "GK", o: 82, num: 32, foot: "R", h: 191, w: 84,
        gk: { gkDiving: 82, gkHandling: 81, gkPositioning: 83, gkReflexes: 83, gkKicking: 78 },
      },
      {
        key: "costacurta", name: "Alessandro Costacurta", short: "Costacurta", pos: "CB", arch: "CB", o: 81, num: 41, foot: "R", h: 183, w: 78,
        r: { defensiveAwareness: 90, composure: 86, tackling: 84, pace: 66, acceleration: 64, stamina: 70 },
      },
    ],
  },

  {
    teamId: "classic_inter_2009_10",
    playerPrefix: "classic_inter_0910",
    fileName: "inter200910",
    constName: "CLASSIC_INTER_2009_10",
    displayName: "Inter Milan",
    abbreviation: "INT",
    eraLabel: "Inter Milan 2009/10",
    season: "2009/10",
    manager: "José Mourinho",
    formation: "4-2-3-1",
    primaryColor: "#0b1f8f",
    secondaryColor: "#111111",
    kitShirt: "#0b1f8f",
    kitShorts: "#111111",
    kitSocks: "#111111",
    squad: [
      {
        key: "toldo", name: "Francesco Toldo", pos: "GK", arch: "GK", o: 79, num: 1, foot: "R", h: 197, w: 92,
        gk: { gkDiving: 78, gkHandling: 79, gkPositioning: 82, gkReflexes: 77, gkKicking: 74 },
        r: { strength: 84, jumping: 78, composure: 82, agility: 64 },
      },
      {
        key: "cordoba", name: "Iván Córdoba", pos: "CB", arch: "CB", o: 79, num: 2, foot: "R", h: 173, w: 72,
        r: { pace: 82, acceleration: 82, jumping: 84, defensiveAwareness: 84, heading: 78, strength: 72 },
      },
      {
        key: "zanetti", name: "Javier Zanetti", pos: "RB", sec: ["DM", "RM"], arch: "FB", o: 88, num: 4, foot: "R", h: 178, w: 75,
        slot: "RDM", captain: true,
        r: { stamina: 97, pace: 85, acceleration: 84, defensiveAwareness: 88, tackling: 88, defending: 88, passing: 84, longPassing: 80, vision: 82, control: 84, composure: 89, reactions: 87, aggression: 82, crossing: 82 },
      },
      {
        key: "stankovic", name: "Dejan Stanković", pos: "CM", sec: ["AM"], arch: "CM", o: 83, num: 5, foot: "R", h: 181, w: 76,
        r: { longShots: 88, shotPower: 89, setPieces: 86, passing: 84, vision: 84, strength: 80 },
      },
      {
        key: "lucio", name: "Lúcio", short: "Lúcio", pos: "CB", arch: "CB", o: 88, num: 6, foot: "R", h: 188, w: 84,
        slot: "RCB",
        r: { strength: 92, heading: 88, jumping: 88, aggression: 90, tackling: 88, defending: 90, defensiveAwareness: 86, pace: 82, acceleration: 80, dribbling: 76, control: 78, passing: 78, composure: 82 },
      },
      {
        key: "quaresma", name: "Ricardo Quaresma", pos: "RW", arch: "W", o: 79, num: 7, foot: "R", h: 175, w: 72,
        r: { dribbling: 87, crossing: 85, agility: 85, setPieces: 82, composure: 70, attackingAwareness: 74 },
      },
      {
        key: "motta", name: "Thiago Motta", pos: "DM", sec: ["CM"], arch: "DM", o: 83, num: 8, foot: "R", h: 187, w: 83,
        r: { passing: 85, longPassing: 84, strength: 85, tackling: 84, composure: 83, pace: 70 },
      },
      {
        key: "etoo", name: "Samuel Eto'o", short: "Eto'o", pos: "ST", sec: ["RW", "LW"], arch: "ST", o: 90, num: 9, foot: "R", h: 180, w: 75,
        slot: "LAM",
        r: { pace: 92, acceleration: 93, agility: 87, finishing: 92, shooting: 90, attackingAwareness: 92, reactions: 91, dribbling: 86, control: 86, strength: 82, balance: 86, defending: 62, defensiveAwareness: 66, stamina: 88, composure: 88 },
      },
      {
        key: "sneijder", name: "Wesley Sneijder", pos: "AM", sec: ["CM"], arch: "AM", o: 91, num: 10, foot: "R", h: 170, w: 67,
        slot: "CAM",
        r: { passing: 93, longPassing: 91, vision: 94, control: 91, dribbling: 87, setPieces: 92, shotPower: 90, longShots: 91, shooting: 88, finishing: 84, crossing: 88, composure: 90, pace: 74, acceleration: 76, agility: 86, strength: 66, stamina: 84 },
      },
      {
        key: "juliocesar", name: "Júlio César", short: "Júlio César", pos: "GK", arch: "GK", o: 90, num: 12, foot: "R", h: 186, w: 84,
        slot: "GK",
        gk: { gkDiving: 90, gkHandling: 89, gkPositioning: 90, gkReflexes: 92, gkKicking: 82 },
        r: { reactions: 92, agility: 84, composure: 89, jumping: 84 },
      },
      {
        key: "maicon", name: "Maicon", short: "Maicon", pos: "RB", sec: ["RM"], arch: "FB", o: 88, num: 13, foot: "R", h: 184, w: 80,
        slot: "RB",
        r: { pace: 90, acceleration: 88, strength: 88, stamina: 92, shotPower: 88, longShots: 82, crossing: 86, dribbling: 82, tackling: 86, defensiveAwareness: 82, aggression: 86 },
      },
      {
        key: "muntari", name: "Sulley Muntari", pos: "CM", sec: ["LM"], arch: "CM", o: 80, num: 15, foot: "L", h: 180, w: 76,
        r: { shotPower: 90, longShots: 84, strength: 82, stamina: 85, pace: 82 },
      },
      {
        key: "cambiasso", name: "Esteban Cambiasso", pos: "DM", sec: ["CM"], arch: "DM", o: 87, num: 19, foot: "R", h: 176, w: 72,
        slot: "LDM",
        r: { defensiveAwareness: 92, tackling: 88, passing: 87, longPassing: 84, vision: 86, control: 86, stamina: 90, composure: 88, reactions: 88, attackingAwareness: 82, pace: 74 },
      },
      {
        key: "milito", name: "Diego Milito", pos: "ST", arch: "ST", o: 88, num: 22, foot: "R", h: 180, w: 78,
        slot: "ST",
        r: { finishing: 91, shooting: 89, attackingAwareness: 91, composure: 90, penalties: 90, control: 86, strength: 84, heading: 82, pace: 80, acceleration: 80, reactions: 89, passing: 80 },
      },
      {
        key: "materazzi", name: "Marco Materazzi", pos: "CB", arch: "CB", o: 80, num: 23, foot: "R", h: 193, w: 90,
        r: { strength: 90, heading: 88, aggression: 94, jumping: 84, penalties: 82, setPieces: 74, pace: 66, agility: 60 },
      },
      {
        key: "samuel", name: "Walter Samuel", pos: "CB", arch: "CB", o: 86, num: 25, foot: "R", h: 183, w: 84,
        slot: "LCB",
        r: { defending: 90, defensiveAwareness: 88, tackling: 90, strength: 90, aggression: 90, heading: 85, composure: 84, pace: 74, agility: 68 },
      },
      {
        key: "chivu", name: "Cristian Chivu", pos: "LB", sec: ["CB"], arch: "FB", o: 80, num: 26, foot: "L", h: 187, w: 79,
        slot: "LB",
        r: { heading: 80, strength: 82, setPieces: 80, tackling: 80, pace: 76 },
      },
      {
        key: "pandev", name: "Goran Pandev", pos: "AM", sec: ["LW", "ST"], arch: "AM", o: 84, num: 27, foot: "R", h: 182, w: 78,
        slot: "RAM",
        r: { finishing: 84, attackingAwareness: 86, passing: 84, vision: 84, control: 84, dribbling: 83, pace: 78 },
      },
      {
        key: "santon", name: "Davide Santon", short: "Santon", pos: "LB", arch: "FB", o: 76, num: 39, foot: "L", h: 186, w: 78,
        r: { pace: 82, stamina: 82, crossing: 76, defending: 72, defensiveAwareness: 70 },
      },
      {
        key: "balotelli", name: "Mario Balotelli", pos: "ST", sec: ["LW"], arch: "ST", o: 80, num: 45, foot: "R", h: 189, w: 85,
        r: { shotPower: 92, strength: 88, finishing: 82, pace: 84, composure: 62, aggression: 82, attackingAwareness: 76, penalties: 88 },
      },
    ],
  },

  {
    teamId: "classic_liverpool_1987_88",
    playerPrefix: "classic_liverpool_8788",
    fileName: "liverpool198788",
    constName: "CLASSIC_LIVERPOOL_1987_88",
    displayName: "Liverpool",
    abbreviation: "LIV",
    eraLabel: "Liverpool 1987/88",
    season: "1987/88",
    manager: "Kenny Dalglish",
    formation: "4-4-2",
    primaryColor: "#c8102e",
    secondaryColor: "#f6eb61",
    kitShirt: "#c8102e",
    kitShorts: "#c8102e",
    kitSocks: "#c8102e",
    squad: [
      {
        key: "grobbelaar", name: "Bruce Grobbelaar", pos: "GK", arch: "GK", o: 84, num: 1, foot: "R", h: 185, w: 82,
        slot: "GK",
        gk: { gkDiving: 85, gkHandling: 80, gkPositioning: 82, gkReflexes: 87, gkKicking: 80 },
        r: { agility: 86, reactions: 88, composure: 76, jumping: 82, dribbling: 62, control: 68 },
      },
      {
        key: "nicol", name: "Steve Nicol", pos: "RB", sec: ["CB", "CM"], arch: "FB", o: 85, num: 2, foot: "R", h: 180, w: 78,
        slot: "RB",
        r: { passing: 84, longPassing: 82, control: 84, vision: 82, tackling: 86, defensiveAwareness: 85, composure: 85, stamina: 88, shotPower: 82 },
      },
      {
        key: "ablett", name: "Gary Ablett", pos: "LB", sec: ["CB"], arch: "FB", o: 78, num: 3, foot: "L", h: 185, w: 78,
        slot: "LB",
        r: { heading: 78, strength: 80, tackling: 80, pace: 76 },
      },
      {
        key: "gillespie", name: "Gary Gillespie", pos: "CB", arch: "CB", o: 81, num: 4, foot: "R", h: 188, w: 80,
        slot: "RCB",
        r: { heading: 84, jumping: 84, passing: 78, composure: 80, pace: 74 },
      },
      {
        key: "whelan", name: "Ronnie Whelan", pos: "CM", sec: ["LM"], arch: "CM", o: 84, num: 5, foot: "L", h: 178, w: 73,
        slot: "LCM",
        r: { passing: 86, vision: 84, control: 85, stamina: 88, tackling: 80, defending: 80, longShots: 82 },
      },
      {
        key: "hansen", name: "Alan Hansen", pos: "CB", arch: "CB", o: 87, num: 6, foot: "R", h: 188, w: 81,
        slot: "LCB", captain: true,
        r: { composure: 93, defensiveAwareness: 92, defending: 90, tackling: 88, passing: 86, longPassing: 84, control: 85, vision: 84, dribbling: 80, reactions: 88, pace: 78, aggression: 74 },
      },
      {
        key: "beardsley", name: "Peter Beardsley", pos: "ST", sec: ["AM"], arch: "ST", o: 88, num: 7, foot: "R", h: 173, w: 70,
        slot: "RST",
        r: { vision: 91, passing: 89, control: 90, dribbling: 89, agility: 88, balance: 86, finishing: 85, attackingAwareness: 90, composure: 88, pace: 80, acceleration: 82, strength: 68, heading: 68, longPassing: 82 },
      },
      {
        key: "houghton", name: "Ray Houghton", pos: "RM", sec: ["CM"], arch: "WM", o: 83, num: 8, foot: "R", h: 170, w: 67,
        slot: "RM",
        r: { stamina: 90, pace: 84, acceleration: 85, crossing: 84, passing: 82, control: 82, longShots: 80 },
      },
      {
        key: "aldridge", name: "John Aldridge", pos: "ST", arch: "ST", o: 86, num: 9, foot: "R", h: 180, w: 76,
        slot: "LST",
        r: { finishing: 92, attackingAwareness: 92, reactions: 90, penalties: 92, shooting: 88, heading: 82, pace: 76, acceleration: 78, dribbling: 72, passing: 72, strength: 76 },
      },
      {
        key: "barnes", name: "John Barnes", pos: "LM", sec: ["LW"], arch: "WM", o: 92, num: 10, foot: "L", h: 180, w: 80,
        slot: "LM",
        r: { dribbling: 95, control: 93, agility: 92, balance: 93, crossing: 93, pace: 89, acceleration: 89, strength: 87, setPieces: 91, shotPower: 88, longShots: 87, finishing: 85, passing: 88, vision: 88, composure: 90, attackingAwareness: 88, stamina: 87 },
      },
      {
        key: "mcmahon", name: "Steve McMahon", pos: "CM", sec: ["DM"], arch: "CM", o: 85, num: 11, foot: "R", h: 175, w: 76,
        slot: "RCM",
        r: { aggression: 92, tackling: 88, defending: 86, defensiveAwareness: 84, shotPower: 88, longShots: 86, passing: 85, longPassing: 85, strength: 82, stamina: 88 },
      },
      {
        key: "lawrenson", name: "Mark Lawrenson", pos: "CB", sec: ["LB", "DM"], arch: "CB", o: 85, num: 12, foot: "R", h: 183, w: 78,
        r: { pace: 86, acceleration: 84, tackling: 92, defensiveAwareness: 88, agility: 82, control: 82, composure: 88 },
      },
      {
        key: "hooper", name: "Mike Hooper", pos: "GK", arch: "GK", o: 76, num: 13, foot: "R", h: 191, w: 84,
        gk: { gkDiving: 76, gkHandling: 75, gkPositioning: 74, gkReflexes: 77, gkKicking: 74 },
      },
      {
        key: "venison", name: "Barry Venison", pos: "RB", sec: ["LB"], arch: "FB", o: 78, num: 14, foot: "R", h: 178, w: 74,
        r: { stamina: 84, crossing: 78, tackling: 80 },
      },
      {
        key: "staunton", name: "Steve Staunton", pos: "LB", sec: ["LM", "CB"], arch: "FB", o: 79, num: 15, foot: "L", h: 183, w: 76,
        r: { crossing: 84, setPieces: 82, passing: 80, pace: 80 },
      },
      {
        key: "molby", name: "Jan Mølby", pos: "CM", arch: "CM", o: 84, num: 16, foot: "R", h: 183, w: 88,
        r: { passing: 91, longPassing: 93, vision: 90, setPieces: 90, penalties: 93, shotPower: 92, longShots: 88, strength: 84, pace: 58, acceleration: 56, stamina: 68, composure: 88 },
      },
      {
        key: "spackman", name: "Nigel Spackman", pos: "CM", sec: ["DM"], arch: "CM", o: 78, num: 17, foot: "R", h: 183, w: 78,
        r: { tackling: 80, stamina: 84, strength: 80 },
      },
      {
        key: "johnston", name: "Craig Johnston", short: "Johnston", pos: "RM", sec: ["RW"], arch: "WM", o: 78, num: 18, foot: "R", h: 175, w: 70,
        r: { pace: 84, dribbling: 82, crossing: 80, stamina: 84 },
      },
      {
        key: "walsh", name: "Paul Walsh", pos: "ST", arch: "ST", o: 79, num: 19, foot: "R", h: 173, w: 68,
        r: { pace: 84, acceleration: 85, dribbling: 82, finishing: 82, strength: 66 },
      },
      {
        key: "dalglish", name: "Kenny Dalglish", pos: "ST", sec: ["AM"], arch: "ST", o: 82, num: 20, foot: "R", h: 173, w: 75,
        r: { vision: 90, passing: 88, control: 90, composure: 92, attackingAwareness: 90, finishing: 86, balance: 88, strength: 80, pace: 66, acceleration: 66, stamina: 68 },
      },
    ],
  },

  {
    teamId: "classic_manutd_1998_99",
    playerPrefix: "classic_manutd_9899",
    fileName: "manutd199899",
    constName: "CLASSIC_MANUTD_1998_99",
    displayName: "Manchester United",
    abbreviation: "MUN",
    eraLabel: "Manchester United 1998/99",
    season: "1998/99",
    manager: "Alex Ferguson",
    formation: "4-4-2",
    primaryColor: "#da291c",
    secondaryColor: "#ffe500",
    kitShirt: "#da291c",
    kitShorts: "#ffffff",
    kitSocks: "#111111",
    squad: [
      {
        key: "schmeichel", name: "Peter Schmeichel", pos: "GK", arch: "GK", o: 88, num: 1, foot: "R", h: 193, w: 96,
        slot: "GK",
        gk: { gkDiving: 88, gkHandling: 87, gkPositioning: 86, gkReflexes: 91, gkKicking: 86 },
        r: { reactions: 91, strength: 92, jumping: 87, agility: 80, aggression: 84, composure: 85 },
      },
      {
        key: "gneville", name: "Gary Neville", short: "G. Neville", pos: "RB", arch: "FB", o: 84, num: 2, foot: "R", h: 180, w: 76,
        slot: "RB",
        r: { stamina: 89, crossing: 84, defensiveAwareness: 85, tackling: 84, composure: 82, pace: 80, aggression: 84 },
      },
      {
        key: "irwin", name: "Denis Irwin", short: "Irwin", pos: "LB", arch: "FB", o: 84, num: 3, foot: "L", h: 175, w: 70,
        slot: "LB",
        r: { composure: 88, crossing: 85, penalties: 88, setPieces: 82, defensiveAwareness: 85, tackling: 85, passing: 82, pace: 82 },
      },
      {
        key: "berg", name: "Henning Berg", pos: "CB", sec: ["RB"], arch: "CB", o: 81, num: 4, foot: "R", h: 183, w: 80,
        r: { pace: 80, tackling: 82, defensiveAwareness: 82 },
      },
      {
        key: "johnsen", name: "Ronny Johnsen", pos: "CB", sec: ["DM"], arch: "CB", o: 82, num: 5, foot: "R", h: 189, w: 84,
        slot: "LCB",
        r: { pace: 84, acceleration: 82, heading: 84, jumping: 86, tackling: 83, composure: 82, control: 78 },
      },
      {
        key: "stam", name: "Jaap Stam", pos: "CB", arch: "CB", o: 89, num: 6, foot: "R", h: 191, w: 94,
        slot: "RCB",
        r: { strength: 96, defending: 92, defensiveAwareness: 90, tackling: 91, heading: 89, jumping: 88, aggression: 90, pace: 82, acceleration: 80, agility: 72, composure: 86, passing: 76 },
      },
      {
        key: "beckham", name: "David Beckham", pos: "RM", sec: ["CM"], arch: "WM", o: 92, num: 7, foot: "R", h: 183, w: 75,
        slot: "RM",
        r: { crossing: 98, setPieces: 97, longPassing: 96, passing: 93, vision: 91, shotPower: 90, longShots: 91, stamina: 93, control: 87, dribbling: 79, pace: 75, acceleration: 73, agility: 76, balance: 80, finishing: 80, shooting: 84, defending: 74, defensiveAwareness: 78, tackling: 74, aggression: 82, strength: 74, composure: 87, attackingAwareness: 84 },
      },
      {
        key: "butt", name: "Nicky Butt", short: "Butt", pos: "CM", sec: ["DM"], arch: "CM", o: 81, num: 8, foot: "R", h: 178, w: 76,
        r: { tackling: 84, aggression: 84, stamina: 86, strength: 80 },
      },
      {
        key: "cole", name: "Andy Cole", pos: "ST", arch: "ST", o: 87, num: 9, foot: "R", h: 179, w: 74,
        slot: "LST",
        r: { pace: 89, acceleration: 90, finishing: 89, attackingAwareness: 89, reactions: 90, control: 84, dribbling: 83, agility: 85, strength: 74, heading: 80 },
      },
      {
        key: "sheringham", name: "Teddy Sheringham", pos: "ST", sec: ["AM"], arch: "ST", o: 84, num: 10, foot: "R", h: 185, w: 79,
        r: { vision: 88, passing: 86, heading: 86, attackingAwareness: 88, composure: 86, penalties: 88, pace: 66, acceleration: 64 },
      },
      {
        key: "giggs", name: "Ryan Giggs", pos: "LM", sec: ["LW"], arch: "WM", o: 90, num: 11, foot: "L", h: 179, w: 71,
        slot: "LM",
        r: { pace: 93, acceleration: 94, agility: 93, balance: 90, dribbling: 93, control: 90, crossing: 86, passing: 83, longPassing: 78, vision: 84, setPieces: 76, finishing: 82, shooting: 83, shotPower: 82, longShots: 80, stamina: 88, strength: 70, composure: 85, attackingAwareness: 87, heading: 66 },
      },
      {
        key: "pneville", name: "Phil Neville", short: "P. Neville", pos: "LB", sec: ["RB", "CM"], arch: "FB", o: 79, num: 12, foot: "R", h: 180, w: 75,
        r: { stamina: 86, tackling: 80, passing: 80 },
      },
      {
        key: "vandergouw", name: "Raimond van der Gouw", short: "van der Gouw", pos: "GK", arch: "GK", o: 77, num: 13, foot: "R", h: 190, w: 82,
        gk: { gkDiving: 76, gkHandling: 78, gkPositioning: 78, gkReflexes: 76, gkKicking: 76 },
      },
      {
        key: "cruyff", name: "Jordi Cruyff", short: "J. Cruyff", pos: "AM", sec: ["RW", "ST"], arch: "AM", o: 77, num: 14, foot: "R", h: 180, w: 74,
        r: { passing: 80, vision: 80, control: 80 },
      },
      {
        key: "blomqvist", name: "Jesper Blomqvist", pos: "LM", sec: ["LW"], arch: "WM", o: 79, num: 15, foot: "L", h: 178, w: 73,
        r: { pace: 84, dribbling: 82, crossing: 82 },
      },
      {
        key: "keane", name: "Roy Keane", pos: "CM", sec: ["DM"], arch: "CM", o: 92, num: 16, foot: "R", h: 178, w: 79,
        slot: "RCM", captain: true,
        r: { aggression: 97, tackling: 93, defending: 90, defensiveAwareness: 91, stamina: 95, passing: 90, longPassing: 88, vision: 89, control: 88, dribbling: 84, shotPower: 88, longShots: 85, shooting: 84, finishing: 80, strength: 86, composure: 90, reactions: 91, attackingAwareness: 86, pace: 82, acceleration: 82, heading: 80, jumping: 80 },
      },
      {
        key: "scholes", name: "Paul Scholes", pos: "CM", sec: ["AM"], arch: "CM", o: 88, num: 18, foot: "R", h: 170, w: 70,
        slot: "LCM",
        r: { passing: 92, longPassing: 92, vision: 92, control: 90, shotPower: 90, longShots: 92, shooting: 88, finishing: 85, attackingAwareness: 87, composure: 88, tackling: 70, defending: 72, aggression: 80, pace: 70, acceleration: 72, strength: 68, stamina: 84 },
      },
      {
        key: "yorke", name: "Dwight Yorke", pos: "ST", sec: ["AM"], arch: "ST", o: 88, num: 19, foot: "R", h: 180, w: 76,
        slot: "RST",
        r: { finishing: 90, shooting: 89, attackingAwareness: 91, control: 88, dribbling: 86, passing: 84, vision: 85, balance: 86, composure: 89, pace: 83, acceleration: 84, strength: 80, heading: 82 },
      },
      {
        key: "solskjaer", name: "Ole Gunnar Solskjær", short: "Solskjær", pos: "ST", sec: ["RW"], arch: "ST", o: 85, num: 20, foot: "R", h: 178, w: 73,
        r: { finishing: 92, attackingAwareness: 91, reactions: 91, composure: 89, control: 84, pace: 82, acceleration: 84, strength: 72 },
      },
      {
        key: "brown", name: "Wesley Brown", short: "Brown", pos: "CB", sec: ["RB"], arch: "CB", o: 76, num: 30, foot: "R", h: 183, w: 79,
        r: { pace: 82, acceleration: 80, tackling: 78 },
      },
    ],
  },

  {
    teamId: "classic_realmadrid_2002_03",
    playerPrefix: "classic_realmadrid_0203",
    fileName: "realMadrid200203",
    constName: "CLASSIC_REAL_MADRID_2002_03",
    displayName: "Real Madrid",
    abbreviation: "RMA",
    eraLabel: "Real Madrid Galácticos 2002/03",
    season: "2002/03",
    manager: "Vicente del Bosque",
    formation: "4-2-3-1",
    primaryColor: "#f7f7f7",
    secondaryColor: "#cba135",
    kitShirt: "#f7f7f7",
    kitShorts: "#f7f7f7",
    kitSocks: "#f7f7f7",
    squad: [
      {
        key: "casillas", name: "Iker Casillas", pos: "GK", arch: "GK", o: 88, num: 1, foot: "R", h: 185, w: 80,
        slot: "GK",
        gk: { gkDiving: 87, gkHandling: 85, gkPositioning: 86, gkReflexes: 93, gkKicking: 76 },
        r: { reactions: 93, agility: 88, composure: 86, jumping: 82 },
      },
      {
        key: "salgado", name: "Míchel Salgado", short: "Salgado", pos: "RB", arch: "FB", o: 83, num: 2, foot: "R", h: 179, w: 76,
        slot: "RB",
        r: { stamina: 88, aggression: 88, crossing: 82, tackling: 84, pace: 84 },
      },
      {
        key: "robertocarlos", name: "Roberto Carlos", short: "R. Carlos", pos: "LB", sec: ["LM"], arch: "FB", o: 91, num: 3, foot: "L", h: 168, w: 70,
        slot: "LB",
        r: { pace: 95, acceleration: 94, agility: 88, balance: 87, shotPower: 99, setPieces: 94, longShots: 90, crossing: 91, stamina: 93, strength: 86, dribbling: 84, control: 84, passing: 82, defensiveAwareness: 76, tackling: 80, defending: 80, attackingAwareness: 82, heading: 68 },
      },
      {
        key: "hierro", name: "Fernando Hierro", short: "Hierro", pos: "CB", sec: ["DM"], arch: "CB", o: 88, num: 4, foot: "R", h: 186, w: 81,
        slot: "RCB", captain: true,
        r: { heading: 90, penalties: 90, setPieces: 88, shotPower: 88, longShots: 84, longPassing: 88, passing: 85, vision: 84, defensiveAwareness: 90, tackling: 88, composure: 89, strength: 86, aggression: 88, pace: 70, acceleration: 66 },
      },
      {
        key: "zidane", name: "Zinedine Zidane", pos: "AM", sec: ["CM"], arch: "AM", o: 96, num: 5, foot: "R", h: 185, w: 80,
        slot: "CAM",
        r: { control: 99, dribbling: 96, balance: 97, agility: 92, passing: 96, longPassing: 94, vision: 97, composure: 97, shotPower: 90, longShots: 88, shooting: 88, finishing: 86, heading: 84, setPieces: 88, crossing: 86, strength: 86, stamina: 84, reactions: 92, attackingAwareness: 90, pace: 78, acceleration: 78, defending: 60, defensiveAwareness: 70, tackling: 62, aggression: 70, jumping: 78 },
      },
      {
        key: "helguera", name: "Iván Helguera", pos: "CB", sec: ["DM"], arch: "CB", o: 84, num: 6, foot: "R", h: 186, w: 80,
        slot: "LCB",
        r: { passing: 82, control: 82, longPassing: 82, tackling: 85, heading: 84, pace: 78 },
      },
      {
        key: "raul", name: "Raúl González", short: "Raúl", pos: "ST", sec: ["AM", "LW"], arch: "ST", o: 91, num: 7, foot: "L", h: 180, w: 72,
        slot: "LAM",
        r: { attackingAwareness: 95, finishing: 92, reactions: 93, composure: 92, control: 89, dribbling: 87, passing: 86, vision: 87, agility: 88, balance: 87, stamina: 90, aggression: 82, pace: 82, acceleration: 84, strength: 74, heading: 82, defensiveAwareness: 70 },
      },
      {
        key: "cambiasso", name: "Esteban Cambiasso", pos: "DM", sec: ["CM"], arch: "DM", o: 80, num: 8, foot: "R", h: 176, w: 72,
        r: { defensiveAwareness: 84, tackling: 82, passing: 82, stamina: 86 },
      },
      {
        key: "morientes", name: "Fernando Morientes", short: "Morientes", pos: "ST", arch: "ST", o: 86, num: 9, foot: "R", h: 186, w: 80,
        r: { heading: 90, jumping: 87, finishing: 88, strength: 84, attackingAwareness: 88, pace: 78 },
      },
      {
        key: "figo", name: "Luís Figo", short: "Figo", pos: "RW", sec: ["AM"], arch: "W", o: 92, num: 10, foot: "R", h: 180, w: 75,
        slot: "RAM",
        r: { dribbling: 95, control: 93, crossing: 94, passing: 90, vision: 91, longPassing: 86, agility: 90, balance: 89, setPieces: 90, shotPower: 88, longShots: 86, finishing: 84, shooting: 86, composure: 90, stamina: 88, pace: 84, acceleration: 84, strength: 80, attackingAwareness: 88, penalties: 86 },
      },
      {
        key: "ronaldo", name: "Ronaldo Nazário", short: "Ronaldo", pos: "ST", arch: "ST", o: 95, num: 11, foot: "R", h: 183, w: 82,
        slot: "ST",
        r: { pace: 94, acceleration: 96, agility: 93, balance: 92, control: 94, dribbling: 96, finishing: 97, shooting: 95, shotPower: 92, longShots: 86, attackingAwareness: 95, reactions: 95, composure: 92, strength: 88, heading: 80, passing: 80, vision: 84, penalties: 88, stamina: 80 },
      },
      {
        key: "guti", name: "José María Gutiérrez", short: "Guti", pos: "CM", sec: ["AM"], arch: "CM", o: 84, num: 14, foot: "R", h: 186, w: 76,
        slot: "LDM",
        r: { vision: 92, passing: 89, longPassing: 88, control: 88, dribbling: 85, composure: 82, finishing: 82, defending: 68, tackling: 68, stamina: 80 },
      },
      {
        key: "flavio", name: "Flávio Conceição", short: "Flávio Conceição", pos: "DM", arch: "DM", o: 79, num: 16, foot: "R", h: 176, w: 74,
        r: { tackling: 82, aggression: 84, stamina: 84 },
      },
      {
        key: "mcmanaman", name: "Steve McManaman", short: "McManaman", pos: "LM", sec: ["AM", "RM"], arch: "WM", o: 80, num: 17, foot: "R", h: 188, w: 73,
        r: { dribbling: 85, control: 84, vision: 84, passing: 83, stamina: 86, strength: 66 },
      },
      {
        key: "pavon", name: "Francisco Pavón", short: "Pavón", pos: "CB", arch: "CB", o: 78, num: 18, foot: "R", h: 185, w: 80,
        r: { heading: 80, strength: 80, tackling: 80 },
      },
      {
        key: "solari", name: "Santiago Solari", short: "Solari", pos: "LM", sec: ["LW"], arch: "WM", o: 78, num: 19, foot: "L", h: 179, w: 74,
        r: { stamina: 86, pace: 80, crossing: 80 },
      },
      {
        key: "portillo", name: "Javier Portillo", short: "Portillo", pos: "ST", arch: "ST", o: 76, num: 21, foot: "R", h: 179, w: 73,
        r: { finishing: 80, attackingAwareness: 80, pace: 80 },
      },
      {
        key: "raulbravo", name: "Raúl Bravo", short: "R. Bravo", pos: "LB", sec: ["CB"], arch: "FB", o: 76, num: 22, foot: "L", h: 180, w: 76,
        r: { tackling: 78, pace: 80 },
      },
      {
        key: "makelele", name: "Claude Makélélé", short: "Makélélé", pos: "DM", arch: "DM", o: 87, num: 24, foot: "R", h: 170, w: 69,
        slot: "RDM",
        r: { defending: 93, defensiveAwareness: 93, tackling: 94, aggression: 88, stamina: 92, reactions: 89, control: 84, passing: 84, longPassing: 78, vision: 80, composure: 86, strength: 80, pace: 82, acceleration: 82, shooting: 56, finishing: 48, longShots: 58, setPieces: 56, attackingAwareness: 68 },
      },
      {
        key: "cesar", name: "César Sánchez", short: "César", pos: "GK", arch: "GK", o: 78, num: 25, foot: "R", h: 186, w: 82,
        gk: { gkDiving: 78, gkHandling: 78, gkPositioning: 79, gkReflexes: 78, gkKicking: 74 },
      },
    ],
  },

  {
    teamId: "classic_barcelona_1993_94",
    playerPrefix: "classic_barca_9394",
    fileName: "barcelona199394",
    constName: "CLASSIC_BARCELONA_1993_94",
    displayName: "Barcelona",
    abbreviation: "BAR",
    eraLabel: "Barcelona Dream Team 1993/94",
    season: "1993/94",
    manager: "Johan Cruyff",
    formation: "4-3-3",
    primaryColor: "#a50044",
    secondaryColor: "#004d98",
    kitShirt: "#a50044",
    kitShorts: "#004d98",
    kitSocks: "#004d98",
    squad: [
      {
        key: "zubizarreta", name: "Andoni Zubizarreta", short: "Zubizarreta", pos: "GK", arch: "GK", o: 87, num: 1, foot: "R", h: 186, w: 84,
        slot: "GK", captain: true,
        gk: { gkDiving: 86, gkHandling: 88, gkPositioning: 89, gkReflexes: 86, gkKicking: 80 },
        r: { composure: 90, reactions: 88, strength: 84, agility: 78 },
      },
      {
        key: "ferrer", name: "Albert Ferrer", short: "Ferrer", pos: "RB", arch: "FB", o: 83, num: 2, foot: "R", h: 170, w: 66,
        slot: "RB",
        r: { pace: 87, acceleration: 87, stamina: 89, tackling: 84, defensiveAwareness: 84, crossing: 80, strength: 66 },
      },
      {
        key: "sergi", name: "Sergi Barjuán", short: "Sergi", pos: "LB", sec: ["LM"], arch: "FB", o: 82, num: 3, foot: "L", h: 170, w: 66,
        slot: "LB",
        r: { pace: 88, acceleration: 88, stamina: 90, crossing: 82, dribbling: 80, strength: 64 },
      },
      {
        key: "koeman", name: "Ronald Koeman", short: "Koeman", pos: "CB", sec: ["DM"], arch: "CB", o: 89, num: 4, foot: "R", h: 186, w: 78,
        slot: "RCB",
        r: { setPieces: 96, shotPower: 97, longShots: 92, penalties: 94, longPassing: 94, passing: 90, vision: 90, control: 86, shooting: 88, finishing: 80, composure: 90, heading: 84, defending: 84, defensiveAwareness: 86, tackling: 82, pace: 62, acceleration: 60, agility: 66, stamina: 74 },
      },
      {
        key: "nadal", name: "Miguel Ángel Nadal", short: "Nadal", pos: "CB", sec: ["DM"], arch: "CB", o: 82, num: 5, foot: "R", h: 183, w: 80,
        slot: "LCB",
        r: { strength: 90, aggression: 92, tackling: 86, heading: 84, jumping: 84, stamina: 84, pace: 76 },
      },
      {
        key: "guardiola", name: "Josep Guardiola", short: "Guardiola", pos: "DM", sec: ["CM"], arch: "DM", o: 84, num: 6, foot: "R", h: 180, w: 68,
        slot: "CM",
        r: { passing: 92, longPassing: 92, vision: 92, control: 89, composure: 90, defensiveAwareness: 87, setPieces: 84, dribbling: 80, pace: 66, acceleration: 64, strength: 64, tackling: 78, aggression: 74, stamina: 80 },
      },
      {
        key: "bakero", name: "José Mari Bakero", short: "Bakero", pos: "CM", sec: ["AM"], arch: "CM", o: 85, num: 7, foot: "R", h: 174, w: 72,
        slot: "RCM",
        r: { attackingAwareness: 88, heading: 84, finishing: 84, shooting: 84, aggression: 88, stamina: 88, tackling: 80, passing: 85, reactions: 87 },
      },
      {
        key: "stoichkov", name: "Hristo Stoichkov", short: "Stoichkov", pos: "LW", sec: ["ST"], arch: "W", o: 93, num: 8, foot: "L", h: 178, w: 74,
        slot: "RW",
        r: { shotPower: 94, finishing: 93, shooting: 93, longShots: 90, dribbling: 91, control: 90, pace: 89, acceleration: 90, agility: 88, aggression: 92, setPieces: 90, penalties: 90, crossing: 86, passing: 84, vision: 86, attackingAwareness: 91, composure: 87, strength: 80, stamina: 86 },
      },
      {
        key: "romario", name: "Romário de Souza", short: "Romário", pos: "ST", arch: "ST", o: 94, num: 9, foot: "R", h: 167, w: 68,
        slot: "ST",
        r: { finishing: 97, agility: 96, balance: 95, acceleration: 95, pace: 90, dribbling: 94, control: 93, attackingAwareness: 96, reactions: 95, composure: 93, shooting: 93, shotPower: 84, longShots: 76, strength: 74, heading: 70, passing: 80, vision: 84, stamina: 74, defending: 40, defensiveAwareness: 48, tackling: 38 },
      },
      {
        key: "laudrup", name: "Michael Laudrup", short: "Laudrup", pos: "AM", sec: ["RW"], arch: "AM", o: 92, num: 10, foot: "R", h: 182, w: 78,
        slot: "LCM",
        r: { vision: 97, passing: 95, control: 95, dribbling: 93, longPassing: 91, balance: 92, agility: 90, composure: 94, attackingAwareness: 90, finishing: 84, shooting: 84, crossing: 87, setPieces: 84, pace: 80, acceleration: 80, strength: 78, stamina: 82 },
      },
      {
        key: "begiristain", name: "Txiki Begiristain", short: "Begiristain", pos: "LW", sec: ["AM"], arch: "W", o: 84, num: 11, foot: "R", h: 178, w: 73,
        slot: "LW",
        r: { crossing: 88, dribbling: 85, passing: 84, vision: 84, finishing: 83, setPieces: 84, pace: 84 },
      },
      {
        key: "amor", name: "Guillermo Amor", short: "Amor", pos: "CM", sec: ["AM"], arch: "CM", o: 82, num: 12, foot: "R", h: 176, w: 70,
        r: { passing: 86, vision: 84, control: 85, stamina: 86, longShots: 80 },
      },
      {
        key: "busquets", name: "Carles Busquets", short: "C. Busquets", pos: "GK", arch: "GK", o: 76, num: 13, foot: "R", h: 183, w: 76,
        gk: { gkDiving: 74, gkHandling: 74, gkPositioning: 74, gkReflexes: 76, gkKicking: 80 },
        r: { control: 68, passing: 68, pace: 60 },
      },
      {
        key: "juancarlos", name: "Juan Carlos Rodríguez", short: "Juan Carlos", pos: "LB", sec: ["LM"], arch: "FB", o: 77, num: 14, foot: "L", h: 176, w: 72,
        r: { pace: 82, crossing: 78 },
      },
      {
        key: "eusebio", name: "Eusebio Sacristán", short: "Eusebio", pos: "CM", arch: "CM", o: 80, num: 15, foot: "R", h: 172, w: 66,
        r: { passing: 86, vision: 85, control: 85, strength: 60 },
      },
      {
        key: "goikoetxea", name: "Jon Andoni Goikoetxea", short: "Goikoetxea", pos: "RM", sec: ["RW"], arch: "WM", o: 81, num: 16, foot: "R", h: 178, w: 74,
        r: { setPieces: 84, shotPower: 84, passing: 82, stamina: 84 },
      },
      {
        key: "salinas", name: "Julio Salinas", short: "Salinas", pos: "ST", arch: "ST", o: 81, num: 17, foot: "R", h: 186, w: 82,
        r: { heading: 86, strength: 86, finishing: 83, pace: 72 },
      },
      {
        key: "estebaranz", name: "Estebaranz", short: "Estebaranz", pos: "RM", sec: ["RW"], arch: "WM", o: 77, num: 18, foot: "R", h: 177, w: 73,
        r: { pace: 82, crossing: 80, stamina: 84 },
      },
      {
        key: "ivaniglesias", name: "Iván Iglesias", short: "I. Iglesias", pos: "CM", sec: ["DM"], arch: "CM", o: 76, num: 19, foot: "R", h: 178, w: 74,
        r: { tackling: 78, stamina: 82 },
      },
      {
        key: "oscargarcia", name: "Óscar García Junyent", short: "Óscar García", pos: "AM", sec: ["ST"], arch: "AM", o: 77, num: 20, foot: "R", h: 174, w: 68,
        r: { control: 82, dribbling: 82, vision: 80 },
      },
    ],
  },

  {
    teamId: "classic_barcelona_2008_09",
    playerPrefix: "classic_barca_0809",
    fileName: "barcelona200809",
    constName: "CLASSIC_BARCELONA_2008_09",
    displayName: "Barcelona",
    abbreviation: "BAR",
    eraLabel: "Barcelona Treble 2008/09",
    season: "2008/09",
    manager: "Pep Guardiola",
    formation: "4-3-3",
    primaryColor: "#a50044",
    secondaryColor: "#004d98",
    kitShirt: "#a50044",
    kitShorts: "#004d98",
    kitSocks: "#a50044",
    squad: [
      {
        key: "valdes", name: "Víctor Valdés", short: "Valdés", pos: "GK", arch: "GK", o: 84, num: 1, foot: "R", h: 183, w: 78,
        slot: "GK",
        gk: { gkDiving: 82, gkHandling: 83, gkPositioning: 84, gkReflexes: 86, gkKicking: 82 },
        r: { reactions: 87, agility: 84, control: 72, passing: 72, composure: 80 },
      },
      {
        key: "alves", name: "Daniel Alves", short: "Alves", pos: "RB", sec: ["RM"], arch: "FB", o: 88, num: 2, foot: "R", h: 172, w: 64,
        slot: "RB",
        r: { pace: 90, acceleration: 90, agility: 89, stamina: 93, crossing: 90, dribbling: 86, control: 86, passing: 85, vision: 84, setPieces: 86, shotPower: 86, longShots: 82, defending: 80, tackling: 82, defensiveAwareness: 78, aggression: 86, strength: 70, attackingAwareness: 84 },
      },
      {
        key: "pique", name: "Gerard Piqué", short: "Piqué", pos: "CB", arch: "CB", o: 85, num: 3, foot: "R", h: 194, w: 85,
        slot: "RCB",
        r: { passing: 86, longPassing: 86, control: 85, vision: 84, heading: 88, jumping: 86, strength: 85, composure: 86, defensiveAwareness: 84, tackling: 84, pace: 78, agility: 70 },
      },
      {
        key: "marquez", name: "Rafael Márquez", short: "Márquez", pos: "CB", sec: ["DM"], arch: "CB", o: 83, num: 4, foot: "L", h: 182, w: 76,
        r: { passing: 86, longPassing: 86, control: 84, composure: 85, defensiveAwareness: 84, pace: 76 },
      },
      {
        key: "puyol", name: "Carles Puyol", short: "Puyol", pos: "CB", sec: ["RB"], arch: "CB", o: 88, num: 5, foot: "R", h: 178, w: 79,
        slot: "LCB", captain: true,
        r: { aggression: 96, defending: 92, defensiveAwareness: 92, tackling: 92, reactions: 90, stamina: 92, jumping: 88, heading: 85, strength: 85, pace: 84, acceleration: 84, composure: 87, passing: 78, control: 78, dribbling: 70 },
      },
      {
        key: "xavi", name: "Xavier Hernández", short: "Xavi", pos: "CM", arch: "CM", o: 93, num: 6, foot: "R", h: 170, w: 68,
        slot: "RCM",
        r: { passing: 98, longPassing: 93, vision: 97, control: 96, composure: 95, dribbling: 88, agility: 88, balance: 88, setPieces: 86, reactions: 90, attackingAwareness: 86, stamina: 88, shooting: 82, finishing: 78, longShots: 82, shotPower: 78, pace: 68, acceleration: 70, strength: 66, tackling: 80, defending: 78, defensiveAwareness: 84, aggression: 78, heading: 60, jumping: 60 },
      },
      {
        key: "iniesta", name: "Andrés Iniesta", short: "Iniesta", pos: "CM", sec: ["AM", "LW"], arch: "CM", o: 93, num: 8, foot: "R", h: 171, w: 68,
        slot: "LCM",
        r: { dribbling: 96, control: 97, balance: 96, agility: 94, passing: 93, vision: 94, longPassing: 86, composure: 95, reactions: 91, attackingAwareness: 88, crossing: 84, finishing: 82, shooting: 83, longShots: 82, stamina: 88, pace: 78, acceleration: 82, strength: 66, tackling: 76, defending: 74, heading: 58 },
      },
      {
        key: "etoo", name: "Samuel Eto'o", short: "Eto'o", pos: "ST", sec: ["RW"], arch: "ST", o: 90, num: 9, foot: "R", h: 180, w: 75,
        slot: "ST",
        r: { pace: 93, acceleration: 94, agility: 88, finishing: 92, shooting: 90, attackingAwareness: 92, reactions: 92, dribbling: 86, control: 86, strength: 82, balance: 86, composure: 88, stamina: 88 },
      },
      {
        key: "messi", name: "Lionel Messi", short: "Messi", pos: "RW", sec: ["AM", "ST"], arch: "W", o: 95, num: 10, foot: "L", h: 170, w: 67,
        slot: "RW",
        r: { dribbling: 99, control: 98, agility: 97, balance: 96, acceleration: 96, pace: 92, finishing: 94, shooting: 93, shotPower: 86, longShots: 87, passing: 90, vision: 92, longPassing: 82, crossing: 84, setPieces: 86, penalties: 85, attackingAwareness: 94, reactions: 94, composure: 93, stamina: 84, strength: 68, heading: 62, jumping: 66, defending: 46, defensiveAwareness: 56, tackling: 44, aggression: 58 },
      },
      {
        key: "bojan", name: "Bojan Krkić", short: "Bojan", pos: "ST", sec: ["RW"], arch: "ST", o: 78, num: 11, foot: "R", h: 170, w: 65,
        r: { finishing: 82, agility: 84, control: 82, strength: 62 },
      },
      {
        key: "pinto", name: "José Manuel Pinto", short: "Pinto", pos: "GK", arch: "GK", o: 77, num: 13, foot: "R", h: 184, w: 80,
        gk: { gkDiving: 77, gkHandling: 76, gkPositioning: 77, gkReflexes: 78, gkKicking: 76 },
      },
      {
        key: "henry", name: "Thierry Henry", short: "Henry", pos: "LW", sec: ["ST"], arch: "W", o: 89, num: 14, foot: "R", h: 188, w: 83,
        slot: "LW",
        r: { pace: 87, acceleration: 86, finishing: 90, shooting: 89, control: 90, dribbling: 89, passing: 86, vision: 88, longPassing: 80, attackingAwareness: 90, composure: 90, balance: 88, strength: 82, stamina: 80, reactions: 88, shotPower: 86, longShots: 84 },
      },
      {
        key: "keita", name: "Seydou Keita", short: "Keita", pos: "CM", sec: ["DM"], arch: "CM", o: 82, num: 15, foot: "R", h: 181, w: 76,
        r: { strength: 84, stamina: 86, tackling: 82, attackingAwareness: 82, heading: 78 },
      },
      {
        key: "sylvinho", name: "Sylvinho", short: "Sylvinho", pos: "LB", arch: "FB", o: 79, num: 16, foot: "L", h: 172, w: 71,
        r: { crossing: 82, setPieces: 80, composure: 80, pace: 78 },
      },
      {
        key: "hleb", name: "Aliaksandr Hleb", short: "Hleb", pos: "AM", sec: ["RW"], arch: "AM", o: 79, num: 19, foot: "R", h: 180, w: 72,
        r: { dribbling: 84, control: 84, vision: 82, passing: 82 },
      },
      {
        key: "gmilito", name: "Gabriel Milito", short: "G. Milito", pos: "CB", arch: "CB", o: 79, num: 20, foot: "L", h: 178, w: 74,
        r: { passing: 82, composure: 82, defensiveAwareness: 82, pace: 72 },
      },
      {
        key: "abidal", name: "Eric Abidal", short: "Abidal", pos: "LB", sec: ["CB"], arch: "FB", o: 84, num: 22, foot: "L", h: 186, w: 82,
        slot: "LB",
        r: { pace: 87, acceleration: 85, strength: 86, tackling: 85, defensiveAwareness: 82, defending: 85, heading: 80, crossing: 76, dribbling: 76 },
      },
      {
        key: "yayatoure", name: "Yaya Touré", short: "Yaya Touré", pos: "DM", sec: ["CB", "CM"], arch: "DM", o: 86, num: 24, foot: "R", h: 189, w: 90,
        slot: "CM",
        r: { strength: 94, shotPower: 90, longShots: 84, dribbling: 84, control: 85, passing: 85, longPassing: 84, tackling: 85, defensiveAwareness: 84, stamina: 88, pace: 80, acceleration: 78, composure: 85, heading: 82 },
      },
      {
        key: "pedro", name: "Pedro Rodríguez", short: "Pedro", pos: "RW", sec: ["LW", "ST"], arch: "W", o: 77, num: 27, foot: "R", h: 169, w: 64,
        r: { pace: 86, acceleration: 86, stamina: 84, attackingAwareness: 80, strength: 62 },
      },
      {
        key: "busquets", name: "Sergio Busquets", short: "Busquets", pos: "DM", arch: "DM", o: 80, num: 28, foot: "R", h: 189, w: 76,
        r: { passing: 86, longPassing: 82, vision: 84, control: 85, composure: 86, defensiveAwareness: 86, tackling: 80, pace: 64, acceleration: 62, strength: 74 },
      },
    ],
  },

  {
    teamId: "classic_barcelona_2014_15",
    playerPrefix: "classic_barca_1415",
    fileName: "barcelona201415",
    constName: "CLASSIC_BARCELONA_2014_15",
    displayName: "Barcelona",
    abbreviation: "BAR",
    eraLabel: "Barcelona Treble 2014/15",
    season: "2014/15",
    manager: "Luis Enrique",
    formation: "4-3-3",
    primaryColor: "#a50044",
    secondaryColor: "#004d98",
    kitShirt: "#a50044",
    kitShorts: "#111144",
    kitSocks: "#a50044",
    squad: [
      {
        key: "terstegen", name: "Marc-André ter Stegen", short: "ter Stegen", pos: "GK", arch: "GK", o: 84, num: 1, foot: "R", h: 187, w: 85,
        slot: "GK",
        gk: { gkDiving: 84, gkHandling: 82, gkPositioning: 83, gkReflexes: 86, gkKicking: 82 },
        r: { reactions: 87, agility: 84, control: 78, passing: 78, composure: 82 },
      },
      {
        key: "pique", name: "Gerard Piqué", short: "Piqué", pos: "CB", arch: "CB", o: 87, num: 3, foot: "R", h: 194, w: 85,
        slot: "RCB",
        r: { passing: 88, longPassing: 88, control: 86, vision: 86, heading: 89, jumping: 86, strength: 86, composure: 89, defensiveAwareness: 89, tackling: 86, defending: 88, pace: 74, agility: 68 },
      },
      {
        key: "rakitic", name: "Ivan Rakitić", short: "Rakitić", pos: "CM", sec: ["AM"], arch: "CM", o: 86, num: 4, foot: "R", h: 184, w: 78,
        slot: "RCM",
        r: { passing: 88, longPassing: 87, vision: 86, control: 86, shotPower: 86, longShots: 85, setPieces: 84, strength: 82, stamina: 88, tackling: 82, composure: 85, pace: 74 },
      },
      {
        key: "busquets", name: "Sergio Busquets", short: "Busquets", pos: "DM", arch: "DM", o: 88, num: 5, foot: "R", h: 189, w: 76,
        slot: "CM",
        r: { passing: 92, longPassing: 89, vision: 92, control: 92, composure: 94, defensiveAwareness: 94, tackling: 85, defending: 86, reactions: 89, agility: 74, pace: 62, acceleration: 60, strength: 76, stamina: 84, aggression: 74, shooting: 62, finishing: 52 },
      },
      {
        key: "xavi", name: "Xavier Hernández", short: "Xavi", pos: "CM", arch: "CM", o: 84, num: 6, foot: "R", h: 170, w: 68,
        r: { passing: 94, vision: 93, control: 92, longPassing: 88, composure: 92, pace: 58, acceleration: 58, stamina: 70, strength: 62 },
      },
      {
        key: "iniesta", name: "Andrés Iniesta", short: "Iniesta", pos: "CM", sec: ["AM"], arch: "CM", o: 89, num: 8, foot: "R", h: 171, w: 68,
        slot: "LCM", captain: true,
        r: { dribbling: 93, control: 94, balance: 93, agility: 90, passing: 91, vision: 92, composure: 93, reactions: 88, attackingAwareness: 86, longPassing: 84, stamina: 82, pace: 72, acceleration: 74, strength: 64, heading: 56 },
      },
      {
        key: "suarez", name: "Luis Suárez", short: "Suárez", pos: "ST", sec: ["RW"], arch: "ST", o: 91, num: 9, foot: "R", h: 182, w: 86,
        slot: "ST",
        r: { finishing: 93, shooting: 92, shotPower: 90, longShots: 88, dribbling: 90, control: 90, balance: 89, agility: 87, attackingAwareness: 92, reactions: 92, aggression: 92, strength: 86, heading: 86, passing: 85, vision: 87, pace: 85, acceleration: 87, stamina: 88, composure: 88 },
      },
      {
        key: "messi", name: "Lionel Messi", short: "Messi", pos: "RW", sec: ["AM", "ST"], arch: "W", o: 96, num: 10, foot: "L", h: 170, w: 72,
        slot: "RW",
        r: { dribbling: 99, control: 99, agility: 96, balance: 96, acceleration: 94, pace: 90, finishing: 96, shooting: 95, shotPower: 88, longShots: 91, passing: 94, vision: 96, longPassing: 88, crossing: 88, setPieces: 93, penalties: 88, attackingAwareness: 96, reactions: 95, composure: 96, stamina: 84, strength: 72, heading: 64, jumping: 68, defending: 44, defensiveAwareness: 58, tackling: 42, aggression: 58 },
      },
      {
        key: "neymar", name: "Neymar da Silva", short: "Neymar", pos: "LW", sec: ["ST"], arch: "W", o: 91, num: 11, foot: "R", h: 175, w: 68,
        slot: "LW",
        r: { dribbling: 96, control: 94, agility: 95, balance: 93, pace: 92, acceleration: 94, finishing: 89, shooting: 88, longShots: 84, passing: 86, vision: 87, crossing: 82, setPieces: 84, attackingAwareness: 89, reactions: 90, composure: 87, strength: 64, heading: 66, stamina: 84 },
      },
      {
        key: "rafinha", name: "Rafinha Alcántara", short: "Rafinha", pos: "CM", sec: ["AM"], arch: "CM", o: 78, num: 12, foot: "R", h: 174, w: 68,
        r: { control: 83, dribbling: 82, passing: 82, strength: 64 },
      },
      {
        key: "bravo", name: "Claudio Bravo", short: "Bravo", pos: "GK", arch: "GK", o: 84, num: 13, foot: "R", h: 184, w: 80,
        gk: { gkDiving: 82, gkHandling: 84, gkPositioning: 86, gkReflexes: 84, gkKicking: 80 },
        r: { composure: 86, reactions: 85, passing: 76 },
      },
      {
        key: "mascherano", name: "Javier Mascherano", short: "Mascherano", pos: "CB", sec: ["DM"], arch: "CB", o: 85, num: 14, foot: "R", h: 174, w: 73,
        slot: "LCB",
        r: { defensiveAwareness: 90, tackling: 90, defending: 88, aggression: 90, reactions: 88, passing: 84, longPassing: 82, control: 84, composure: 86, stamina: 88, pace: 78, acceleration: 78, strength: 78, heading: 74, jumping: 74 },
      },
      {
        key: "bartra", name: "Marc Bartra", short: "Bartra", pos: "CB", arch: "CB", o: 77, num: 15, foot: "R", h: 184, w: 76,
        r: { passing: 80, pace: 78, tackling: 78 },
      },
      {
        key: "pedro", name: "Pedro Rodríguez", short: "Pedro", pos: "RW", sec: ["LW", "ST"], arch: "W", o: 83, num: 17, foot: "R", h: 169, w: 64,
        r: { pace: 88, acceleration: 88, attackingAwareness: 86, finishing: 84, stamina: 86, strength: 64 },
      },
      {
        key: "alba", name: "Jordi Alba", short: "Alba", pos: "LB", sec: ["LM"], arch: "FB", o: 85, num: 18, foot: "L", h: 170, w: 69,
        slot: "LB",
        r: { pace: 93, acceleration: 93, agility: 88, stamina: 91, crossing: 86, passing: 84, control: 84, dribbling: 83, defending: 80, tackling: 82, defensiveAwareness: 80, strength: 66, attackingAwareness: 84 },
      },
      {
        key: "munir", name: "Munir El Haddadi", short: "Munir", pos: "ST", sec: ["LW"], arch: "ST", o: 76, num: 19, foot: "R", h: 175, w: 68,
        r: { pace: 84, finishing: 78, agility: 82 },
      },
      {
        key: "sergiroberto", name: "Sergi Roberto", short: "Sergi Roberto", pos: "CM", sec: ["RB"], arch: "CM", o: 78, num: 20, foot: "R", h: 178, w: 68,
        r: { passing: 82, stamina: 86, pace: 82, control: 81 },
      },
      {
        key: "adriano", name: "Adriano Correia", short: "Adriano", pos: "LB", sec: ["RB", "LM"], arch: "FB", o: 79, num: 21, foot: "L", h: 172, w: 72,
        r: { pace: 84, crossing: 80, shotPower: 82, stamina: 84 },
      },
      {
        key: "alves", name: "Daniel Alves", short: "Alves", pos: "RB", sec: ["RM"], arch: "FB", o: 85, num: 22, foot: "R", h: 172, w: 64,
        slot: "RB",
        r: { pace: 84, acceleration: 84, agility: 86, stamina: 89, crossing: 88, dribbling: 84, control: 85, passing: 85, vision: 85, setPieces: 84, defending: 78, tackling: 80, defensiveAwareness: 76, aggression: 86, strength: 70, attackingAwareness: 84 },
      },
      {
        key: "mathieu", name: "Jérémy Mathieu", short: "Mathieu", pos: "CB", sec: ["LB"], arch: "CB", o: 80, num: 24, foot: "L", h: 188, w: 78,
        r: { heading: 84, strength: 82, pace: 78, passing: 80 },
      },
    ],
  },

  {
    teamId: "classic_arsenal_2003_04",
    playerPrefix: "classic_arsenal_0304",
    fileName: "arsenal200304",
    constName: "CLASSIC_ARSENAL_2003_04",
    displayName: "Arsenal",
    abbreviation: "ARS",
    eraLabel: "Arsenal Invincibles 2003/04",
    season: "2003/04",
    manager: "Arsène Wenger",
    formation: "4-4-2",
    primaryColor: "#ef0107",
    secondaryColor: "#f7f7f7",
    kitShirt: "#ef0107",
    kitShorts: "#f7f7f7",
    kitSocks: "#f7f7f7",
    squad: [
      {
        key: "lehmann", name: "Jens Lehmann", short: "Lehmann", pos: "GK", arch: "GK", o: 84, num: 1, foot: "R", h: 190, w: 85,
        slot: "GK",
        gk: { gkDiving: 84, gkHandling: 82, gkPositioning: 85, gkReflexes: 86, gkKicking: 82 },
        r: { reactions: 87, aggression: 88, composure: 78, agility: 80, jumping: 82 },
      },
      {
        key: "acole", name: "Ashley Cole", short: "A. Cole", pos: "LB", arch: "FB", o: 85, num: 3, foot: "L", h: 176, w: 71,
        slot: "LB",
        r: { pace: 91, acceleration: 91, agility: 88, stamina: 92, tackling: 87, defensiveAwareness: 85, defending: 87, crossing: 82, dribbling: 82, control: 82, strength: 74 },
      },
      {
        key: "vieira", name: "Patrick Vieira", short: "Vieira", pos: "CM", sec: ["DM"], arch: "CM", o: 92, num: 4, foot: "R", h: 193, w: 84,
        slot: "RCM", captain: true,
        r: { strength: 93, tackling: 91, defending: 89, defensiveAwareness: 89, aggression: 90, passing: 89, longPassing: 87, vision: 88, control: 90, dribbling: 88, balance: 88, reactions: 90, composure: 89, stamina: 90, pace: 82, acceleration: 80, heading: 82, jumping: 82, shotPower: 84, longShots: 78, shooting: 80, finishing: 74, attackingAwareness: 82 },
      },
      {
        key: "keown", name: "Martin Keown", short: "Keown", pos: "CB", arch: "CB", o: 79, num: 5, foot: "R", h: 180, w: 76,
        r: { aggression: 92, tackling: 84, defensiveAwareness: 84, pace: 72 },
      },
      {
        key: "pires", name: "Robert Pirès", short: "Pirès", pos: "LM", sec: ["AM", "LW"], arch: "WM", o: 91, num: 7, foot: "R", h: 188, w: 77,
        slot: "LM",
        r: { control: 93, dribbling: 91, passing: 90, vision: 92, longPassing: 85, crossing: 89, finishing: 88, shooting: 87, longShots: 84, setPieces: 88, balance: 89, agility: 87, composure: 91, attackingAwareness: 90, pace: 84, acceleration: 84, strength: 74, stamina: 84, defending: 68, tackling: 68, aggression: 68 },
      },
      {
        key: "ljungberg", name: "Fredrik Ljungberg", short: "Ljungberg", pos: "RM", sec: ["AM"], arch: "WM", o: 85, num: 8, foot: "R", h: 175, w: 76,
        slot: "RM",
        r: { pace: 88, acceleration: 89, attackingAwareness: 88, finishing: 84, stamina: 89, dribbling: 85, control: 84, reactions: 86, strength: 76 },
      },
      {
        key: "reyes", name: "José Antonio Reyes", short: "Reyes", pos: "LW", sec: ["ST", "RW"], arch: "W", o: 82, num: 9, foot: "R", h: 180, w: 76,
        r: { dribbling: 87, control: 86, agility: 86, finishing: 82, pace: 85 },
      },
      {
        key: "bergkamp", name: "Dennis Bergkamp", short: "Bergkamp", pos: "ST", sec: ["AM"], arch: "ST", o: 89, num: 10, foot: "R", h: 183, w: 79,
        slot: "RST",
        r: { vision: 95, passing: 92, control: 95, dribbling: 90, composure: 93, attackingAwareness: 93, finishing: 89, shooting: 88, longShots: 82, balance: 89, agility: 85, reactions: 91, strength: 80, heading: 78, pace: 68, acceleration: 68, stamina: 74, longPassing: 86 },
      },
      {
        key: "wiltord", name: "Sylvain Wiltord", short: "Wiltord", pos: "RW", sec: ["ST"], arch: "W", o: 82, num: 11, foot: "R", h: 176, w: 74,
        r: { pace: 87, acceleration: 87, finishing: 83, dribbling: 84 },
      },
      {
        key: "lauren", name: "Lauren Bisan-Etame", short: "Lauren", pos: "RB", sec: ["RM"], arch: "FB", o: 82, num: 12, foot: "R", h: 178, w: 73,
        slot: "RB",
        r: { pace: 86, acceleration: 86, stamina: 88, tackling: 84, aggression: 84, control: 80, dribbling: 80 },
      },
      {
        key: "taylor", name: "Stuart Taylor", short: "S. Taylor", pos: "GK", arch: "GK", o: 76, num: 13, foot: "R", h: 196, w: 88,
        gk: { gkDiving: 76, gkHandling: 75, gkPositioning: 75, gkReflexes: 76, gkKicking: 76 },
        r: { strength: 82, jumping: 80 },
      },
      {
        key: "henry", name: "Thierry Henry", short: "Henry", pos: "ST", sec: ["LW"], arch: "ST", o: 96, num: 14, foot: "R", h: 188, w: 83,
        slot: "LST",
        r: { pace: 96, acceleration: 96, agility: 92, balance: 92, control: 94, dribbling: 95, finishing: 96, shooting: 95, shotPower: 92, longShots: 90, passing: 89, vision: 92, longPassing: 84, crossing: 86, setPieces: 86, penalties: 86, attackingAwareness: 95, reactions: 94, composure: 94, strength: 86, stamina: 88, heading: 74, jumping: 82, defending: 50, defensiveAwareness: 60, tackling: 48, aggression: 70 },
      },
      {
        key: "parlour", name: "Ray Parlour", short: "Parlour", pos: "CM", sec: ["RM"], arch: "CM", o: 80, num: 15, foot: "R", h: 178, w: 76,
        r: { stamina: 88, tackling: 82, aggression: 84, longShots: 80 },
      },
      {
        key: "edu", name: "Eduardo Gaspar", short: "Edu", pos: "CM", sec: ["DM"], arch: "CM", o: 82, num: 17, foot: "L", h: 183, w: 78,
        r: { passing: 85, longPassing: 84, setPieces: 82, composure: 84, tackling: 80 },
      },
      {
        key: "cygan", name: "Pascal Cygan", short: "Cygan", pos: "CB", arch: "CB", o: 77, num: 18, foot: "L", h: 191, w: 84,
        r: { heading: 82, strength: 84, pace: 70 },
      },
      {
        key: "gilberto", name: "Gilberto Silva", short: "Gilberto", pos: "DM", arch: "DM", o: 84, num: 19, foot: "R", h: 191, w: 78,
        slot: "LCM",
        r: { defensiveAwareness: 89, tackling: 87, defending: 87, reactions: 86, passing: 84, longPassing: 82, control: 82, composure: 85, heading: 82, strength: 84, stamina: 88, pace: 74 },
      },
      {
        key: "clichy", name: "Gaël Clichy", short: "Clichy", pos: "LB", arch: "FB", o: 76, num: 22, foot: "L", h: 176, w: 70,
        r: { pace: 88, acceleration: 88, stamina: 86, defending: 74, defensiveAwareness: 70 },
      },
      {
        key: "campbell", name: "Sol Campbell", short: "Campbell", pos: "CB", arch: "CB", o: 88, num: 23, foot: "R", h: 188, w: 90,
        slot: "LCB",
        r: { strength: 94, pace: 86, acceleration: 84, heading: 88, jumping: 88, defending: 91, defensiveAwareness: 89, tackling: 90, aggression: 88, composure: 86, reactions: 87, control: 76, passing: 76 },
      },
      {
        key: "kanu", name: "Nwankwo Kanu", short: "Kanu", pos: "ST", sec: ["AM"], arch: "ST", o: 81, num: 25, foot: "R", h: 197, w: 84,
        r: { control: 88, dribbling: 86, vision: 85, passing: 83, balance: 84, heading: 80, pace: 70 },
      },
      {
        key: "toure", name: "Kolo Touré", short: "Touré", pos: "CB", sec: ["RB", "DM"], arch: "CB", o: 84, num: 28, foot: "R", h: 183, w: 80,
        slot: "RCB",
        r: { pace: 88, acceleration: 86, strength: 88, tackling: 86, defending: 85, aggression: 86, stamina: 88, agility: 78, defensiveAwareness: 80, composure: 78 },
      },
    ],
  },

  {
    teamId: "classic_chelsea_2004_05",
    playerPrefix: "classic_chelsea_0405",
    fileName: "chelsea200405",
    constName: "CLASSIC_CHELSEA_2004_05",
    displayName: "Chelsea",
    abbreviation: "CHE",
    eraLabel: "Chelsea 2004/05",
    season: "2004/05",
    manager: "José Mourinho",
    formation: "4-3-3",
    primaryColor: "#034694",
    secondaryColor: "#f7f7f7",
    kitShirt: "#034694",
    kitShorts: "#034694",
    kitSocks: "#f7f7f7",
    squad: [
      {
        key: "cech", name: "Petr Čech", short: "Čech", pos: "GK", arch: "GK", o: 90, num: 1, foot: "R", h: 196, w: 90,
        slot: "GK",
        gk: { gkDiving: 90, gkHandling: 90, gkPositioning: 92, gkReflexes: 91, gkKicking: 82 },
        r: { reactions: 92, composure: 92, strength: 88, jumping: 86, agility: 80 },
      },
      {
        key: "makelele", name: "Claude Makélélé", short: "Makélélé", pos: "DM", arch: "DM", o: 89, num: 4, foot: "R", h: 170, w: 69,
        slot: "CM",
        r: { defending: 95, defensiveAwareness: 95, tackling: 95, aggression: 88, stamina: 92, reactions: 90, control: 85, passing: 85, longPassing: 78, vision: 80, composure: 88, strength: 80, pace: 80, acceleration: 80, shooting: 56, finishing: 48, longShots: 58, setPieces: 56, attackingAwareness: 68 },
      },
      {
        key: "huth", name: "Robert Huth", short: "Huth", pos: "CB", arch: "CB", o: 77, num: 5, foot: "R", h: 191, w: 88,
        r: { strength: 90, heading: 84, jumping: 82, pace: 70, agility: 60 },
      },
      {
        key: "carvalho", name: "Ricardo Carvalho", short: "Carvalho", pos: "CB", arch: "CB", o: 87, num: 6, foot: "R", h: 183, w: 78,
        slot: "RCB",
        r: { defensiveAwareness: 92, tackling: 91, defending: 90, composure: 89, reactions: 89, control: 84, passing: 82, pace: 82, acceleration: 80, agility: 82, heading: 82, strength: 80 },
      },
      {
        key: "tiago", name: "Tiago Mendes", short: "Tiago", pos: "CM", sec: ["DM"], arch: "CM", o: 82, num: 7, foot: "R", h: 180, w: 74,
        slot: "LCM",
        r: { passing: 85, longPassing: 84, stamina: 87, tackling: 82, control: 83 },
      },
      {
        key: "lampard", name: "Frank Lampard", short: "Lampard", pos: "CM", sec: ["AM"], arch: "CM", o: 92, num: 8, foot: "R", h: 184, w: 88,
        slot: "RCM",
        r: { shotPower: 94, longShots: 93, shooting: 92, finishing: 89, penalties: 93, setPieces: 88, passing: 90, longPassing: 89, vision: 89, control: 88, attackingAwareness: 93, stamina: 95, strength: 86, composure: 91, reactions: 90, heading: 80, tackling: 82, defending: 82, defensiveAwareness: 84, aggression: 84, pace: 78, acceleration: 76 },
      },
      {
        key: "kezman", name: "Mateja Kežman", short: "Kežman", pos: "ST", arch: "ST", o: 78, num: 9, foot: "R", h: 178, w: 74,
        r: { finishing: 84, pace: 84, attackingAwareness: 82, strength: 70 },
      },
      {
        key: "joecole", name: "Joseph Cole", short: "J. Cole", pos: "AM", sec: ["LW", "RW"], arch: "AM", o: 85, num: 10, foot: "R", h: 173, w: 70,
        r: { dribbling: 91, control: 90, agility: 90, balance: 89, vision: 85, passing: 84, finishing: 82, strength: 74 },
      },
      {
        key: "duff", name: "Damien Duff", short: "Duff", pos: "LW", sec: ["RW"], arch: "W", o: 87, num: 11, foot: "L", h: 173, w: 68,
        slot: "LW",
        r: { pace: 91, acceleration: 92, agility: 90, balance: 89, dribbling: 90, control: 88, crossing: 85, finishing: 83, shooting: 83, passing: 82, stamina: 87, strength: 70, attackingAwareness: 85 },
      },
      {
        key: "parker", name: "Scott Parker", short: "Parker", pos: "CM", sec: ["DM"], arch: "CM", o: 79, num: 12, foot: "R", h: 176, w: 74,
        r: { tackling: 84, aggression: 86, stamina: 86 },
      },
      {
        key: "gallas", name: "William Gallas", short: "Gallas", pos: "CB", sec: ["LB", "RB"], arch: "CB", o: 86, num: 13, foot: "R", h: 182, w: 78,
        slot: "LB",
        r: { pace: 88, acceleration: 87, agility: 84, tackling: 88, defending: 88, defensiveAwareness: 86, strength: 84, heading: 82, composure: 84, control: 80 },
      },
      {
        key: "drogba", name: "Didier Drogba", short: "Drogba", pos: "ST", arch: "ST", o: 87, num: 15, foot: "R", h: 188, w: 91,
        slot: "ST",
        r: { strength: 95, shotPower: 92, finishing: 87, shooting: 88, heading: 88, jumping: 87, pace: 87, acceleration: 86, balance: 88, control: 85, dribbling: 84, aggression: 88, attackingAwareness: 86, composure: 82, reactions: 87, longShots: 84 },
      },
      {
        key: "robben", name: "Arjen Robben", short: "Robben", pos: "RW", sec: ["LW"], arch: "W", o: 88, num: 16, foot: "L", h: 180, w: 80,
        slot: "RW",
        r: { pace: 93, acceleration: 94, agility: 92, balance: 89, dribbling: 93, control: 91, finishing: 86, shooting: 87, shotPower: 88, longShots: 85, crossing: 84, passing: 83, vision: 84, attackingAwareness: 87, composure: 85, strength: 72, stamina: 80 },
      },
      {
        key: "bridge", name: "Wayne Bridge", short: "Bridge", pos: "LB", sec: ["LM"], arch: "FB", o: 79, num: 18, foot: "L", h: 178, w: 76,
        r: { pace: 86, stamina: 87, crossing: 82 },
      },
      {
        key: "smertin", name: "Alexey Smertin", short: "Smertin", pos: "DM", sec: ["CM"], arch: "DM", o: 78, num: 19, foot: "R", h: 173, w: 66,
        r: { stamina: 86, tackling: 80, passing: 80 },
      },
      {
        key: "ferreira", name: "Paulo Ferreira", short: "Ferreira", pos: "RB", arch: "FB", o: 83, num: 20, foot: "R", h: 182, w: 76,
        slot: "RB",
        r: { pace: 85, stamina: 88, defensiveAwareness: 84, tackling: 84, composure: 82, crossing: 80 },
      },
      {
        key: "gudjohnsen", name: "Eiður Guðjohnsen", short: "Guðjohnsen", pos: "ST", sec: ["AM"], arch: "ST", o: 83, num: 22, foot: "R", h: 185, w: 82,
        r: { control: 87, vision: 85, passing: 84, finishing: 84, strength: 82, balance: 84 },
      },
      {
        key: "cudicini", name: "Carlo Cudicini", short: "Cudicini", pos: "GK", arch: "GK", o: 82, num: 23, foot: "R", h: 185, w: 80,
        gk: { gkDiving: 83, gkHandling: 81, gkPositioning: 82, gkReflexes: 84, gkKicking: 76 },
        r: { agility: 84, reactions: 85 },
      },
      {
        key: "geremi", name: "Geremi Njitap", short: "Geremi", pos: "RB", sec: ["RM", "CM"], arch: "FB", o: 79, num: 24, foot: "R", h: 179, w: 76,
        r: { setPieces: 84, crossing: 82, shotPower: 84, stamina: 84 },
      },
      {
        key: "terry", name: "John Terry", short: "Terry", pos: "CB", arch: "CB", o: 91, num: 26, foot: "R", h: 187, w: 90,
        slot: "LCB", captain: true,
        r: { defending: 94, defensiveAwareness: 95, tackling: 93, heading: 92, jumping: 88, strength: 91, aggression: 92, composure: 90, reactions: 91, passing: 80, longPassing: 78, control: 78, attackingAwareness: 76, pace: 74, acceleration: 72, agility: 70 },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Build + emit
// ---------------------------------------------------------------------------

const clamp = (n) => Math.max(1, Math.min(100, Math.round(n)));

function ratingsFor(player) {
  const arch = ARCH[player.arch];
  if (!arch) throw new Error(`Unknown archetype ${player.arch} for ${player.name}`);
  const overrides = player.r ?? {};
  for (const key of Object.keys(overrides)) {
    if (!V1_KEYS.includes(key)) throw new Error(`Unknown override "${key}" on ${player.name}`);
  }
  const out = {};
  for (const key of V1_KEYS) out[key] = clamp(overrides[key] ?? player.o + arch[key]);
  return out;
}

function gkRatingsFor(player) {
  const overrides = player.gk ?? {};
  for (const key of Object.keys(overrides)) {
    if (!GK_KEYS.includes(key)) throw new Error(`Unknown GK override "${key}" on ${player.name}`);
  }
  const out = {};
  for (const key of GK_KEYS) out[key] = clamp(overrides[key] ?? player.o + GK_ARCH[key]);
  return out;
}

function shortNameOf(player) {
  if (player.short) return player.short;
  const parts = player.name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
}

function buildTeam(team) {
  const slots = FORMATION_SLOTS[team.formation];
  if (!slots) throw new Error(`${team.teamId}: unsupported formation ${team.formation}`);

  const players = [];
  const xi = [];
  const bench = [];
  const seenIds = new Set();
  const seenNumbers = new Set();
  const seenSlots = new Set();
  let goalkeepers = 0;

  for (const player of team.squad) {
    const id = `${team.playerPrefix}_${player.key}`;
    if (seenIds.has(id)) throw new Error(`${team.teamId}: duplicate player id ${id}`);
    seenIds.add(id);
    if (seenNumbers.has(player.num)) throw new Error(`${team.teamId}: duplicate shirt number ${player.num}`);
    seenNumbers.add(player.num);
    if (!POSITIONS.has(player.pos)) throw new Error(`${team.teamId}: bad position ${player.pos} for ${player.name}`);
    for (const pos of player.sec ?? []) {
      if (!POSITIONS.has(pos)) throw new Error(`${team.teamId}: bad secondary position ${pos} for ${player.name}`);
    }
    if (player.pos === "GK") goalkeepers += 1;

    players.push({
      id,
      name: player.name,
      displayName: shortNameOf(player),
      primaryPosition: player.pos,
      secondaryPositions: player.sec,
      preferredFoot: player.foot,
      heightCm: player.h,
      weightKg: player.w,
      ratings: ratingsFor(player),
      gk: player.pos === "GK" ? gkRatingsFor(player) : undefined,
    });

    if (player.slot) {
      if (!slots.includes(player.slot)) {
        throw new Error(`${team.teamId}: slot ${player.slot} is not part of ${team.formation}`);
      }
      if (seenSlots.has(player.slot)) throw new Error(`${team.teamId}: duplicate slot ${player.slot}`);
      seenSlots.add(player.slot);
      xi.push({ id, shirtNumber: player.num, slot: player.slot, captain: player.captain === true });
    } else {
      bench.push({ id, shirtNumber: player.num });
    }
  }

  const missingSlots = slots.filter((slot) => !seenSlots.has(slot));
  if (missingSlots.length) throw new Error(`${team.teamId}: unfilled slots ${missingSlots.join(", ")}`);
  if (bench.length < 9) throw new Error(`${team.teamId}: only ${bench.length} bench players`);
  if (players.length < 20) throw new Error(`${team.teamId}: only ${players.length} players`);
  if (goalkeepers < 2) throw new Error(`${team.teamId}: only ${goalkeepers} goalkeepers`);
  if (xi.filter((row) => row.captain).length !== 1) throw new Error(`${team.teamId}: needs exactly one captain`);

  // Keep the emitted XI in formation order so the lineup reads top-down.
  xi.sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));

  return { players, xi, bench, goalkeepers };
}

function emitPlayer(player) {
  const lines = [];
  lines.push("    {");
  lines.push(`      id: ${JSON.stringify(player.id)},`);
  lines.push(`      name: ${JSON.stringify(player.name)},`);
  lines.push(`      displayName: ${JSON.stringify(player.displayName)},`);
  lines.push(`      primaryPosition: ${JSON.stringify(player.primaryPosition)},`);
  if (player.secondaryPositions?.length) {
    lines.push(`      secondaryPositions: [${player.secondaryPositions.map((p) => JSON.stringify(p)).join(", ")}],`);
  }
  lines.push(`      preferredFoot: ${JSON.stringify(player.preferredFoot)},`);
  lines.push(`      heightCm: ${player.heightCm},`);
  lines.push(`      weightKg: ${player.weightKg},`);
  for (const group of KEY_GROUPS) {
    lines.push(`      ${group.map((key) => `${key}: ${player.ratings[key]}`).join(", ")},`);
  }
  if (player.gk) {
    lines.push(`      gk: { ${GK_KEYS.map((key) => `${key}: ${player.gk[key]}`).join(", ")} },`);
  }
  lines.push("    },");
  return lines.join("\n");
}

function emitTeamFile(team, built) {
  const lines = [];
  lines.push(`import type { ClassicTeamDefinition } from "../types";`);
  lines.push("");
  lines.push(`export const ${team.constName}: ClassicTeamDefinition = {`);
  lines.push(`  teamId: ${JSON.stringify(team.teamId)},`);
  lines.push(`  lineupId: ${JSON.stringify(`${team.teamId}_xi`)},`);
  lines.push(`  playerPrefix: ${JSON.stringify(team.playerPrefix)},`);
  lines.push(`  displayName: ${JSON.stringify(team.displayName)},`);
  lines.push(`  abbreviation: ${JSON.stringify(team.abbreviation)},`);
  lines.push(`  eraLabel: ${JSON.stringify(team.eraLabel)},`);
  lines.push(`  season: ${JSON.stringify(team.season)},`);
  lines.push(`  manager: ${JSON.stringify(team.manager)},`);
  lines.push(`  formation: ${JSON.stringify(team.formation)},`);
  lines.push(`  dataVersion: ${JSON.stringify(DATA_VERSION)},`);
  lines.push(`  ratingsNote:`);
  lines.push(`    ${JSON.stringify(RATINGS_NOTE)},`);
  lines.push(`  primaryColor: ${JSON.stringify(team.primaryColor)},`);
  lines.push(`  secondaryColor: ${JSON.stringify(team.secondaryColor)},`);
  lines.push(`  kitShirt: ${JSON.stringify(team.kitShirt)},`);
  lines.push(`  kitShorts: ${JSON.stringify(team.kitShorts)},`);
  lines.push(`  kitSocks: ${JSON.stringify(team.kitSocks)},`);
  lines.push(`  stadiumId: ${JSON.stringify(STADIUM_ID)},`);
  lines.push("  players: [");
  for (const player of built.players) lines.push(emitPlayer(player));
  lines.push("  ],");
  lines.push("  xi: [");
  for (const row of built.xi) {
    const captain = row.captain ? ", captain: true" : "";
    lines.push(`    { id: ${JSON.stringify(row.id)}, shirtNumber: ${row.shirtNumber}, slot: ${JSON.stringify(row.slot)}${captain} },`);
  }
  lines.push("  ],");
  lines.push("  bench: [");
  for (const row of built.bench) {
    lines.push(`    { id: ${JSON.stringify(row.id)}, shirtNumber: ${row.shirtNumber} },`);
  }
  lines.push("  ],");
  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

function emitIndexFile(teams) {
  const lines = [];
  lines.push(`import type { ClassicTeamDefinition } from "./types";`);
  for (const team of teams) {
    lines.push(`import { ${team.constName} } from "./teams/${team.fileName}";`);
  }
  lines.push("");
  lines.push(`export * from "./types";`);
  for (const team of teams) {
    lines.push(`export { ${team.constName} } from "./teams/${team.fileName}";`);
  }
  lines.push("");
  lines.push("export const CLASSIC_TEAM_DEFINITIONS: ClassicTeamDefinition[] = [");
  for (const team of teams) lines.push(`  ${team.constName},`);
  lines.push("];");
  lines.push("");
  lines.push("export function getClassicTeamDefinitions(): ClassicTeamDefinition[] {");
  lines.push("  return CLASSIC_TEAM_DEFINITIONS;");
  lines.push("}");
  lines.push("");
  lines.push("export function getClassicTeamDefinition(teamId: string): ClassicTeamDefinition | undefined {");
  lines.push("  return CLASSIC_TEAM_DEFINITIONS.find((team) => team.teamId === teamId);");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const globalIds = new Set();
  const summary = [];

  for (const team of TEAMS) {
    const built = buildTeam(team);
    for (const player of built.players) {
      if (globalIds.has(player.id)) throw new Error(`Duplicate player id across teams: ${player.id}`);
      globalIds.add(player.id);
    }
    const file = path.join(outDir, `${team.fileName}.ts`);
    fs.writeFileSync(file, emitTeamFile(team, built));
    summary.push({
      team: `${team.displayName} ${team.season}`,
      file: path.relative(root, file),
      players: built.players.length,
      xi: built.xi.length,
      bench: built.bench.length,
      gks: built.goalkeepers,
    });
  }

  fs.writeFileSync(indexFile, emitIndexFile(TEAMS));

  const total = summary.reduce((sum, row) => sum + row.players, 0);
  console.log(`Wrote ${summary.length} classic teams (${total} players) to ${path.relative(root, outDir)}`);
  for (const row of summary) {
    console.log(
      `  ${row.file.padEnd(46)} ${String(row.players).padStart(2)} players (XI ${row.xi}, bench ${row.bench}, GK ${row.gks})  ${row.team}`,
    );
  }
  console.log(`Wrote ${path.relative(root, indexFile)}`);
}

main();
