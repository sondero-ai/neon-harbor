// Neon Harbor E2E groups 25-28: mall life, the mall robbery, the gas station and the station shot.
// Entries are moved verbatim from tools/test-npc-loot.mjs.
export const groups = [
  {
    name: 'test 25: mall life follows the clock',
    shot: 'mall-interior',
    body: function mallLife() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const traffic = neon?.debug?.traffic;
      const life = neon?.debug?.mallLife;
      const mall = neon?.debug?.world?.mall;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!traffic) missing.push('traffic');
      if (!life || typeof life.update !== 'function' || typeof life.updatePed !== 'function') missing.push('mallLife');
      if (!mall) missing.push('world.mall');
      check('test 25: mall-life hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (!life || !traffic || !mall) return results;

      life.update(0.1, 18 * 60);
      const dusk = traffic.peds.filter((ped) => ped.active && ped.mode === 'mall').length;
      check('test 25: dusk brings at least 20 shoppers', dusk >= 20, `mall=${dusk}`);

      const seated = traffic.peds.filter((ped) => ped.active && ped.mode === 'mall' && ped.sitting);
      check('test 25: at least four shoppers are sitting', seated.length >= 4, `seated=${seated.length}`);
      const seats = seated.map((ped) => ped.seat);
      check(
        'test 25: no two shoppers share a seat',
        seats.every((seat, index) => Boolean(seat) && seats.indexOf(seat) === index)
          && seats.every((seat) => seat.occupant && seat.occupant.sitting === true),
        JSON.stringify(seats.map((seat) => ({ x: seat?.x, z: seat?.z }))),
      );
      const seatedInMall = seated.every((ped) => ped.seat.x > mall.bounds.minX && ped.seat.x < mall.bounds.maxX
        && ped.seat.z > mall.bounds.minZ && ped.seat.z < mall.bounds.maxZ);
      check('test 25: every occupied chair is inside the mall', seatedInMall);

      life.update(0.1, 2 * 60);
      const night = traffic.peds.filter((ped) => ped.active && ped.mode === 'mall').length;
      check('test 25: 02:00 leaves at most six shoppers', night <= 6, `mall=${night}`);
      check(
        'test 25: no chair holds a stale occupant after the shrink',
        mall.seats.every((seat) => !seat.occupant || seat.occupant === 'player' || seat.occupant.active === true),
        JSON.stringify(mall.seats.filter((seat) => seat.occupant && seat.occupant !== 'player' && !seat.occupant.active).map((seat) => seat.x)),
      );
      return results;
    },
  },
  {
    name: 'test 26: the mall robbery',
    shot: 'mall-interior',
    body: function mallRobbery() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon?.debug?.world;
      const player = neon?.debug?.player;
      const traffic = neon?.debug?.traffic;
      const police = neon?.debug?.police;
      const pickups = neon?.debug?.pickups;
      const robbery = neon?.debug?.robbery;
      const interactions = neon?.debug?.interactions;
      const env = neon?.debug?.environment;
      const mall = world?.mall;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!world || !mall) missing.push('world.mall');
      if (!player) missing.push('player');
      if (!traffic) missing.push('traffic');
      if (!police) missing.push('police');
      if (!pickups) missing.push('pickups');
      if (!robbery || !interactions) missing.push('robbery/interactions');
      if (!env || typeof env.setClock !== 'function') missing.push('environment');
      check('test 26: robbery hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
        code,
        key: code.replace('Key', '').toLowerCase(),
        bubbles: true,
        cancelable: true,
      }));

      env.setClock(18 * 60);
      neon.advance(1 / 60);
      player.teleport(mall.register.x + 1.3, mall.register.z, Math.PI / 2, -Math.PI / 2);
      neon.advance(1 / 60);
      check(
        'test 26: standing at the jewelry counter prompts ROB',
        interactions.prompt?.action === 'rob',
        JSON.stringify(interactions.prompt),
      );

      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check('test 26: E starts the robbery once', robbery.robbed === true);
      check('test 26: the robbery raises three wanted stars', police.wanted === 3, `wanted=${police.wanted}`);

      const guards = traffic.peds.filter((ped) => ped.guard && ped.active && !ped.dead);
      check('test 26: two security guards spawn', guards.length === 2, `guards=${guards.length}`);
      check(
        'test 26: both guards are armed and hostile',
        guards.length === 2 && guards.every((guard) => guard.armed === true && guard.hostile === true),
        JSON.stringify(guards.map((guard) => ({ armed: guard.armed, hostile: guard.hostile }))),
      );
      check(
        'test 26: both guards are inside the mall',
        guards.length === 2 && guards.every((guard) => guard.x > mall.bounds.minX && guard.x < mall.bounds.maxX
          && guard.z > mall.bounds.minZ && guard.z < mall.bounds.maxZ),
        JSON.stringify(guards.map((guard) => ({ x: guard.x, z: guard.z }))),
      );

      const drop = neon.loot.items.find((item) => item.kind === 'cash'
        && Math.hypot(item.x - mall.register.x, item.z - mall.register.z) < 3.5);
      check(
        'test 26: the cash drop sits at the counter and holds $650-950',
        Boolean(drop) && drop.amount >= 650 && drop.amount <= 950,
        JSON.stringify({ drop: drop ?? null, items: neon.loot.items }),
      );
      check('test 26: nearby pedestrians flee', neon.pedestrians.fleeing >= 1, `fleeing=${neon.pedestrians.fleeing}`);

      const frozenCash = drop?.amount ?? 0;
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      const guardsAgain = traffic.peds.filter((ped) => ped.guard && ped.active && !ped.dead).length;
      check(
        'test 26: a second E does not rob again',
        robbery.robbed === true && guardsAgain === 2 && neon.loot.items.filter((item) => item.kind === 'cash').length === 1,
        JSON.stringify({ guards: guardsAgain, cash: neon.loot.items.filter((item) => item.kind === 'cash').length }),
      );

      neon.advance(2);
      const insideUnits = neon.police.unitList.filter((unit) => unit.x > mall.bounds.minX && unit.x < mall.bounds.maxX
        && unit.z > mall.bounds.minZ && unit.z < mall.bounds.maxZ);
      check('test 26: no police cruiser parks inside the mall', insideUnits.length === 0, JSON.stringify(insideUnits));

      const guard = guards[0];
      const lootBefore = neon.loot.count;
      if (guard && !guard.dead) traffic.applyPlayerHit({ ped: guard, headshot: false }, 500);
      check(
        'test 26: a dead guard drops loot like any armed pedestrian',
        Boolean(guard) && guard.dead === true && neon.loot.count === lootBefore + 1,
        JSON.stringify({ dead: guard?.dead, before: lootBefore, after: neon.loot.count }),
      );
      return results;
    },
  },
  {
    name: 'test 27: the gas station forecourt and service lane',
    shot: 'street',
    body: function gasStation() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };
      const neon = window.__neon;
      const world = neon?.debug?.world;
      const station = neon?.debug?.gasStation;
      check('test 27: station hooks are exposed', Boolean(world?.gasStation) && Boolean(station), 'station missing');
      if (!world || !station) return results;
      check('test 27: the forecourt has two pumps and two slots', station.pumps.length === 2 && station.slots.length === 2,
        JSON.stringify({ pumps: station.pumps.length, slots: station.slots.length }));
      check('test 27: a stopped car is within reach of a nozzle',
        Boolean(station.atPump({ x: -96.5, z: -11 }, 3.5)) && Boolean(station.atPump({ x: -96.5, z: 11 }, 3.5)),
        'no nozzle within 3.5 m of a slot');
      check('test 27: the kiosk is solid', world.collides(-120, 0, 0.4) === true);
      check('test 27: both pump islands are solid', world.collides(-100, -8, 0.4) === true && world.collides(-100, 8, 0.4) === true);
      check('test 27: the canopy columns are solid', world.collides(-107.5, -9, 0.4) === true && world.collides(-92.5, 9, 0.4) === true);
      check('test 27: the pump slots are clear for a car',
        world.collides(-96.5, -11, 0.9) === false && world.collides(-96.5, 11, 0.9) === false);
      check('test 27: the service lane and both curb cuts are clear',
        world.collides(-92, -15, 1.2) === false && world.collides(-92, 15, 1.2) === false
          && world.collides(-88, -18, 1.2) === false && world.collides(-88, 18, 1.2) === false);
      check('test 27: the forecourt is not vehicle-blocked',
        world.vehicleBlocked(-100, 0, false) === false && world.vehicleBlocked(-92, -18, false) === false);

      const player = neon?.debug?.player;
      const vehicles = neon?.debug?.vehicles;
      const interactions = neon?.debug?.interactions;
      const hud = neon?.debug?.hud;
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
        code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true,
      }));
      // A ?shot= page suppresses toasts for the capture; this group asserts them.
      hud.suppressToasts = false;

      const car = vehicles.spawn('sedan', { x: -96.5, z: -11, yaw: -Math.PI / 2, fuel: 0.4 });
      car.condition = 0.5;
      player.enterVehicle(car);
      neon.advance(1 / 60);
      check('test 27: a car at the pump prompts SERVICE at the quoted price',
        interactions.prompt?.action === 'fuel' && interactions.prompt?.detail === '$123',
        JSON.stringify(interactions.prompt));
      check('test 27: the HUD carries the fuel level', neon.state?.vehicle?.fuel === 0.4,
        JSON.stringify(neon.state?.vehicle ?? null));

      player.cash = 1000;
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check('test 27: E refuels and repairs and debits the quote',
        car.fuel === 1 && car.condition === 1 && player.cash === 877,
        JSON.stringify({ fuel: car.fuel, condition: car.condition, cash: player.cash }));
      neon.advance(1 / 60);
      check('test 27: a fully serviced car has no service prompt', interactions.prompt?.action !== 'fuel');

      key('keydown', 'KeyF');
      neon.advance(1 / 60);
      key('keyup', 'KeyF');
      check('test 27: F still exits at a pump and does not service', player.driving === null);

      const poor = vehicles.spawn('muscle', { x: -96.5, z: 11, yaw: -Math.PI / 2, fuel: 0.5 });
      player.enterVehicle(poor);
      player.cash = 20;
      neon.advance(1 / 60);
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check('test 27: a wallet short of the quote refuses and keeps the car as it was',
        poor.fuel === 0.5 && player.cash === 20 && hud?.toast?.title === 'NOT ENOUGH CASH',
        JSON.stringify({ fuel: poor.fuel, cash: player.cash, toast: hud?.toast?.title }));

      poor.fuel = 0.1;
      neon.advance(1 / 60);
      check('test 27: a low tank raises the LOW FUEL toast', hud?.toast?.title === 'LOW FUEL',
        JSON.stringify(hud?.toast));

      // An empty tank turns throttle into nothing while the car stays drivable.
      const dry = vehicles.spawn('sedan', { x: -70, z: -6, yaw: 0, fuel: 0, driver: 'ai' });
      dry.controls.throttle = 1;
      dry.controls.brake = 0;
      const dryZ = dry.position.z;
      neon.advance(1);
      check('test 27: an empty car cannot accelerate',
        Math.abs(dry.speed) < 0.5 && Math.abs(dry.position.z - dryZ) < 0.5,
        JSON.stringify({ speed: dry.speed, z: dry.position.z }));

      const traffic = neon?.debug?.traffic;

      // The service checks left the player parked across pump 1 and the test
      // cars on the pads; clear every one so both pumps are free for the NPCs.
      if (player.driving) player.exitVehicle();
      vehicles.remove(car);
      vehicles.remove(poor);
      vehicles.remove(dry);
      player.teleport(-63, 27.3);

      // Isolate the station: no ambient car may take a pump, and no crosser
      // may hold the adjacent lane for the length of the 60 s deadlock run.
      traffic.carTarget = 0;
      for (const other of [...traffic.cars]) traffic.removeCar(other);
      traffic.sidewalkTarget = 0;
      traffic.beachTarget = 0;
      for (const ped of traffic.peds) traffic.crowd.hide(ped.slot);
      traffic.peds.length = 0;

      // A flagged northbound car pulls in, pumps, and rejoins.
      const flagged = traffic.spawnLaneCar('sedan', 'z', 1, -81, -30, 11, { fuel: 0.2 });
      let pumpSlot = null;
      for (let i = 0; i < 240 && !pumpSlot; i += 1) {
        neon.advance(0.1);
        pumpSlot = station.slots.find((entry) => entry.car === flagged && entry.phase === 'pump') ?? null;
      }
      check('test 27: a flagged car pulls in and stops at a pump',
        Boolean(pumpSlot) && flagged.position.x < -88,
        JSON.stringify({ mode: flagged.ai.mode, x: flagged.position.x, z: flagged.position.z }));
      check('test 27: the pump wait is 4-6 seconds',
        Boolean(pumpSlot) && pumpSlot.timer >= 4 && pumpSlot.timer <= 6,
        JSON.stringify(pumpSlot ? { timer: pumpSlot.timer } : null));
      neon.advance(3);
      check('test 27: the car is still pumping after three seconds', flagged.ai.mode === 'pump');
      // The pull-out loops around the kiosk; give it the real drive time and
      // stop the moment it merges, so its measured tank is still the fresh fill.
      for (let i = 0; i < 400 && flagged.ai.mode !== 'drive'; i += 1) neon.advance(0.1);
      check('test 27: the pump fills the NPC tank and the car rejoins the lane',
        flagged.fuel > 0.98 && flagged.ai.mode === 'drive' && Math.abs(flagged.position.x + 84.2) < 1.5,
        JSON.stringify({ fuel: flagged.fuel, mode: flagged.ai.mode, x: flagged.position.x, z: flagged.position.z }));

      // An unflagged car never stops.
      const passing = traffic.spawnLaneCar('pickup', 'z', 1, -81, -30, 11, { fuel: 1 });
      neon.advance(6);
      check('test 27: an unflagged car passes the station',
        passing.ai.mode === 'drive' && passing.position.z > -6 && Math.abs(passing.position.x + 84.2) < 1.5,
        JSON.stringify({ mode: passing.ai.mode, x: passing.position.x, z: passing.position.z }));

      // Fill both pumps, then a third flagged car must keep rolling.
      const first = traffic.spawnLaneCar('sedan', 'z', 1, -81, -32, 11, { fuel: 0.2 });
      const second = traffic.spawnLaneCar('muscle', 'z', 1, -81, -44, 12, { fuel: 0.2 });
      for (let i = 0; i < 400; i += 1) {
        neon.advance(0.1);
        if (station.slots.every((slot) => slot.car)) break;
      }
      check('test 27: both pumps can be busy at once', station.slots.every((slot) => slot.car),
        JSON.stringify(station.slots.map((slot) => Boolean(slot.car))));
      const queued = traffic.spawnLaneCar('pickup', 'z', 1, -81, -30, 11, { fuel: 0.2 });
      let queuedPassed = false;
      for (let i = 0; i < 120 && !queuedPassed; i += 1) {
        neon.advance(0.1);
        queuedPassed = queued.position.z > -8;
      }
      check('test 27: a flagged car with both pumps busy keeps driving',
        queuedPassed && !station.owns(queued),
        JSON.stringify({ mode: queued.ai.mode, z: queued.position.z }));

      // 60 simulated seconds: both pumps free themselves, nothing parks at the entry.
      let entryStall = 0;
      let worstStall = 0;
      let secondPumped = false;
      const entryCars = [first, second, queued];
      for (let i = 0; i < 120; i += 1) {
        neon.advance(0.5);
        if (second.fuel > 0.9) secondPumped = true;
        let stalled = false;
        for (const car of entryCars) {
          const distance = Math.hypot(car.position.x + 84.2, car.position.z + 18);
          if (distance < 12 && Math.abs(car.speed) < 0.3) stalled = true;
        }
        entryStall = stalled ? entryStall + 0.5 : 0;
        worstStall = Math.max(worstStall, entryStall);
      }
      check('test 27: the service lane never deadlocks for 60 seconds',
        worstStall <= 8 && station.slots.every((slot) => slot.car === null),
        JSON.stringify({ worstStall, slots: station.slots.map((slot) => Boolean(slot.car)) }));
      check('test 27: the second pump also fills its car', secondPumped,
        JSON.stringify({ fuel: second.fuel, mode: second.ai.mode, x: second.position.x, z: second.position.z }));

      // Removing a pump car frees its slot for the next car.
      const doomed = traffic.spawnLaneCar('sedan', 'z', 1, -81, -30, 11, { fuel: 0.2 });
      let doomedSlot = null;
      for (let i = 0; i < 240 && !doomedSlot; i += 1) {
        neon.advance(0.1);
        doomedSlot = station.slots.find((entry) => entry.car === doomed) ?? null;
      }
      traffic.removeCar(doomed);
      check('test 27: removing a pump car frees its slot',
        Boolean(doomedSlot) && doomedSlot.car === null && doomedSlot.phase === 'free',
        JSON.stringify(doomedSlot ? { car: Boolean(doomedSlot.car), phase: doomedSlot.phase } : null));

      // Carjacking a station car frees its pad instead of reserving it forever.
      const stolen = traffic.spawnLaneCar('sedan', 'z', 1, -81, -30, 11, { fuel: 0.2 });
      let stolenSlot = null;
      for (let i = 0; i < 240 && !stolenSlot; i += 1) {
        neon.advance(0.1);
        stolenSlot = station.slots.find((entry) => entry.car === stolen) ?? null;
      }
      player.enterVehicle(stolen);
      neon.advance(1 / 60);
      check('test 27: carjacking a pump car frees its slot',
        Boolean(stolenSlot) && stolenSlot.car === null && player.driving === stolen,
        JSON.stringify(stolenSlot ? { car: Boolean(stolenSlot.car), driving: player.driving === stolen } : null));

      return results;
    },
  },
  {
    name: 'test 28: the station shot',
    shot: 'station',
    body: function stationShot() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };
      const neon = window.__neon;
      const station = neon?.debug?.gasStation;
      const shots = neon?.shots;
      check('test 28: the station shot is registered',
        Boolean(shots?.station) && shots.station.mode === 'playing',
        JSON.stringify(shots?.station ?? null));
      check('test 28: a car is staged at a pump', Boolean(station?.slots?.[0]?.car)
        && station.slots[0].phase === 'pump' && station.slots[0].car.fuel < 0.35,
        JSON.stringify({ phase: station?.slots?.[0]?.phase, fuel: station?.slots?.[0]?.car?.fuel }));
      const approach = neon?.debug?.traffic?.cars.find((car) => car.ai?.stationApproach);
      check('test 28: a low-fuel car is staged on the approach', Boolean(approach) && approach.fuel < 0.35,
        JSON.stringify(approach ? { fuel: approach.fuel, z: approach.position.z } : null));
      check('test 28: the shot renders draw calls', (neon?.draws ?? 0) > 0, String(neon?.draws));
      return results;
    },
  },
];
