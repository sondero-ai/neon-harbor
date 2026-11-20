// The Harbor PD: a five-star wanted director with cruiser pursuit, PIT-style
// ramming, sidearm fire, foot officers at high heat, roadblocks, a search phase
// when the player breaks line of sight, and the busted/wasted handshake with
// main.js. Units are ordinary vehicles with a 'police' driver, so they obey the
// same arcade physics and collisions as the player's car.

import * as THREE from '../vendor/three.module.js';
import { POLICE, ROADS, WORLD } from './config.js';
import { makeRng } from './random.js';
import { canvasTexture, makeGlowSprite } from './geo.js';

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

const CRUISERS_PER_STAR = [0, 1, 1, 2, 3, 4];
const _vec = new THREE.Vector3();
const _forward = new THREE.Vector3();

function nearestRoad(value) {
  let best = ROADS[0];
  let bestDistance = Infinity;
  for (const road of ROADS) {
    const distance = Math.abs(value - road);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = road;
    }
  }
  return best;
}

function nearestNode(x, z) {
  const roadX = nearestRoad(x);
  const roadZ = nearestRoad(z);
  return { x: roadX, z: roadZ, i: ROADS.indexOf(roadX), j: ROADS.indexOf(roadZ) };
}

// Breadth-first route over the 7x7 intersection grid. Fifty nodes: cheap enough
// to rebuild for every cruiser twice a second and guaranteed to follow asphalt.
function roadRoute(fromX, fromZ, toX, toZ) {
  const size = ROADS.length;
  const start = nearestNode(fromX, fromZ);
  const goal = nearestNode(toX, toZ);
  if (start.i === goal.i && start.j === goal.j) return [{ x: goal.x, z: goal.z }];
  const total = size * size;
  const previous = new Int16Array(total).fill(-1);
  const seen = new Uint8Array(total);
  const queue = [start.i + start.j * size];
  const startIndex = queue[0];
  seen[startIndex] = 1;
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const i = index % size;
    const j = Math.floor(index / size);
    if (i === goal.i && j === goal.j) break;
    const neighbors = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]];
    for (const [ni, nj] of neighbors) {
      if (ni < 0 || ni >= size || nj < 0 || nj >= size) continue;
      const next = ni + nj * size;
      if (seen[next]) continue;
      seen[next] = 1;
      previous[next] = index;
      queue.push(next);
    }
  }
  const goalIndex = goal.i + goal.j * size;
  if (!seen[goalIndex]) return [{ x: goal.x, z: goal.z }];
  const path = [];
  let cursor = goalIndex;
  while (cursor !== -1 && cursor !== startIndex) {
    const i = cursor % size;
    const j = Math.floor(cursor / size);
    path.push({ x: ROADS[i], z: ROADS[j] });
    cursor = previous[cursor];
  }
  path.reverse();
  return path;
}

function raySphere(origin, direction, cx, cy, cz, radius) {
  const ox = origin.x - cx;
  const oy = origin.y - cy;
  const oz = origin.z - cz;
  const b = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t = -b - root;
  if (t < 0.05) {
    const t2 = -b + root;
    return t2 > 0.05 ? t2 : null;
  }
  return t;
}

function rayLocalBox(origin, direction, yaw, px, pz, halfWidth, halfLength, minY, maxY) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const dx = origin.x - px;
  const dz = origin.z - pz;
  const ox = dx * cos - dz * sin;
  const oz = dx * sin + dz * cos;
  const oy = origin.y;
  const vx = direction.x * cos - direction.z * sin;
  const vz = direction.x * sin + direction.z * cos;
  const vy = direction.y;
  let tMin = 0.05;
  let tMax = 1e6;
  const slabs = [
    [ox, vx, -halfWidth, halfWidth],
    [oy, vy, minY, maxY],
    [oz, vz, -halfLength, halfLength],
  ];
  for (const [start, velocity, min, max] of slabs) {
    if (Math.abs(velocity) < 1e-8) {
      if (start < min || start > max) return null;
      continue;
    }
    let t1 = (min - start) / velocity;
    let t2 = (max - start) / velocity;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }
  return tMin;
}

// ---------------------------------------------------------------- officer

let officerMaterials = null;
function getOfficerMaterials() {
  if (officerMaterials) return officerMaterials;
  officerMaterials = {
    navy: new THREE.MeshStandardMaterial({ color: 0x1c2a45, roughness: 0.8, metalness: 0.08 }),
    navyDark: new THREE.MeshStandardMaterial({ color: 0x131d31, roughness: 0.85 }),
    vest: new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.75, metalness: 0.12 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xa77456, roughness: 0.82 }),
    skinB: new THREE.MeshStandardMaterial({ color: 0x6f4835, roughness: 0.82 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x111a2c, roughness: 0.7 }),
    badge: new THREE.MeshStandardMaterial({ color: 0xffc95c, roughness: 0.3, metalness: 0.7, emissive: 0x4a3005 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x2d2b36, roughness: 0.35, metalness: 0.7 }),
  };
  return officerMaterials;
}

class Officer {
  constructor(scene, world, x, z, rng) {
    this.scene = scene;
    this.world = world;
    this.x = x;
    this.z = z;
    this.y = world.groundHeightAt(x, z);
    this.yaw = rng.range(0, Math.PI * 2);
    this.health = 100;
    this.speed = 0;
    this.phase = rng.range(0, Math.PI * 2);
    this.shootTimer = rng.range(0.5, 1.6);
    this.losTimer = rng.range(0, 0.3);
    this.los = false;
    this.dead = false;
    this.deadTimer = 0;
    this.removed = false;
    this.build(getOfficerMaterials(), rng);
    this.applyTransform();
  }

