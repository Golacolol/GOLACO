import * as THREE from "three";
import type { EnvironmentPreset } from "../environment/Environment";
import type { StadiumRecord } from "../../data/schema";
import { HALF_LENGTH, HALF_WIDTH } from "../constants";
import { ONE_STAND_CROWD_INSET } from "./Crowd";

export function applyLighting(scene: THREE.Scene, stadium: StadiumRecord, env: EnvironmentPreset): THREE.Group {
  scene.background = new THREE.Color(env.skyColor);
  scene.fog = new THREE.Fog(env.fogColor, env.fogNear, env.fogFar);

  const group = new THREE.Group();
  const night = env.timeOfDay === "NIGHT" || env.sunIntensity < 0.06;
  const evening = env.timeOfDay === "EVENING";
  const hemi = new THREE.HemisphereLight(0xd7ecff, 0x1d3326, env.ambientIntensity * (night ? 0.82 : 1));
  group.add(hemi);
  if (env.timeOfDay !== "DAY") {
    const pitchFill = new THREE.DirectionalLight(0xfff1d0, night ? 0.72 : 0.55);
    pitchFill.position.set(6, 88, 8);
    group.add(pitchFill);
  }
  if (!night) {
    const fill = new THREE.DirectionalLight(0xfff6ea, env.sunIntensity * (env.timeOfDay === "DAY" ? 0.4 : 0.38));
    fill.position.set(24, 18, -32);
    group.add(fill);

    const sun = new THREE.DirectionalLight(env.timeOfDay === "DAY" ? 0xfff3d6 : 0xffc48a, env.sunIntensity);
    sun.position.set(env.timeOfDay === "DAY" ? -40 : -28, env.timeOfDay === "DAY" ? 55 : 32, 28);
    sun.castShadow = env.sunIntensity > 0.25;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 220;
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.bias = -0.00018;
    sun.shadow.normalBias = 0.02;
    group.add(sun);
  }

  const flood = stadium.floodlights && env.floodlightIntensity > 0.2;
  if (flood) {
    const deluxe = stadium.standConfiguration === "deluxe";
    const intensity =
      (env.timeOfDay === "NIGHT" ? 2.05 + env.floodlightIntensity * 2.8 : 1.7 + env.floodlightIntensity * 2.4) *
      (deluxe ? 1.18 : 1);
    const beams: { pos: [number, number, number]; aim: [number, number, number]; mul?: number }[] = [
      { pos: [-62, 30, -44], aim: [-40, 0, -10] },
      { pos: [62, 30, -44], aim: [40, 0, -10] },
      { pos: [-62, 30, 44], aim: [-40, 0, 10] },
      { pos: [62, 30, 44], aim: [40, 0, 10] },
      { pos: [-70, 26, 0], aim: [-HALF_LENGTH + 4, 0, 0], mul: 1.45 },
      { pos: [70, 26, 0], aim: [HALF_LENGTH - 4, 0, 0], mul: 1.45 },
      { pos: [-58, 22, -16], aim: [-HALF_LENGTH + 8, 0, -6], mul: 1.15 },
      { pos: [-58, 22, 16], aim: [-HALF_LENGTH + 8, 0, 6], mul: 1.15 },
      { pos: [58, 22, -16], aim: [HALF_LENGTH - 8, 0, -6], mul: 1.15 },
      { pos: [58, 22, 16], aim: [HALF_LENGTH - 8, 0, 6], mul: 1.15 },
      { pos: [0, 32, -50], aim: [0, 0, -8] },
      { pos: [0, 32, 50], aim: [0, 0, 8] },
    ];
    if (deluxe) {
      beams.push(
        { pos: [-74, 36, -28], aim: [-30, 0, -8], mul: 1.35 },
        { pos: [74, 36, -28], aim: [30, 0, -8], mul: 1.35 },
        { pos: [-74, 36, 28], aim: [-30, 0, 8], mul: 1.35 },
        { pos: [74, 36, 28], aim: [30, 0, 8], mul: 1.35 },
        { pos: [0, 38, -58], aim: [0, 0, -10], mul: 1.25 },
      );
    }
    for (const c of beams) {
      const light = new THREE.SpotLight(0xfff1d0, intensity * (c.mul ?? 1), deluxe ? 230 : 200, Math.PI / 3.05, 0.46, 0.32);
      light.position.set(c.pos[0], c.pos[1], c.pos[2]);
      light.target.position.set(c.aim[0], c.aim[1], c.aim[2]);
      group.add(light);
      group.add(light.target);
    }
  } else if (stadium.standConfiguration === "one" || stadium.environment === "park") {
    // Fans / community parks: always wash the pitch a bit brighter (day included).
    addParkLighting(group, night, evening, env.timeOfDay === "DAY");
  }
  return group;
}

/** Soft community flood wash for Central Park — day boost + evening/night fill. */
function addParkLighting(group: THREE.Group, night: boolean, evening: boolean, day: boolean): void {
  const strength = night ? 1.45 : evening ? 1.05 : day ? 0.55 : 0.72;
  const standZ = -HALF_WIDTH - ONE_STAND_CROWD_INSET;
  const beams: { pos: [number, number, number]; aim: [number, number, number]; mul?: number }[] = [
    { pos: [-32, 12.2, standZ - 0.2], aim: [-18, 0, -8], mul: 1.1 },
    { pos: [32, 12.2, standZ - 0.2], aim: [18, 0, -8], mul: 1.1 },
    { pos: [-48, 14, 10], aim: [-20, 0, 4], mul: 0.85 },
    { pos: [48, 14, 10], aim: [20, 0, 4], mul: 0.85 },
    { pos: [0, 16, 36], aim: [0, 0, 8], mul: 0.7 },
  ];
  for (const c of beams) {
    const light = new THREE.SpotLight(0xffefc8, strength * (c.mul ?? 1), 130, Math.PI / 3.6, 0.55, 0.55);
    light.position.set(c.pos[0], c.pos[1], c.pos[2]);
    light.target.position.set(c.aim[0], c.aim[1], c.aim[2]);
    group.add(light);
    group.add(light.target);
  }
  const glow = new THREE.PointLight(0xffe6b0, night ? 0.72 : evening ? 0.48 : day ? 0.28 : 0.32, 80, 2);
  glow.position.set(0, 9, standZ + 2);
  group.add(glow);
  if (day || evening) {
    const fill = new THREE.HemisphereLight(0xfff6e0, 0x2a4a32, day ? 0.28 : 0.22);
    group.add(fill);
  }
}
