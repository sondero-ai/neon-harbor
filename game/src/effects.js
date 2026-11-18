// Everything that flies, sparks, smokes or shakes: a two-batch particle system (soft smoke and
// additive glow), tracer lines, muzzle flashes, tyre marks, explosion blooms and the camera shake
// amount the main loop reads. Pools are fixed, so firing does not allocate.
import * as THREE from '../vendor/three.module.js';
import { makeGlowTexture } from './geo.js';

// Effects use their own fixed-seed generator so a screenshot frame is identical every run.
const rand = (() => {
  let a = 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

const MAX_PARTICLES = 420;

function makeParticleBatch(scene, texture, blending) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const alphas = new Float32Array(MAX_PARTICLES);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture } },
    transparent: true,
    depthWrite: false,
    blending,
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (220.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
        vColor = aColor;
        vAlpha = aAlpha;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(vColor, 1.0) * tex.a * vAlpha;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, growth: 0, gravity: 0, drag: 0, r: 1, g: 1, b: 1, alpha: 1 });
  }
  return { geometry, attributes: { positions, colors, sizes, alphas }, parts, cursor: 0 };
}

function spawnIn(batch, particle) {
  const index = batch.cursor;
  batch.cursor = (batch.cursor + 1) % MAX_PARTICLES;
  const p = batch.parts[index];
  Object.assign(p, particle);
  p.life = particle.life;
  return p;
}

