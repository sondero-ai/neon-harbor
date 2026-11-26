// The fleet manager: spawn, remove, clear, per-frame update and car-to-car
// contact resolution for every Vehicle in the scene. The Vehicle itself (and
// its physics) stays in vehicles.js; the builders live in vehicle-geometry.js.

import { SkidMarks } from './effects.js';
import { Vehicle, setHeadlightLevel } from './vehicles.js';

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
