// Neon Harbor E2E groups 9-12: armed witness, crowd density, traffic signals and pedestrian walls.
// Entries are moved verbatim from tools/test-npc-loot.mjs.
export const groups = [
  {
    name: 'test 9: armed witness',
    shot: 'street',
    body: function armedWitness() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const player = debug && debug.player;
      const traffic = debug && debug.traffic;
      const police = debug && debug.police;
      const camera = debug && debug.camera;
      const missing = [];
      if (!neon || !neon.loot) missing.push('__neon.loot');
      if (!traffic || typeof traffic.spawnPed !== 'function') missing.push('traffic.spawnPed');
      if (!traffic || typeof traffic.update !== 'function') missing.push('traffic.update');
      if (!traffic || typeof traffic.despawnPed !== 'function') missing.push('traffic.despawnPed');
      if (!police || typeof police.clearWanted !== 'function') missing.push('police.clearWanted');
      if (!player || !player.position) missing.push('__neon.debug.player');
      if (!camera || !camera.position) missing.push('__neon.debug.camera');
      check('test 9: armed-witness hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const baseX = 81;
      const baseZ = 0;
      police.stageAir({ x: 640, y: 40, z: 640 });
      police.clearWanted({ quiet: true });
      police.clearOfficers();
      player.teleport(baseX, baseZ, Math.PI, 0);
      player.cameraPitch = -0.27;
      player.cameraDistance = 3.1;
      player.updateView(camera, 1 / 60, true);
      player.health = 100;
      player.armor = 0;
      player.dead = false;

      const armed = traffic.spawnPed({ x: baseX, z: baseZ - 6, yaw: 0, armed: true });
      const victim = traffic.spawnPed({ x: baseX, z: baseZ - 8, armed: false });
      check(
        'test 9: an armed pedestrian stages with a victim in the panic radius',
        Boolean(armed) && armed.armed === true && Boolean(victim),
        JSON.stringify({ armed: Boolean(armed), flag: armed && armed.armed }),
      );
      if (!armed || !victim) return results;

      traffic.applyPlayerHit({ ped: victim, headshot: false }, 500);
      check(
        'test 9: the armed witness draws for 0.9 s before it is hostile',
        armed.hostile === false && armed.hostileDraw === 0.9,
        `hostile=${armed.hostile} draw=${armed.hostileDraw}`,
      );
      traffic.update(0.5, 0);
      check(
        'test 9: the armed witness is still drawing after 0.5 s',
        armed.hostile === false && armed.hostileDraw > 0,
        `hostile=${armed.hostile} draw=${armed.hostileDraw}`,
      );

      const healthBefore = player.health;
      const originalRandom = Math.random;
      try {
        Math.random = () => 0;
        traffic.update(0.45, 0);
      } finally {
        Math.random = originalRandom;
      }
      check(
        'test 9: the first shot after the draw lowers the player health',
        armed.hostile === true && player.health < healthBefore,
        `hostile=${armed.hostile} health ${healthBefore} -> ${player.health}`,
      );

      // The next shot is gated by the 1.2 s fire interval, so 1.0 s later the
      // health is untouched and the 0.25 s step after that fires again.
      const healthAfterFirst = player.health;
      try {
        Math.random = () => 0;
        traffic.update(1.0, 0);
      } finally {
        Math.random = originalRandom;
      }
      check(
        'test 9: the armed witness waits out the 1.2 s fire interval',
        player.health === healthAfterFirst,
        `health ${healthAfterFirst} -> ${player.health}`,
      );
      try {
        Math.random = () => 0;
        traffic.update(0.25, 0);
      } finally {
        Math.random = originalRandom;
      }
      check(
        'test 9: the next shot lands once the interval elapses',
        player.health === healthAfterFirst - 9,
        `health ${healthAfterFirst} -> ${player.health}`,
      );

      player.teleport(baseX + 50, baseZ, Math.PI, 0);
      traffic.update(0.06, 0);
      check(
        'test 9: moving beyond 45 m sends the armed witness back to fleeing',
        armed.hostile === false && armed.fleeTimer > 0,
        `hostile=${armed.hostile} flee=${armed.fleeTimer}`,
      );

      const lootBefore = neon.loot.count;
      traffic.applyPlayerHit({ ped: armed, headshot: false }, 500);
      check(
        'test 9: an armed pedestrian still dies like any other and drops loot',
        armed.dead === true && neon.loot.count > lootBefore,
        `dead=${armed.dead} loot ${lootBefore} -> ${neon.loot.count}`,
      );

      // The same staged position, unarmed: it should only run.
      player.teleport(baseX, baseZ, Math.PI, 0);
      const unarmed = traffic.spawnPed({ x: baseX, z: baseZ - 6, yaw: 0, armed: false });
      const victim2 = traffic.spawnPed({ x: baseX, z: baseZ - 8, armed: false });
      check('test 9: the unarmed witness stages', Boolean(unarmed) && Boolean(victim2), 'spawnPed returned null');
      if (unarmed && victim2) {
        traffic.applyPlayerHit({ ped: victim2, headshot: false }, 500);
        check(
          'test 9: an unarmed witness only flees',
          unarmed.hostile === false && unarmed.fleeTimer === 6,
          `hostile=${unarmed.hostile} flee=${unarmed.fleeTimer}`,
        );
        traffic.update(1.2, 0);
        check(
          'test 9: the unarmed witness never turns hostile',
          unarmed.hostile === false && unarmed.fleeTimer > 0,
          `hostile=${unarmed.hostile} flee=${unarmed.fleeTimer}`,
        );
      }
      return results;
    },
  },
  {
    name: 'test 10: crowd density',
    shot: 'street',
    body: function crowdDensity() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const traffic = debug && debug.traffic;
      const player = debug && debug.player;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!traffic || typeof traffic.update !== 'function') missing.push('traffic.update');
      if (!traffic || !traffic.crowd || !traffic.crowd.meshes) missing.push('traffic.crowd');
      if (!player || !player.position) missing.push('__neon.debug.player');
      check('test 10: density hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      check(
        'test 10: the crowd targets are 168 / 64 / 28 / 18',
        traffic.maxPeds === 168 && traffic.sidewalkTarget === 64
          && traffic.beachTarget === 28 && traffic.carTarget === 18,
        JSON.stringify({
          maxPeds: traffic.maxPeds,
          sidewalk: traffic.sidewalkTarget,
          beach: traffic.beachTarget,
          cars: traffic.carTarget,
        }),
      );
      check(
        'test 10: the instanced crowd capacity follows MAX_PEDS',
        traffic.crowd.capacity === 168 && Object.keys(traffic.crowd.meshes).every(
          (name) => traffic.crowd.meshes[name].instanceMatrix.count === 168,
        ),
        `capacity=${traffic.crowd.capacity}`,
      );

      const beachAtStart = traffic.peds.filter((ped) => ped.active && ped.mode === 'beach').length;
      check(
        'test 10: the beach crowd seeds all 28 walkers',
        beachAtStart === 28,
        `beach=${beachAtStart}`,
      );

      let maxCars = 0;
      for (let i = 0; i < 180; i += 1) {
        traffic.update(0.5, i * 0.5);
        maxCars = Math.max(maxCars, traffic.density.cars);
      }
      const active = traffic.peds.filter((ped) => ped.active);
      const sidewalk = active.filter((ped) => ped.mode !== 'beach').length;
      const beach = active.filter((ped) => ped.mode === 'beach').length;
      const slots = new Set(active.map((ped) => ped.slot));
      check(
        'test 10: the sidewalk crowd reaches its 64-walker target',
        sidewalk >= 64,
        `sidewalk=${sidewalk}`,
      );
      check(
        'test 10: the beach crowd stays at 28 while the sidewalks fill',
        beach === 28,
        `beach=${beach}`,
      );
      check(
        'test 10: no two pedestrians share a crowd slot',
        slots.size === active.length && active.every((ped) => ped.slot >= 0 && ped.slot < 168),
        `active=${active.length} slots=${slots.size}`,
      );
      check(
        'test 10: the live crowd never exceeds the 168 slot cap',
        active.length <= 168,
        `active=${active.length}`,
      );
      check(
        'test 10: the traffic reaches the 18-car target',
        maxCars === 18,
        `maxCars=${maxCars}`,
      );
      const extra = traffic.spawnPed({
        x: player.position.x + 6,
        z: player.position.z,
        armed: false,
      });
      check(
        'test 10: a free crowd slot is still available after the fill',
        Boolean(extra),
        'spawnPed returned null (slot starvation)',
      );
      return results;
    },
  },
  {
    name: 'test 11: traffic signals',
    shot: 'street',
    body: function trafficSignals() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const signals = neon && neon.signals;
      const system = neon && neon.debug && neon.debug.signals;
      const missing = [];
      if (!signals) missing.push('__neon.signals');
      if (!system) missing.push('__neon.debug.signals');
      check('test 11: signal hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      check(
        'test 11: one signal stands at every one of the 100 intersections',
        signals.intersections === 100,
        `intersections=${signals.intersections}`,
      );
      check(
        'test 11: core and extension intersections both have a signal',
        Boolean(signals.at(189, 81)) && Boolean(signals.at(-135, -189))
          && Boolean(signals.at(351, 243)),
        JSON.stringify({
          core: signals.at(189, 81),
          north: signals.at(-135, -189),
          east: signals.at(351, 243),
        }),
      );
      check(
        'test 11: a mid-block point has no signal',
        signals.at(0, 0) === null,
        JSON.stringify(signals.at(0, 0)),
      );

      function expected(axis, t) {
        const own = axis === 'x' ? t % 18 : (t + 9) % 18;
        return own < 7.5 ? 'green' : own < 9 ? 'amber' : 'red';
      }
      let statesMatch = true;
      const stateRows = [];
      for (const t of [0, 1, 7.4, 8.2, 9.1, 12, 16.5]) {
        const state = signals.stateAt(t);
        const want = { x: expected('x', t), z: expected('z', t) };
        stateRows.push({ t, state, want });
        if (state.x !== want.x || state.z !== want.z) statesMatch = false;
      }
      check(
        'test 11: the state function matches the 7.5 s green / 1.5 s amber cycle',
        statesMatch,
        JSON.stringify(stateRows),
      );

      const atGreen = signals.setTime(1);
      const greenLamps = { x: signals.lamps('x'), z: signals.lamps('z') };
      const atAmber = signals.setTime(8.2);
      const amberLamps = { x: signals.lamps('x'), z: signals.lamps('z') };
      const atRed = signals.setTime(10);
      const redLamps = { x: signals.lamps('x'), z: signals.lamps('z') };
      check(
        'test 11: the lamps show green for one axis and red for the other',
        atGreen.x === 'green' && atGreen.z === 'red'
          && greenLamps.x === 'green' && greenLamps.z === 'red',
        JSON.stringify({ atGreen, greenLamps }),
      );
      check(
        'test 11: the amber window lights amber for the switching axis only',
        atAmber.x === 'amber' && atAmber.z === 'red'
          && amberLamps.x === 'amber' && amberLamps.z === 'red',
        JSON.stringify({ atAmber, amberLamps }),
      );
      check(
        'test 11: the switch flips both axes at once',
        atRed.x === 'red' && atRed.z === 'green'
          && redLamps.x === 'red' && redLamps.z === 'green',
        JSON.stringify({ atRed, redLamps }),
      );
      const sets = system.axisMeshes;
      check(
        'test 11: each colour and axis renders as one instanced lamp set',
        ['x', 'z'].every((axis) => ['red', 'amber', 'green'].every(
          (name) => sets[axis][name].isInstancedMesh && sets[axis][name].count === 200,
        )),
        Object.fromEntries(['x', 'z'].map((axis) => [axis, {
          red: sets[axis].red.count,
          amber: sets[axis].amber.count,
          green: sets[axis].green.count,
        }])),
      );
      return results;
    },
  },
  {
    name: 'test 12: pedestrian wall collision',
    shot: 'street',
    body: function pedestrianWalls() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const traffic = neon && neon.debug && neon.debug.traffic;
      const world = neon && neon.debug && neon.debug.world;
      const player = neon && neon.debug && neon.debug.player;
      const missing = [];
      if (!traffic || typeof traffic.walkToward !== 'function') missing.push('traffic.walkToward');
      if (!world || typeof world.resolveCircle !== 'function') missing.push('world.resolveCircle');
      if (!world || !Array.isArray(world.colliders)) missing.push('world.colliders');
      if (!player) missing.push('__neon.debug.player');
      check('test 12: collision hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const overlaps = (x, z, radius) => world.colliders.some((box) => (
        x > box.minX - radius && x < box.maxX + radius
        && z > box.minZ - radius && z < box.maxZ + radius
      ));
      const buildings = world.colliders.filter((box) => (
        box.kind === 'building' && box.maxX - box.minX > 15 && box.maxZ - box.minZ > 15
        && box.minX > -145 && box.maxX < 195 && box.minZ > -145 && box.maxZ < 195
      ));
      check(
        'test 12: the core exposes building colliders to test against',
        buildings.length > 10,
        `buildings=${buildings.length}`,
      );
      if (buildings.length === 0) return results;

      const building = buildings.reduce((best, box) => {
        const cx = (box.minX + box.maxX) / 2;
        const cz = (box.minZ + box.maxZ) / 2;
        const distance = Math.hypot(cx - player.position.x, cz - player.position.z);
        return !best || distance < best.distance ? { box, distance } : best;
      }, null).box;
      const midZ = (building.minZ + building.maxZ) / 2;
      const wallPed = traffic.spawnPed({
        x: building.minX - 2.2,
        z: midZ,
        yaw: Math.PI / 2,
        mode: 'idle',
      });
      check('test 12: a test pedestrian stages beside a building', Boolean(wallPed), 'spawnPed returned null');
      if (!wallPed) return results;

      wallPed.target = { x: building.maxX + 2.2, z: midZ };
      let everInside = false;
      for (let i = 0; i < 600; i += 1) {
        traffic.walkToward(wallPed, 3, 1 / 60);
        if (overlaps(wallPed.x, wallPed.z, 0.3)) {
          everInside = true;
          break;
        }
      }
      check(
        'test 12: a target straight through a building never puts the walker inside it',
        everInside === false,
        `ped=(${wallPed.x.toFixed(2)}, ${wallPed.z.toFixed(2)}) box=(${building.minX}, ${building.minZ})`,
      );
      check(
        'test 12: the blocked walker stops at the wall face',
        wallPed.x <= building.minX - 0.28,
        `x=${wallPed.x.toFixed(2)} face=${building.minX}`,
      );

      const openPed = traffic.spawnPed({ x: -67, z: 18.1, yaw: 0, mode: 'idle' });
      check('test 12: a reachable-target pedestrian stages', Boolean(openPed), 'spawnPed returned null');
      if (openPed) {
        openPed.target = { x: -61, z: 18.1 };
        for (let i = 0; i < 300; i += 1) traffic.walkToward(openPed, 2, 1 / 60);
        check(
          'test 12: a reachable target is still reached',
          Math.hypot(openPed.x - -61, openPed.z - 18.1) < 0.3,
          `distance=${Math.hypot(openPed.x - -61, openPed.z - 18.1).toFixed(2)}`,
        );
        check(
          'test 12: the reachable walk stays out of every collider',
          overlaps(openPed.x, openPed.z, 0.3) === false,
          `ped=(${openPed.x.toFixed(2)}, ${openPed.z.toFixed(2)})`,
        );
      }

      const slidingPed = traffic.spawnPed({ x: -67, z: 18.1, yaw: 0, mode: 'idle' });
      if (slidingPed) slidingPed.target = { x: -63, z: 18.1 };
      const startX = slidingPed ? slidingPed.x : 0;
      if (slidingPed) {
        for (let i = 0; i < 240; i += 1) traffic.walkToward(slidingPed, 2, 1 / 60);
      }
      check(
        'test 12: the wall slide keeps forward progress along the face',
        Boolean(slidingPed) && slidingPed.x - startX > 1.5,
        `moved=${slidingPed ? (slidingPed.x - startX).toFixed(2) : 'n/a'}`,
      );

      for (let i = 0; i < 120; i += 1) traffic.update(0.5, i * 0.5);
      const live = traffic.peds.filter((ped) => ped.active && !ped.dead);
      const stuck = live.filter((ped) => overlaps(ped.x, ped.z, 0.26));
      check(
        'test 12: after 60 simulated seconds no live pedestrian is inside a wall',
        stuck.length === 0,
        `stuck=${stuck.length}/${live.length} first=${stuck[0] ? `(${stuck[0].x.toFixed(2)}, ${stuck[0].z.toFixed(2)})` : ''}`,
      );
      return results;
    },
  },
];