  build(materials, rng) {
    this.group = new THREE.Group();
    this.group.name = 'harbor-pd-officer';
    const skin = rng.chance(0.5) ? materials.skin : materials.skinB;
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.24), materials.navyDark);
    hips.position.y = 0.92;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 0.3), materials.navy);
    torso.position.y = 1.28;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.34), materials.vest);
    vest.position.y = 1.32;
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.32), materials.navyDark);
    collar.position.y = 1.58;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skin);
    head.position.y = 1.74;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.19, 0.13, 10), materials.cap);
    cap.position.y = 1.9;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.035, 0.14), materials.cap);
    brim.position.set(0, 1.85, 0.14);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.02), materials.badge);
    badge.position.set(-0.15, 1.44, 0.165);
    this.group.add(hips, torso, vest, collar, head, cap, brim, badge);

    // Both arms are held in a low ready position; the right hand carries the
    // sidearm so the silhouette says "police" at a glance.
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.56, 0.17), materials.navyDark);
      arm.position.set(side * 0.31, 1.32, 0.12);
      arm.rotation.x = -0.72;
      arm.rotation.z = side * -0.12;
      this.group.add(arm);
    }
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.26), materials.gun);
    this.gun.position.set(0.31, 1.26, 0.62);
    this.group.add(this.gun);

    this.legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, 0.9, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.84, 0.19), materials.navyDark);
      leg.position.y = -0.42;
      pivot.add(leg);
      this.group.add(pivot);
      this.legs.push(pivot);
    }
    this.group.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.scene.add(this.group);
  }

  get muzzle() {
    return {
      x: this.x + Math.sin(this.yaw) * 0.66,
      y: this.y + 1.33,
      z: this.z + Math.cos(this.yaw) * 0.66,
    };
  }

  applyTransform() {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
  }

  update(dt, player, police) {
    if (this.removed) return;
    if (this.dead) {
      this.deadTimer -= dt;
      this.group.rotation.z = damp(this.group.rotation.z, Math.PI / 2, 7, dt);
      this.group.position.y = damp(this.group.position.y, this.y - 0.28, 3.5, dt);
      if (this.deadTimer <= 0) this.remove();
      return;
    }
    const dx = player.position.x - this.x;
    const dz = player.position.z - this.z;
    const distance = Math.hypot(dx, dz);
    const targetYaw = Math.atan2(dx, dz);
    this.yaw += Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw)) * (1 - Math.exp(-10 * dt));

    let move = 0;
    if (!police.down && distance > 3.2) {
      const speed = distance > 16 ? 4.6 : 3.3;
      move = 1;
      this.phase += dt * (5.4 + speed * 0.7);
      const step = speed * dt;
      const nx = this.x + (dx / Math.max(0.001, distance)) * step;
      const nz = this.z + (dz / Math.max(0.001, distance)) * step;
      if (!this.world.collides(nx, this.z, 0.38)) this.x = nx;
      if (!this.world.collides(this.x, nz, 0.38)) this.z = nz;
    } else if (!police.down && distance < 12) {
      // Hold the perimeter but keep shuffling so they are not statues.
      this.phase += dt * 3.2;
      move = 0.35;
    }

    this.legs[0].rotation.x = Math.sin(this.phase) * 0.58 * move;
    this.legs[1].rotation.x = Math.sin(this.phase + Math.PI) * 0.58 * move;
    this.y = damp(this.y, this.world.groundHeightAt(this.x, this.z), 16, dt);
    this.speed = move * (distance > 16 ? 4.6 : 3.3);
    this.applyTransform();
  }

  remove() {
    this.removed = true;
    this.scene.remove(this.group);
  }
}

// ---------------------------------------------------------------- air unit

let heliMaterials = null;
let heliDecalTexture = null;

function getHeliMaterials() {
  if (heliMaterials) return heliMaterials;
  heliMaterials = {
    navy: new THREE.MeshStandardMaterial({ color: 0x1b2434, roughness: 0.46, metalness: 0.38 }),
    navyDark: new THREE.MeshStandardMaterial({ color: 0x0f1520, roughness: 0.6, metalness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe7dfd1, roughness: 0.5, metalness: 0.2 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xff6f61, roughness: 0.45, metalness: 0.25 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x18384a,
      roughness: 0.16,
      metalness: 0.62,
      transparent: true,
      opacity: 0.84,
    }),
    metal: new THREE.MeshStandardMaterial({ color: 0x363b46, roughness: 0.38, metalness: 0.72 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c2, toneMapped: false }),
    red: new THREE.MeshBasicMaterial({ color: 0xff3b2c, toneMapped: false }),
    blue: new THREE.MeshBasicMaterial({ color: 0x4a78ff, toneMapped: false }),
  };
  return heliMaterials;
}

function getHeliDecalTexture() {
  if (heliDecalTexture) return heliDecalTexture;
  heliDecalTexture = canvasTexture(512, 128, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ff6f61';
    ctx.fillRect(0, 82, width, 10);
    ctx.fillStyle = '#f7e8d2';
    ctx.font = '700 43px Bahnschrift, Arial Narrow, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('HARBOR PD', 24, 58);
    ctx.fillStyle = '#3fe0cf';
    ctx.font = '900 53px Bahnschrift, Arial Narrow, sans-serif';
    ctx.fillText('AIR 1', 338, 61);
    ctx.font = '700 23px Bahnschrift, Arial Narrow, sans-serif';
    ctx.fillStyle = 'rgba(247,232,210,0.72)';
    ctx.fillText('SEARCHLIGHT', 338, 104);
  });
  return heliDecalTexture;
}

/**
 * The high-heat Harbor PD helicopter. It orbits the pursuit, keeps its
 * searchlight on the player's last known position and settles into a fixed
 * pose for deterministic screenshots. The rotor is a pair of blades plus a
 * translucent disc, so it reads as spinning in a still frame.
 */
