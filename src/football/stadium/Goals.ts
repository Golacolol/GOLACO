import * as THREE from "three";
import { GOAL_DEPTH, GOAL_HEIGHT, GOAL_WIDTH, HALF_LENGTH } from "../constants";

/** Post radius — centres sit on the painted goal-line midline. */
const POST_R = 0.06;

/** Goals sit on this pitch's goal lines (defaults to the FIFA half-length). */
export function createGoals(halfLength = HALF_LENGTH): THREE.Group {
  const group = new THREE.Group();
  const hl = Math.max(40, halfLength);
  group.add(makeGoal(-hl), makeGoal(hl));
  return group;
}

function makeGoal(lineX: number): THREE.Group {
  const g = new THREE.Group();
  // dir points from goal mouth into the pitch.
  const dir = lineX < 0 ? 1 : -1;
  // Post centres on the goal-line paint (0.12m wide) so the posts straddle it —
  // pitch face at the inner edge, outer face at the outer edge. No air gap.
  const mouthX = lineX;

  const white = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.35, metalness: 0.08 });
  const postGeo = new THREE.CylinderGeometry(POST_R, POST_R, GOAL_HEIGHT, 10);
  const left = new THREE.Mesh(postGeo, white);
  left.name = "goal-post";
  left.position.set(mouthX, GOAL_HEIGHT / 2, -GOAL_WIDTH / 2);
  const right = left.clone();
  right.position.z = GOAL_WIDTH / 2;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(POST_R, POST_R, GOAL_WIDTH, 10), white);
  bar.name = "goal-bar";
  bar.rotation.x = Math.PI / 2;
  bar.position.set(mouthX, GOAL_HEIGHT, 0);
  g.add(left, right, bar);

  const netMat = new THREE.MeshStandardMaterial({
    color: 0xe8eee8,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  // Net mouth flush with posts; depth extends behind the goal line.
  const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_WIDTH, GOAL_HEIGHT), netMat);
  back.position.set(mouthX - dir * GOAL_DEPTH, GOAL_HEIGHT / 2, 0);
  back.rotation.y = lineX < 0 ? Math.PI / 2 : -Math.PI / 2;
  g.add(back);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_WIDTH), netMat);
  top.rotation.x = Math.PI / 2;
  top.position.set(mouthX - dir * (GOAL_DEPTH / 2), GOAL_HEIGHT, 0);
  g.add(top);
  const sideGeo = new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HEIGHT);
  const s1 = new THREE.Mesh(sideGeo, netMat);
  s1.position.set(mouthX - dir * (GOAL_DEPTH / 2), GOAL_HEIGHT / 2, -GOAL_WIDTH / 2);
  const s2 = s1.clone();
  s2.position.z = GOAL_WIDTH / 2;
  g.add(s1, s2);

  const netLines = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.PlaneGeometry(GOAL_WIDTH, GOAL_HEIGHT, 8, 5)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 }),
  );
  netLines.position.copy(back.position);
  netLines.rotation.copy(back.rotation);
  g.add(netLines);
  return g;
}
