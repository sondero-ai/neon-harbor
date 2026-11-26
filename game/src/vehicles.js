// The harbor's traffic hardware: seven original low-poly vehicle classes with
// arcade handling (throttle / brake / reverse / drift), building collision,
// fuel drain and a pooled skid-mark ribbon. The builders and shared materials
// live in vehicle-geometry.js, and the fleet that spawns and updates cars
// lives in vehicle-fleet.js; this file is the Vehicle itself, so a police
// pursuit can reuse the same cars. Traffic AI lives in traffic.js.

import * as THREE from '../vendor/three.module.js';
import { WORLD } from './config.js';
import { drainFuel } from './fuel.js';
import { makeGlowSprite } from './geo.js';
import { SkidMarks } from './effects.js';
import {
  buildPoliceDecalGeometry,
  geometryFor,
  getPoliceDecalTexture,
  getWheelGeometry,
  getWheelMaterial,
  glassMaterial,
  headlightMaterial,
  paintPalettes,
  setHeadlightLevel,
  trimMaterial,
} from './vehicle-geometry.js';

export {
  pickVehicleColor,
  setHeadlightLevel,
  vehicleBodyGeometry,
  vehicleShape,
} from './vehicle-geometry.js';

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

export const VEHICLE_TYPES = {
  sedan: {
    name: 'Fathom 400',
    className: 'SEDAN',
    tune: 'HARBOR STOCK',
    maxSpeed: 33,
    acceleration: 8.8,
    brake: 17,
    reverseSpeed: 8,
    grip: 7.4,
    steer: 0.58,
    colors: paintPalettes.sedan,
  },
  taxi: {
    name: 'Harbor Cab',
    className: 'TAXI',
    tune: 'FLEET TUNE',
    maxSpeed: 32,
    acceleration: 8.2,
    brake: 16,
    reverseSpeed: 8,
    grip: 7.2,
    steer: 0.58,
    colors: paintPalettes.taxi,
  },
  sports: {
    name: 'Vela GT',
    className: 'SPORTS',
    tune: 'STRIP TUNE',
    maxSpeed: 45,
    acceleration: 14.2,
    brake: 20,
    reverseSpeed: 8,
    grip: 9.2,
    steer: 0.62,
    colors: paintPalettes.sports,
  },
  muscle: {
    name: 'Riptide 442',
    className: 'MUSCLE',
    tune: 'DRAG TUNE',
    maxSpeed: 41,
    acceleration: 12.8,
    brake: 15,
    reverseSpeed: 9,
    grip: 6.0,
    steer: 0.6,
    colors: paintPalettes.muscle,
  },
  van: {
    name: 'Mule 9',
    className: 'VAN',
    tune: 'HAUL TUNE',
    maxSpeed: 28,
    acceleration: 6.4,
    brake: 14,
    reverseSpeed: 6,
    grip: 7.8,
    steer: 0.5,
    colors: paintPalettes.van,
  },
  pickup: {
    name: 'Dune Hauler',
    className: 'PICKUP',
    tune: 'DOCK TUNE',
    maxSpeed: 31,
    acceleration: 8.2,
    brake: 15,
    reverseSpeed: 7,
    grip: 6.8,
    steer: 0.55,
    colors: paintPalettes.pickup,
  },
  police: {
    name: 'Harbor PD Cruiser',
    className: 'POLICE',
    tune: 'PURSUIT TUNE',
    maxSpeed: 39,
    acceleration: 12,
    brake: 20,
    reverseSpeed: 9,
    grip: 8.6,
    steer: 0.6,
    colors: paintPalettes.police,
  },
};

export const TRAFFIC_MIX = ['sedan', 'sedan', 'taxi', 'sedan', 'van', 'sports', 'pickup', 'sedan', 'muscle', 'taxi'];

const _local = new THREE.Vector3();
const _wheelMatrix = new THREE.Matrix4();
const _wheelPosition = new THREE.Vector3();
const _wheelScale = new THREE.Vector3();
const _wheelQuaternion = new THREE.Quaternion();
const _wheelSteer = new THREE.Quaternion();
const _wheelSpinQuat = new THREE.Quaternion();
const _wheelIdentity = new THREE.Quaternion();
const _wheelAxisY = new THREE.Vector3(0, 1, 0);
const _wheelAxisX = new THREE.Vector3(1, 0, 0);

