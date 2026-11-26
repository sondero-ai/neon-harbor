// The mall robbery: one jewelry register, one cash drop, two security guards,
// a panicking crowd and three wanted stars, once per city reset. The guards
// are ordinary armed pedestrians with a dark uniform, so the existing hit,
// death, loot, witness and heat systems all apply without special cases.

import { makeRng } from './random.js';

const REGISTER_REACH = 2.0;
const GUARD_POSTS = [
  { x: 42.6, z: 6.4, yaw: -Math.PI / 2 },
  { x: 44.4, z: 10.2, yaw: Math.PI / 2 },
];

export class MallRobbery {
  constructor({ mall, player, police, traffic, pickups, onToast = null, audio = null } = {}) {
    this.mall = mall;
    this.player = player;
    this.police = police;
    this.traffic = traffic;
    this.pickups = pickups;
    this.onToast = onToast;
    this.audio = audio;
    this.rng = makeRng(0x8a17);
    this.robbed = false;
    this.guards = [];
    this.drop = null;
    this.time = 0;
    this.alarm = 0;
  }

  get register() {
    return this.mall?.register ?? { x: 0, y: 0, z: 0 };
  }

  inReach(point) {
    const register = this.register;
    return Math.hypot(register.x - point.x, register.z - point.z) <= REGISTER_REACH;
  }

  reset() {
    this.robbed = false;
    this.guards = [];
    this.drop = null;
    this.time = 0;
    this.alarm = 0;
  }

  /** Start the one robbery this city reset allows. Returns false if spent. */
  tryRob() {
    if (this.robbed || !this.mall) return false;
    this.robbed = true;
    this.time = 0;
    this.alarm = 4.0;
    if (this.audio && typeof this.audio.sirenBurst === 'function') this.audio.sirenBurst();
    if (this.police) this.police.addWanted(3, 'Mall Robbery');

    this.guards = [];
    for (const post of GUARD_POSTS) {
      const guard = this.traffic?.spawnPed({
        x: post.x,
        z: post.z,
        yaw: post.yaw,
        mode: 'guard',
        guard: true,
        armed: true,
        anchor: { x: post.x, z: post.z },
      });
      if (guard) {
        guard.health = 78;
        guard.hostile = true;
        guard.hostileTime = 0;
        guard.shootTimer = 0;
        this.guards.push(guard);
      }
    }

    this.traffic?.panic?.(this.register.x, this.register.z, 18);

    const amount = 650 + Math.floor(this.rng() * 301);
    // Set the case down the counter, not under the robber's feet, so it reads
    // as loot and is not vacuumed up on the same frame.
    this.drop = this.pickups?.spawnDrop({
      x: this.register.x + 1.25,
      z: this.register.z + 2.4,
      kind: 'cash',
      amount,
      label: 'CASH',
      expire: 90,
    });
    if (this.onToast) {
      this.onToast({
        title: 'Mall Robbery',
        sub: `$${amount} IN THE CASE · SECURITY ENGAGED`,
        life: 3.4,
      });
    }
    return true;
  }

  update(dt) {
    this.time += dt;
    if (this.alarm > 0) this.alarm = Math.max(0, this.alarm - dt);
  }

  get liveGuards() {
    return this.guards.filter((guard) => guard.active && !guard.dead);
  }
}
