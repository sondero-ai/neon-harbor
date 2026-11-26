// Static glow sprites (aircraft beacons, lamp halos, pier bulbs, sign spill)
// batched into one instanced, camera-facing quad mesh. Each entry keeps its
// own world position, size, colour and brightness; brightness is written into
// the instance colour, so additive blending gives per-item opacity in one
// draw call instead of one draw per glow.

import * as THREE from '../vendor/three.module.js';
import { makeGlowTexture } from './geo.js';

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _color = new THREE.Color();

export class GlowField {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.mesh = null;
    this.material = null;
  }

  /** Adds a glow and returns its index, which setBrightness() takes. */
  add({ x, y, z, scaleX = 1, scaleY = scaleX, color = 0xffffff, brightness = 1 }) {
    this.items.push({ x, y, z, scaleX, scaleY, color, brightness });
    return this.items.length - 1;
  }

  build() {
    if (this.items.length === 0) return;
    this.material = new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      this.material,
      this.items.length,
    );
    this.mesh.name = 'glow-field';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.items.forEach((item, index) => {
      _color.setHex(item.color).multiplyScalar(item.brightness);
      this.mesh.setColorAt(index, _color);
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);
  }

  setBrightness(index, brightness) {
    if (!this.mesh || index < 0 || index >= this.items.length) return;
    const item = this.items[index];
    if (Math.abs(item.brightness - brightness) < 0.002) return;
    item.brightness = brightness;
    _color.setHex(item.color).multiplyScalar(brightness);
    this.mesh.setColorAt(index, _color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(camera) {
    if (!this.mesh || !camera) return;
    _quaternion.copy(camera.quaternion);
    for (let i = 0; i < this.items.length; i += 1) {
      const item = this.items[i];
      _position.set(item.x, item.y, item.z);
      _scale.set(item.scaleX, item.scaleY, 1);
      _matrix.compose(_position, _quaternion, _scale);
      this.mesh.setMatrixAt(i, _matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