export class Vehicle {
  constructor(type, { x = 0, z = 0, yaw = 0, color = null, fuel = 1 } = {}) {
    const spec = VEHICLE_TYPES[type] ?? VEHICLE_TYPES.sedan;
    const shape = geometryFor(type);
    this.type = type;
    this.spec = spec;
    this.shape = shape;
    this.name = spec.name;
    this.className = spec.className;
    this.tune = spec.tune ?? 'HARBOR STOCK';
    this.color = color ?? spec.colors[0];
    // Bodywork condition is presentation state only: it records hard impacts
    // for the HUD's condition bar and never feeds back into the physics.
    this.condition = 1;
    // The tank is session state like condition: 0..1, burned by distance.
    // A dry tank turns the throttle into nothing but the car still steers.
    this.fuel = Math.max(0, Math.min(1, fuel));
    this.driver = null;
    this.controls = { throttle: 0, brake: 1, steer: 0, handbrake: true };
    this.velocity = new THREE.Vector3();
    this.position = new THREE.Vector3(x, 0, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.steerAngle = 0;
    this.wheelSpin = 0;
    this.impact = 0;
    this.skidDistance = 0;
    this.ai = null;
    this.removed = false;

    this.group = new THREE.Group();
    this.group.name = `vehicle-${type}`;
    this.group.rotation.order = 'YXZ';

    this.paintMaterial = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.4,
      metalness: 0.36,
    });
    this.paintMesh = new THREE.Mesh(shape.paint, this.paintMaterial);
    this.paintMesh.castShadow = true;
    this.paintMesh.receiveShadow = true;
    this.group.add(this.paintMesh);

    this.trimMesh = new THREE.Mesh(shape.trim, trimMaterial);
    this.trimMesh.castShadow = true;
    this.trimMesh.receiveShadow = true;
    this.group.add(this.trimMesh);

    this.glassMesh = new THREE.Mesh(shape.glass, glassMaterial);
    this.glassMesh.castShadow = false;
    this.group.add(this.glassMesh);

    this.headMesh = new THREE.Mesh(shape.head, headlightMaterial);
    this.group.add(this.headMesh);

    this.tailMaterial = new THREE.MeshBasicMaterial({ color: 0x8f2017, toneMapped: false });
    this.tailMesh = new THREE.Mesh(shape.tail, this.tailMaterial);
    this.group.add(this.tailMesh);