class Helicopter {
  constructor(scene, world, options = {}) {
    this.scene = scene;
    this.world = world;
    this.time = 0;
    this.staged = options.staged === true;
    this.orbit = options.orbit ?? this.randomOrbit();
    this.radius = options.radius ?? 44;
    this.altitude = options.altitude ?? 27;
    this.aim = new THREE.Vector3(options.targetX ?? 0, 0, options.targetZ ?? 0);
    this.position = new THREE.Vector3(options.x ?? 0, this.altitude, options.z ?? 0);
    this.searchlightOn = options.searchlight !== false;
    this.yaw = 0;
    this.bank = 0;

    const materials = getHeliMaterials();
    this.group = new THREE.Group();
    this.group.name = 'harbor-pd-air-1';
    this.group.rotation.order = 'YXZ';
    this.airframe = new THREE.Group();
    this.airframe.rotation.x = -0.08;
    this.group.add(this.airframe);
    scene.add(this.group);

    // Fuselage, glazed nose and the tail boom.
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.55, 3.5), materials.navy);
    body.position.z = 0.35;
    const belly = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 2.7), materials.navyDark);
    belly.position.set(0, -0.68, 0.45);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.1, 1.15), materials.navy);
    nose.position.set(0, -0.06, 2.42);
    const noseChin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.7), materials.navyDark);
    noseChin.position.set(0, -0.52, 2.55);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.72, 0.55), materials.glass);
    windshield.position.set(0, 0.28, 2.22);
    windshield.rotation.x = -0.42;
    const sideGlassLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 1.0), materials.glass);
    sideGlassLeft.position.set(0.93, 0.25, 1.55);
    const sideGlassRight = sideGlassLeft.clone();
    sideGlassRight.position.x = -0.93;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 3.5), materials.navy);
    tail.position.set(0, 0.1, -2.7);
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.25, 0.85), materials.navyDark);
    tailFin.position.set(0, 0.62, -4.2);
    tailFin.rotation.x = -0.28;
    const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.09, 0.48), materials.navyDark);
    stabilizer.position.set(0, 0.18, -3.7);
    this.airframe.add(body, belly, nose, noseChin, windshield, sideGlassLeft, sideGlassRight, tail, tailFin, stabilizer);

    // White door panel, coral stripe and the hull lettering.
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.86, 1.2), materials.white);
      door.position.set(side * 0.94, -0.05, 0.6);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 2.3), materials.stripe);
      stripe.position.set(side * 0.945, -0.35, 0.25);
      this.airframe.add(door, stripe);
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(1.55, 0.39),
        new THREE.MeshBasicMaterial({
          map: getHeliDecalTexture(),
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
      );
      decal.position.set(side * 0.965, 0.09, 0.55);
      decal.rotation.y = side * Math.PI / 2;
      this.airframe.add(decal);
    }

    // Skids and struts.
    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, 3.4), materials.metal);
      skid.position.set(side * 0.78, -1.22, 0.45);
      skid.rotation.x = 0.03;
      this.airframe.add(skid);
      for (const z of [-0.65, 1.05]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.1), materials.metal);
        strut.position.set(side * 0.62, -0.92, z);
        strut.rotation.z = side * 0.28;
        this.airframe.add(strut);
      }
    }

    // Main rotor: mast, two blades that actually turn, and a faint disc.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.45, 8), materials.metal);
    mast.position.y = 1.02;
    this.airframe.add(mast);
    this.rotor = new THREE.Group();
    this.rotor.position.y = 1.23;
    for (const spin of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.055, 0.24), materials.navyDark);
      blade.rotation.y = spin;
      this.rotor.add(blade);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.27), materials.stripe);
      tip.position.x = Math.cos(spin) * 4.3;
      tip.position.z = -Math.sin(spin) * 4.3;
      tip.rotation.y = spin;
      this.rotor.add(tip);
    }
    const blur = new THREE.Mesh(
      new THREE.CircleGeometry(4.5, 28),
      new THREE.MeshBasicMaterial({
        color: 0xd8e4ee,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    blur.rotation.x = -Math.PI / 2;
    blur.position.y = 0.01;
    this.rotor.add(blur);
    this.airframe.add(this.rotor);

    // Tail rotor on the left fin.
    this.tailRotor = new THREE.Group();
    this.tailRotor.position.set(0.32, 0.62, -4.2);
    for (const spin of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.45, 0.16), materials.navyDark);
      blade.rotation.x = spin;
      this.tailRotor.add(blade);
    }
    this.airframe.add(this.tailRotor);

    // Searchlight housing and the red/blue belly beacons.
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.38, 10), materials.metal);
    housing.position.set(0, -0.74, 2.2);
    housing.rotation.x = Math.PI / 2;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.27, 12), materials.lamp);
    lens.position.set(0, -0.74, 2.4);
    this.airframe.add(housing, lens);
    this.beaconRed = makeGlowSprite(0xff3b2c, 1.7, 0.8);
    this.beaconRed.position.set(-0.35, -0.88, 0.2);
    this.beaconBlue = makeGlowSprite(0x4a78ff, 1.7, 0.8);
    this.beaconBlue.position.set(0.35, -0.88, 0.2);
    this.airframe.add(this.beaconRed, this.beaconBlue);

    this.airframe.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = false;
      }
    });

    // The searchlight is a separate world-space rig: a cone from the aircraft
    // to the ground plus a soft pool, so it stays aimed while the body banks.
    this.beamGroup = new THREE.Group();
    this.beamGroup.name = 'air-unit-searchlight';
    const beamGeometry = new THREE.ConeGeometry(3.2, 1, 20, 1, true);
    beamGeometry.translate(0, -0.5, 0);
    this.beam = new THREE.Mesh(
      beamGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffe6a2,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      }),
    );
    this.beamGroup.add(this.beam);
    this.groundGlow = makeGlowSprite(0xffe8a8, 10, 0.34);
    scene.add(this.beamGroup, this.groundGlow);

    this.spot = new THREE.SpotLight(0xfff0c4, 30, 110, 0.18, 0.55, 1.1);
    this.spot.castShadow = false;
    this.spotTarget = new THREE.Object3D();
    scene.add(this.spot, this.spotTarget);
    this.spot.target = this.spotTarget;

    this.aimAt(options.targetX ?? this.position.x, options.targetZ ?? this.position.z);
    this.place();
  }

  randomOrbit() {
    return Math.random() * Math.PI * 2;
  }

  stage(x, z, height, targetX, targetZ) {
    this.staged = true;
    this.position.set(x, height, z);
    this.altitude = height;
    this.aimAt(targetX, targetZ);
    this.place();
    this.updateRig(1 / 60, targetX, targetZ, true);
  }

  aimAt(x, z) {
    this.aim.set(x, this.world.groundHeightAt(x, z), z);
  }

  place() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.group.rotation.z = this.bank;
  }

  update(dt, focusX, focusZ) {
    this.time += dt;
    if (!this.staged) {
      this.orbit += dt * 0.2;
      const targetX = focusX + Math.cos(this.orbit) * this.radius;
      const targetZ = focusZ + Math.sin(this.orbit) * this.radius;
      this.position.x = damp(this.position.x, targetX, 1.7, dt);
      this.position.z = damp(this.position.z, targetZ, 1.7, dt);
      this.position.y = damp(this.position.y, this.altitude + Math.sin(this.time * 0.74) * 1.2, 2.2, dt);
      this.aimAt(focusX, focusZ);
      const forwardX = -Math.sin(this.orbit);
      const forwardZ = Math.cos(this.orbit);
      this.yaw = dampAngle(this.yaw, Math.atan2(forwardX, forwardZ), 2.4, dt);
      this.bank = damp(this.bank, 0.16 + Math.sin(this.orbit * 0.7) * 0.05, 1.4, dt);
    } else {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.aim.x - this.position.x, this.aim.z - this.position.z), 3.2, dt);
      this.bank = damp(this.bank, 0.04, 2, dt);
    }
    this.updateRig(dt, focusX, focusZ, false);
  }

  updateRig(dt, focusX, focusZ, immediate) {
    this.rotor.rotation.y += dt * 31;
    this.tailRotor.rotation.x += dt * 44;
    const blink = Math.sin(this.time * 8) > 0;
    if (this.beaconRed?.material) this.beaconRed.material.opacity = blink ? 0.95 : 0.15;
    if (this.beaconBlue?.material) this.beaconBlue.material.opacity = blink ? 0.15 : 0.95;

    if (!this.staged && Number.isFinite(focusX) && Number.isFinite(focusZ)) {
      this.aimAt(focusX, focusZ);
    }
    const groundY = this.aim.y;
    const dx = this.aim.x - this.position.x;
    const dy = groundY - this.position.y;
    const dz = this.aim.z - this.position.z;
    const length = Math.max(4, Math.hypot(dx, dy, dz));
    this.beamGroup.position.copy(this.position);
    this.beamGroup.scale.set(1, length, 1);
    this.beamGroup.quaternion.setFromUnitVectors(
      _down,
      _beamDirection.set(dx / length, dy / length, dz / length),
    );
    this.groundGlow.position.set(this.aim.x, groundY + 0.06, this.aim.z);
    this.groundGlow.scale.setScalar(immediate ? 7 : 6 + Math.sin(this.time * 2.4) * 0.8);
    this.beam.visible = this.searchlightOn;
    this.groundGlow.visible = this.searchlightOn;
    this.spot.visible = this.searchlightOn;
    if (this.world.daylight) {
      this.beam.material.opacity = 0.055;
      this.groundGlow.material.opacity = 0.16;
      this.spot.intensity = 16;
    } else {
      this.beam.material.opacity = 0.14;
      this.groundGlow.material.opacity = 0.34;
      this.spot.intensity = 52;
    }
    this.spot.position.copy(this.position);
    this.spotTarget.position.set(this.aim.x, groundY + 0.2, this.aim.z);
    this.place();
  }

  dispose() {
    this.scene.remove(this.group, this.beamGroup, this.groundGlow, this.spot, this.spotTarget);
    this.group.traverse((object) => {
      if (object.isMesh && object.geometry) object.geometry.dispose();
      if (object.isMesh && object.material && object.material !== getHeliMaterials().navy) {
        // Shared liveries are kept; per-instance decal/beam materials go.
        if (object.material.map === heliDecalTexture || object.material.blending === THREE.AdditiveBlending) {
          object.material.dispose();
        }
      }
    });
    this.beam.geometry.dispose();
    this.beam.material.dispose();
    this.groundGlow.material.dispose();
    if (this.beaconRed?.material) this.beaconRed.material.dispose();
    if (this.beaconBlue?.material) this.beaconBlue.material.dispose();
    this.spot.dispose?.();
  }
}

