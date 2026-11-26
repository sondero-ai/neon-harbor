// The harbor's physical punctuation: pooled sparks, smoke, tracers and flashes,
// one reusable explosion light, road-level headlight beams, camera shake and the
// hurt tint the HUD reads. Everything is allocated once and recycled, so a
// firefight costs buffer writes rather than new meshes. Skid marks live here
// too because the ground ribbon is the same kind of long-lived effect.

import * as THREE from '../vendor/three.module.js';
import { makeGlowSprite, makeGlowTexture } from './geo.js';

const MAX_SPARKS = 260;
const MAX_SMOKE = 46;
const MAX_FLASHES = 18;
const MAX_TRACERS = 40;

const _color = new THREE.Color();
const _vector = new THREE.Vector3();

function hide(object) {
  object.visible = false;
  object.scale.setScalar(0.001);
}

// The skid ribbon moved out of vehicles.js: six vertices per quad in one
// non-indexed buffer, overwritten in a ring so a long drift costs no allocation.
export class SkidMarks {
  constructor(scene, maxQuads = 900) {
    this.maxQuads = maxQuads;
    this.cursor = 0;
    this.positions = new Float32Array(maxQuads * 6 * 3);
    this.positions.fill(-80);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setDrawRange(0, maxQuads * 6);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0x0b0910,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }

  reset() {
    this.cursor = 0;
    this.positions.fill(-80);
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  add(x, z, directionX, directionZ, y, width = 0.26, length = 0.72) {
    const sideX = -directionZ;
    const sideZ = directionX;
    const halfWidth = width / 2;
    const halfLength = length / 2;
    const ax = x - directionX * halfLength + sideX * halfWidth;
    const az = z - directionZ * halfLength + sideZ * halfWidth;
    const bx = x + directionX * halfLength + sideX * halfWidth;
    const bz = z + directionZ * halfLength + sideZ * halfWidth;
    const cx = x + directionX * halfLength - sideX * halfWidth;
    const cz = z + directionZ * halfLength - sideZ * halfWidth;
    const dx = x - directionX * halfLength - sideX * halfWidth;
    const dz = z - directionZ * halfLength - sideZ * halfWidth;
    const offset = this.cursor * 18;
    const p = this.positions;
    const height = y + 0.028;
    p[offset] = ax; p[offset + 1] = height; p[offset + 2] = az;
    p[offset + 3] = bx; p[offset + 4] = height; p[offset + 5] = bz;
    p[offset + 6] = cx; p[offset + 7] = height; p[offset + 8] = cz;
    p[offset + 9] = ax; p[offset + 10] = height; p[offset + 11] = az;
    p[offset + 12] = cx; p[offset + 13] = height; p[offset + 14] = cz;
    p[offset + 15] = dx; p[offset + 16] = height; p[offset + 17] = dz;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.cursor = (this.cursor + 1) % this.maxQuads;
  }
}

export class Effects {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.time = 0;
    this.shakeAmount = 0;
    this.hurtLevel = 0;
    this.hurtDirection = 0;
    this.lowQuality = quality === 'low';
    this.lightVehicles = new Set();
    this._spriteCursor = 0;
    this._flashCursor = 0;
    this._tracerCursor = 0;
    this._sparkCursor = 0;

    this.buildSparks();
    this.buildSmoke();
    this.buildFlashes();
    this.buildTracers();
    this.buildExplosionLight();
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd79b,
      transparent: true,
      opacity: this.lowQuality ? 0.09 : 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    this.beamGeometry = new THREE.PlaneGeometry(2.7, 11);
    this.beamGeometry.rotateX(-Math.PI / 2);
  }

  // ------------------------------------------------------------ particle pools

  buildSparks() {
    this.sparkPositions = new Float32Array(MAX_SPARKS * 3);
    this.sparkColors = new Float32Array(MAX_SPARKS * 3);
    this.sparkVelocities = new Float32Array(MAX_SPARKS * 3);
    this.sparkLife = new Float32Array(MAX_SPARKS);
    this.sparkMaxLife = new Float32Array(MAX_SPARKS);
    this.sparkPositions.fill(-900);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.sparkColors, 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.PointsMaterial({
      map: makeGlowTexture(),
      size: this.lowQuality ? 0.24 : 0.19,
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      toneMapped: false,
    });
    this.sparks = new THREE.Points(geometry, material);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 3;
    this.scene.add(this.sparks);
  }

  buildSmoke() {
    this.smoke = [];
    for (let i = 0; i < MAX_SMOKE; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        color: 0x75636a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.userData = { life: 0, maxLife: 1, scale: 1, drift: new THREE.Vector3(), spin: 0 };
      this.scene.add(sprite);
      this.smoke.push(sprite);
    }
  }