    if (type === 'police') {
      this.decalMesh = new THREE.Mesh(
        buildPoliceDecalGeometry(shape),
        new THREE.MeshBasicMaterial({
          map: getPoliceDecalTexture(),
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      this.group.add(this.decalMesh);
      this.lightbarBase = new THREE.Group();
      this.lightbarBase.position.set(0, 1.5, -0.2);
      this.group.add(this.lightbarBase);
      this.lightbarRed = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.12, 0.24),
        new THREE.MeshBasicMaterial({ color: 0xff2d22, toneMapped: false }),
      );
      this.lightbarRed.position.set(-0.27, 0.06, 0);
      this.lightbarBlue = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.12, 0.24),
        new THREE.MeshBasicMaterial({ color: 0x2f5bff, toneMapped: false }),
      );
      this.lightbarBlue.position.set(0.27, 0.06, 0);
      this.lightbarBase.add(this.lightbarRed, this.lightbarBlue);
      this.lightGlowRed = makeGlowSprite(0xff4938, [2.9, 1.5], 0.8);
      this.lightGlowBlue = makeGlowSprite(0x4e7bff, [2.9, 1.5], 0.8);
      this.lightGlowRed.position.set(-0.27, 0.1, 0);
      this.lightGlowBlue.position.set(0.27, 0.1, 0);
      this.lightbarBase.add(this.lightGlowRed, this.lightGlowBlue);
    }

    // Four wheels, one instanced draw per car. Steering is a Y rotation on the
    // front instances and spin is an X rotation on all four.
    this.wheelLayout = [];
    this.wheelScale = shape.wheelRadius / 0.36;
    this.wheelMesh = new THREE.InstancedMesh(getWheelGeometry(), getWheelMaterial(), 4);
    this.wheelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheelMesh.castShadow = true;
    this.wheelMesh.receiveShadow = true;
    this.wheelMesh.frustumCulled = false;
    this.group.add(this.wheelMesh);
    for (const zSide of [1, -1]) {
      for (const xSide of [-1, 1]) {
        this.wheelLayout.push({
          x: xSide * shape.wheelHalfTrack,
          z: zSide * shape.wheelbase / 2,
          front: zSide === 1,
        });
      }
    }
    this.updateWheels();

    this.position.y = 0;
    this.group.position.copy(this.position);
    this.group.rotation.y = yaw;
  }

  get speed() {
    return this.velocity.x * Math.sin(this.yaw) + this.velocity.z * Math.cos(this.yaw);
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  get gear() {
    const forward = this.speed;
    if (forward < -0.5) return 'R';
    if (Math.abs(forward) < 0.5) return 'N';
    const ratio = Math.abs(forward) / this.spec.maxSpeed;
    return String(Math.min(6, 1 + Math.floor(ratio * 5.9)));
  }

  get engineRpm() {
    const ratio = clamp(Math.abs(this.speed) / this.spec.maxSpeed, 0, 1);
    const throttle = Math.max(0, this.controls.throttle);
    if (!this.driver) return 0;
    return clamp(820 + ratio * 4300 + throttle * 900, 820, 6400);
  }

  get engineOn() {
    return Boolean(this.driver);
  }

  get engineState() {
    return {
      on: this.engineOn,
      rpm: this.engineRpm,
      load: Math.abs(this.controls.throttle),
      gear: this.gear,
      speed: this.speed,
    };
  }

  get halfLength() {
    return this.shape.length / 2;
  }

  get halfWidth() {
    return this.shape.width / 2;
  }

  updateWheels() {
    if (!this.wheelMesh) return;
    const steer = this.driver ? this.steerAngle : 0;
    _wheelSteer.setFromAxisAngle(_wheelAxisY, steer);
    _wheelSpinQuat.setFromAxisAngle(_wheelAxisX, this.wheelSpin);
    _wheelScale.setScalar(this.wheelScale);
    for (let i = 0; i < this.wheelLayout.length; i += 1) {
      const wheel = this.wheelLayout[i];
      _wheelPosition.set(wheel.x, this.shape.wheelRadius, wheel.z);
      _wheelQuaternion.copy(wheel.front ? _wheelSteer : _wheelIdentity).multiply(_wheelSpinQuat);
      _wheelMatrix.compose(_wheelPosition, _wheelQuaternion, _wheelScale);
      this.wheelMesh.setMatrixAt(i, _wheelMatrix);
    }
    this.wheelMesh.instanceMatrix.needsUpdate = true;
  }

  setPose(x, z, yaw = this.yaw) {
    this.position.set(x, 0, z);
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.steerAngle = 0;
    this.group.position.set(x, 0, z);
    this.group.rotation.set(0, yaw, 0);
  }

  setDriver(driver) {
    this.driver = driver;
    if (!driver) {
      this.controls.throttle = 0;
      this.controls.brake = 1;
      this.controls.steer = 0;
      this.controls.handbrake = true;
      this.velocity.multiplyScalar(0.9);
    } else {
      this.controls.brake = 0;
      this.controls.handbrake = false;
    }
  }

  localPoint(x, z) {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    _local.set(dx * cos - dz * sin, 0, dx * sin + dz * cos);
    return _local;
  }

  distanceToBox(x, z) {
    const local = this.localPoint(x, z);
    const outsideX = Math.max(0, Math.abs(local.x) - this.halfWidth);
    const outsideZ = Math.max(0, Math.abs(local.z) - this.halfLength);
    return Math.hypot(outsideX, outsideZ);
  }

  /**
   * Circle against the car's oriented box. Returns the penetration depth and a
   * unit normal pointing from the car to the circle centre, in world space.
   * A zero penetration means the circle is clear of the bodywork.
   */
  overlapCircle(x, z, radius) {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    // Local x is the car's right side, local z is its forward axis.
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    const closestX = clamp(localX, -this.halfWidth, this.halfWidth);
    const closestZ = clamp(localZ, -this.halfLength, this.halfLength);
    const offsetX = localX - closestX;
    const offsetZ = localZ - closestZ;
    const distance = Math.hypot(offsetX, offsetZ);
    let penetration = 0;
    let normalLocalX = 0;
    let normalLocalZ = 0;
    if (distance > 1e-6) {
      if (distance >= radius) return { penetration: 0, nx: 0, nz: 0 };
      penetration = radius - distance;
      normalLocalX = offsetX / distance;
      normalLocalZ = offsetZ / distance;
    } else {
      // The centre is inside the box: leave by the nearest face.
      const left = localX + this.halfWidth;
      const right = this.halfWidth - localX;
      const back = localZ + this.halfLength;
      const front = this.halfLength - localZ;
      const least = Math.min(left, right, back, front);
      if (least === left) {
        normalLocalX = -1;
        penetration = radius + left;
      } else if (least === right) {
        normalLocalX = 1;
        penetration = radius + right;
      } else if (least === back) {
        normalLocalZ = -1;
        penetration = radius + back;
      } else {
        normalLocalZ = 1;
        penetration = radius + front;
      }
    }
    // Rotate the local normal back into world space: +x is side, +z is forward.
    return {
      penetration,
      nx: normalLocalX * cos + normalLocalZ * sin,
      nz: -normalLocalX * sin + normalLocalZ * cos,
    };
  }

  collidesAt(x, z, world) {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const forwardX = sin;
    const forwardZ = cos;
    const sideX = cos;
    const sideZ = -sin;
    const probes = [
      [0, 0],
      [0, this.halfLength],
      [0, -this.halfLength],
      [this.halfWidth, this.halfLength * 0.82],
      [-this.halfWidth, this.halfLength * 0.82],
      [this.halfWidth, -this.halfLength * 0.82],
      [-this.halfWidth, -this.halfLength * 0.82],
    ];
    const isPlayer = this.driver === 'player';
    for (const [side, forward] of probes) {
      const px = x + forwardX * forward + sideX * side;
      const pz = z + forwardZ * forward + sideZ * side;
      if (world.collides(px, pz, 0.2)) return true;
      if (typeof world.vehicleBlocked === 'function' && world.vehicleBlocked(px, pz, isPlayer)) return true;
    }
    return false;
  }

  update(dt, elapsed, world, skids) {
    if (this.removed) return;
    if (this.driver) this.stepPhysics(dt, world, skids);
    else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    this.alignToGround(dt, world);
    this.animate(dt, elapsed);
  }

  stepPhysics(dt, world, skids) {
    const controls = this.controls;
    const spec = this.spec;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const forwardX = sin;
    const forwardZ = cos;
    const sideX = cos;
    const sideZ = -sin;

    let forwardSpeed = this.velocity.x * forwardX + this.velocity.z * forwardZ;
    let lateralSpeed = this.velocity.x * sideX + this.velocity.z * sideZ;

    const throttle = this.fuel <= 0 ? 0 : clamp(controls.throttle, -1, 1);
    const brake = clamp(controls.brake, 0, 1);

    if (throttle > 0) {
      if (forwardSpeed < -0.4) {
        forwardSpeed += spec.brake * 0.55 * throttle * dt;
      } else {
        const ratio = clamp(forwardSpeed / spec.maxSpeed, 0, 1);
        const power = spec.acceleration * (1 - ratio * 0.72);
        forwardSpeed += power * throttle * dt;
      }
    } else if (throttle < 0) {
      if (forwardSpeed > 0.4) {
        forwardSpeed += spec.brake * throttle * dt;
      } else {
        const reverseRatio = clamp(-forwardSpeed / spec.reverseSpeed, 0, 1);
        forwardSpeed += spec.acceleration * 0.55 * throttle * (1 - reverseRatio * 0.7) * dt;
      }
    }

    if (brake > 0 && Math.abs(forwardSpeed) > 0.12) {
      forwardSpeed -= Math.sign(forwardSpeed) * spec.brake * brake * dt;
    }

    const rolling = 0.55 + Math.abs(forwardSpeed) * 0.018;
    if (Math.abs(forwardSpeed) > 0.05) forwardSpeed -= Math.sign(forwardSpeed) * rolling * dt;
    else if (Math.abs(throttle) < 0.02) forwardSpeed = 0;

    forwardSpeed = clamp(forwardSpeed, -spec.reverseSpeed, spec.maxSpeed);

    const speedRatio = clamp(Math.abs(forwardSpeed) / spec.maxSpeed, 0, 1);
    const steerLimit = spec.steer * (1 - speedRatio * 0.44);
    const steerTarget = clamp(controls.steer, -1, 1) * steerLimit;
    this.steerAngle = damp(this.steerAngle, steerTarget, 9.5, dt);

    const yawRate = (forwardSpeed / Math.max(0.6, this.shape.wheelbase)) * Math.tan(this.steerAngle)
      * (controls.handbrake ? 1.32 : 1);
    this.yaw += yawRate * dt;

    let grip = spec.grip;
    if (controls.handbrake) grip = 1.15;
    else grip *= 1 - clamp(Math.abs(lateralSpeed) / 22, 0, 0.36);
    lateralSpeed *= Math.exp(-grip * dt);

    if (controls.handbrake && Math.abs(forwardSpeed) > 0.2) {
      forwardSpeed -= Math.sign(forwardSpeed) * 5.4 * dt;
    }

    const newSin = Math.sin(this.yaw);
    const newCos = Math.cos(this.yaw);
    this.velocity.x = newSin * forwardSpeed + newCos * lateralSpeed;
    this.velocity.z = newCos * forwardSpeed - newSin * lateralSpeed;

    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    const distance = Math.hypot(dx, dz);
    const substeps = clamp(Math.ceil(distance / 0.72), 1, 7);
    const startX = this.position.x;
    const startZ = this.position.z;
    const stepX = dx / substeps;
    const stepZ = dz / substeps;
    for (let i = 0; i < substeps; i += 1) {
      const nextX = this.position.x + stepX;
      const nextZ = this.position.z + stepZ;
      if (!this.collidesAt(nextX, nextZ, world)) {
        this.position.x = nextX;
        this.position.z = nextZ;
        continue;
      }
      const movedX = !this.collidesAt(nextX, this.position.z, world);
      const movedZ = !this.collidesAt(this.position.x, nextZ, world);
      if (movedX) this.position.x = nextX;
      if (movedZ) this.position.z = nextZ;
      this.velocity.x *= movedX ? 0.45 : -0.08;
      this.velocity.z *= movedZ ? 0.45 : -0.08;
      this.impact = Math.min(1, this.impact + Math.abs(forwardSpeed) * 0.035);
      if (Math.abs(forwardSpeed) > 7) {
        this.condition = Math.max(0, this.condition - Math.abs(forwardSpeed) * 0.0016);
      }
      break;
    }
    this.fuel = drainFuel(this.fuel, Math.hypot(this.position.x - startX, this.position.z - startZ));

    if (this.position.x < WORLD.bounds.minX + 1 || this.position.x > WORLD.bounds.maxX - 1
      || this.position.z < WORLD.bounds.minZ + 1 || this.position.z > WORLD.bounds.maxZ - 1) {
      this.velocity.multiplyScalar(0.2);
    }

    this.impact = damp(this.impact, 0, 7, dt);

    const skidding = Math.abs(lateralSpeed) > 2.3
      || (controls.handbrake && Math.abs(forwardSpeed) > 3.5)
      || (brake > 0.65 && Math.abs(forwardSpeed) > 11);
    if (skids && skidding) {
      this.skidDistance += distance;
      if (this.skidDistance > 0.34) {
        this.skidDistance = 0;
        const travel = Math.hypot(this.velocity.x, this.velocity.z) || 1;
        const directionX = this.velocity.x / travel;
        const directionZ = this.velocity.z / travel;
        const rearZ = -this.shape.wheelbase / 2;
        for (const side of [-1, 1]) {
          const wheelX = this.position.x + newCos * side * this.shape.wheelHalfTrack + newSin * rearZ;
          const wheelZ = this.position.z - newSin * side * this.shape.wheelHalfTrack + newCos * rearZ;
          const ground = world.groundHeightAt(wheelX, wheelZ);
          skids.add(wheelX, wheelZ, directionX, directionZ, ground, 0.28, 0.74);
        }
      }
    } else {
      this.skidDistance = 0;
    }
  }

  alignToGround(dt, world) {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const frontX = this.position.x + sin * this.halfLength * 0.82;
    const frontZ = this.position.z + cos * this.halfLength * 0.82;
    const rearX = this.position.x - sin * this.halfLength * 0.82;
    const rearZ = this.position.z - cos * this.halfLength * 0.82;
    const leftX = this.position.x + cos * this.halfWidth;
    const leftZ = this.position.z - sin * this.halfWidth;
    const rightX = this.position.x - cos * this.halfWidth;
    const rightZ = this.position.z + sin * this.halfWidth;
    const centerGround = world.groundHeightAt(this.position.x, this.position.z);
    const frontGround = world.groundHeightAt(frontX, frontZ);
    const rearGround = world.groundHeightAt(rearX, rearZ);
    const leftGround = world.groundHeightAt(leftX, leftZ);
    const rightGround = world.groundHeightAt(rightX, rightZ);
    const ground = Math.max(centerGround, frontGround, rearGround, leftGround, rightGround);
    const targetPitch = -Math.atan2(frontGround - rearGround, this.halfLength * 1.64);
    const targetRoll = Math.atan2(rightGround - leftGround, this.halfWidth * 2);
    this.pitch = damp(this.pitch, targetPitch, 10, dt);
    this.roll = damp(this.roll, targetRoll, 10, dt);
    const targetY = ground + this.impact * 0.045;
    this.position.y = damp(this.position.y, targetY, 18, dt);
    this.group.position.set(this.position.x, this.position.y, this.position.z);
    this.group.rotation.set(this.pitch, this.yaw, this.roll);
  }

  animate(dt, elapsed) {
    const forwardSpeed = this.speed;
    this.wheelSpin += (forwardSpeed / Math.max(0.12, this.shape.wheelRadius)) * dt;
    this.updateWheels();

    const braking = Boolean(this.driver) && (this.controls.brake > 0.35
      || (this.controls.throttle < 0 && forwardSpeed > 0.2)
      || this.controls.handbrake);
    const reversing = Boolean(this.driver) && forwardSpeed < -0.4;
    if (this.tailMaterial) {
      if (reversing) this.tailMaterial.color.setHex(0xffd9c4);
      else if (braking && Math.sin(elapsed * 9) > -0.6) this.tailMaterial.color.setHex(0xff5a3c);
      else this.tailMaterial.color.setHex(0x9c2218);
    }

    if (this.lightbarRed) {
      const phase = Math.floor(elapsed * 7) % 4;
      const redOn = phase === 0 || phase === 1;
      const blueOn = phase === 2 || phase === 3;
      this.lightbarRed.material.color.setHex(redOn ? 0xff3526 : 0x43090b);
      this.lightbarBlue.material.color.setHex(blueOn ? 0x3d63ff : 0x0a0d3a);
      this.lightGlowRed.material.opacity = redOn ? 0.88 : 0.04;
      this.lightGlowBlue.material.opacity = blueOn ? 0.88 : 0.04;
    }
  }

  dispose() {
    this.removed = true;
    this.group.removeFromParent();
    this.paintMaterial.dispose();
    this.tailMaterial.dispose();
    if (this.lightbarRed) {
      this.lightbarRed.material.dispose();
      this.lightbarBlue.material.dispose();
      this.lightGlowRed.material.dispose();
      this.lightGlowBlue.material.dispose();
      this.decalMesh.material.dispose();
    }
  }
}