const _down = new THREE.Vector3(0, -1, 0);
const _beamDirection = new THREE.Vector3();

function dampAngle(current, target, lambda, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
}

// ---------------------------------------------------------------- police

export class Police {
  constructor(scene, world, vehicles, player, traffic, effects, audio, options = {}) {
    this.scene = scene;
    this.world = world;
    this.vehicles = vehicles;
    this.player = player;
    this.traffic = traffic;
    this.effects = effects;
    this.audio = audio;
    this.onDown = options.onDown ?? null;
    this.rng = makeRng(0x9c0ffee);
    this.time = 0;
    this.wanted = 0;
    this.status = 'patrol';
    this.units = [];
    this.officers = [];
    this.unitSpawnTimer = 0;
    this.roadblockTimer = 18;
    this.roadblock = null;
    this.lastSeen = -99;
    this.lastKnown = new THREE.Vector3();
    this.searchTimer = 0;
    this.decayTimer = 0;
    this.wantedFlash = 0;
    this.bustTimer = 0;
    this.down = null;
    this.notice = null;
    this.staged = false;
    this.sightTimer = 0;
    this.playerVisible = false;
    this.sirenLevel = 0;
    this.sirenClock = 0;
    this.ramFlash = 0;
    this.helicopter = null;
    this.airStaged = false;
  }

  // ---------------------------------------------------------------- public

  notify(title, sub = '') {
    this.notice = { title, sub, life: 3.0 };
  }

  consumeNotice() {
    const notice = this.notice;
    this.notice = null;
    return notice;
  }

  addWanted(amount = 1, reason = '') {
    if (this.down) return;
    const next = clamp(this.wanted + amount, 0, 5);
    if (next === this.wanted) return;
    this.wanted = next;
    this.wantedFlash = 1;
    this.lastSeen = this.time;
    this.lastKnown.copy(this.player.position);
    this.status = 'pursuit';
    this.searchTimer = 0;
    this.decayTimer = 0;
    if (reason) this.notify(reason, `WANTED LEVEL ${this.wanted}`);
  }

  setWanted(stars, { silent = false } = {}) {
    this.wanted = clamp(Math.round(stars), 0, 5);
    this.wantedFlash = 1;
    this.lastSeen = this.time;
    this.lastKnown.copy(this.player.position);
    this.status = this.wanted > 0 ? 'pursuit' : 'patrol';
    this.searchTimer = 0;
    this.decayTimer = 0;
    if (this.wanted === 0) this.clearUnits();
    if (this.wanted < POLICE.airFromStars) this.clearAirUnit();
    if (!silent && this.wanted > 0) this.notify('Harbor PD Alert', `WANTED LEVEL ${this.wanted}`);
  }

  clearWanted({ quiet = false } = {}) {
    const had = this.wanted;
    this.wanted = 0;
    this.status = 'patrol';
    this.bustTimer = 0;
    this.searchTimer = 0;
    this.decayTimer = 0;
    this.clearUnits();
    this.clearOfficers();
    this.clearAirUnit();
    this.roadblock = null;
    if (had > 0 && !quiet) this.notify('Heat Lost', 'HARBOR PD STOOD DOWN');
  }

  reportGunfire(x, z) {
    if (this.down) return;
    this.lastKnown.set(x, 0, z);
    if (this.wanted === 0) {
      let near = false;
      for (const unit of this.units) if (!unit.car?.removed && unit.car.position.distanceTo(this.player.position) < 90) near = true;
      for (const officer of this.officers) if (!officer.dead && Math.hypot(officer.x - x, officer.z - z) < 70) near = true;
      if (near) this.addWanted(1, 'Gunfire Reported');
    } else {
      this.lastSeen = this.time;
      this.lastKnown.set(x, 0, z);
      this.status = 'pursuit';
      this.decayTimer = 0;
    }
  }

  reportCarTheft() {
    this.addWanted(2, 'Police Cruiser Stolen');
  }

  /** Called by player when a hitscan shot lands. Also used by effects-free tests. */
  applyPlayerHit(target, damage, { weapon = 'pistol', suppressHeat = false } = {}) {
    if (!target) return;
    if (target.officer) {
      const officer = target.officer;
      if (officer.dead) return;
      const amount = damage * (target.headshot ? 1.75 : 1);
      officer.health -= amount;
      this.lastSeen = this.time;
      this.lastKnown.copy(this.player.position);
      if (officer.health <= 0) {
        officer.dead = true;
        officer.deadTimer = 6;
        this.addWanted(2, 'Officer Down');
        if (this.effects) this.effects.impact(target.point, null, 'metal');
        if (this.audio) this.audio.impact(1.2);
      } else {
        if (!suppressHeat) this.addWanted(1);
        if (this.effects) this.effects.impact(target.point, null, 'metal');
      }
      return;
    }
    if (target.unit) {
      const unit = target.unit;
      if (!unit.car || unit.car.removed) return;
      unit.health -= damage;
      unit.car.applyDamage(damage * 0.42);
      this.lastSeen = this.time;
      this.lastKnown.copy(this.player.position);
      if (this.effects) this.effects.impact(target.point, null, 'metal');
      if (this.audio) this.audio.impact(0.7);
      if (unit.health <= 0) this.destroyUnit(unit);
      else if (!suppressHeat) this.addWanted(1);
      return;
    }
    if (target.vehicle) {
      target.vehicle.applyDamage(damage * 0.55);
      if (this.effects) this.effects.impact(target.point, null, 'metal');
      if (this.audio) this.audio.impact(0.5);
    }
  }

  /** Nearest solid thing the player's ray can hit, limited by the world hit. */
  traceShot(origin, direction, maxDistance) {
    let best = null;
    for (const officer of this.officers) {
      if (officer.dead || officer.removed) continue;
      const chest = raySphere(origin, direction, officer.x, officer.y + 1.16, officer.z, 0.48);
      const head = raySphere(origin, direction, officer.x, officer.y + 1.72, officer.z, 0.25);
      let distance = null;
      let headshot = false;
      if (head !== null && (chest === null || head <= chest)) {
        distance = head;
        headshot = true;
      } else if (chest !== null) {
        distance = chest;
      }
      if (distance === null || distance > maxDistance) continue;
      if (!best || distance < best.distance) {
        best = {
          type: 'officer',
          officer,
          headshot,
          distance,
          point: new THREE.Vector3(origin.x + direction.x * distance, origin.y + direction.y * distance, origin.z + direction.z * distance),
        };
      }
    }
    for (const vehicle of this.vehicles.list) {
      if (vehicle.removed) continue;
      const halfWidth = vehicle.halfWidth + 0.08;
      const halfLength = vehicle.halfLength + 0.06;
      const distance = rayLocalBox(origin, direction, vehicle.yaw, vehicle.position.x, vehicle.position.z, halfWidth, halfLength, vehicle.position.y + 0.22, vehicle.position.y + 1.72);
      if (distance === null || distance > maxDistance) continue;
      if (best && distance >= best.distance) continue;
      const unit = this.units.find((entry) => entry.car === vehicle) ?? null;
      best = {
        type: unit ? 'unit' : 'vehicle',
        unit,
        vehicle,
        distance,
        point: new THREE.Vector3(origin.x + direction.x * distance, origin.y + direction.y * distance, origin.z + direction.z * distance),
      };
    }
    return best;
  }

