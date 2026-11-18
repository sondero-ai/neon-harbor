// Procedural people: a box-built humanoid with a walk cycle, shared by the player, pedestrians
// and the police. No models, no textures: vertex-coloured parts, a pivot at every joint, and a
// simple sin-driven gait that reads clearly at third-person distance.
import * as THREE from '../vendor/three.module.js';
import { MeshBuilder } from './geo.js';

const PART_CACHE = new Map();

function material(color, extra = {}) {
  const key = `${color}|${extra.roughness ?? 0.8}|${extra.metalness ?? 0}`;
  if (!PART_CACHE.has(key)) {
    PART_CACHE.set(key, new THREE.MeshStandardMaterial({ color, roughness: extra.roughness ?? 0.8, metalness: extra.metalness ?? 0.05, ...extra }));
  }
  return PART_CACHE.get(key);
}

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Builds a person facing +Z. `detailed` keeps the joints separate so the player can swing arms
 * and legs; the cheap version merges the upper body and uses two legs, which is all a pedestrian
 * at ten metres needs.
 */
export function createHumanoid(palette, detailed = false, phase = 0) {
  const group = new THREE.Group();
  const torso = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.66, 0.3), material(palette.jacket));
  body.position.y = 1.3;
  torso.add(body);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.28), material(palette.pants));
  hips.position.y = 0.98;
  torso.add(hips);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.26), material(palette.accent ?? palette.hair));
  collar.position.set(0, 1.6, 0.02);
  torso.add(collar);
  group.add(torso);

  const headPivot = new THREE.Group();
  headPivot.position.y = 1.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.3, 0.26), material(palette.skin));
  head.position.y = 0.17;
  headPivot.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.3), material(palette.hair, { roughness: 0.95 }));
  hair.position.y = 0.33;
  headPivot.add(hair);
  if (detailed) {
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.06), material(palette.hair, { roughness: 0.95 }));
    fringe.position.set(0, 0.29, 0.15);
    headPivot.add(fringe);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.02), material('#1a1520'));
    eyes.position.set(0, 0.19, 0.135);
    headPivot.add(eyes);
  }
  group.add(headPivot);

  const arms = [];
  const legs = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.36, 1.55, 0);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), material(palette.jacket));
    sleeve.position.y = -0.24;
    shoulder.add(sleeve);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.16), material(palette.skin));
    hand.position.y = -0.56;
    shoulder.add(hand);
    group.add(shoulder);
    arms.push(shoulder);

    const hip = new THREE.Group();
    hip.position.set(side * 0.15, 0.98, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.82, 0.22), material(palette.pants));
    leg.position.y = -0.4;
    hip.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.13, 0.34), material(palette.shoes));
    shoe.position.set(0, -0.86, 0.06);
    hip.add(shoe);
    group.add(hip);
    legs.push(hip);
  }

  const rig = {
    group, torso, head: headPivot, hair,
    leftArm: arms[0], rightArm: arms[1],
    leftLeg: legs[0], rightLeg: legs[1],
    phase: phase ?? 0,
    bobBase: 0,
  };
  group.userData.rig = rig;
  return rig;
}

/**
 * Advances the walk cycle: legs alternate, arms counter-swing, the torso bobs and leans into the
 * run, and an airborne pose tucks the legs. `speed` is metres per second.
 */
export function animateHumanoid(rig, dt, speed, elapsed, airborne = false) {
  const run = Math.min(1, Math.max(0, (speed - 0.2) / 8));
  rig.phase += dt * (2.2 + speed * 1.15);
  const swing = run * 0.82 + (speed > 0.2 ? 0.1 : 0);
  const s = Math.sin(rig.phase);
  if (airborne) {
    rig.leftLeg.rotation.x = -0.55;
    rig.rightLeg.rotation.x = 0.35;
    rig.leftArm.rotation.x = -1.1;
    rig.rightArm.rotation.x = -0.7;
  } else {
    rig.leftLeg.rotation.x = s * swing;
    rig.rightLeg.rotation.x = -s * swing;
    rig.leftArm.rotation.x = -s * swing * 0.85;
    rig.rightArm.rotation.x = s * swing * 0.85;
  }
  rig.torso.rotation.x = run * 0.12;
  rig.torso.position.y = Math.abs(Math.cos(rig.phase)) * 0.035 * run;
  rig.head.rotation.y = Math.sin(elapsed * 0.7 + rig.phase * 0.1) * 0.12;
  rig.armSwing = swing;
}

/**
 * A cheaper pedestrian: the upper body (torso, arms, head, hair) merged into one vertex-coloured
 * mesh, with two animated legs. Three draw calls per person instead of seven.
 */
export function createPedestrian(palette, phase = 0) {
  const group = new THREE.Group();
  const builder = new MeshBuilder();
  builder.box(0, 0.98, 0, 0.46, 0.22, 0.28, palette.pants);
  builder.box(0, 1.3, 0, 0.54, 0.62, 0.3, palette.jacket);
  builder.box(0, 1.6, 0.02, 0.4, 0.08, 0.26, palette.accent ?? palette.hair);
  builder.box(0, 1.77, 0, 0.27, 0.3, 0.26, palette.skin);
  builder.box(0, 1.94, 0, 0.3, 0.13, 0.3, palette.hair);
  for (const side of [-1, 1]) {
    builder.box(side * 0.36, 1.32, 0, 0.15, 0.52, 0.17, palette.jacket);
    builder.box(side * 0.36, 1.02, 0, 0.13, 0.15, 0.15, palette.skin);
  }
  const body = new THREE.Mesh(builder.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.03 }));
  group.add(body);
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.14, 0.96, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 0.21), material(palette.pants));
    leg.position.y = -0.4;
    hip.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.32), material(palette.shoes));
    shoe.position.set(0, -0.84, 0.05);
    hip.add(shoe);
    group.add(hip);
    legs.push(hip);
  }
  return { group, body, head: null, leftLeg: legs[0], rightLeg: legs[1], phase };
}

/** Leg swing and a small body bob for the cheap pedestrians. */
export function animatePedestrian(rig, dt, speed) {
  rig.phase += dt * (2 + speed * 1.6);
  const swing = Math.min(1, speed / 6) * 0.7;
  const s = Math.sin(rig.phase);
  rig.leftLeg.rotation.x = s * swing;
  rig.rightLeg.rotation.x = -s * swing;
  rig.body.position.y = Math.abs(Math.cos(rig.phase)) * 0.03 * Math.min(1, speed);
}