  buildFlashes() {
    this.flashes = [];
    for (let i = 0; i < MAX_FLASHES; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        color: 0xffd08c,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.userData = { life: 0, maxLife: 0.1, scale: 1, grow: 0 };
      this.scene.add(sprite);
      this.flashes.push(sprite);
    }
  }

  buildTracers() {
    this.tracerPositions = new Float32Array(MAX_TRACERS * 2 * 3);
    this.tracerColors = new Float32Array(MAX_TRACERS * 2 * 3);
    this.tracerLife = new Float32Array(MAX_TRACERS);
    this.tracerMaxLife = new Float32Array(MAX_TRACERS);
    this.tracerPositions.fill(-900);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.tracerPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.tracerColors, 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.tracers = new THREE.LineSegments(geometry, material);
    this.tracers.frustumCulled = false;
    this.tracers.renderOrder = 3;
    this.scene.add(this.tracers);
  }

  buildExplosionLight() {
    this.blastLight = new THREE.PointLight(0xffa25c, 0, 28, 1.7);
    this.blastLight.visible = false;
    this.scene.add(this.blastLight);
    this.blastLife = 0;
  }

  setQuality(quality) {
    this.quality = quality;
    this.lowQuality = quality === 'low';
    this.sparks.material.size = this.lowQuality ? 0.24 : 0.19;
  }

  // ------------------------------------------------------------ spawn helpers