  // ---------------------------------------------------------------- stage

  stageChase(spec, playerCar) {
    this.clearUnits();
    this.clearOfficers();
    this.clearAirUnit();
    this.airStaged = false;
    this.staged = true;
    this.wanted = clamp(spec.wanted ?? 4, 0, 5);
    this.status = 'pursuit';
    this.lastSeen = this.time;
    this.lastKnown.copy(playerCar.position);
    this.wantedFlash = 0.4;
    for (const entry of spec.units ?? []) {
      const unit = this.spawnCruiserAt(entry.x, entry.z, entry.yaw, entry.mode ?? 'pursue');
      if (!unit) continue;
      const speed = entry.speed ?? 0;
      unit.car.velocity.set(Math.sin(entry.yaw) * speed, 0, Math.cos(entry.yaw) * speed);
      unit.car.controls.throttle = entry.throttle ?? 0;
      unit.car.controls.brake = entry.mode === 'block' ? 1 : 0;
      unit.car.controls.handbrake = entry.mode === 'block';
      unit.car.controls.steer = 0;
      unit.shootTimer = entry.shootTimer ?? 1.1;
      unit.health = entry.health ?? 130;
    }
    for (const entry of spec.officers ?? []) {
      const officer = this.spawnOfficerAt(entry.x, entry.z, entry.yaw ?? 0);
      if (officer) {
        officer.shootTimer = entry.shootTimer ?? officer.shootTimer;
        officer.losTimer = 0;
      }
    }
    if (spec.air) this.stageAirUnit(spec.air);
  }

  stageAirUnit(spec = {}) {
    this.clearAirUnit();
    this.staged = true;
    const x = Number.isFinite(spec.x) ? spec.x : this.player.position.x - 24;
    const z = Number.isFinite(spec.z) ? spec.z : this.player.position.z + 18;
    const height = Number.isFinite(spec.height) ? spec.height : 23;
    const targetX = Number.isFinite(spec.targetX) ? spec.targetX : this.player.position.x;
    const targetZ = Number.isFinite(spec.targetZ) ? spec.targetZ : this.player.position.z;
    this.helicopter = new Helicopter(this.scene, this.world, {
      staged: true,
      x,
      z,
      altitude: height,
      targetX,
      targetZ,
      searchlight: spec.searchlight !== false,
    });
    this.helicopter.stage(x, z, height, targetX, targetZ);
    this.airStaged = true;
  }

  spawnAirUnit() {
    if (this.helicopter) return;
    const orbit = this.rng.range(0, Math.PI * 2);
    const radius = 46;
    this.helicopter = new Helicopter(this.scene, this.world, {
      orbit,
      radius,
      altitude: 28,
      x: this.player.position.x + Math.cos(orbit) * radius,
      z: this.player.position.z + Math.sin(orbit) * radius,
      targetX: this.player.position.x,
      targetZ: this.player.position.z,
    });
    this.airStaged = false;
    this.notify('Air Unit Inbound', 'HARBOR PD AIR 1 · SEARCHLIGHT');
  }

  clearAirUnit() {
    if (!this.helicopter) return;
    this.helicopter.dispose();
    this.helicopter = null;
  }

  updateAirUnit(dt) {
    if (!this.staged) {
      if (this.wanted >= POLICE.airFromStars && !this.down && !this.helicopter) this.spawnAirUnit();
      if (this.wanted < POLICE.airFromStars && this.helicopter && !this.airStaged) this.clearAirUnit();
    }
    if (!this.helicopter) return;
    const focus = this.status === 'search' && !this.playerVisible ? this.lastKnown : this.player.position;
    this.helicopter.update(dt, focus.x, focus.z);
  }

  stageRoadblock(entries) {
    for (const entry of entries ?? []) {
      const unit = this.spawnCruiserAt(entry.x, entry.z, entry.yaw, 'block');
      if (unit) {
        unit.car.controls.brake = 1;
        unit.car.controls.handbrake = true;
      }
    }
  }

  // ---------------------------------------------------------------- spawning

  spawnCruiserAt(x, z, yaw, mode = 'pursue') {
    const car = this.vehicles.spawn('police', { x, z, yaw, color: 0x1d2029 });
    car.setDriver('police');
    car.ai = { police: true };
    car.controls.throttle = 0;
    car.controls.brake = 1;
    const unit = {
      car,
      mode,
      health: 130,
      maxHealth: 130,
      shootTimer: this.rng.range(0.8, 2.0),
      ramCooldown: 0,
      stuckTimer: 0,
      reverseTimer: 0,
      dismountTimer: 1.2,
      deployed: false,
      path: null,
      pathTimer: this.rng.range(0, 0.6),
      age: 0,
      distanceTimer: 0,
    };
    this.units.push(unit);
    if (this.effects) this.effects.registerVehicle(car);
    return unit;
  }

  spawnOfficerAt(x, z, yaw = 0) {
    if (this.officers.filter((officer) => !officer.removed).length >= POLICE.maxOfficers + 4) return null;
    const officer = new Officer(this.scene, this.world, x, z, this.rng);
    officer.yaw = yaw;
    officer.applyTransform();
    this.officers.push(officer);
    return officer;
  }

  findSpawnNode() {
    const px = this.player.position.x;
    const pz = this.player.position.z;
    let best = null;
    let bestScore = -Infinity;
    for (const roadX of ROADS) {
      for (const roadZ of ROADS) {
        const distance = Math.hypot(roadX - px, roadZ - pz);
        if (distance < 62 || distance > 165) continue;
        if (this.units.some((unit) => unit.car && !unit.car.removed && Math.hypot(unit.car.position.x - roadX, unit.car.position.z - roadZ) < 18)) continue;
        const score = -Math.abs(distance - 105) + this.rng.range(-12, 12);
        if (score > bestScore) {
          bestScore = score;
          best = { x: roadX, z: roadZ };
        }
      }
    }
    return best;
  }

  spawnPursuitUnit() {
    if (this.units.filter((unit) => unit.car && !unit.car.removed).length >= POLICE.maxCruisers + 2) return null;
    const node = this.findSpawnNode();
    if (!node) return null;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const yaw = Math.atan2(px - node.x, pz - node.z);
    return this.spawnCruiserAt(node.x, node.z, yaw, 'pursue');
  }

  // ---------------------------------------------------------------- removal

  clearUnits() {
    for (const unit of this.units) {
      if (unit.car) {
        if (this.effects) this.effects.unregisterVehicle(unit.car);
        this.vehicles.remove(unit.car);
      }
      unit.car = null;
    }
    this.units.length = 0;
  }

  clearOfficers() {
    for (const officer of this.officers) officer.remove();
    this.officers.length = 0;
  }

  removeUnit(unit) {
    if (unit.car) {
      if (this.effects) this.effects.unregisterVehicle(unit.car);
      this.vehicles.remove(unit.car);
      unit.car = null;
    }
    const index = this.units.indexOf(unit);
    if (index !== -1) this.units.splice(index, 1);
  }

  destroyUnit(unit) {
    if (!unit.car) return;
    const { x, y, z } = unit.car.position;
    if (this.effects) {
      this.effects.unregisterVehicle(unit.car);
      this.effects.explosion(x, y + 0.4, z);
    }
    if (this.audio) this.audio.explosion();
    this.vehicles.remove(unit.car);
    unit.car = null;
    this.addWanted(1, 'Cruiser Destroyed');
  }

  // ---------------------------------------------------------------- update

