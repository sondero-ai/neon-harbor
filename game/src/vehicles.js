// Cars: seven body styles built from coloured boxes, an arcade driving model (throttle, brake,
// reverse, steering, grip, handbrake drift, suspension lean), damage that ends in fire and an
// explosion, headlights, brake lights, sirens, tyre smoke and skid marks. Traffic and the police
// use the same cars; only the controller differs.
import * as THREE from '../vendor/three.module.js';
import { CARS } from './config.js';
import { MeshBuilder, makeGlowTexture } from './geo.js';

// A fixed-seed helper for cosmetic chance so the physics and the smoke look the same every run.
const rand = (() => {
  let a = 0x2545f491;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

const WHEEL_RADIUS = 0.36;

function shapeOf(spec, id) {
  const L = spec.length, W = spec.width, H = spec.height;
  const belt = id === 'sports' ? H * 0.55 : id === 'van' || id === 'truck' ? H * 0.6 : H * 0.58;
  return { L, W, H, belt, cabin: id === 'sports' ? 0.34 : 0.44, wheelZ: L * 0.31 };
}

/** One geometry set per car type: body, glass, head lights, tail lights, wheels. */
function buildCarGeometries(spec) {
  const { L, W, H, belt, cabin } = shapeOf(spec, spec.id);
  const body = new MeshBuilder();
  const glass = new MeshBuilder();
  const head = new MeshBuilder();
  const tail = new MeshBuilder();
  const accent = spec.accent;
  const paint = spec.body;
  const dark = '#1c1a21';
  const chassisTop = id => 0;
  const mid = (H + belt) / 2;
  const bodyBottom = 0.34;

  if (spec.id === 'truck') {
    body.box(0, 0.34 + (H - 1.1) / 2, -L * 0.18, W * 0.92, H - 1.1, L * 0.62, paint, 2);
    body.box(0, 0.34 + (H - 1.1) / 2, L * 0.3, W * 0.98, H - 0.7, L * 0.34, paint, 2);
    body.box(0, 0.34 + H - 1.0, L * 0.3, W * 0.86, 1.4, L * 0.3, accent, 2);
    body.box(0, 0.55, -L * 0.02, W * 0.7, 0.35, L * 0.55, dark, 2);
    body.box(0, H - 0.5, -L * 0.18, W * 0.6, 0.5, 1.0, '#5a4a34', 2);
    for (const x of [-1, 1]) body.box(x * W * 0.45, 0.7, L * 0.46, 0.2, 0.5, 0.2, '#ffe2a8', 1);
    glass.box(0, H - 0.55, L * 0.44, W * 0.8, 0.75, 0.16, '#0d1a24');
    head.box(0, H - 0.65, -L * 0.49, W * 0.86, 0.5, 0.2, dark);
  } else {
    // Chassis and the two shoulders of the bonnet and boot.
    body.box(0, bodyBottom + (belt - bodyBottom) / 2, 0, W * 0.98, belt - bodyBottom, L * 0.96, paint, 2);
    body.box(0, (belt + 0.04) / 2 + belt / 2, L * 0.3, W * 0.94, 0.16, L * 0.3, paint, 2);
    body.box(0, belt + 0.06, -L * 0.3, W * 0.94, 0.2, L * 0.3, paint, 2);
    // The greenhouse: a glass band under a painted roof and four pillars.
    const cabinZ = -L * (spec.id === 'sports' ? 0.08 : 0.04);
    const cabinL = L * cabin;
    glass.box(0, (belt + H) / 2, cabinZ, W * 0.92, H - belt, cabinL, '#0e1a24');
    body.box(0, H - 0.045, cabinZ, W * 0.9, 0.09, cabinL * 0.98, paint, 2);
    body.box(0, belt + 0.02, cabinZ, W * 0.93, 0.07, cabinL, paint, 2);
    for (const z of [cabinZ + cabinL / 2, cabinZ - cabinL / 2]) {
      body.box(0, (belt + H) / 2, z, W * 0.93, H - belt, 0.14, paint, 2);
    }
    for (const x of [-1, 1]) {
      body.box(x * W * 0.45, (belt + H) / 2, cabinZ, 0.1, H - belt, 0.16, paint, 2);
      body.box(x * W * 0.52, belt - 0.12, cabinZ + cabinL * 0.42, 0.16, 0.1, 0.24, dark, 1);
    }
    // Bumpers, grille and side skirts.
    body.box(0, 0.52, L * 0.49, W * 0.96, 0.26, 0.24, accent, 2);
    body.box(0, 0.52, -L * 0.49, W * 0.96, 0.26, 0.24, accent, 2);
    body.box(0, 0.62, L * 0.495, W * 0.5, 0.16, 0.12, dark, 1);
    for (const x of [-1, 1]) body.box(x * W * 0.49, 0.42, 0, 0.08, 0.16, L * 0.5, accent, 2);
    // Wheel arches (dark lips).
    for (const x of [-1, 1]) for (const z of [-1, 1]) body.box(x * W * 0.44, 0.5, z * L * 0.31, 0.05, 0.4, 0.85, dark, 1);
    head.box(W * 0.31, 0.74, L * 0.49, 0.44, 0.16, 0.1, '#fff0c0');
    head.box(-W * 0.31, 0.74, L * 0.49, 0.44, 0.16, 0.1, '#fff0c0');
    tail.box(W * 0.32, 0.72, -L * 0.49, 0.4, 0.14, 0.1, '#ff2f28');
    tail.box(-W * 0.32, 0.72, -L * 0.49, 0.4, 0.14, 0.1, '#ff2f28');
    if (spec.id === 'sports') {
      body.box(0, H + 0.1, -L * 0.42, W * 0.92, 0.08, 0.42, accent, 1);
      body.box(-W * 0.32, H - 0.02, -L * 0.42, 0.1, 0.22, 0.12, accent, 1);
      body.box(W * 0.32, H - 0.02, -L * 0.42, 0.1, 0.22, 0.12, accent, 1);
    }
    if (spec.id === 'muscle') {
      body.box(0, belt + 0.16, L * 0.2, W * 0.26, 0.18, 0.7, dark, 1);
      for (const x of [-1, 1]) body.box(x * W * 0.24, belt + 0.02, 0.1, 0.3, 0.03, L * 0.8, accent, 1);
    }
    if (spec.id === 'van') {
      body.box(0, H - 0.02, -L * 0.3, W * 0.92, 0.16, L * 0.3, paint, 2);
      body.box(0, H * 0.5, L * 0.48, W * 0.86, H * 0.7, 0.14, '#141e28', 1);
    }
    if (spec.id === 'taxi') {
      head.box(0, H + 0.16, -L * 0.02, 1.0, 0.26, 0.4, '#ffd75e');
    }
  }
  return {
    body: body.build(), glass: glass.build(), head: head.build(), tail: tail.build(),
    lights: null,
  };
}

export function createVehicleSystem(scene, world, effects, audio) {
  const cars = [];
  const geometryCache = new Map();
  const wheelGeometry = (() => {
    const geometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 10);
    geometry.rotateZ(Math.PI / 2);
    return geometry;
  })();
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: '#141218', roughness: 0.95 });
  const bodyMaterials = new Map();
  const glassMaterial = new THREE.MeshStandardMaterial({ color: '#101a24', roughness: 0.12, metalness: 0.85, transparent: true, opacity: 0.82 });
  const headMaterial = new THREE.MeshBasicMaterial({ color: '#fff2c4', toneMapped: false });
  const tailMaterial = new THREE.MeshBasicMaterial({ color: '#ff3028', toneMapped: false });
  const lightGlow = makeGlowTexture();
  const beamMaterial = new THREE.MeshBasicMaterial({ map: makeGlowTexture(), color: '#ffd9a0', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
  const callbacks = { onCarjack: null, onCrime: null, onExplode: null };

  function bodyMaterial(color) {
    if (!bodyMaterials.has(color)) {
      bodyMaterials.set(color, new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.38 }));
    }
    return bodyMaterials.get(color);
  }

  function geometryFor(spec) {
    if (!geometryCache.has(spec.id)) geometryCache.set(spec.id, buildCarGeometries(spec));
    return geometryCache.get(spec.id);
  }

  function spawnCar(typeId, x, z, heading, options = {}) {
    const spec = CARS.find((car) => car.id === typeId) ?? CARS[0];
    const geometry = geometryFor(spec);
    const group = new THREE.Group();
    const bodyGroup = new THREE.Group();
    const bodyMesh = new THREE.Mesh(geometry.body, bodyMaterial(options.color ?? spec.body));
    const glassMesh = new THREE.Mesh(geometry.glass, glassMaterial);
    bodyGroup.add(bodyMesh, glassMesh);
    if (geometry.head.attributes.position.count > 0) bodyGroup.add(new THREE.Mesh(geometry.head, headMaterial));
    let tailMesh = null;
    if (geometry.tail.attributes.position.count > 0) {
      tailMesh = new THREE.Mesh(geometry.tail, tailMaterial.clone());
      bodyGroup.add(tailMesh);
    }
    if (spec.id === 'police') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.7, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: '#1a1e26', roughness: 0.6 }));
      bar.position.set(0, spec.height + 0.1, -0.2);
      const barBlue = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.3, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: '#2a6bff', toneMapped: false }));
      barBlue.position.set(-spec.width * 0.16, spec.height + 0.13, -0.2);
      const barRed = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.3, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: '#ff2a3a', toneMapped: false }));
      barRed.position.set(spec.width * 0.16, spec.height + 0.13, -0.2);
      const haloRed = new THREE.Sprite(new THREE.SpriteMaterial({ map: lightGlow, color: '#ff2a3a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
      haloRed.scale.setScalar(1.5);
      haloRed.position.set(spec.width * 0.3, spec.height + 0.4, -0.2);
      const haloBlue = new THREE.Sprite(new THREE.SpriteMaterial({ map: lightGlow, color: '#4a8cff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
      haloBlue.scale.setScalar(1.5);
      haloBlue.position.set(-spec.width * 0.3, spec.height + 0.4, -0.2);
      bodyGroup.add(bar, barBlue, barRed, haloRed, haloBlue);
      group.userData.sirenLamps = [barBlue, barRed];
    }
    const lux = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 11), beamMaterial);
    lux.rotation.x = -Math.PI / 2;
    lux.position.set(0, 0.07, spec.length * 0.5 + 4.4);
    group.add(lux);
    group.add(bodyGroup);
    group.position.set(x, world.surfaceHeight(x, z), z);
    group.rotation.y = heading;
    scene.add(group);

    const wheels = new THREE.InstancedMesh(wheelGeometry, wheelMaterial, 4);
    wheels.frustumCulled = false;
    group.add(wheels);
    const car = {
      id: cars.length + 1, typeId: spec.id, spec, group, bodyGroup, bodyMesh, wheels, tailMesh,
      pos: new THREE.Vector3(x, 0, z), heading, speed: 0, throttle: 0, steer: 0,
      handbrake: false, health: 100, maxHealth: 100, occupied: Boolean(options.occupied),
      driver: options.driver ?? null, ai: options.ai ?? null, police: spec.id === 'police',
      wrecked: false, burning: false, smokeTimer: 0, skidTimer: 0, wheelAngle: 0,
      brake: false, bounce: 0, sirenOn: Boolean(options.siren), sirenPhase: 0,
      isPlayer: false, spawnFlash: 0, color: options.color ?? spec.body,
    };
    wheels.setMatrixAt(0, new THREE.Matrix4());
    cars.push(car);
    updateWheels(car, 0);
    return car;
  }

  function updateWheels(car, steer) {
    const { spec } = car;
    const positions = [
      [-spec.width / 2 + 0.06, spec.length * 0.31],
      [spec.width / 2 - 0.06, spec.length * 0.31],
      [-spec.width / 2 + 0.06, -spec.length * 0.31],
      [spec.width / 2 - 0.06, -spec.length * 0.31],
    ];
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let i = 0; i < 4; i += 1) {
      const [x, z] = positions[i];
      quaternion.setFromEuler(new THREE.Euler(car.wheelAngle, i < 2 ? steer * 0.5 : 0, 0, 'YXZ'));
      matrix.compose(new THREE.Vector3(x, WHEEL_RADIUS, z), quaternion, new THREE.Vector3(1, 1, 1));
      car.wheels.setMatrixAt(i, matrix);
    }
    car.wheels.instanceMatrix.needsUpdate = true;
  }

  function nearestCar(position, maxDistance, filter = () => true) {
    let best = null, bestDistance = maxDistance;
    for (const car of cars) {
      if (car.wrecked || !filter(car)) continue;
      const distance = Math.hypot(car.pos.x - position.x, car.pos.z - position.z);
      if (distance < bestDistance) { best = car; bestDistance = distance; }
    }
    return best;
  }

  function damage(car, amount, cause = 'impact') {
    if (car.wrecked) return;
    car.health = Math.max(0, car.health - amount);
    car.bounce = Math.min(0.3, car.bounce + amount * 0.004);
    if (amount > 6) {
      effects.spark(car.pos.x, 0.9, car.pos.z, { life: 0.4, size: 0.4, r: 1, g: 0.7, b: 0.3, vy: 1.5, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, gravity: -8 });
      effects.shake(Math.min(0.5, amount * 0.012));
    }
    if (car.health <= 0) explode(car);
  }

  function explode(car) {
    if (car.wrecked) return;
    car.wrecked = true;
    car.burning = true;
    car.speed = 0;
    car.throttle = 0;
    const position = new THREE.Vector3(car.pos.x, 1.1, car.pos.z);
    effects.explosion(position, 1.1);
    effects.shake(1.2);
    audio.explosion(car.pos);
    car.bodyMesh.material = new THREE.MeshStandardMaterial({ color: '#241f24', roughness: 0.95, metalness: 0.3 });
    car.bodyGroup.rotation.z = 0.08;
    if (callbacks.onExplode) callbacks.onExplode(car);
  }

  function removeCar(car) {
    const index = cars.indexOf(car);
    if (index !== -1) cars.splice(index, 1);
    scene.remove(car.group);
    car.group.traverse((child) => {
      if (child.isInstancedMesh) child.dispose();
    });
  }

  /**
   * One physics step for one car. The controller (player, traffic AI or police) only sets throttle,
   * steer and handbrake; everything else is here so every car feels the same.
   */
  function stepCar(car, dt) {
    if (car.wrecked) {
      car.speed *= Math.max(0, 1 - dt * 4);
      car.pos.x += Math.sin(car.heading) * car.speed * dt;
      car.pos.z += Math.cos(car.heading) * car.speed * dt;
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0 && car.burning) {
        effects.smoke(car.pos.x, 1.2, car.pos.z, 1);
        effects.fire(car.pos.x, 1.1, car.pos.z, 1);
        car.smokeTimer = 0.16;
        if (rand() < 0.1) car.burning = false;
      }
      return;
    }
    const spec = car.spec;
    const topSpeed = spec.top;
    const throttle = car.throttle;
    const braking = throttle < 0 && car.speed > 0.5;
    if (throttle > 0) {
      car.speed += spec.accel * throttle * dt * (1.05 - Math.min(1, Math.abs(car.speed) / topSpeed));
    } else if (throttle < 0) {
      car.speed += (car.speed > 0.4 ? spec.accel * 1.9 : spec.accel * 0.5) * throttle * dt;
    }
    car.brake = braking || car.handbrake;
    // Drag, rolling resistance and the handbrake.
    car.speed *= Math.max(0, 1 - (car.handbrake ? 2.4 : 0.42) * dt);
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 1.4 * dt);
    const limit = car.speed < 0 ? topSpeed * 0.4 : topSpeed;
    car.speed = Math.max(-topSpeed * 0.4, Math.min(limit, car.speed));
    // Steering: less bite at the top end, none when stopped.
    const grip = car.handbrake ? 1.35 : 1;
    const speedFactor = Math.min(1, Math.abs(car.speed) / 9);
    const steerPower = 1.75 * grip * speedFactor * (1 - Math.min(0.45, Math.abs(car.speed) / topSpeed * 0.45));
    car.heading += car.steer * steerPower * dt * (car.speed < 0 ? -1 : 1);
    const dx = Math.sin(car.heading) * car.speed * dt;
    const dz = Math.cos(car.heading) * car.speed * dt;
    car.pos.x += dx;
    car.pos.z += dz;
    car.bounce = Math.max(0, car.bounce - dt * 2.2);
    // City and sea limits.
    const onPier = car.pos.x > 500 && Math.abs(car.pos.z) < 8.4;
    if (!onPier && car.pos.x > 496) {
      car.pos.x = 496;
      car.speed *= -0.25;
      car.bounce = 0.15;
    }
    if (Math.abs(car.pos.x) > 690 || Math.abs(car.pos.z) > 690) {
      car.pos.x = Math.max(-690, Math.min(690, car.pos.x));
      car.pos.z = Math.max(-690, Math.min(690, car.pos.z));
      car.speed *= -0.2;
    }
    const before = { x: car.pos.x, z: car.pos.z };
    world.resolveCollision(car.pos, spec.width * 0.55);
    if (Math.abs(car.pos.x - before.x) > 0.001 || Math.abs(car.pos.z - before.z) > 0.001) {
      if (Math.abs(car.speed) > 3) {
        damage(car, Math.abs(car.speed) * 1.9);
        audio.crash(car.pos, Math.min(1, Math.abs(car.speed) / 30));
        effects.spark(car.pos.x + dx * 2, 0.8, car.pos.z + dz * 2, { life: 0.35, size: 0.4, vy: 1.2, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, r: 1, g: 0.7, b: 0.4 });
      }
      car.speed *= -0.32;
    }
    // Wheels and the body's lean over the springs.
    car.wheelAngle += (car.speed * dt) / WHEEL_RADIUS;
    if (!car.isPlayer || Math.abs(car.speed) > 2) updateWheels(car, car.steer);
    const lean = -car.steer * Math.min(0.09, Math.abs(car.speed) * 0.004);
    car.bodyGroup.rotation.z += (lean - car.bodyGroup.rotation.z) * Math.min(1, dt * 6);
    car.bodyGroup.position.y = car.bounce + Math.sin(car.wheelAngle * 0.6) * 0.006 * Math.min(1, Math.abs(car.speed) * 0.2);
    // Lights, sirens, smoke and marks.
    car.sirenPhase += dt;
    if (car.police && car.sirenOn) {
      const lamps = car.group.userData.sirenLamps;
      if (lamps) {
        lamps[0].material.color.setHex(Math.floor(car.sirenPhase * 8) % 2 ? '#2a6bff' : '#0a1a4a');
        lamps[1].material.color.setHex(Math.floor(car.sirenPhase * 8) % 2 ? '#4a0a10' : '#ff2a3a');
      }
    }
    const sliding = (Math.abs(car.steer) > 0.65 && Math.abs(car.speed) > 11) || car.handbrake && Math.abs(car.speed) > 6;
    if (sliding) {
      car.skidTimer -= dt;
      if (car.skidTimer <= 0) {
        car.skidTimer = 0.03;
        for (const side of [-1, 1]) {
          const wx = car.pos.x + Math.cos(car.heading) * side * spec.width * 0.35 - Math.sin(car.heading) * spec.length * 0.3;
          const wz = car.pos.z - Math.sin(car.heading) * side * spec.width * 0.35 - Math.cos(car.heading) * spec.length * 0.3;
          effects.skid(wx, wz, car.heading, 1);
        }
        if (rand() < 0.4) effects.smoke(car.pos.x - Math.sin(car.heading) * spec.length * 0.3, 0.3, car.pos.z - Math.cos(car.heading) * spec.length * 0.3, 1);
      }
    }
    if (car.brake && Math.abs(car.speed) > 1 && rand() < 0.6) {
      effects.smoke(car.pos.x + (rand() - 0.5) * 0.8, 0.3, car.pos.z + (rand() - 0.5) * 0.8, 1);
    }
    car.smokeTimer -= dt;
    if (car.health < 45 && car.smokeTimer <= 0) {
      car.smokeTimer = 0.22;
      effects.smoke(car.pos.x, 0.8, car.pos.z, 1);
      if (car.health < 22) effects.fire(car.pos.x, 0.9, car.pos.z, 1);
    }
    // Tail lights: bright when braking.
    if (car.tailMesh) car.tailMesh.material.color.setHex(car.brake ? 0xff4a3a : 0x9a2320);
    car.group.position.set(car.pos.x, world.surfaceHeight(car.pos.x, car.pos.z), car.pos.z);
    car.group.rotation.y = car.heading;
  }

  /** Car-to-car separation and impact damage. */
  function resolveTraffic(carsToCheck) {
    for (let i = 0; i < carsToCheck.length; i += 1) {
      const a = carsToCheck[i];
      if (a.pos.x > 495) continue;
      for (let j = i + 1; j < carsToCheck.length; j += 1) {
        const b = carsToCheck[j];
        if (b.pos.x > 495) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const minDistance = (a.spec.length + b.spec.length) * 0.42;
        const distance = Math.hypot(dx, dz);
        if (distance > 0.001 && distance < minDistance) {
          const push = (minDistance - distance) / 2;
          const nx = dx / distance, nz = dz / distance;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
          const impact = Math.abs(a.speed - b.speed) * 0.5;
          if (impact > 3) {
            damage(a, impact);
            damage(b, impact);
            audio.crash(a.pos, Math.min(1, impact / 24));
            if (a.isPlayer || b.isPlayer) effects.shake(Math.min(0.6, impact * 0.03));
          }
        }
      }
    }
  }

  function update(dt) {
    for (const car of cars) stepCar(car, dt);
    resolveTraffic(cars);
  }

  function reset() {
    for (const car of cars.slice()) removeCar(car);
  }

  return {
    cars, spawnCar, removeCar, nearestCar, damage, explode, update, reset, callbacks,
    get playerCar() { return cars.find((car) => car.isPlayer) ?? null; },
    geometryFor,
  };
}