export function createEffects(scene, camera) {
  const glow = makeGlowTexture();
  const soft = makeParticleBatch(scene, glow, THREE.NormalBlending);
  const bright = makeParticleBatch(scene, glow, THREE.AdditiveBlending);
  const shakeState = { amount: 0, time: 0 };

  // Tracers: one line strip pool drawn additively, colours fading to black.
  const tracerCount = 20;
  const tracerPositions = new Float32Array(tracerCount * 6);
  const tracerColors = new Float32Array(tracerCount * 6);
  const tracerLife = new Float32Array(tracerCount);
  const tracerGeometry = new THREE.BufferGeometry();
  tracerGeometry.setAttribute('position', new THREE.BufferAttribute(tracerPositions, 3));
  tracerGeometry.setAttribute('color', new THREE.BufferAttribute(tracerColors, 3));
  const tracerMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const tracers = new THREE.LineSegments(tracerGeometry, tracerMaterial);
  tracers.frustumCulled = false;
  scene.add(tracers);
  let tracerCursor = 0;

  // Tyre marks: one InstancedMesh cycled around like a ring buffer.
  const markCount = 500;
  const markGeometry = new THREE.PlaneGeometry(0.32, 0.9);
  markGeometry.rotateX(-Math.PI / 2);
  const markMaterial = new THREE.MeshBasicMaterial({ color: '#100d12', transparent: true, opacity: 0.55, depthWrite: false });
  const marks = new THREE.InstancedMesh(markGeometry, markMaterial, markCount);
  marks.frustumCulled = false;
  scene.add(marks);
  const markDummy = new THREE.Object3D();
  let markCursor = 0;

  // Muzzle flashes and explosion blooms: billboarded sprites with their own materials.
  const flashes = [];
  for (let i = 0; i < 6; i += 1) {
    const material = new THREE.SpriteMaterial({ map: glow, color: '#ffd39a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.scale.setScalar(1.4);
    scene.add(sprite);
    flashes.push({ sprite, life: 0, max: 0.001, start: 1 });
  }
  let flashCursor = 0;

  function puff(x, y, z, options) {
    spawnIn(soft, {
      life: options.life, max: options.life, x, y, z,
      vx: options.vx ?? 0, vy: options.vy ?? 0.5, vz: options.vz ?? 0,
      size: options.size ?? 1, growth: options.growth ?? 1.4, gravity: options.gravity ?? -0.4,
      drag: options.drag ?? 1.2, r: options.r ?? 0.5, g: options.g ?? 0.5, b: options.b ?? 0.55, alpha: options.alpha ?? 0.5,
    });
  }

  function spark(x, y, z, options) {
    spawnIn(bright, {
      life: options.life, max: options.life, x, y, z,
      vx: options.vx ?? 0, vy: options.vy ?? 0, vz: options.vz ?? 0,
      size: options.size ?? 0.3, growth: options.growth ?? 0, gravity: options.gravity ?? -9,
      drag: options.drag ?? 0.5, r: options.r ?? 1, g: options.g ?? 0.7, b: options.b ?? 0.3, alpha: options.alpha ?? 1,
    });
  }

  function smoke(x, y, z, amount = 1) {
    for (let i = 0; i < amount; i += 1) {
      puff(x + (rand() - 0.5) * 0.8, y, z + (rand() - 0.5) * 0.8, {
        life: 1.6 + rand() * 1.4, vy: 1.1 + rand(), size: 0.9 + rand(), growth: 2.4,
        r: 0.32, g: 0.3, b: 0.34, alpha: 0.42,
      });
    }
  }

  function exhaust(x, y, z) {
    puff(x, y, z, { life: 0.7, vy: 0.5, size: 0.4, growth: 1.1, r: 0.36, g: 0.35, b: 0.4, alpha: 0.28 });
  }

  function dust(x, y, z) {
    for (let i = 0; i < 4; i += 1) {
      puff(x + (rand() - 0.5) * 0.6, y + 0.1, z + (rand() - 0.5) * 0.6, {
        life: 0.6 + rand() * 0.4, vy: 0.6 + rand() * 0.8, size: 0.5, growth: 1.8,
        r: 0.62, g: 0.55, b: 0.48, alpha: 0.4,
      });
    }
  }

  function splash(x, z) {
    for (let i = 0; i < 8; i += 1) {
      spark(x + (rand() - 0.5) * 1.6, 0.2, z + (rand() - 0.5) * 1.6, {
        life: 0.5 + rand() * 0.3, vy: 2 + rand() * 2.4, vx: (rand() - 0.5) * 2.6, vz: (rand() - 0.5) * 2.6,
        size: 0.26, gravity: -12, r: 0.7, g: 0.95, b: 1, alpha: 0.9,
      });
    }
  }

  function fire(x, y, z, amount = 3) {
    for (let i = 0; i < amount; i += 1) {
      spark(x + (rand() - 0.5) * 1.6, y + rand() * 0.6, z + (rand() - 0.5) * 1.6, {
        life: 0.5 + rand() * 0.7, vy: 1.4 + rand() * 2, size: 1.3 + rand(),
        growth: 1.8, gravity: 0.6, r: 1, g: 0.45 + rand() * 0.3, b: 0.12, alpha: 0.8,
      });
    }
  }

  function muzzle(position, color = '#ffe0a0') {
    const flash = flashes[flashCursor];
    flashCursor = (flashCursor + 1) % flashes.length;
    flash.sprite.position.copy(position);
    flash.sprite.material.color.set(color);
    flash.sprite.material.rotation = rand() * 6.28;
    flash.sprite.visible = true;
    flash.sprite.scale.setScalar(1.1 + rand() * 0.7);
    flash.life = 0.06;
    flash.max = 0.06;
    flash.start = 1.3;
    spark(position.x, position.y, position.z, { life: 0.12, size: 0.5, r: 1, g: 0.85, b: 0.5, alpha: 1 });
  }

  function explosion(position, scale = 1) {
    const flash = flashes[flashCursor];
    flashCursor = (flashCursor + 1) % flashes.length;
    flash.sprite.position.copy(position);
    flash.sprite.material.color.set('#ffb35a');
    flash.sprite.visible = true;
    flash.sprite.scale.setScalar(10 * scale);
    flash.life = 0.35;
    flash.max = 0.35;
    flash.start = 12 * scale;
    for (let i = 0; i < 30; i += 1) {
      const angle = rand() * Math.PI * 2;
      const speed = 3 + rand() * 13;
      spark(position.x, position.y, position.z, {
        life: 0.5 + rand() * 0.9, vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: 2 + rand() * 8,
        size: 0.5 + rand() * 0.8, gravity: -12, r: 1, g: 0.5 + rand() * 0.4, b: 0.15, alpha: 1,
      });
    }
    for (let i = 0; i < 16; i += 1) {
      puff(position.x + (rand() - 0.5) * 4, position.y + rand() * 2, position.z + (rand() - 0.5) * 4, {
        life: 2.4 + rand() * 1.6, vy: 1.6 + rand() * 2, size: 2.2 + rand() * 2, growth: 3.2,
        r: 0.16, g: 0.14, b: 0.16, alpha: 0.6,
      });
    }
  }

  function tracer(from, to, color = '#ffd98a') {
    const index = tracerCursor;
    tracerCursor = (tracerCursor + 1) % tracerCount;
    tracerLife[index] = 0.09;
    const c = new THREE.Color(color);
    tracerPositions.set([from.x, from.y, from.z, to.x, to.y, to.z], index * 6);
    tracerColors.set([c.r, c.g, c.b, c.r, c.g, c.b], index * 6);
    tracerGeometry.attributes.position.needsUpdate = true;
    tracerGeometry.attributes.color.needsUpdate = true;
  }

  function skid(x, z, heading, width = 0.9) {
    const index = markCursor;
    markCursor = (markCursor + 1) % markCount;
    markDummy.position.set(x, 0.06, z);
    markDummy.rotation.set(0, heading, 0);
    markDummy.scale.set(width, 1, 1 + rand() * 0.4);
    markDummy.updateMatrix();
    marks.setMatrixAt(index, markDummy.matrix);
    marks.instanceMatrix.needsUpdate = true;
  }

  function shake(amount) {
    shakeState.amount = Math.min(1.4, shakeState.amount + amount);
  }

  function update(dt) {
    for (const batch of [soft, bright]) {
      const { attributes, parts } = batch;
      const { positions, colors, sizes, alphas } = attributes;
      for (let i = 0; i < parts.length; i += 1) {
        const p = parts[i];
        if (p.life <= 0) {
          sizes[i] = 0;
          alphas[i] = 0;
          continue;
        }
        p.life -= dt;
        const decay = Math.max(0, 1 - p.drag * dt);
        p.vx *= decay; p.vz *= decay; p.vy = p.vy * decay + p.gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.size += p.growth * dt;
        const t = Math.max(0, p.life / p.max);
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        colors[i * 3] = p.r; colors[i * 3 + 1] = p.g; colors[i * 3 + 2] = p.b;
        sizes[i] = p.size;
        alphas[i] = p.alpha * Math.min(1, t * 2.2);
      }
      attributes.positions.needsUpdate = true;
      attributes.colors.needsUpdate = true;
      attributes.sizes.needsUpdate = true;
      attributes.alphas.needsUpdate = true;
      batch.geometry.setDrawRange(0, parts.length);
    }
    for (let i = 0; i < tracerCount; i += 1) {
      if (tracerLife[i] <= 0) continue;
      tracerLife[i] -= dt;
      const fade = Math.max(0, tracerLife[i] / 0.09);
      for (let k = 0; k < 2; k += 1) {
        const at = i * 6 + k * 3;
        tracerColors[at] *= 0.0001 + fade * 0.12 + 0.88;
        tracerColors[at + 1] *= 0.0001 + fade * 0.12 + 0.88;
        tracerColors[at + 2] *= 0.0001 + fade * 0.12 + 0.88;
      }
    }
    tracerGeometry.attributes.color.needsUpdate = true;
    for (const flash of flashes) {
      if (flash.life <= 0) {
        flash.sprite.visible = false;
        continue;
      }
      flash.life -= dt;
      const t = Math.max(0, flash.life / flash.max);
      flash.sprite.material.opacity = t;
      flash.sprite.scale.setScalar(flash.start * (0.6 + (1 - t) * 1.1));
    }
    shakeState.amount *= Math.max(0, 1 - dt * 5.5);
    shakeState.time += dt;
  }

  /** Pixel offsets for the camera this frame. */
  function shakeOffset() {
    const a = shakeState.amount;
    if (a < 0.001) return { x: 0, y: 0, roll: 0 };
    return {
      x: Math.sin(shakeState.time * 61) * a * 0.16,
      y: Math.cos(shakeState.time * 47) * a * 0.12,
      roll: Math.sin(shakeState.time * 33) * a * 0.02,
    };
  }

  return { update, smoke, exhaust, dust, splash, fire, muzzle, explosion, tracer, skid, shake, shakeOffset, spark, soft, bright, tracers };
}