  update(dt, elapsed) {
    this.time = elapsed;
    this.updateAirUnit(dt);
    if (this.down) {
      this.sirenLevel = Math.max(0, this.sirenLevel - dt * 0.6);
      if (this.audio) this.audio.setSiren(this.sirenLevel, dt);
      return;
    }
    this.wantedFlash = Math.max(0, this.wantedFlash - dt * 1.7);
    this.ramFlash = Math.max(0, this.ramFlash - dt * 3);

    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = 0.28;
      this.playerVisible = this.isPlayerVisible();
    }
    if (this.time - this.player.lastGunfire < 1.3) this.playerVisible = true;

    if (!this.staged) {
      this.updateWanted(dt);
      this.updateSpawner(dt);
      this.updateRoadblock(dt);
    }

    this.updateUnits(dt);
    this.updateOfficers(dt);
    this.updateBusted(dt);
    this.updateSiren(dt);
  }

  updateWanted(dt) {
    if (this.wanted <= 0) {
      this.status = 'patrol';
      this.decayTimer = 0;
      this.searchTimer = 0;
      return;
    }
    if (this.playerVisible) {
      this.lastSeen = this.time;
      this.lastKnown.copy(this.player.position);
      if (this.status !== 'pursuit') this.status = 'pursuit';
      this.searchTimer = 0;
      this.decayTimer = 0;
      return;
    }
    if (this.time - this.lastSeen < POLICE.lostSightSeconds) return;
    if (this.status !== 'search') {
      this.status = 'search';
      this.notify('Searching', 'BREAK LINE OF SIGHT');
    }
    this.searchTimer += dt;
    if (this.searchTimer > POLICE.searchSeconds) {
      this.decayTimer += dt;
      if (this.decayTimer >= POLICE.decayStepSeconds) {
        this.decayTimer = 0;
        this.wanted = Math.max(0, this.wanted - 1);
        this.wantedFlash = 1;
        if (this.wanted === 0) {
          this.clearWanted();
        } else {
          this.notify('Heat Cooling', `WANTED LEVEL ${this.wanted}`);
        }
      }
    }
  }

  updateSpawner(dt) {
    if (this.wanted <= 0) return;
    this.unitSpawnTimer -= dt;
    if (this.unitSpawnTimer > 0) return;
    this.unitSpawnTimer = 1.4;
    const target = CRUISERS_PER_STAR[this.wanted] ?? 0;
    const active = this.units.filter((unit) => unit.car && !unit.car.removed).length;
    if (active < target) this.spawnPursuitUnit();
    const officerTarget = this.wanted >= POLICE.officersFromStars ? Math.min(POLICE.maxOfficers, this.wanted - 1) : 0;
    const activeOfficers = this.officers.filter((officer) => !officer.dead && !officer.removed).length;
    if (activeOfficers < officerTarget && this.status !== 'search') {
      const unit = this.units.find((entry) => entry.car && !entry.car.removed && !entry.deployed
        && entry.car.position.distanceTo(this.player.position) < 46);
      if (unit) this.dismount(unit);
    }
  }

  updateRoadblock(dt) {
    if (this.wanted < POLICE.roadblockFromStars) {
      this.roadblock = null;
      this.roadblockTimer = 12;
      return;
    }
    this.roadblockTimer -= dt;
    if (this.roadblockTimer > 0 || !this.player.driving || Math.abs(this.player.driving.speed) < 4) return;
    this.roadblockTimer = 30;
    const car = this.player.driving;
    const dirX = Math.sin(car.yaw);
    const dirZ = Math.cos(car.yaw);
    let blockX = car.position.x + dirX * 92;
    let blockZ = car.position.z + dirZ * 92;
    const roadHorizontal = Math.abs(nearestRoad(car.position.z) - car.position.z) < 8;
    if (roadHorizontal) {
      blockZ = nearestRoad(car.position.z);
      blockX = clamp(blockX, WORLD.cityMin + 10, WORLD.cityMax - 10);
      for (let i = 0; i < 2; i += 1) {
        const unit = this.spawnCruiserAt(blockX, blockZ + (i === 0 ? -2.3 : 2.3), 0, 'block');
        if (unit) {
          unit.car.controls.brake = 1;
          unit.car.controls.handbrake = true;
        }
      }
      this.spawnOfficerAt(blockX - dirX * 7 - 2.4, blockZ - 3.4, Math.PI);
      this.spawnOfficerAt(blockX - dirX * 7 + 2.4, blockZ + 3.4, Math.PI);
    } else {
      blockX = nearestRoad(car.position.x);
      blockZ = clamp(blockZ, WORLD.cityMin + 10, WORLD.cityMax - 10);
      for (let i = 0; i < 2; i += 1) {
        const unit = this.spawnCruiserAt(blockX + (i === 0 ? -2.3 : 2.3), blockZ, Math.PI / 2, 'block');
        if (unit) {
          unit.car.controls.brake = 1;
          unit.car.controls.handbrake = true;
        }
      }
      this.spawnOfficerAt(blockX - 3.4, blockZ - dirZ * 7 - 2.4, 0);
      this.spawnOfficerAt(blockX + 3.4, blockZ - dirZ * 7 + 2.4, 0);
    }
    this.notify('Roadblock', 'HARBOR PD IS WAITING AHEAD');
    if (this.audio) {
      // Distant siren sting for the new block.
      this.audio.setSiren(0.8, 0);
    }
  }

  updateUnits(dt) {
    for (const unit of [...this.units]) {
      if (!unit.car || unit.car.removed) {
        this.removeUnit(unit);
        continue;
      }
      const car = unit.car;
      unit.age += dt;
      unit.ramCooldown = Math.max(0, unit.ramCooldown - dt);
      unit.shootTimer -= dt;
      unit.pathTimer -= dt;
      unit.distanceTimer += dt;

      const distance = car.position.distanceTo(this.player.position);
      if (distance > 260) {
        if (unit.distanceTimer > 4) {
          this.removeUnit(unit);
          continue;
        }
      } else {
        unit.distanceTimer = 0;
      }

      if (unit.mode === 'block') {
        car.controls.throttle = 0;
        car.controls.brake = 1;
        car.controls.handbrake = true;
        car.controls.steer = 0;
        if (distance < 34 && this.wanted > 0) {
          unit.mode = 'pursue';
          unit.dismountTimer = 0.8;
        }
      } else if (unit.deployed) {
        car.controls.throttle = 0;
        car.controls.brake = 1;
        car.controls.handbrake = true;
        car.controls.steer = 0;
      } else {
        this.driveUnit(unit, dt);
      }

      if (!unit.deployed && this.wanted >= POLICE.officersFromStars && distance < 28
        && (!this.player.driving || Math.abs(this.player.driving.speed) < 2.5)) {
        unit.dismountTimer -= dt;
        if (unit.dismountTimer <= 0) this.dismount(unit);
      } else {
        unit.dismountTimer = 1.2;
      }

      const holdingUp = !this.player.driving && Math.abs(this.player.speed) < 1.2 && !this.player.aiming;
      if (this.wanted >= POLICE.shootFromStars && distance < 44 && unit.shootTimer <= 0 && this.playerVisible
        && !(holdingUp && distance < 8)) {
        unit.shootTimer = this.rng.range(1.35, 2.4);
        this.cruiserShoot(unit);
      }
      this.ramCheck(unit, dt);
    }
  }

  driveUnit(unit, dt) {
    const car = unit.car;
    const player = this.player;
    const px = player.position.x;
    const pz = player.position.z;
    const distance = car.position.distanceTo(player.position);
    let targetX = px;
    let targetZ = pz;
    if (this.status === 'search' && !this.playerVisible) {
      targetX = this.lastKnown.x;
      targetZ = this.lastKnown.z;
    } else if (!player.driving) {
      // Aim slightly behind a runner so cruisers do not drive through them.
      targetX += player.velocity.x * 0.25;
      targetZ += player.velocity.z * 0.25;
    } else {
      targetX += player.driving.velocity.x * 0.35;
      targetZ += player.driving.velocity.z * 0.35;
    }

    if (distance > 40 && unit.pathTimer <= 0) {
      unit.pathTimer = 0.9;
      const path = roadRoute(car.position.x, car.position.z, targetX, targetZ);
      unit.path = path.length > 0 ? path : null;
      if (unit.path && unit.path.length > 0 && Math.hypot(unit.path[0].x - car.position.x, unit.path[0].z - car.position.z) < 9) {
        unit.path.shift();
      }
    }
    if (distance > 36 && unit.path && unit.path.length > 0) {
      targetX = unit.path[0].x;
      targetZ = unit.path[0].z;
      if (Math.hypot(targetX - car.position.x, targetZ - car.position.z) < 12) unit.path.shift();
    }

    const dx = targetX - car.position.x;
    const dz = targetZ - car.position.z;
    const error = Math.atan2(dx, dz) - car.yaw;
    const wrapped = Math.atan2(Math.sin(error), Math.cos(error));
    car.controls.steer = clamp(wrapped * 2.3, -1, 1);
    car.controls.handbrake = false;

    const close = distance < 46;
    let desired = car.spec.maxSpeed * (close ? POLICE.cruiseSpeed : 0.86);
    if (Math.abs(wrapped) > 0.72) desired = Math.min(desired, 13);
    if (this.status === 'search') desired = Math.min(desired, 17);
    const speed = car.speed;
    if (unit.reverseTimer > 0) {
      unit.reverseTimer -= dt;
      car.controls.throttle = -0.72;
      car.controls.brake = 0;
      car.controls.steer = -car.controls.steer;
      return;
    }
    if (speed < desired - 0.4) {
      car.controls.throttle = clamp((desired - speed) * 0.3, 0.22, 1);
      car.controls.brake = 0;
    } else if (speed > desired + 1.5) {
      car.controls.throttle = 0;
      car.controls.brake = clamp((speed - desired) * 0.32, 0.18, 1);
    } else {
      car.controls.throttle = 0.12;
      car.controls.brake = 0;
    }

    if (Math.abs(speed) < 0.65 && unit.age > 2.5) unit.stuckTimer += dt;
    else unit.stuckTimer = 0;
    if (unit.stuckTimer > 1.5) {
      unit.stuckTimer = 0;
      unit.reverseTimer = 0.9;
    }
  }

  dismount(unit) {
    if (!unit.car || unit.deployed) return;
    unit.deployed = true;
    unit.dismountTimer = 1.2;
    unit.car.controls.brake = 1;
    unit.car.controls.handbrake = true;
    unit.car.velocity.multiplyScalar(0.2);
    const car = unit.car;
    const cos = Math.cos(car.yaw);
    const sin = Math.sin(car.yaw);
    const side = this.rng.chance(0.5) ? 1 : -1;
    const x = car.position.x + cos * side * (car.halfWidth + 0.9) + sin * 1.2;
    const z = car.position.z - sin * side * (car.halfWidth + 0.9) + cos * 1.2;
    if (!this.world.collides(x, z, 0.4)) {
      this.spawnOfficerAt(x, z, car.yaw + Math.PI);
    } else {
      this.spawnOfficerAt(car.position.x - sin * 3.2, car.position.z - cos * 3.2, car.yaw + Math.PI);
    }
    if (this.audio) this.audio.impact(0.5);
  }

  ramCheck(unit, dt) {
    const car = unit.car;
    if (!car || unit.ramCooldown > 0) return;
    const player = this.player;
    if (player.driving) {
      const target = player.driving;
      const dx = target.position.x - car.position.x;
      const dz = target.position.z - car.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 4.9) {
        const relative = Math.abs(car.speed - target.speed);
        if (relative > 5.5) {
          unit.ramCooldown = 1.1;
          this.ramFlash = 1;
          const damage = clamp(4 + relative * 0.45, 5, 17);
          this.damagePlayer(damage, car.position.x, car.position.z, 'RAMMED');
          target.applyDamage(damage * 0.85);
          if (this.effects) {
            this.effects.impact(new THREE.Vector3((car.position.x + target.position.x) / 2, car.position.y + 0.8, (car.position.z + target.position.z) / 2), null, 'metal');
            this.effects.shake(0.5);
          }
          if (this.audio) this.audio.impact(1.3);
        }
      }
    } else {
      const dx = player.position.x - car.position.x;
      const dz = player.position.z - car.position.z;
      if (dx * dx + dz * dz < 7.2 && Math.abs(car.speed) > 6) {
        unit.ramCooldown = 1.4;
        this.damagePlayer(18, car.position.x, car.position.z, 'STRUCK');
        player.velocity.set(dx * 1.7, 3.2, dz * 1.7);
        if (this.effects) this.effects.shake(0.7);
      }
    }
  }

  cruiserShoot(unit) {
    const car = unit.car;
    if (!car) return;
    const player = this.player;
    const muzzle = new THREE.Vector3(
      car.position.x + Math.cos(car.yaw) * 0.8 + Math.sin(car.yaw) * 1.4,
      car.position.y + 1.15,
      car.position.z - Math.sin(car.yaw) * 0.8 + Math.cos(car.yaw) * 1.4,
    );
    const target = new THREE.Vector3(player.position.x, player.position.y + 1.15, player.position.z);
    target.x += (Math.random() - 0.5) * 2.6;
    target.y += (Math.random() - 0.5) * 0.9;
    target.z += (Math.random() - 0.5) * 2.6;
    const direction = target.sub(muzzle).normalize();
    if (this.world.lineBlocked(muzzle.x, muzzle.y, muzzle.z, player.position.x, player.position.y + 1.1, player.position.z, 0.3)) return;
    const hit = Math.random() < 0.54;
    const endpoint = new THREE.Vector3();
    if (hit) {
      endpoint.set(player.position.x, player.position.y + 1.1, player.position.z);
      this.damagePlayer(7 + Math.random() * 4, car.position.x, car.position.z);
    } else {
      endpoint.copy(muzzle).addScaledVector(direction, 38);
      const worldHit = this.world.raycast(muzzle, direction, 38);
      if (worldHit) {
        endpoint.copy(worldHit.point);
        if (this.effects) this.effects.impact(worldHit.point, worldHit.normal, 'concrete');
      }
    }
    if (this.effects) {
      this.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd59a);
      this.effects.tracer(muzzle, endpoint, 0xffcf8a);
    }
    if (this.audio) this.audio.gunshot('pistol');
  }

  updateOfficers(dt) {
    for (const officer of [...this.officers]) {
      if (officer.removed) {
        const index = this.officers.indexOf(officer);
        if (index !== -1) this.officers.splice(index, 1);
        continue;
      }
      officer.update(dt, this.player, this);
      if (officer.dead) continue;
      if (this.down || this.wanted <= 0) continue;
      const distance = Math.hypot(officer.x - this.player.position.x, officer.z - this.player.position.z);
      if (distance > 140) {
        officer.remove();
        continue;
      }
      officer.losTimer -= dt;
      if (officer.losTimer <= 0) {
        officer.losTimer = 0.45;
        officer.los = distance < 36 && !this.world.lineBlocked(
          officer.x,
          officer.y + 1.35,
          officer.z,
          this.player.position.x,
          this.player.position.y + 1.2,
          this.player.position.z,
          0.2,
        );
      }
      officer.shootTimer -= dt;
      const holdingUp = !this.player.driving && Math.abs(this.player.speed) < 1.2 && !this.player.aiming;
      if (officer.los && distance < 38 && officer.shootTimer <= 0 && !(holdingUp && distance < 8)) {
        officer.shootTimer = this.rng.range(1.25, 2.3);
        this.officerShoot(officer);
      }
    }
  }

  officerShoot(officer) {
    const player = this.player;
    const muzzle = new THREE.Vector3(officer.x + Math.sin(officer.yaw) * 0.66, officer.y + 1.33, officer.z + Math.cos(officer.yaw) * 0.66);
    const target = new THREE.Vector3(player.position.x, player.position.y + 1.1, player.position.z);
    target.x += (Math.random() - 0.5) * 1.8;
    target.z += (Math.random() - 0.5) * 1.8;
    const direction = target.sub(muzzle).normalize();
    const hit = Math.random() < 0.6;
    const endpoint = new THREE.Vector3();
    if (hit) {
      endpoint.set(player.position.x, player.position.y + 1.05, player.position.z);
      this.damagePlayer(8 + Math.random() * 5, officer.x, officer.z);
    } else {
      endpoint.copy(muzzle).addScaledVector(direction, 30);
    }
    if (this.effects) {
      this.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd59a);
      this.effects.tracer(muzzle, endpoint, 0xffcf8a);
    }
    if (this.audio) this.audio.gunshot('pistol');
  }

  damagePlayer(amount, fromX, fromZ, cause = '') {
    if (this.down) return;
    const dead = this.player.applyDamage(amount, fromX, fromZ);
    if (cause && this.effects) this.effects.flash(fromX, this.player.position.y + 1.2, fromZ, { color: 0xff6a5c, scale: 1.1, life: 0.08, grow: 1 });
    if (dead) this.triggerDown('wasted');
  }

  updateBusted(dt) {
    if (this.wanted <= 0 || this.down) {
      this.bustTimer = 0;
      return;
    }
    if (this.player.driving || this.player.dead || this.player.aiming
      || this.player.playSeconds - this.player.lastGunfire < 1.2) {
      this.bustTimer = 0;
      return;
    }
    let close = false;
    if (Math.abs(this.player.speed) < 0.9) {
      for (const officer of this.officers) {
        if (officer.dead) continue;
        if (Math.hypot(officer.x - this.player.position.x, officer.z - this.player.position.z) < POLICE.bustRange) {
          close = true;
          break;
        }
      }
      if (!close) {
        for (const unit of this.units) {
          if (!unit.car || unit.car.removed) continue;
          if (unit.car.position.distanceTo(this.player.position) < POLICE.bustRange + 0.8 && Math.abs(unit.car.speed) < 2) {
            close = true;
            break;
          }
        }
      }
    }
    if (close) {
      this.bustTimer += dt;
      if (this.bustTimer >= POLICE.bustSeconds) {
        this.bustTimer = 0;
        this.triggerDown('busted');
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 1.8);
    }
  }

  updateSiren(dt) {
    let nearest = Infinity;
    for (const unit of this.units) {
      if (!unit.car || unit.car.removed) continue;
      nearest = Math.min(nearest, unit.car.position.distanceTo(this.player.position));
    }
    for (const officer of this.officers) {
      if (officer.dead) continue;
      nearest = Math.min(nearest, Math.hypot(officer.x - this.player.position.x, officer.z - this.player.position.z));
    }
    let target = 0;
    if (!this.down && this.wanted > 0 && nearest < 160) {
      target = clamp(1 - nearest / 170, 0.28, 1);
      if (this.status === 'search') target *= 0.62;
    }
    this.sirenLevel = damp(this.sirenLevel, target, 4, dt);
    if (this.audio) this.audio.setSiren(this.sirenLevel, dt);
  }

  isPlayerVisible() {
    const px = this.player.position.x;
    const py = this.player.position.y + 1.2;
    const pz = this.player.position.z;
    const inCar = Boolean(this.player.driving);
    for (const unit of this.units) {
      if (!unit.car || unit.car.removed) continue;
      const distance = unit.car.position.distanceTo(this.player.position);
      if (distance > POLICE.sightRange) continue;
      if (distance < 24) return true;
      if (this.staged) return true;
      if (!this.world.lineBlocked(unit.car.position.x, unit.car.position.y + 1.4, unit.car.position.z, px, py, pz, 0.5)) return true;
    }
    for (const officer of this.officers) {
      if (officer.dead || officer.removed) continue;
      const distance = Math.hypot(officer.x - px, officer.z - pz);
      if (distance > 34) continue;
      if (distance < 12) return true;
      if (!this.world.lineBlocked(officer.x, officer.y + 1.4, officer.z, px, py, pz, 0.2)) return true;
    }
    if (inCar && this.time - this.lastSeen < 0.4) return true;
    return false;
  }

  triggerDown(type) {
    if (this.down) return;
    this.down = type;
    this.bustTimer = 0;
    for (const unit of this.units) {
      if (!unit.car) continue;
      unit.car.controls.throttle = 0;
      unit.car.controls.brake = 1;
      unit.car.controls.handbrake = true;
    }
    if (this.audio) {
      if (type === 'busted') this.audio.busted();
      else this.audio.wasted();
    }
    if (this.onDown) this.onDown(type);
  }

  resetAfterDown() {
    this.down = null;
    this.wanted = 0;
    this.status = 'patrol';
    this.bustTimer = 0;
    this.searchTimer = 0;
    this.decayTimer = 0;
    this.lastSeen = -99;
    this.staged = false;
    this.sirenLevel = 0;
    this.roadblock = null;
    this.roadblockTimer = 18;
    this.clearUnits();
    this.clearOfficers();
    this.clearAirUnit();
    this.airStaged = false;
  }

  get hudState() {
    return {
      wanted: this.wanted,
      status: this.status,
      wantedFlash: this.wantedFlash,
      bustProgress: this.bustTimer / POLICE.bustSeconds,
      down: this.down,
      ramFlash: this.ramFlash,
      sirenLevel: this.sirenLevel,
      airUnit: this.helicopter
        ? {
            active: true,
            x: this.helicopter.position.x,
            z: this.helicopter.position.z,
            altitude: Math.round(this.helicopter.position.y),
            searchlight: this.helicopter.searchlightOn,
          }
        : null,
      units: this.units
        .filter((unit) => unit.car && !unit.car.removed)
        .map((unit) => ({
          x: unit.car.position.x,
          z: unit.car.position.z,
          yaw: unit.car.yaw,
          speed: unit.car.speed,
          mode: unit.mode,
          deployed: unit.deployed,
        })),
      officers: this.officers
        .filter((officer) => !officer.dead && !officer.removed)
        .map((officer) => ({ x: officer.x, z: officer.z, yaw: officer.yaw })),
    };
  }
}
