// Neon Harbor E2E groups 21-24: the pier, seats and sitting, the mall shell and the parking lot.
// Entries are moved verbatim from tools/test-npc-loot.mjs.
export const groups = [
  {
    name: 'test 21: pier is pedestrian-only',
    shot: 'pier',
    body: function pierOnly() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon?.debug?.world;
      const vehicles = neon?.debug?.vehicles;
      const police = neon?.debug?.police;
      const traffic = neon?.debug?.traffic;
      const player = neon?.debug?.player;
      const missions = neon?.debug?.missions;
      const deck = { minX: -316, maxX: -172, z: 70, halfWidth: 9, rampMinX: -172, rampMaxX: -156 };
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!world || typeof world.collides !== 'function') missing.push('world.collides');
      if (!world || typeof world.vehicleBlocked !== 'function') missing.push('world.vehicleBlocked');
      if (!vehicles || typeof vehicles.spawn !== 'function') missing.push('vehicles.spawn');
      if (!police || typeof police.spawnCruiserAt !== 'function') missing.push('police.spawnCruiserAt');
      if (!traffic || typeof traffic.pickBeachTarget !== 'function') missing.push('traffic.pickBeachTarget');
      if (!missions) missing.push('__neon.debug.missions');
      if (!neon || !neon.shots) missing.push('__neon.shots');
      check('test 21: pier hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (!world || typeof world.collides !== 'function' || typeof world.vehicleBlocked !== 'function') return results;

      check('test 21: the bait shack centre is solid', world.collides(-188, 66, 0.3) === true, 'shack is walk-through');
      for (const x of [-298, -274, -250, -226, -202]) {
        check(`test 21: the bench at x ${x} is solid`, world.collides(x, 63.1, 0.3) === true, 'bench is walk-through');
      }
      for (const x of [-282, -255, -228, -201]) {
        check(`test 21: the barrel at x ${x} is solid`, world.collides(x, 76.9, 0.3) === true, 'barrel is walk-through');
      }
      const crates = world.pierCrates ?? [];
      check('test 21: the pier registers its twelve crates', crates.length === 12, `crates=${crates.length}`);
      let crateSolid = crates.length === 12;
      for (const crate of crates) {
        if (world.collides(crate.x, crate.z, 0.3) !== true) crateSolid = false;
      }
      check('test 21: every crate is solid', crateSolid, JSON.stringify(crates.map((crate) => ({ x: crate.x, z: crate.z }))));
      check('test 21: the north railing is solid', world.collides(-280, deck.z + deck.halfWidth - 0.4, 0.3) === true, 'railing is walk-through');
      check('test 21: the south railing is solid', world.collides(-280, deck.z - deck.halfWidth + 0.4, 0.3) === true, 'railing is walk-through');
      check('test 21: the open deck centre stays clear', world.collides(-280, 70, 0.3) === false, 'a prop sits on the open deck');

      check('test 21: the deck blocks vehicles', world.vehicleBlocked(-280, 70, false) === true);
      check('test 21: the deck blocks a player-driven car too', world.vehicleBlocked(-280, 70, true) === true);
      check('test 21: the ramp blocks vehicles', world.vehicleBlocked(-164, 70, false) === true);
      check('test 21: a city road is drivable', world.vehicleBlocked(-135, 27, false) === false);
      check('test 21: sand blocks AI vehicles', world.vehicleBlocked(-200, 0, false) === true);
      check('test 21: sand stays drivable for the player', world.vehicleBlocked(-200, 0, true) === false);

      if (vehicles && typeof vehicles.spawn === 'function') {
        const sedan = vehicles.spawn('sedan', { x: -164, z: 70, yaw: Math.PI / 2 });
        check('test 21: a sedan on the ramp cannot reach the deck', sedan.collidesAt(-280, 70, world) === true, 'collidesAt(deck) is false');
        check('test 21: the same sedan can drive a city road', sedan.collidesAt(-135, 27, world) === false, 'collidesAt(road) is true');
        vehicles.remove(sedan);
      }

      if (police && typeof police.spawnCruiserAt === 'function') {
        const officersBefore = police.officers.filter((officer) => !officer.removed).length;
        police.clearUnits();
        police.clearOfficers();
        police.staged = true;
        police.wanted = 3;
        const unit = police.spawnCruiserAt(-235, 20, 0, 'pursue', 'UNIT 99');
        const distance = player ? Math.hypot(-250 - player.position.x, 70 - player.position.z) : 0;
        police.update(0.5, 5);
        const officersAfter = police.officers.filter((officer) => !officer.removed).length;
        check(
          'test 21: a cruiser blocked at the shoreline force-dismounts its officers',
          Boolean(unit) && unit.deployed === true && officersAfter > 0,
          `deployed=${unit?.deployed} officers ${officersBefore} -> ${officersAfter} distance=${distance.toFixed(1)}`,
        );
        police.staged = false;
      }

      if (missions?.pierHeist) {
        const positions = [
          ...missions.pierHeist.crates.map((entry) => ({ kind: 'crate', x: entry[0], z: entry[1] })),
          ...missions.pierHeist.spawns.map((entry) => ({ kind: 'enemy', x: entry.x, z: entry.z })),
        ];
        const blocked = positions.filter((entry) => world.collides(entry.x, entry.z, 0.3));
        check(
          'test 21: every heist crate and enemy stands clear of the pier colliders',
          positions.length >= 18 && blocked.length === 0,
          JSON.stringify(blocked),
        );
      } else {
        check('test 21: the pier heist positions are exposed', false, 'missions.pierHeist missing');
      }

      if (traffic && typeof traffic.pickBeachTarget === 'function') {
        const ped = traffic.spawnPed({ x: -280, z: 70, yaw: 0, mode: 'beach', anchor: { x: -280, z: 70 } });
        let bad = null;
        if (!ped) bad = 'spawnPed returned null';
        for (let i = 0; i < 50 && ped && !bad; i += 1) {
          traffic.pickBeachTarget(ped);
          const inside = ped.target.x >= deck.minX + 3 && ped.target.x <= deck.maxX - 3
            && Math.abs(ped.target.z - deck.z) <= deck.halfWidth - 2;
          if (!inside || world.collides(ped.target.x, ped.target.z, 0.3)) {
            bad = JSON.stringify(ped.target);
          }
        }
        check('test 21: fifty pier wander targets all land on the open deck', bad === null, String(bad || ''));
        if (ped) traffic.despawnPed(ped);
      }

      if (neon?.shots?.heist?.police?.units) {
        const units = neon.shots.heist.police.units;
        const bad = units.filter((unit) => world.vehicleBlocked(unit.x, unit.z, false));
        check(
          'test 21: the heist shot cruisers sit off the blocked pier',
          units.length === 2 && bad.length === 0,
          JSON.stringify(bad),
        );
      }

      const strayCars = vehicles ? vehicles.list.filter((car) => car.driver === 'ai' && (car.position.x < -142 || world.vehicleBlocked(car.position.x, car.position.z, false))) : [];
      check('test 21: no ambient car starts on the sand or the pier', strayCars.length === 0, JSON.stringify(strayCars.map((car) => ({ x: car.position.x, z: car.position.z }))));
      return results;
    },
  },
  {
    name: 'test 22: seats, sitting and the contextual E layer',
    shot: 'street',
    body: function seatsAndSitting() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon?.debug?.world;
      const player = neon?.debug?.player;
      const vehicles = neon?.debug?.vehicles;
      const interactions = neon?.debug?.interactions;
      const seats = world?.seats;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!Array.isArray(seats)) missing.push('world.seats');
      if (!player || typeof player.sitAt !== 'function' || typeof player.stand !== 'function') missing.push('player.sitAt/stand');
      if (!interactions || typeof interactions.update !== 'function') missing.push('interactions.update');
      if (!vehicles || typeof vehicles.spawn !== 'function') missing.push('vehicles.spawn');
      check('test 22: seat hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const kinds = new Set(seats.map((seat) => seat.kind));
      check('test 22: the registry has a plaza seat', kinds.has('plaza'), JSON.stringify([...kinds]));
      check('test 22: the registry has a pier seat', kinds.has('pier'), JSON.stringify([...kinds]));
      check('test 22: the registry has a beach seat', kinds.has('beach'), JSON.stringify([...kinds]));

      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
        code,
        key: code.replace('Key', '').toLowerCase(),
        bubbles: true,
        cancelable: true,
      }));

      const seat = seats.find((entry) => entry.kind === 'plaza' && !entry.occupant);
      check('test 22: a free plaza seat exists', Boolean(seat), 'no free plaza seat');
      if (!seat) return results;

      player.teleport(seat.x, seat.z, seat.yaw, seat.yaw + Math.PI);
      neon.advance(1 / 60);
      check(
        'test 22: standing beside a free seat prompts SIT',
        interactions.prompt?.action === 'sit',
        JSON.stringify(interactions.prompt),
      );

      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check(
        'test 22: E seats the player',
        player.sitting === true && player.seat === seat && seat.occupant === 'player',
        JSON.stringify({ sitting: player.sitting, occupant: seat.occupant }),
      );

      const beforeX = player.position.x;
      const beforeZ = player.position.z;
      key('keydown', 'KeyW');
      neon.advance(1 / 60);
      key('keyup', 'KeyW');
      check(
        'test 22: a movement key stands the seated player',
        player.sitting === false && player.seat === null && seat.occupant === null,
        JSON.stringify({ sitting: player.sitting, occupant: seat.occupant }),
      );
      check(
        'test 22: the first movement frame does not slide the seated player',
        Math.hypot(player.position.x - beforeX, player.position.z - beforeZ) < 0.05,
        JSON.stringify({ x: player.position.x, z: player.position.z, beforeX, beforeZ }),
      );
      const standX = player.position.x;
      const standZ = player.position.z;
      key('keydown', 'KeyW');
      neon.advance(0.5);
      key('keyup', 'KeyW');
      check(
        'test 22: the player walks after standing',
        Math.hypot(player.position.x - standX, player.position.z - standZ) > 0.2,
        JSON.stringify({ x: player.position.x, z: player.position.z, standX, standZ }),
      );

      // Re-seat for the E stand check.
      player.teleport(seat.x, seat.z, seat.yaw, seat.yaw + Math.PI);
      neon.advance(1 / 60);
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check('test 22: E seats the player again', player.sitting === true, JSON.stringify({ sitting: player.sitting }));

      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check(
        'test 22: E again stands and frees the seat',
        player.sitting === false && player.seat === null && seat.occupant === null,
        JSON.stringify({ sitting: player.sitting, occupant: seat.occupant }),
      );

      player.teleport(seat.x + 1.2, seat.z, seat.yaw, seat.yaw + Math.PI);
      neon.advance(1 / 60);
      check(
        'test 22: the prompt reads SIT while standing beside it',
        interactions.prompt?.action === 'sit' && interactions.prompt?.label === 'SIT',
        JSON.stringify(interactions.prompt),
      );

      // Squeeze: park a sedan against a known building wall with Rae in the
      // gap. The straight push cannot work, so the push-out must slide her
      // clear of the car without putting her inside the wall.
      const building = world.buildings[0];
      check('test 22: a building wall is available for the squeeze test', Boolean(building), 'no buildings');
      if (building) {
        const wallZ = building.z0;
        const midX = (building.x0 + building.x1) / 2;
        const car = vehicles.spawn('sedan', { x: midX, z: wallZ, yaw: Math.PI / 2 });
        // Place its near edge 8 cm from the wall once the body width is known.
        const halfWidth = car.halfWidth;
        car.setPose(midX, wallZ - halfWidth - 0.08, Math.PI / 2);
        player.teleport(midX, wallZ - 0.3, Math.PI / 2, Math.PI * 1.5);
        player.velocity.set(0, 0, 0);
        check(
          'test 22: the squeeze start overlaps the car',
          car.overlapCircle(player.position.x, player.position.z, 0.46).penetration > 0,
          JSON.stringify(car.overlapCircle(player.position.x, player.position.z, 0.46)),
        );
        player.resolveVehicleContacts();
        const overlap = car.overlapCircle(player.position.x, player.position.z, 0.46);
        check(
          'test 22: the push-out leaves the player outside the car body',
          overlap.penetration === 0,
          JSON.stringify({ overlap, x: player.position.x, z: player.position.z }),
        );
        check(
          'test 22: the push-out never leaves the player inside the wall',
          world.collides(player.position.x, player.position.z, 0.46) === false,
          JSON.stringify({ x: player.position.x, z: player.position.z }),
        );
        vehicles.remove(car);
      }
      return results;
    },
  },
  {
    name: 'test 23: the Solano Mall shell and interior',
    shot: 'street',
    body: function mallShell() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon?.debug?.world;
      const player = neon?.debug?.player;
      const vehicles = neon?.debug?.vehicles;
      const mall = world?.mall;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!mall) missing.push('world.mall');
      if (!world || typeof world.vehicleBlocked !== 'function') missing.push('world.vehicleBlocked');
      if (!world || typeof world.resolveCircle !== 'function') missing.push('world.resolveCircle');
      if (!player || typeof player.teleport !== 'function') missing.push('player.teleport');
      if (!neon || !neon.mall) missing.push('__neon.mall');
      check('test 23: mall hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (!mall || !world) return results;

      const bounds = mall.bounds;
      player.teleport(54, 8, Math.PI / 2, -Math.PI / 2);
      check(
        'test 23: the hall centre is inside the mall bounds',
        bounds.minX < 54 && bounds.maxX > 54 && bounds.minZ < 8 && bounds.maxZ > 8,
        JSON.stringify(bounds),
      );
      check(
        'test 23: the hall floor is the block floor',
        Math.abs(world.groundHeightAt(54, 8) - 0.15) < 1e-6,
        `ground=${world.groundHeightAt(54, 8)}`,
      );
      check(
        'test 23: the hall centre is walkable',
        world.collides(54, 8, 0.4) === false,
        'a collider sits at the hall centre',
      );

      const wall = world.resolveCircle(46, 16, 0.4);
      check(
        'test 23: resolveCircle pushes a point inside a mall wall back out',
        !world.collides(wall.x, wall.z, 0.4) && (wall.x !== 46 || wall.z !== 16),
        JSON.stringify(wall),
      );

      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
        code,
        key: code.replace('Key', '').toLowerCase(),
        bubbles: true,
        cancelable: true,
      }));
      player.teleport(54, 18, Math.PI, 0);
      key('keydown', 'KeyW');
      neon.advance(1.4);
      key('keyup', 'KeyW');
      check(
        'test 23: the main door is walkable from the strip into the hall',
        player.position.z < 15.5,
        JSON.stringify({ x: player.position.x, z: player.position.z }),
      );
      player.teleport(54, -2, 0, Math.PI);
      key('keydown', 'KeyW');
      neon.advance(1.4);
      key('keyup', 'KeyW');
      check(
        'test 23: the lot door is walkable from the parking side into the hall',
        player.position.z > 0.5,
        JSON.stringify({ x: player.position.x, z: player.position.z }),
      );

      if (vehicles) {
        const car = vehicles.spawn('sedan', { x: 60, z: 16.3, yaw: Math.PI / 2 });
        const halfWidth = car.halfWidth;
        car.setPose(60, 16.02 + halfWidth + 0.08, Math.PI / 2);
        player.teleport(60, 16.32, Math.PI / 2, Math.PI * 1.5);
        player.velocity.set(0, 0, 0);
        check(
          'test 23: the mall squeeze start overlaps the car',
          car.overlapCircle(player.position.x, player.position.z, 0.46).penetration > 0,
          JSON.stringify(car.overlapCircle(player.position.x, player.position.z, 0.46)),
        );
        player.resolveVehicleContacts();
        const overlap = car.overlapCircle(player.position.x, player.position.z, 0.46);
        check(
          'test 23: the mall squeeze leaves the player outside the car body',
          overlap.penetration === 0,
          JSON.stringify({ overlap, x: player.position.x, z: player.position.z }),
        );
        check(
          'test 23: the mall squeeze leaves the player outside the wall',
          world.collides(player.position.x, player.position.z, 0.46) === false,
          JSON.stringify({ x: player.position.x, z: player.position.z }),
        );
        vehicles.remove(car);
      }

      check('test 23: the mall blocks vehicles', world.vehicleBlocked(54, 8, false) === true);
      check('test 23: the mall blocks a player-driven car too', world.vehicleBlocked(54, 8, true) === true);
      check('test 23: the parking lot stays drivable', world.vehicleBlocked(54, -8, false) === false);

      const seats = mall.seats ?? [];
      check('test 23: the mall owns at least 24 seats', seats.length >= 24, `seats=${seats.length}`);
      const outside = seats.filter((seat) => seat.x < bounds.minX || seat.x > bounds.maxX || seat.z < bounds.minZ || seat.z > bounds.maxZ);
      check('test 23: every mall seat is inside the hall bounds', outside.length === 0, JSON.stringify(outside));
      const registered = seats.every((seat) => Array.isArray(world.seats) && world.seats.includes(seat));
      check('test 23: every mall seat is in the shared registry', registered);
      check(
        'test 23: the minimap state carries the mall label and footprint',
        mall.label === 'SOLANO MALL' && neon.mall?.label === mall.label
          && neon.mall?.bounds?.minX === bounds.minX && neon.mall?.bounds?.maxZ === bounds.maxZ,
        JSON.stringify({ label: mall.label, state: neon.mall }),
      );
      return results;
    },
  },
  {
    name: 'test 24: the parking lot, theft and valet',
    shot: 'street',
    body: function parkingLot() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon?.debug?.world;
      const player = neon?.debug?.player;
      const vehicles = neon?.debug?.vehicles;
      const parking = neon?.debug?.parking;
      const env = neon?.debug?.environment;
      const interactions = neon?.debug?.interactions;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!world) missing.push('world');
      if (!player) missing.push('player');
      if (!vehicles || typeof vehicles.closestTo !== 'function') missing.push('vehicles.closestTo');
      if (!parking || !Array.isArray(parking.slots)) missing.push('parking.slots');
      if (!env || typeof env.setClock !== 'function') missing.push('environment.setClock');
      if (!interactions) missing.push('interactions');
      if (!neon || !neon.parking) missing.push('__neon.parking');
      check('test 24: parking hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (!parking || !world || !player || !vehicles) return results;

      check('test 24: the lot has 26 stalls', parking.slots.length === 26, `slots=${parking.slots.length}`);
      const outside = parking.slots.filter((slot) => slot.x < 38 || slot.x > 70 || slot.z < -16 || slot.z > 0);
      check('test 24: every stall is inside the lot bounds', outside.length === 0, JSON.stringify(outside.map((slot) => ({ x: slot.x, z: slot.z }))));

      const settle = (minutes) => {
        env.setClock(minutes);
        for (let i = 0; i < 320; i += 1) parking.update(0.2, minutes);
        return parking.occupied;
      };
      const night = settle(22 * 60);
      check(
        'test 24: night occupancy is 20% within one stall',
        Math.abs(night - Math.round(26 * 0.2)) <= 1,
        `occupied=${night} target=${Math.round(26 * 0.2)}`,
      );
      const dusk = settle(18 * 60);
      check(
        'test 24: dusk occupancy is 90% within one stall',
        Math.abs(dusk - Math.round(26 * 0.9)) <= 1,
        `occupied=${dusk} target=${Math.round(26 * 0.9)}`,
      );
      const day = settle(12 * 60);
      check(
        'test 24: day occupancy is 65% within one stall',
        Math.abs(day - Math.round(26 * 0.65)) <= 1,
        `occupied=${day} target=${Math.round(26 * 0.65)}`,
      );

      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, {
        code,
        key: code.replace('Key', '').toLowerCase(),
        bubbles: true,
        cancelable: true,
      }));

      // Dusk is the busiest lot; the stall in front of the lot door must stay
      // empty or the only way between the mall and the parking lot is blocked.
      const doorSlot = parking.slots.find((entry) => entry.key === 'B-6');
      settle(18 * 60);
      check(
        'test 24: the stall in front of the lot door stays clear at dusk',
        Boolean(doorSlot) && doorSlot.doorClear === true && doorSlot.occupied === false
          && world.collides(54, -2.5, 0.4) === false,
        JSON.stringify(doorSlot ? { key: doorSlot.key, doorClear: doorSlot.doorClear, occupied: doorSlot.occupied } : null),
      );
      player.teleport(54, -2, 0, Math.PI);
      neon.advance(1 / 60);
      key('keydown', 'KeyW');
      neon.advance(1.4);
      key('keyup', 'KeyW');
      check(
        'test 24: the lot door is walkable at 90% occupancy',
        player.position.z > 0.5,
        JSON.stringify({ x: player.position.x, z: player.position.z }),
      );

      const slot = parking.slots.find((entry) => entry.static && entry.occupied && !entry.stolen);
      check('test 24: an occupied static stall exists for the theft', Boolean(slot), 'no static occupied slot');
      if (slot) {
        check(
          'test 24: an occupied stall has a solid collider',
          Boolean(slot.collider) && world.collides(slot.x, slot.z, 0.4) === true,
          JSON.stringify({ collider: Boolean(slot.collider) }),
        );
        const aisleZ = slot.row === 'A' ? 1.9 : -1.9;
        player.teleport(slot.x, slot.z + aisleZ, slot.row === 'A' ? Math.PI : 0, slot.row === 'A' ? 0 : Math.PI);
        neon.advance(1 / 60);
        check(
          'test 24: standing beside a parked car prompts STEAL',
          interactions.prompt?.action === 'steal',
          JSON.stringify(interactions.prompt),
        );
        key('keydown', 'KeyE');
        neon.advance(1 / 60);
        key('keyup', 'KeyE');
        check(
          'test 24: E steals the static car into a real Vehicle',
          slot.occupied === false && slot.stolen === true && Boolean(slot.vehicle)
            && slot.vehicle.driver === 'player' && player.driving === slot.vehicle,
          JSON.stringify({ occupied: slot.occupied, stolen: slot.stolen, vehicle: Boolean(slot.vehicle), driving: Boolean(player.driving) }),
        );
        check(
          'test 24: stealing removes the stall collider',
          slot.collider === null && world.collides(slot.x, slot.z, 0.4) === false,
          JSON.stringify({ collider: slot.collider, collides: world.collides(slot.x, slot.z, 0.4) }),
        );
      }

      const car = player.driving;
      check('test 24: the stolen car is drivable', Boolean(car), 'player is not driving');
      if (!car) return results;

      const zone = parking.valetZone;
      car.setPose((zone.minX + zone.maxX) / 2, (zone.minZ + zone.maxZ) / 2, Math.PI / 2);
      player.syncFromVehicle();
      const storedType = car.type;
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      check(
        'test 24: E in the valet zone parks the car instead of only exiting it',
        Boolean(parking.valet) && player.driving === null && player.sitting === false && car.removed === true,
        JSON.stringify({ valet: Boolean(parking.valet), driving: Boolean(player.driving), removed: car.removed }),
      );
      check(
        'test 24: the valet stores the car type and colour',
        parking.valet?.type === storedType && Number.isFinite(parking.valet?.color),
        JSON.stringify(parking.valet),
      );
      neon.advance(1 / 60);
      check(
        'test 24: the prompt leaves VALET once the car is parked',
        interactions.prompt?.action !== 'valet',
        JSON.stringify(interactions.prompt),
      );

      player.teleport((zone.minX + zone.maxX) / 2, (zone.minZ + zone.maxZ) / 2, 0, Math.PI);
      neon.advance(1 / 60);
      check(
        'test 24: on foot in the valet zone does not prompt to park',
        interactions.prompt?.action !== 'valet',
        JSON.stringify(interactions.prompt),
      );

      player.teleport(parking.podium.x - 1.0, parking.podium.z, 0, Math.PI);
      neon.advance(1 / 60);
      check(
        'test 24: the podium prompts RETRIEVE',
        interactions.prompt?.action === 'retrieve',
        JSON.stringify(interactions.prompt),
      );
      key('keydown', 'KeyE');
      neon.advance(1 / 60);
      key('keyup', 'KeyE');
      const returned = vehicles.closestTo(parking.entrance.x, parking.entrance.z, 8);
      check(
        'test 24: retrieveValet puts the car back at the entrance',
        Boolean(returned) && returned.type === storedType && returned.driver === null
          && Math.hypot(returned.position.x - parking.entrance.x, returned.position.z - parking.entrance.z) < 2.0,
        JSON.stringify(returned ? { type: returned.type, x: returned.position.x, z: returned.position.z } : null),
      );
      check('test 24: the valet slot is clear after the return', parking.valet === null);
      return results;
    },
  },
];
