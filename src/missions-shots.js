// Deterministic mission staging for the contact-sheet screenshots: the
// ambush and heist scenes are built from fixed crates, spawns and effects and
// then left frozen. Every function takes the Missions instance it stages so
// the runtime keeps the scene, objective marker and enemies.

import * as THREE from '../vendor/three.module.js';
import { Thug } from './missions-actor.js';

export function prepareShot(missions) {
  missions.suspended = true;
  missions.staged = false;
  missions.clearMissionEntities();
  missions.clearProps();
  missions.clearFire();
  missions.active = null;
  missions.failure = null;
  missions.subtitle = null;
  missions.queue.length = 0;
  missions.storyDone = false;
  missions.index = 0;
}

export function stageShot(missions, name) {
  missions.prepareShot();
  missions.staged = true;
  missions.subtitle = null;
  missions.queue.length = 0;
  if (name === 'mission') missions.stageMissionShot();
  else if (name === 'heist') missions.stageHeistShot();
}

export function stageMissionShot(missions) {
  missions.addCrate(-5.6, 11.3, 1.1);
  missions.addCrate(6.4, 10.8, 1.0);
  missions.addCrate(-8.2, 8.8, 0.85);
  missions.addCrate(8.0, 7.8, 0.95);
  const spawns = [
    { x: 0, z: 9.3, health: 205, boss: true, name: 'Tomas', damage: 11, speed: 2.2 },
    { x: -4.8, z: 9.9, health: 105 },
    { x: 4.9, z: 9.5, health: 105 },
    { x: 2.7, z: 12.2, health: 105 },
    { x: -3.9, z: 15.1, health: 105, dead: true },
  ];
  for (const spec of spawns) missions.enemies.push(new Thug(missions.scene, missions.world, missions.materials, spec, missions.enemies.length));
  missions.enemies[0].setPose(0);
  missions.enemies[0].aim = 1;
  missions.enemies[1].setPose(0.5);
  missions.enemies[2].setPose(-0.5);
  missions.enemies[3].setPose(0.2);
  missions.enemies[4].setPose(-1.2);
  for (let i = 0; i < 4; i += 1) missions.poseAim(missions.enemies[i]);
  missions.objective = {
    title: 'Survive the Ambush',
    sub: 'Tomas and his crew have the fountain covered.',
    marker: { x: 0, z: 8.4 },
    tag: 'MISSION 04 · FAMILY CUT',
    progress: { label: 'CREW', value: 2, max: 5 },
  };
  missions.world.setObjectiveMarker(0, 8.4);
  missions.subtitle = {
    speaker: 'TOMAS',
    text: 'You brought the case. And a conscience.',
    life: 999,
  };
}

export function stageHeistShot(missions) {
  missions.addCrate(-236, 62.8, 1.0);
  missions.addCrate(-239, 77.0, 1.1);
  missions.addCrate(-247, 62.4, 0.9);
  missions.addCrate(-252, 77.2, 1.0);
  missions.addFireSpot(-256, 62.8);
  missions.addFireSpot(-258, 76.2);
  missions.addFireSpot(-249, 58.8);
  missions.addFireSpot(-237.2, 77.0);
  missions.addFireSpot(-243.5, 62.2);
  missions.addFireSpot(-234.2, 73.9);
  missions.addFireSpot(-236.4, 65.6);
  const spawns = [
    { x: -250, z: 70, health: 280, boss: true, name: 'Aurelio', damage: 13, speed: 2.2 },
    { x: -237.5, z: 65.6, health: 115 },
    { x: -238.5, z: 74.8, health: 115 },
    { x: -243.4, z: 69.4, health: 120 },
    { x: -243.8, z: 72.7, health: 120 },
    { x: -247.4, z: 65.3, health: 125 },
    { x: -246.8, z: 75.4, health: 125 },
    { x: -231.9, z: 68.4, health: 105, dead: true },
  ];
  for (const spec of spawns) missions.enemies.push(new Thug(missions.scene, missions.world, missions.materials, spec, missions.enemies.length));
  missions.enemies[0].setPose(Math.PI / 2);
  missions.enemies[0].aim = 1;
  for (let i = 1; i < 7; i += 1) {
    missions.enemies[i].setPose(Math.PI / 2 + (i % 2 === 0 ? 0.3 : -0.3));
    missions.enemies[i].aim = 0.8;
    missions.poseAim(missions.enemies[i]);
  }
  missions.poseAim(missions.enemies[0]);
  missions.objective = {
    title: 'Clear Pier 9',
    sub: 'Put Aurelio down and get off the deck.',
    marker: { x: -250, z: 70 },
    tag: 'MISSION 05 · PIER 9 BURNING',
    progress: { label: 'ENFORCERS', value: 4, max: 8 },
  };
  missions.world.setObjectiveMarker(-250, 70);
  missions.subtitle = {
    speaker: 'AURELIO',
    text: 'The harbor always collects, Rae. Even from family.',
    life: 999,
  };
  for (const fire of missions.fireSpots) {
    missions.effects?.smokePuff(fire.x, missions.world.groundHeightAt(fire.x, fire.z) + 1.4, fire.z, {
      scale: 3.0, life: 3.4, color: 0x40383b, rise: 1.7,
    });
  }
}

