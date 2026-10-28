import * as THREE from "three";
import { GOAL_DEPTH, GOAL_HEIGHT, GOAL_WIDTH, HALF_LENGTH } from "../constants";

export function createGoals(): THREE.Group {
  const group = new THREE.Group();
  group.add(makeGoal(-HALF_LENGTH), makeGoal(HALF_LENGTH));
  return group;
}

function makeGoal(x: number): THREE.Group {
  const g = new THREE.Group();
  const dir = x < 0 ? 1 : -1;
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.35, metalness: 0.08 });
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, GOAL_HEIGHT, 10);
  const left = new THREE.Mesh(postGeo, white);
  left.position.set(x, GOAL_HEIGHT / 2, -GOAL_WIDTH / 2);
  const right = left.clone();
  right.position.z = GOAL_WIDTH / 2;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GOAL_WIDTH, 10), white);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(x, GOAL_HEIGHT, 0);
  g.add(left, right, bar);

  const netMat = new THREE.MeshStandardMaterial({
    color: 0xe8eee8,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_WIDTH, GOAL_HEIGHT), netMat);
  back.position.set(x - dir * GOAL_DEPTH, GOAL_HEIGHT / 2, 0);
  back.rotation.y = Math.PI / 2 * (dir > 0 ? 0 : 0);
  if (x < 0) back.rotation.y = Math.PI / 2;
  else back.rotation.y = -Math.PI / 2;
  g.add(back);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_WIDTH), netMat);
  top.rotation.x = Math.PI / 2;
  top.position.set(x - dir * GOAL_DEPTH / 2, GOAL_HEIGHT, 0);
  g.add(top);
  const sideGeo = new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HEIGHT);
  const s1 = new THREE.Mesh(sideGeo, netMat);
  s1.position.set(x - dir * GOAL_DEPTH / 2, GOAL_HEIGHT / 2, -GOAL_WIDTH / 2);
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