  spark(x, y, z, direction = null, color = 0xffb054, count = 4, speed = 6) {
    const n = this.lowQuality ? Math.max(1, Math.ceil(count * 0.6)) : count;
    for (let i = 0; i < n; i += 1) {
      const index = this._sparkCursor;
      this._sparkCursor = (this._sparkCursor + 1) % MAX_SPARKS;
      const offset = index * 3;
      this.sparkPositions[offset] = x;
      this.sparkPositions[offset + 1] = y;
      this.sparkPositions[offset + 2] = z;
      const spread = 0.8;
      let vx = (Math.random() - 0.5) * spread * speed;
      let vy = Math.random() * speed * 0.75 + 0.6;
      let vz = (Math.random() - 0.5) * spread * speed;
      if (direction) {
        vx += direction.x * speed * 0.55;
        vy += direction.y * speed * 0.25;
        vz += direction.z * speed * 0.55;
      }
      this.sparkVelocities[offset] = vx;
      this.sparkVelocities[offset + 1] = vy;
      this.sparkVelocities[offset + 2] = vz;
      _color.setHex(color);
      this.sparkColors[offset] = _color.r;
      this.sparkColors[offset + 1] = _color.g;
      this.sparkColors[offset + 2] = _color.b;
      this.sparkLife[index] = 0.22 + Math.random() * 0.5;
      this.sparkMaxLife[index] = this.sparkLife[index];
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.color.needsUpdate = true;
  }

  smokePuff(x, y, z, { scale = 1.8, life = 1.8, color = 0x806e73, rise = 1.1 } = {}) {
    const sprite = this.smoke[this._spriteCursor];
    this._spriteCursor = (this._spriteCursor + 1) % MAX_SMOKE;
    sprite.visible = true;
    sprite.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
    sprite.material.color.setHex(color);
    sprite.material.opacity = 0.42;
    sprite.scale.setScalar(scale * 0.45);
    sprite.userData.life = life;
    sprite.userData.maxLife = life;
    sprite.userData.scale = scale;
    sprite.userData.drift.set((Math.random() - 0.5) * 0.7, rise, (Math.random() - 0.5) * 0.7);
    sprite.userData.spin = (Math.random() - 0.5) * 0.7;
    sprite.material.rotation = Math.random() * Math.PI;
  }

  flash(x, y, z, { color = 0xffcf8c, scale = 1.5, life = 0.08, grow = 2.2 } = {}) {
    const sprite = this.flashes[this._flashCursor];
    this._flashCursor = (this._flashCursor + 1) % MAX_FLASHES;
    sprite.visible = true;
    sprite.position.set(x, y, z);
    sprite.material.color.setHex(color);
    sprite.material.opacity = 0.95;
    sprite.scale.setScalar(scale);
    sprite.userData.life = life;
    sprite.userData.maxLife = life;
    sprite.userData.scale = scale;
    sprite.userData.grow = grow;
  }

  tracer(from, to, color = 0xffd08a) {
    const index = this._tracerCursor;
    this._tracerCursor = (this._tracerCursor + 1) % MAX_TRACERS;
    const offset = index * 6;
    this.tracerPositions[offset] = from.x;
    this.tracerPositions[offset + 1] = from.y;
    this.tracerPositions[offset + 2] = from.z;
    this.tracerPositions[offset + 3] = to.x;
    this.tracerPositions[offset + 4] = to.y;
    this.tracerPositions[offset + 5] = to.z;
    _color.setHex(color);
    for (let i = 0; i < 2; i += 1) {
      this.tracerColors[offset + i * 3] = _color.r;
      this.tracerColors[offset + i * 3 + 1] = _color.g;
      this.tracerColors[offset + i * 3 + 2] = _color.b;
    }
    this.tracerLife[index] = 0.11;
    this.tracerMaxLife[index] = 0.11;
    this.tracers.geometry.attributes.position.needsUpdate = true;
    this.tracers.geometry.attributes.color.needsUpdate = true;
  }

  muzzle(x, y, z, color = 0xffd08c) {
    this.flash(x, y, z, { color, scale: 1.15, life: 0.055, grow: 1.8 });
    this.spark(x, y, z, null, color, 3, 3.4);
  }

  impact(point, normal = null, kind = 'concrete') {
    const color = kind === 'metal' ? 0xffb257 : kind === 'glass' ? 0x8ff2e4 : 0xffd18a;
    this.spark(point.x, point.y, point.z, normal, color, kind === 'metal' ? 9 : 5, 7.5);
    this.smokePuff(point.x, point.y, point.z, {
      scale: kind === 'metal' ? 1.3 : 1.9,
      life: 0.85,
      color: kind === 'metal' ? 0x8c7c78 : 0xb49a83,
      rise: 0.45,
    });
  }

  explosion(x, y, z) {
    this.flash(x, y + 0.6, z, { color: 0xffc46a, scale: 9, life: 0.32, grow: 18 });
    this.flash(x, y + 0.4, z, { color: 0xff6e3a, scale: 5, life: 0.55, grow: 9 });
    this.spark(x, y + 0.4, z, null, 0xffa04a, 34, 14);
    this.spark(x, y + 0.2, z, null, 0xffe2a1, 16, 8);
    for (let i = 0; i < 7; i += 1) {
      this.smokePuff(x + (Math.random() - 0.5) * 2.6, y + 0.5 + Math.random() * 0.7, z + (Math.random() - 0.5) * 2.6, {
        scale: 3.4 + Math.random() * 2.2,
        life: 2.1 + Math.random(),
        color: i % 2 ? 0x413b40 : 0x6c5b58,
        rise: 1.3 + Math.random() * 0.8,
      });
    }
    this.blastLight.position.set(x, y + 1.2, z);
    this.blastLight.visible = true;
    this.blastLight.intensity = 22;
    this.blastLife = 0.34;
    this.shake(0.9);
    this.hurt(0.28);
  }

  shake(amount) {
    this.shakeAmount = Math.min(1.6, this.shakeAmount + amount);
  }

  hurt(amount) {
    this.hurtLevel = Math.min(1, this.hurtLevel + amount);
  }

  // ------------------------------------------------------------ vehicle lights

  registerVehicle(vehicle) {
    if (vehicle.__lightKit) return;
    const group = new THREE.Group();
    group.name = 'vehicle-light-kit';
    const length = vehicle.shape.length;
    const width = vehicle.shape.width;
    const beams = [];
    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
      beam.position.set(side * width * 0.32, 0.04, length / 2 + 5.1);
      beam.renderOrder = 2;
      group.add(beam);
      beams.push(beam);
      const lamp = makeGlowSprite(0xffe6b5, 1.7, 0.84);
      lamp.position.set(side * width * 0.36, 0.68, length / 2 + 0.06);
      group.add(lamp);
      const tail = makeGlowSprite(0xff3928, 1.05, 0.66);
      tail.position.set(side * width * 0.38, 0.84, -length / 2 - 0.06);
      group.add(tail);
    }
    vehicle.group.add(group);
    vehicle.__lightKit = group;
    this.lightVehicles.add(vehicle);
  }

  unregisterVehicle(vehicle) {
    if (!vehicle.__lightKit) return;
    vehicle.__lightKit.traverse((object) => {
      if (object.material && object.material.isSpriteMaterial) object.material.dispose();
    });
    vehicle.group.remove(vehicle.__lightKit);
    delete vehicle.__lightKit;
    this.lightVehicles.delete(vehicle);
  }

  // ------------------------------------------------------------ per frame