export function poseAim(missions, enemy) {
  enemy.arms.right.shoulder.rotation.x = -1.25 * enemy.aim;
  enemy.arms.right.shoulder.rotation.z = -0.08;
  enemy.arms.right.elbow.rotation.x = -0.2 - enemy.aim * 0.2;
  enemy.arms.left.shoulder.rotation.x = -0.3;
  enemy.torso.rotation.x = 0.02;
}

export function stageShotDrama(missions, name) {
  const player = missions.player;
  const facing = player.facing;
  const muzzle = new THREE.Vector3(
    player.position.x + Math.sin(facing) * 0.62,
    player.position.y + 1.36,
    player.position.z + Math.cos(facing) * 0.62,
  );
  if (name === 'mission') {
    const boss = missions.enemies.find((enemy) => enemy.name === 'Tomas');
    const flunky = missions.enemies[1];
    if (boss && flunky) {
      const chest = new THREE.Vector3(flunky.x, flunky.y + 1.2, flunky.z);
      missions.effects?.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd79a);
      missions.effects?.flash(muzzle.x, muzzle.y, muzzle.z, { color: 0xffe0a0, scale: 0.9, life: 0.1, grow: 1.8 });
      missions.effects?.tracer(muzzle, chest, 0xffd49a);
      missions.effects?.flash(chest.x, chest.y, chest.z, { color: 0xff9a63, scale: 0.8, life: 0.1, grow: 1.7 });
      missions.effects?.spark(chest.x, chest.y, chest.z, null, 0xffb04a, 12, 4.8);
      const enemyMuzzle = boss.muzzle();
      const target = new THREE.Vector3(player.position.x, player.position.y + 1.05, player.position.z);
      missions.effects?.muzzle(enemyMuzzle.x, enemyMuzzle.y, enemyMuzzle.z, 0xffd08a);
      missions.effects?.tracer(enemyMuzzle, target, 0xffbd7a);
      missions.effects?.flash(flunky.x, flunky.y + 1.3, flunky.z, { color: 0xffb066, scale: 1.6, life: 0.18, grow: 2.8 });
      missions.effects?.smokePuff(-5.6, 1.1, 11.3, { scale: 1.8, life: 2.0, color: 0x5a4c4c, rise: 0.9 });
      player.hitMarker = 0.75;
    }
  } else if (name === 'heist') {
    const boss = missions.enemies.find((enemy) => enemy.name === 'Aurelio');
    if (boss) {
      const chest = new THREE.Vector3(boss.x, boss.y + 1.2, boss.z);
      missions.effects?.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffd79a);
      missions.effects?.tracer(muzzle, chest, 0xffd49a);
      missions.effects?.flash(chest.x, chest.y, chest.z, { color: 0xffa063, scale: 0.9, life: 0.1, grow: 1.8 });
    }
    const visible = missions.enemies.slice(1, 4);
    for (let i = 0; i < visible.length; i += 1) {
      const enemy = visible[i];
      const origin = enemy.muzzle();
      const target = new THREE.Vector3(player.position.x, player.position.y + 1.02, player.position.z);
      missions.effects?.muzzle(origin.x, origin.y, origin.z, 0xffd08a);
      missions.effects?.tracer(origin, target, 0xffbd7a);
      if (i === 0) missions.effects?.flash(origin.x, origin.y, origin.z, { color: 0xffcf8a, scale: 1.15, life: 0.12, grow: 2.0 });
    }
    const ground = missions.world.groundHeightAt(-256, 62.8);
    missions.effects?.explosion(-256, ground + 1.4, 62.8);
    missions.effects?.explosion(-238.5, missions.world.groundHeightAt(-238.5, 76.9) + 1.0, 76.9);
    missions.effects?.flash(-250, 1.6, 72, { color: 0xff8a4a, scale: 2.4, life: 0.24, grow: 3.2 });
    missions.effects?.spark(-244, 1.8, 70, null, 0xffb05a, 14, 7);
    missions.effects?.smokePuff(-246, 1.4, 70, { scale: 2.6, life: 2.4, color: 0x54484c, rise: 1.2 });
    missions.effects?.smokePuff(-239, 1.2, 76.5, { scale: 2.2, life: 2.2, color: 0x4c4246, rise: 1.1 });
    player.hitMarker = 0.5;
  }
}
