import type { GameplayTuning } from "../gameplay/GameplayTuning";

export type TimeOfDay = "DAY" | "EVENING" | "NIGHT";
export type Weather = "SUNNY" | "MILD" | "RAINY" | "SNOWY";

export interface EnvironmentPreset {
  timeOfDay: TimeOfDay;
  weather: Weather;
  skyColor: string;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  ambientIntensity: number;
  sunIntensity: number;
  floodlightIntensity: number;
  exposure: number;
  precipitation: "none" | "rain" | "snow";
  precipDensity: number;
  pitchWetness: number;
  pitchTint: number;
  pitchRoughness: number;
  ballFrictionMultiplier: number;
  playerGripMultiplier: number;
  firstTouchExtra: number;
  /** Lateral wind drift on lofted balls (m/s²). */
  windZ: number;
  scoreboardEmissive: number;
  highContrastBall: boolean;
}

const TIME: Record<TimeOfDay, Partial<EnvironmentPreset>> = {
  DAY: {
    skyColor: "#9dceef",
    fogColor: 0xb5d8f0,
    fogNear: 170,
    fogFar: 360,
    ambientIntensity: 0.96,
    sunIntensity: 1.28,
    floodlightIntensity: 0.06,
    exposure: 1.26,
    scoreboardEmissive: 0.35,
  },
  EVENING: {
    skyColor: "#1d334c",
    fogColor: 0x1d334c,
    fogNear: 130,
    fogFar: 300,
    ambientIntensity: 0.58,
    sunIntensity: 0.32,
    floodlightIntensity: 0.52,
    exposure: 0.98,
    scoreboardEmissive: 0.7,
  },
  NIGHT: {
    skyColor: "#070b16",
    fogColor: 0x070b16,
    fogNear: 95,
    fogFar: 230,
    ambientIntensity: 0.32,
    sunIntensity: 0,
    floodlightIntensity: 0.68,
    exposure: 0.88,
    scoreboardEmissive: 0.9,
  },
};

const WEATHER: Record<Weather, Partial<EnvironmentPreset>> = {
  SUNNY: {
    precipitation: "none",
    precipDensity: 0,
    pitchWetness: 0,
    pitchTint: 0,
    pitchRoughness: 0.82,
    ballFrictionMultiplier: 1,
    playerGripMultiplier: 1,
    firstTouchExtra: 0,
    windZ: 0.15,
    highContrastBall: false,
  },
  MILD: {
    precipitation: "none",
    precipDensity: 0,
    pitchWetness: 0.08,
    pitchTint: -0.04,
    pitchRoughness: 0.86,
    ballFrictionMultiplier: 1,
    playerGripMultiplier: 1,
    firstTouchExtra: 0,
    windZ: 0.55,
    highContrastBall: false,
  },
  RAINY: {
    precipitation: "rain",
    precipDensity: 1,
    pitchWetness: 0.72,
    pitchTint: -0.18,
    pitchRoughness: 0.38,
    ballFrictionMultiplier: 0.86,
    playerGripMultiplier: 0.92,
    firstTouchExtra: 0.12,
    windZ: 1.15,
    highContrastBall: false,
    fogNear: 70,
    fogFar: 180,
  },
  SNOWY: {
    precipitation: "snow",
    precipDensity: 0.85,
    pitchWetness: 0.35,
    pitchTint: 0.22,
    pitchRoughness: 0.7,
    ballFrictionMultiplier: 0.9,
    playerGripMultiplier: 0.86,
    firstTouchExtra: 0.16,
    windZ: 0.85,
    highContrastBall: true,
    fogNear: 60,
    fogFar: 160,
  },
};

export function weatherAllowedAt(timeOfDay: TimeOfDay): Weather[] {
  if (timeOfDay === "NIGHT") return ["MILD", "RAINY", "SNOWY"];
  return ["SUNNY", "MILD", "RAINY", "SNOWY"];
}

export function clampWeatherForTime(timeOfDay: TimeOfDay, weather: Weather): Weather {
  const allowed = weatherAllowedAt(timeOfDay);
  return allowed.includes(weather) ? weather : "MILD";
}

export function resolveEnvironment(timeOfDay: TimeOfDay = "EVENING", weather: Weather = "MILD"): EnvironmentPreset {
  weather = clampWeatherForTime(timeOfDay, weather);
  const t = TIME[timeOfDay];
  const w = WEATHER[weather];
  const sky =
    weather === "RAINY"
      ? timeOfDay === "DAY"
        ? "#6b8498"
        : "#0a121c"
      : weather === "SNOWY"
        ? timeOfDay === "DAY"
          ? "#c5d4e2"
          : "#1a2433"
        : weather === "SUNNY" && timeOfDay === "DAY"
          ? "#7ec4f0"
          : (t.skyColor as string);
  const sunBoost = weather === "SUNNY" && timeOfDay === "DAY" ? 1.14 : timeOfDay === "DAY" ? 1.02 : 0.88;
  const night = timeOfDay === "NIGHT";
  return {
    timeOfDay,
    weather,
    skyColor: sky,
    fogColor: (w.fogNear ? (weather === "SNOWY" ? 0xb8c8d6 : 0x4a5a68) : t.fogColor) as number,
    fogNear: w.fogNear ?? t.fogNear ?? 110,
    fogFar: w.fogFar ?? t.fogFar ?? 260,
    ambientIntensity: (t.ambientIntensity ?? 0.55) * (weather === "RAINY" ? 0.82 : 1),
    sunIntensity: night ? 0 : (t.sunIntensity ?? 0.7) * sunBoost * (weather === "RAINY" ? 0.45 : 1),
    floodlightIntensity: t.floodlightIntensity ?? 0.8,
    exposure: t.exposure ?? 0.85,
    precipitation: w.precipitation ?? "none",
    precipDensity: w.precipDensity ?? 0,
    pitchWetness: w.pitchWetness ?? 0,
    pitchTint: w.pitchTint ?? 0,
    pitchRoughness: w.pitchRoughness ?? 0.82,
    ballFrictionMultiplier: w.ballFrictionMultiplier ?? 1,
    playerGripMultiplier: w.playerGripMultiplier ?? 1,
    firstTouchExtra: w.firstTouchExtra ?? 0,
    windZ: w.windZ ?? 0,
    scoreboardEmissive: t.scoreboardEmissive ?? 0.7,
    highContrastBall: w.highContrastBall ?? false,
  };
}

export function applyWeatherToTuning(tuning: GameplayTuning, env: EnvironmentPreset): GameplayTuning {
  const arcadeBoost = tuning.id === "ARCADE" ? 1.15 : 1;
  return {
    ...tuning,
    ballFrictionMultiplier: tuning.ballFrictionMultiplier * env.ballFrictionMultiplier,
    firstTouchErrorMultiplier: tuning.firstTouchErrorMultiplier * (1 + env.firstTouchExtra * arcadeBoost),
    maxSpeedMultiplier: tuning.maxSpeedMultiplier * (0.88 + env.playerGripMultiplier * 0.12),
    turnMultiplier: tuning.turnMultiplier * env.playerGripMultiplier,
  };
}

export function lightingFromStadiumPreset(preset: string): TimeOfDay {
  if (preset === "DAY") return "DAY";
  if (preset === "NIGHT") return "NIGHT";
  return "EVENING";
}