  update(dt, camera) {
    this.time += dt;
    this.updateSparks(dt);
    this.updateSmoke(dt);
    this.updateFlashes(dt);
    this.updateTracers(dt);
    this.updateBlast(dt);
    for (const vehicle of this.lightVehicles) {
      if (vehicle.removed) {
        this.lightVehicles.delete(vehicle);
        continue;
      }
      if (vehicle.__lightKit) vehicle.__lightKit.visible = Boolean(vehicle.driver);
    }
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 1.9);
    this.hurtLevel = Math.max(0, this.hurtLevel - dt * 1.35);
    if (camera && this.shakeAmount > 0.002) {
      const t = this.time;
      const amount = this.shakeAmount;
      camera.position.x += Math.sin(t * 73.1) * amount * 0.11;
      camera.position.y += Math.sin(t * 59.7 + 1.3) * amount * 0.08;
      camera.position.z += Math.cos(t * 67.3) * amount * 0.1;
      camera.rotation.z += Math.sin(t * 51.7) * amount * 0.016;
    }
  }

  updateSparks(dt) {
    let live = false;
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      if (this.sparkLife[i] <= 0) continue;
      live = true;
      this.sparkLife[i] -= dt;
      const offset = i * 3;
      if (this.sparkLife[i] <= 0) {
        this.sparkPositions[offset + 1] = -900;
        this.sparkColors[offset] = 0;
        this.sparkColors[offset + 1] = 0;
        this.sparkColors[offset + 2] = 0;
        continue;
      }
      this.sparkVelocities[offset + 1] -= 13.5 * dt;
      this.sparkPositions[offset] += this.sparkVelocities[offset] * dt;
      this.sparkPositions[offset + 1] += this.sparkVelocities[offset + 1] * dt;
      this.sparkPositions[offset + 2] += this.sparkVelocities[offset + 2] * dt;
      if (this.sparkPositions[offset + 1] < 0.03) {
        this.sparkPositions[offset + 1] = 0.03;
        this.sparkVelocities[offset + 1] *= -0.32;
        this.sparkVelocities[offset] *= 0.65;
        this.sparkVelocities[offset + 2] *= 0.65;
      }
      const fade = this.sparkLife[i] / this.sparkMaxLife[i];
      _color.setRGB(1, 0.48 + fade * 0.42, 0.16 + fade * 0.3);
      const red = this.sparkColors[offset];
      this.sparkColors[offset] = red * 0.92;
      this.sparkColors[offset + 1] *= 0.93 + fade * 0.05;
      this.sparkColors[offset + 2] *= 0.94;
    }
    if (live) {
      this.sparks.geometry.attributes.position.needsUpdate = true;
      this.sparks.geometry.attributes.color.needsUpdate = true;
    }
  }

  updateSmoke(dt) {
    for (const sprite of this.smoke) {
      if (!sprite.visible) continue;
      const data = sprite.userData;
      data.life -= dt;
      if (data.life <= 0) {
        hide(sprite);
        continue;
      }
      sprite.position.addScaledVector(data.drift, dt);
      const t = 1 - data.life / data.maxLife;
      sprite.scale.setScalar(data.scale * (0.35 + t * 1.1));
      sprite.material.opacity = 0.42 * (1 - t) * (1 - t);
      sprite.material.rotation += data.spin * dt;
    }
  }

  updateFlashes(dt) {
    for (const sprite of this.flashes) {
      if (!sprite.visible) continue;
      const data = sprite.userData;
      data.life -= dt;
      if (data.life <= 0) {
        hide(sprite);
        continue;
      }
      const t = 1 - data.life / data.maxLife;
      sprite.scale.setScalar(data.scale * (1 + t * data.grow));
      sprite.material.opacity = 0.95 * (1 - t);
    }
  }

  updateTracers(dt) {
    let live = false;
    for (let i = 0; i < MAX_TRACERS; i += 1) {
      if (this.tracerLife[i] <= 0) continue;
      live = true;
      this.tracerLife[i] -= dt;
      const offset = i * 6;
      if (this.tracerLife[i] <= 0) {
        this.tracerPositions[offset] = -900;
        this.tracerPositions[offset + 3] = -900;
        this.tracerColors[offset] = 0;
        this.tracerColors[offset + 1] = 0;
        this.tracerColors[offset + 2] = 0;
        this.tracerColors[offset + 3] = 0;
        this.tracerColors[offset + 4] = 0;
        this.tracerColors[offset + 5] = 0;
        continue;
      }
      const fade = this.tracerLife[i] / this.tracerMaxLife[i];
      for (let side = 0; side < 2; side += 1) {
        this.tracerColors[offset + side * 3] *= 0.9;
        this.tracerColors[offset + side * 3 + 1] *= 0.82;
        this.tracerColors[offset + side * 3 + 2] *= 0.75;
      }
      if (fade < 0) this.tracerLife[i] = 0;
    }
    if (live) {
      this.tracers.geometry.attributes.position.needsUpdate = true;
      this.tracers.geometry.attributes.color.needsUpdate = true;
    }
  }

  updateBlast(dt) {
    if (!this.blastLight.visible) return;
    this.blastLife -= dt;
    if (this.blastLife <= 0) {
      this.blastLight.visible = false;
      this.blastLight.intensity = 0;
      return;
    }
    this.blastLight.intensity = 22 * (this.blastLife / 0.34);
  }
}
