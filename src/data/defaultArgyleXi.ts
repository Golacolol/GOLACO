import type { PositionCode } from "./schema";

export interface DefaultArgyleStarter {
  id: string;
  shirtNumber: number;
  displayPosition: PositionCode;
  name: string;
  slot: string;
  tacticalRole: "GK" | "WIDE_DEFENDER" | "CB" | "MID" | "ST";
}

/** User-configured default Plymouth Argyle XI. Keep these starters/numbers; expand depth around them. */
export const DEFAULT_ARGYLE_XI: DefaultArgyleStarter[] = [
  { id: "player_arg_cooper", shirtNumber: 1, displayPosition: "GK", name: "M. Cooper", slot: "GK", tacticalRole: "GK" },
  { id: "player_arg_sorinola", shirtNumber: 29, displayPosition: "LB", name: "M. Sorinola", slot: "LB", tacticalRole: "WIDE_DEFENDER" },
  { id: "player_arg_pleguezuelo", shirtNumber: 5, displayPosition: "CB", name: "J. Pleguezuelo", slot: "LCB", tacticalRole: "CB" },
  { id: "player_arg_mitchell", shirtNumber: 15, displayPosition: "CB", name: "A. Mitchell", slot: "RCB", tacticalRole: "CB" },
  { id: "player_arg_edwards", shirtNumber: 8, displayPosition: "RB", name: "J. Edwards", slot: "RB", tacticalRole: "WIDE_DEFENDER" },
  { id: "player_arg_watts", shirtNumber: 17, displayPosition: "LM", name: "C. Watts", slot: "LM", tacticalRole: "MID" },
  { id: "player_arg_white", shirtNumber: 7, displayPosition: "CM", name: "H. White", slot: "LCM", tacticalRole: "MID" },
  { id: "player_arg_ibrahim", shirtNumber: 23, displayPosition: "CM", name: "B. Ibrahim", slot: "RCM", tacticalRole: "MID" },
  { id: "player_arg_curtis", shirtNumber: 11, displayPosition: "RM", name: "R. Curtis", slot: "RM", tacticalRole: "MID" },
  { id: "player_arg_people", shirtNumber: 27, displayPosition: "ST", name: "B. Pepple", slot: "LST", tacticalRole: "ST" },
  { id: "player_arg_evans", shirtNumber: 9, displayPosition: "ST", name: "W. Evans", slot: "RST", tacticalRole: "ST" },
];

export const DEFAULT_ARGYLE_FORMATION = "4-4-2-W";
