// Harbor PD's air unit: the patrol helicopter mesh, its searchlight cones and
// the orbiting flight logic. The class keeps its own `this`; the Police
// instance passes itself to update so the helicopter can read the pursuit
// state and the HUD can read its range.

import * as THREE from '../vendor/three.module.js';
import { makeGlowSprite, mergeGeometries } from './geo.js';
import { dampAngle } from './police-shared.js';

function makeAirDecal() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f7e8d2';
  ctx.font = '900 62px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('HPD', 128, 70);
  ctx.fillStyle = '#ffc95c';
  ctx.font = '700 22px "Arial Narrow", Arial, sans-serif';
  ctx.fillText('AIR 1', 128, 106);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// ---------------------------------------------------------------- air unit

// Harbor PD's patrol helicopter. It is not a vehicle: it flies a loose orbit
// over the streets, keeps a searchlight on the player once a pursuit starts,
// and reports its range to the HUD. The spotlight is a pair of additive cones
// plus a ground glow, so it reads at a glance without a shadow-casting light.
export class AirUnit {
  constructor(scene, world, player) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.group = new THREE.Group();
    this.group.name = 'harbor-pd-air-1';
    this.group.rotation.order = 'YXZ';
    this.position = new THREE.Vector3(-54, 36, 27);
    this.yaw = Math.PI / 2;
    this.spotlight = true;
    this.staged = false;
    this.target = new THREE.Vector3(-60, 0, 27);
    this._down = new THREE.Vector3(0, -1, 0);
    this._dir = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this.build();
    this.group.scale.setScalar(1.2);
    scene.add(this.group);
    this.group.position.copy(this.position);
  }

  build() {
    const navy = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.42, metalness: 0.38 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0e15, roughness: 0.55, metalness: 0.3 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.5, metalness: 0.2 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc95c, roughness: 0.35, metalness: 0.45, emissive: 0x3a2804 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x14232b, roughness: 0.08, metalness: 0.72, emissive: 0x0a1a24, emissiveIntensity: 0.5 });
    const red = new THREE.MeshBasicMaterial({ color: 0xff3526, toneMapped: false });
    const blue = new THREE.MeshBasicMaterial({ color: 0x3d63ff, toneMapped: false });

    // Static boxwork is merged per material, so the whole airframe costs four
    // draws instead of one per box; the rotors and glow sprites stay separate.
    const staticParts = new Map([[navy, []], [dark, []], [trim, []], [gold, []]]);
    const box = (width, height, depth, material, x, y, z, parent = this.group) => {
      const geometry = new THREE.BoxGeometry(width, height, depth);
      if (parent === this.group && staticParts.has(material)) {
        geometry.translate(x, y, z);
        staticParts.get(material).push(geometry);
        return null;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Fuselage, nose and the long tail boom.
    box(1.75, 1.16, 3.15, navy, 0, 0, 0);
    box(1.42, 0.78, 1.15, navy, 0, -0.06, 1.85);
    this.cockpit = box(1.28, 0.58, 0.72, glass, 0, 0.25, 1.62);
    box(0.44, 0.4, 3.05, navy, 0, 0.12, -2.85);
    box(0.14, 1.0, 0.62, navy, 0, 0.5, -4.28);
    box(0.1, 0.28, 0.9, trim, 0, 0.2, -4.25);
    box(0.86, 0.1, 2.7, gold, 0, 0.55, 0.06);

    // White cabin doors with an HPD / AIR 1 decal on each side.
    const decal = makeAirDecal();
    const decalMirror = decal.clone();
    decalMirror.wrapS = THREE.RepeatWrapping;
    decalMirror.repeat.x = -1;
    decalMirror.offset.x = 1;
    decalMirror.needsUpdate = true;
    for (const side of [-1, 1]) {
      box(0.06, 0.66, 1.55, trim, side * 0.89, 0.02, 0.2);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.18, 0.6),
        new THREE.MeshBasicMaterial({
          map: side === 1 ? decal : decalMirror,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
      );
      plane.position.set(side * 0.925, 0.04, 0.2);
      plane.rotation.y = side * Math.PI / 2;
      this.group.add(plane);
    }

    // Skids and struts.
    for (const side of [-1, 1]) {
      box(0.12, 0.1, 3.1, dark, side * 0.92, -0.88, 0);
      box(0.1, 0.48, 0.1, dark, side * 0.64, -0.62, 0.78);
      box(0.1, 0.48, 0.1, dark, side * 0.64, -0.62, -0.62);
    }

    // Main rotor mast, four blades and a soft blur disc.
    box(0.16, 0.42, 0.16, dark, 0, 0.78, 0);
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 1.02, 0);
    this.group.add(this.rotor);
    const bladeParts = [];
    for (let i = 0; i < 4; i += 1) {
      const geometry = new THREE.BoxGeometry(0.16, 0.035, 5.7);
      geometry.rotateY((i * Math.PI) / 4);
      geometry.translate(0, i % 2 === 0 ? 0.02 : -0.02, 0);
      bladeParts.push({ geometry });
    }
    const rotorBlades = new THREE.Mesh(mergeGeometries(bladeParts), dark);
    rotorBlades.castShadow = true;
    this.rotor.add(rotorBlades);
    const blur = new THREE.Mesh(
      new THREE.CircleGeometry(2.85, 32),
      new THREE.MeshBasicMaterial({
        color: 0xb9c6dd,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    blur.rotation.x = -Math.PI / 2;
    blur.position.y = 1.03;
    this.group.add(blur);

    // Tail rotor, mounted on the left of the fin.
    this.tailRotor = new THREE.Group();
    this.tailRotor.position.set(0.22, 0.56, -4.22);
    this.group.add(this.tailRotor);
    const tailParts = [];
    for (let i = 0; i < 2; i += 1) {
      const geometry = new THREE.BoxGeometry(0.04, 1.5, 0.11);
      geometry.rotateX((i * Math.PI) / 2);
      tailParts.push({ geometry });
    }
    const tailBlades = new THREE.Mesh(mergeGeometries(tailParts), dark);
    tailBlades.castShadow = true;
    this.tailRotor.add(tailBlades);

    // The light bar and the searchlight housing under the nose.
    box(0.22, 0.08, 0.22, red, -0.24, -0.6, 0.55);
    box(0.22, 0.08, 0.22, blue, 0.24, -0.6, 0.55);
    this.redGlow = makeGlowSprite(0xff3526, 1.6, 0.9);
    this.redGlow.position.set(-0.24, -0.62, 0.56);
    this.group.add(this.redGlow);
    this.blueGlow = makeGlowSprite(0x3d63ff, 1.6, 0.9);
    this.blueGlow.position.set(0.24, -0.62, 0.56);
    this.group.add(this.blueGlow);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.29, 0.42, 12), dark);
    housing.rotation.x = Math.PI / 2;
    housing.position.set(0, -0.52, 1.16);
    this.group.add(housing);
    for (const [material, parts] of staticParts) {
      if (parts.length === 0) continue;
      const mesh = new THREE.Mesh(mergeGeometries(parts.map((geometry) => ({ geometry }))), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.lens = makeGlowSprite(0xfff1c4, 1.8, 0.95);
    this.lens.position.set(0, -0.7, 1.36);
    this.group.add(this.lens);

    // Red/green navigation lights on the boom tips.
    this.navRed = makeGlowSprite(0xff3b2c, 1.1, 0.9);
    this.navRed.position.set(-1.15, 0, 0.3);
    this.group.add(this.navRed);
    this.navGreen = makeGlowSprite(0x3bff7a, 1.1, 0.85);
    this.navGreen.position.set(1.15, 0, 0.3);
    this.group.add(this.navGreen);

    // The visible searchlight: one wide cone, one hot core and a ground pool.
    const cone = new THREE.ConeGeometry(0.5, 1, 28, 1, true);
    cone.translate(0, -0.5, 0);
    this.coneOuter = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({
      color: 0xffe8ae,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    }));
    this.coneInner = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({
      color: 0xfff8e0,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    }));
    this.coneOuter.renderOrder = 4;
    this.coneInner.renderOrder = 5;
    this.coneOuter.frustumCulled = false;
    this.coneInner.frustumCulled = false;
    this.scene.add(this.coneOuter, this.coneInner);
    this.spotPool = makeGlowSprite(0xffedb4, 9, 0.52);
    this.spotPool.renderOrder = 3;
    this.scene.add(this.spotPool);
  }

  update(dt, elapsed, police) {
    this.spin = (this.spin ?? 0) + dt;
    if (this.staged) {
      this.animate(dt);
      this.updateSpotlight();
      return;
    }
    const player = this.player.position;
    const pursuit = police.wanted > 0 && !police.down;
    const search = police.status === 'search';
    const angle = (this.spin * (pursuit ? 0.55 : 0.16)) + (pursuit ? 2.2 : 0.4);
    const radius = pursuit ? 24 : 66;
    const altitude = pursuit ? 25 : 37;
    const ground = this.world.groundHeightAt(player.x, player.z);
    const targetX = player.x + Math.cos(angle) * radius;
    const targetZ = player.z + Math.sin(angle) * radius;
    const targetY = ground + altitude;
    const ease = 1 - Math.exp(-dt * 1.4);
    this.position.x += (targetX - this.position.x) * ease;
    this.position.y += (targetY - this.position.y) * ease;
    this.position.z += (targetZ - this.position.z) * ease;
    const dx = player.x - this.position.x;
    const dz = player.z - this.position.z;
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 1.8, dt);
    // The light stays on: a patrol sweep on a quiet night, a hard lock once
    // the pursuit is live. The HUD banner always reads AIR 1 · SPOTLIGHT.
    this.spotlight = true;
    if (pursuit || search) {
      const car = this.player.driving;
      const tx = car ? car.position.x + car.velocity.x * 0.22 : player.x;
      const tz = car ? car.position.z + car.velocity.z * 0.22 : player.z;
      this.target.set(tx, this.world.groundHeightAt(tx, tz) + 0.12, tz);
    } else {
      const sweep = Math.sin(this.spin * 0.9) * 0.8;
      const tx = this.position.x + Math.sin(this.yaw + sweep) * 22;
      const tz = this.position.z + Math.cos(this.yaw + sweep) * 22;
      this.target.set(tx, this.world.groundHeightAt(tx, tz) + 0.12, tz);
    }
    this.applyTransform(elapsed);
    this.animate(dt);
    this.updateSpotlight();
  }

  stage(spec = {}) {
    this.staged = true;
    const player = this.player.position;
    this.position.set(
      Number.isFinite(spec.x) ? spec.x : player.x - 22,
      Number.isFinite(spec.y) ? spec.y : 26,
      Number.isFinite(spec.z) ? spec.z : player.z,
    );
    this.yaw = Number.isFinite(spec.yaw)
      ? spec.yaw
      : Math.atan2(player.x - this.position.x, player.z - this.position.z);
    this.spotlight = spec.spotlight !== false;
    const tx = Number.isFinite(spec.targetX) ? spec.targetX : player.x;
    const tz = Number.isFinite(spec.targetZ) ? spec.targetZ : player.z;
    this.target.set(tx, this.world.groundHeightAt(tx, tz) + 0.12, tz);
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.yaw, 0);
    this.rotor.rotation.y = Number.isFinite(spec.rotor) ? spec.rotor : 0.72;
    this.tailRotor.rotation.x = Number.isFinite(spec.tailRotor) ? spec.tailRotor : 1.1;
    this.applyTransform(0);
    this.updateSpotlight();
  }

  applyTransform(elapsed = 0) {
    const bob = Math.sin(elapsed * 1.7 + 0.6) * 0.34;
    this.group.position.set(this.position.x, this.position.y + bob, this.position.z);
    this.group.rotation.set(Math.sin(elapsed * 0.72) * 0.035, this.yaw, Math.sin(elapsed * 0.91 + 1.3) * 0.05);
  }

  animate(dt) {
    this.rotor.rotation.y += dt * 34;
    this.tailRotor.rotation.x += dt * 52;
    const blink = Math.sin((this.spin ?? 0) * 11) > 0;
    this.redGlow.material.opacity = blink ? 0.95 : 0.15;
    this.blueGlow.material.opacity = blink ? 0.15 : 0.95;
    this.lens.material.opacity = 0.75 + Math.sin((this.spin ?? 0) * 5.5) * 0.18;
  }

  updateSpotlight() {
    const origin = this._origin.set(
      this.group.position.x + Math.sin(this.yaw) * 1.0,
      this.group.position.y - 0.55,
      this.group.position.z + Math.cos(this.yaw) * 1.0,
    );
    const distance = Math.max(1, origin.distanceTo(this.target));
    const direction = this._dir.copy(this.target).sub(origin).normalize();
    this._quat.setFromUnitVectors(this._down, direction);
    for (const [mesh, width] of [[this.coneOuter, 0.5], [this.coneInner, 0.2]]) {
      mesh.visible = this.spotlight;
      if (!this.spotlight) continue;
      mesh.position.copy(origin);
      mesh.quaternion.copy(this._quat);
      mesh.scale.set(distance * width, distance, distance * width);
    }
    this.spotPool.visible = this.spotlight;
    if (this.spotlight) {
      this.spotPool.position.set(this.target.x, this.target.y + 0.05, this.target.z);
      const size = Math.max(4, distance * 0.24);
      this.spotPool.scale.set(size, size * 0.72, 1);
      this.spotPool.material.opacity = 0.42 + Math.sin((this.spin ?? 0) * 3.2) * 0.08;
    }
    this.lens.visible = this.spotlight;
  }

  hudState(player) {
    const dx = this.group.position.x - player.position.x;
    const dz = this.group.position.z - player.position.z;
    return {
      active: true,
      x: this.group.position.x,
      y: this.group.position.y,
      z: this.group.position.z,
      distance: Math.round(Math.hypot(dx, dz)),
      altitude: Math.round(this.group.position.y - this.world.groundHeightAt(player.position.x, player.position.z)),
      spotlight: this.spotlight,
    };
  }
}