export class Vehicles {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.skids = new SkidMarks(scene);
  }

  spawn(type, options = {}) {
    const vehicle = new Vehicle(type, options);
    if (options.driver) vehicle.setDriver(options.driver);
    if (options.speed) {
      vehicle.velocity.set(Math.sin(vehicle.yaw) * options.speed, 0, Math.cos(vehicle.yaw) * options.speed);
    }
    this.scene.add(vehicle.group);
    this.list.push(vehicle);
    return vehicle;
  }

  remove(vehicle) {
    const index = this.list.indexOf(vehicle);
    if (index !== -1) this.list.splice(index, 1);
    vehicle.dispose();
  }

  clear() {
    for (const vehicle of [...this.list]) vehicle.dispose();
    this.list.length = 0;
    this.skids.reset();
  }

  applyEnvironment(palette) {
    setHeadlightLevel(palette.carLights);
  }

  update(dt, elapsed) {
    for (const vehicle of this.list) vehicle.update(dt, elapsed, this.world, this.skids);
    this.resolveContacts();
  }

  resolveContacts() {
    const cars = this.list;
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.removed) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.removed) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        if (Math.abs(dx) > 7 || Math.abs(dz) > 7) continue;

        // Three circles down each car's spine read the body as a capsule: wide
        // enough to catch a bumper, narrow enough to let neighbouring lanes
        // pass without pushing each other around.
        const radiusA = a.halfWidth + 0.16;
        const radiusB = b.halfWidth + 0.16;
        const sinA = Math.sin(a.yaw);
        const cosA = Math.cos(a.yaw);
        const sinB = Math.sin(b.yaw);
        const cosB = Math.cos(b.yaw);
        let overlap = 0;
        let nx = 0;
        let nz = 0;
        for (const offsetA of [-a.halfLength * 0.58, 0, a.halfLength * 0.58]) {
          const ax = a.position.x + sinA * offsetA;
          const az = a.position.z + cosA * offsetA;
          for (const offsetB of [-b.halfLength * 0.58, 0, b.halfLength * 0.58]) {
            const bx = b.position.x + sinB * offsetB;
            const bz = b.position.z + cosB * offsetB;
            const cdx = bx - ax;
            const cdz = bz - az;
            const distance = Math.hypot(cdx, cdz);
            const minDistance = radiusA + radiusB;
            if (distance >= minDistance || distance < 1e-4) continue;
            const penetration = minDistance - distance;
            if (penetration > overlap) {
              overlap = penetration;
              nx = cdx / distance;
              nz = cdz / distance;
            }
          }
        }
        if (overlap <= 0) continue;

        const push = overlap * 0.5;
        const aMoving = Boolean(a.driver);
        const bMoving = Boolean(b.driver);
        if (aMoving) { a.position.x -= nx * push; a.position.z -= nz * push; }
        if (bMoving) { b.position.x += nx * push; b.position.z += nz * push; }
        if (!aMoving && bMoving) { b.position.x += nx * push; b.position.z += nz * push; }
        if (!bMoving && aMoving) { a.position.x -= nx * push; a.position.z -= nz * push; }
        a.velocity.multiplyScalar(aMoving ? 0.68 : 1);
        b.velocity.multiplyScalar(bMoving ? 0.68 : 1);
        a.impact = Math.min(1, a.impact + 0.22);
        b.impact = Math.min(1, b.impact + 0.22);
        const closing = Math.abs(a.speed - b.speed);
        if (closing > 4) {
          const wear = closing * 0.0012;
          a.condition = Math.max(0, a.condition - wear);
          b.condition = Math.max(0, b.condition - wear);
        }
      }
    }
  }

  nearestEnterable(point, reach = 2.0) {
    let best = null;
    let bestDistance = reach;
    for (const vehicle of this.list) {
      if (vehicle.removed) continue;
      if (vehicle.driver === 'player') continue;
      if (Math.abs(vehicle.speed) > 4.5) continue;
      const distance = vehicle.distanceToBox(point.x, point.z);
      if (distance < bestDistance) {
        best = vehicle;
        bestDistance = distance;
      }
    }
    return best;
  }

  blocksPoint(x, z, radius, ignore = null) {
    for (const vehicle of this.list) {
      if (vehicle === ignore || vehicle.removed) continue;
      const local = vehicle.localPoint(x, z);
      if (Math.abs(local.x) < vehicle.halfWidth + radius && Math.abs(local.z) < vehicle.halfLength + radius) {
        return vehicle;
      }
    }
    return null;
  }

  closestTo(x, z, maxDistance = 120) {
    let best = null;
    let bestDistance = maxDistance * maxDistance;
    for (const vehicle of this.list) {
      const dx = vehicle.position.x - x;
      const dz = vehicle.position.z - z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        best = vehicle;
        bestDistance = distance;
      }
    }
    return best;
  }

  get count() {
    return this.list.length;
  }
}
