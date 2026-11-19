// Third-person on-foot control: camera-relative movement, sprint, jump, curb
// stepping, building collision, and a damped follow camera that slides in
// front of walls instead of clipping through them.

import * as THREE from '../vendor/three.module.js';
import { CAMERA, PLAYER } from './config.js';
import { Humanoid } from './humanoid.js';

const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function dampAngle(current, target, lambda, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export class Player {
  constructor(scene, world) {
    this.world = world;
    this.group = new THREE.Group();
    this.humanoid = new Humanoid();
    this.group.add(this.humanoid.group);
    scene.add(this.group);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.cameraYaw = PLAYER.spawnCameraYaw;
    this.cameraPitch = CAMERA.pitch;
    this.cameraDistance = CAMERA.distance;
    this.facing = PLAYER.spawnFacing;
    this.grounded = true;
    this.speed = 0;
    this.health = PLAYER.health;
    this.armor = PLAYER.armor;
    this.cash = PLAYER.cash;
    this.wanted = 0;
    this.mission = 0;
    this.playSeconds = 0;
    this.walkPhase = 0;

    this.resetToSpawn();
  }

  resetToSpawn() {
    this.position.set(PLAYER.spawn.x, this.world.groundHeightAt(PLAYER.spawn.x, PLAYER.spawn.z), PLAYER.spawn.z);
    this.velocity.set(0, 0, 0);
    this.cameraYaw = PLAYER.spawnCameraYaw;
    this.cameraPitch = CAMERA.pitch;
    this.facing = PLAYER.spawnFacing;
    this.cameraDistance = CAMERA.distance;
    this.grounded = true;
    this.speed = 0;
    this.applyTransform();
    this.snapCamera();
  }

  loadFromSave(save) {
    this.position.set(save.position.x, save.position.y, save.position.z);
    const ground = this.world.groundHeightAt(this.position.x, this.position.z);
    if (this.position.y < ground) this.position.y = ground;
    this.velocity.set(0, 0, 0);
    this.cash = save.cash;
    this.health = save.health;
    this.armor = save.armor;
    this.wanted = save.wanted;
    this.mission = save.mission;
    this.playSeconds = save.playSeconds;
    this.cameraYaw = save.cameraYaw;
    this.cameraPitch = clamp(save.cameraPitch, CAMERA.minPitch, CAMERA.maxPitch);
    this.facing = this.cameraYaw - Math.PI;
    this.applyTransform();
    this.snapCamera();
  }

  applyTransform() {
    this.group.position.copy(this.position);
    this.humanoid.setFacing(this.facing);
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  get saveState() {
    return {
      cash: this.cash,
      health: this.health,
      armor: this.armor,
      wanted: this.wanted,
      mission: this.mission,
      playSeconds: this.playSeconds,
      cameraYaw: this.cameraYaw,
      cameraPitch: this.cameraPitch,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
    };
  }

  update(dt, input) {
    this.playSeconds += dt;
    const mouse = input.consumeMouse();
    if (mouse.x !== 0) this.cameraYaw -= mouse.x * CAMERA.sensitivity;
    if (mouse.y !== 0) this.cameraPitch = clamp(this.cameraPitch + mouse.y * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);
    if (mouse.wheel !== 0) {
      this.cameraDistance = clamp(this.cameraDistance + mouse.wheel * 0.0035, CAMERA.minDistance, CAMERA.maxDistance);
    }

    const { forward, strafe } = input.moveAxis();
    const hasInput = forward !== 0 || strafe !== 0;
    const sprint = input.isDown('ShiftLeft', 'ShiftRight');
    const sin = Math.sin(this.cameraYaw);
    const cos = Math.cos(this.cameraYaw);
    let wishX = -sin * forward + cos * strafe;
    let wishZ = -cos * forward - sin * strafe;
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 1) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    const maxSpeed = sprint ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const targetX = hasInput ? wishX * maxSpeed : 0;
    const targetZ = hasInput ? wishZ * maxSpeed : 0;
    const acceleration = (this.grounded ? PLAYER.acceleration : PLAYER.airAcceleration) * dt;
    if (hasInput) {
      this.velocity.x = moveTowards(this.velocity.x, targetX, acceleration);
      this.velocity.z = moveTowards(this.velocity.z, targetZ, acceleration);
    } else if (this.grounded) {
      const friction = PLAYER.friction * dt;
      this.velocity.x = moveTowards(this.velocity.x, 0, friction);
      this.velocity.z = moveTowards(this.velocity.z, 0, friction);
    }

    if (input.wasPressed('Space') && this.grounded) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.grounded = false;
    }

    this.moveHorizontal(dt);

    this.velocity.y -= PLAYER.gravity * dt;
    this.position.y += this.velocity.y * dt;
    const ground = this.world.groundHeightAt(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    if (this.grounded && ground > this.position.y) this.position.y = ground;

    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    this.speed = damp(this.speed, horizontal, 14, dt);
    if (horizontal > 0.25) {
      const desiredFacing = Math.atan2(this.velocity.x, this.velocity.z);
      this.facing = dampAngle(this.facing, desiredFacing, 13, dt);
    }

    if (this.position.y < -6) this.resetToSpawn();
    this.applyTransform();
    this.humanoid.update(dt, horizontal, !this.grounded);
  }

  moveHorizontal(dt) {
    const radius = PLAYER.radius;
    const stepX = this.velocity.x * dt;
    if (stepX !== 0) {
      const nextX = this.position.x + stepX;
      if (!this.world.collides(nextX, this.position.z, radius)) {
        const nextGround = this.world.groundHeightAt(nextX, this.position.z);
        if (nextGround - this.position.y <= 0.62) this.position.x = nextX;
        else this.velocity.x = 0;
      } else {
        this.velocity.x = 0;
      }
    }
    const stepZ = this.velocity.z * dt;
    if (stepZ !== 0) {
      const nextZ = this.position.z + stepZ;
      if (!this.world.collides(this.position.x, nextZ, radius)) {
        const nextGround = this.world.groundHeightAt(this.position.x, nextZ);
        if (nextGround - this.position.y <= 0.62) this.position.z = nextZ;
        else this.velocity.z = 0;
      } else {
        this.velocity.z = 0;
      }
    }
  }

  computeCameraDesired(out) {
    const target = this.cameraTarget.set(this.position.x, this.position.y + CAMERA.lookHeight, this.position.z);
    const distance = this.cameraDistance;
    const horizontal = Math.cos(this.cameraPitch) * distance;
    out.set(
      target.x + Math.sin(this.cameraYaw) * horizontal,
      target.y + Math.sin(this.cameraPitch) * distance + CAMERA.heightOffset,
      target.z + Math.cos(this.cameraYaw) * horizontal,
    );
    return out;
  }

  snapCamera() {
    this.computeCameraDesired(this.cameraPosition);
    this.world.clipCamera(this.cameraTarget, this.cameraPosition, 0.3, this.cameraPosition);
    this._cameraInitialized = true;
  }

  updateCamera(camera, dt, immediate = false) {
    this.computeCameraDesired(this.cameraPosition);
    this.world.clipCamera(this.cameraTarget, this.cameraPosition, 0.3, this.cameraPosition);
    if (!this._smoothCamera) this._smoothCamera = this.cameraPosition.clone();
    if (immediate || !this._cameraInitialized) {
      this._smoothCamera.copy(this.cameraPosition);
      this._cameraInitialized = true;
    } else {
      const alpha = 1 - Math.exp(-CAMERA.damping * dt);
      this._smoothCamera.lerp(this.cameraPosition, alpha);
      this.world.clipCamera(this.cameraTarget, this._smoothCamera, 0.3, this._smoothCamera);
    }
    camera.position.copy(this._smoothCamera);
    camera.lookAt(this.cameraTarget);
  }

  faceCamera() {
    this.facing = this.cameraYaw - Math.PI;
    this.humanoid.setFacing(this.facing);
  }

  teleport(x, z, facing = this.facing, cameraYaw = facing + Math.PI) {
    this.position.set(x, this.world.groundHeightAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.cameraYaw = cameraYaw;
    this.grounded = true;
    this.applyTransform();
    this.snapCamera();
  }
}
