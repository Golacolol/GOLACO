import { HUD_CARD_FADE_SECONDS, HUD_CARD_RAISE_SECONDS } from "../constants";

export const HUD_CARD_RAISE_MS = HUD_CARD_RAISE_SECONDS * 1000;
export const HUD_CARD_FADE_MS = HUD_CARD_FADE_SECONDS * 1000;

export function hudSheetShowing(until: number, now: number): boolean {
  return until > 0 && now < until + HUD_CARD_FADE_MS;
}

export function hudSheetFading(until: number, now: number): boolean {
  return until > 0 && now >= until && now < until + HUD_CARD_FADE_MS;
}
