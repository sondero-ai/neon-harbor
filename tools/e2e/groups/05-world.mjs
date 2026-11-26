// Neon Harbor E2E groups 17-20: beach, carjacking, volume settings and ambient road-grid traffic.
// Entries are moved verbatim from tools/test-npc-loot.mjs.
export const groups = [
  {
    name: 'test 17: beach',
    shot: 'street',
    body: function beach() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const world = neon && neon.debug && neon.debug.world;
      const traffic = neon && neon.debug && neon.debug.traffic;
      const missing = [];
      if (!world || typeof world.beachHeight !== 'function') missing.push('world.beachHeight');
      if (!world || typeof world.collides !== 'function') missing.push('world.collides');
      if (!world || typeof world.groundHeightAt !== 'function') missing.push('world.groundHeightAt');
      if (!world || !world.beach || !world.beach.geometry) missing.push('world.beach');
      if (!world || !world.beachWet) missing.push('world.beachWet');
      if (!world || !world.foam) missing.push('world.foam');
      if (!traffic || !traffic.peds) missing.push('__neon.debug.traffic.peds');
      check('test 17: beach hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const shorelineX = -232;
      const cityEdgeX = -142;
      const round = (value) => Math.round(value * 1000) / 1000;
      world.beach.geometry.computeBoundingBox();
      const bounds = world.beach.geometry.boundingBox;
      check(
        'test 17: the sand mesh starts at the shoreline and ends at the city edge',
        Math.abs(bounds.min.x - shorelineX) < 0.001 && Math.abs(bounds.max.x - cityEdgeX) < 0.001,
        `minX=${round(bounds.min.x)} maxX=${round(bounds.max.x)}`,
      );
      check(
        'test 17: no sand is drawn west of the shoreline',
        bounds.min.x >= shorelineX - 0.001,
        `minX=${round(bounds.min.x)}`,
      );

      const dryZ = -100;
      check(
        'test 17: half a metre east of the shoreline is walkable',
        world.collides(shorelineX + 0.5, dryZ, 0.46) === false,
        `collides=${world.collides(shorelineX + 0.5, dryZ, 0.46)}`,
      );
      check(
        'test 17: half a metre west of the shoreline is blocked',
        world.collides(shorelineX - 0.5, dryZ, 0.46) === true,
        `collides=${world.collides(shorelineX - 0.5, dryZ, 0.46)}`,
      );
      check(
        'test 17: the ground height is finite on both sides of the line',
        Number.isFinite(world.groundHeightAt(shorelineX + 0.5, dryZ))
          && Number.isFinite(world.groundHeightAt(shorelineX - 0.5, dryZ)),
        JSON.stringify({
          east: world.groundHeightAt(shorelineX + 0.5, dryZ),
          west: world.groundHeightAt(shorelineX - 0.5, dryZ),
        }),
      );

      const cityHeight = world.beachHeight(cityEdgeX, dryZ);
      const shoreHeight = world.beachHeight(shorelineX, dryZ);
      check(
        'test 17: the beach keeps the 0.45 m fall from the city edge to the water',
        Math.abs(cityHeight) < 0.001 && Math.abs(shoreHeight + 0.45) <= 0.0101,
        `city=${round(cityHeight)} shore=${round(shoreHeight)}`,
      );

      let minRipple = Infinity;
      let maxRipple = -Infinity;
      for (let z = -200; z <= 200; z += 3) {
        const height = world.beachHeight(shorelineX, z);
        minRipple = Math.min(minRipple, height);
        maxRipple = Math.max(maxRipple, height);
      }
      check(
        'test 17: the shoreline ripple stays within one centimetre',
        maxRipple - minRipple <= 0.0201,
        `peak-to-peak=${round(maxRipple - minRipple)}`,
      );

      let maxStep = 0;
      let previous = world.beachHeight(shorelineX, dryZ);
      for (let x = shorelineX + 0.5; x <= cityEdgeX; x += 0.5) {
        const height = world.beachHeight(x, dryZ);
        maxStep = Math.max(maxStep, Math.abs(height - previous));
        previous = height;
      }
      check(
        'test 17: the slope is smooth between half-metre samples',
        maxStep < 0.006,
        `maxStep=${round(maxStep)}`,
      );

      let blocked = 0;
      for (let x = shorelineX + 0.5; x <= cityEdgeX; x += 2.5) {
        if (world.collides(x, dryZ, 0.46)) blocked += 1;
      }
      check(
        'test 17: every visible sand metre east of the shoreline is walkable',
        blocked === 0,
        `blocked=${blocked}`,
      );

      world.beachWet.geometry.computeBoundingBox();
      const wetBounds = world.beachWet.geometry.boundingBox;
      check(
        'test 17: the wet-sand strip runs from the shoreline a few metres inland',
        world.beachWet.material.transparent === true
          && Math.abs(wetBounds.min.x - shorelineX) < 0.001
          && wetBounds.max.x > shorelineX + 6
          && wetBounds.max.x < shorelineX + 12,
        `minX=${round(wetBounds.min.x)} maxX=${round(wetBounds.max.x)}`,
      );

      const foam = world.foam;
      const foamHalf = foam.geometry.parameters.width / 2;
      check(
        'test 17: the foam line sits on the water edge',
        Math.abs(foam.position.x - shorelineX) <= 0.5
          && foam.position.x - foamHalf <= shorelineX
          && foam.position.x + foamHalf >= shorelineX,
        JSON.stringify({ x: round(foam.position.x), half: round(foamHalf) }),
      );

      const beachPeds = traffic.peds.filter((ped) => ped.active && ped.mode === 'beach');
      check(
        'test 17: all beach walkers stand on the visible sand',
        beachPeds.length === 28 && beachPeds.every((ped) => ped.x >= shorelineX + 1 - 1e-6),
        `count=${beachPeds.length} minX=${round(Math.min(...beachPeds.map((ped) => ped.x)))}`,
      );
      return results;
    },
  },
  {
    name: 'test 18: carjacking',
    shot: 'street',
    body: function carjacking() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const player = debug && debug.player;
      const traffic = debug && debug.traffic;
      const police = debug && debug.police;
      const vehicles = debug && debug.vehicles;
      const hud = debug && debug.hud;
      const missing = [];
      if (!traffic || typeof traffic.ejectDriver !== 'function') missing.push('traffic.ejectDriver');
      if (!traffic || typeof traffic.update !== 'function') missing.push('traffic.update');
      if (!player || typeof player.enterVehicle !== 'function') missing.push('player.enterVehicle');
      if (!player || typeof player.exitVehicle !== 'function') missing.push('player.exitVehicle');
      if (!vehicles || typeof vehicles.spawn !== 'function') missing.push('vehicles.spawn');
      if (!police || typeof police.clearWanted !== 'function') missing.push('police.clearWanted');
      if (!hud || typeof hud !== 'object') missing.push('__neon.debug.hud');
      if (!neon || !neon.loot) missing.push('__neon.loot');
      check('test 18: carjacking hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const round = (value) => Math.round(value * 1000) / 1000;
      const baseX = 81;
      const baseZ = 0;
      const resetWorld = () => {
        police.clearWanted({ quiet: true });
        police.consumeNotice();
        police.clearUnits();
        police.clearOfficers();
        police.stageAir({ x: 640, y: 40, z: 640 });
        traffic.reset({ spawnBeach: false });
        for (const car of [...vehicles.list]) vehicles.remove(car);
      };
      resetWorld();
      player.teleport(baseX, baseZ, Math.PI, 0);
      player.health = 100;
      player.armor = 0;
      player.dead = false;

      // Direct entry of an AI civilian car: the driver bails at the left door.
      const car = vehicles.spawn('sedan', { x: baseX + 2.2, z: baseZ, yaw: Math.PI / 2, driver: 'ai' });
      const beforePeds = new Set(traffic.peds);
      player.enterVehicle(car);
      const ejected = traffic.peds.find((ped) => ped.active && !beforePeds.has(ped));
      check(
        'test 18: taking an AI car leaves the player at the wheel',
        player.driving === car && car.driver === 'player',
        `driving=${player.driving === car} driver=${car.driver}`,
      );
      check(
        'test 18: a driver spawns at the driver door',
        Boolean(ejected),
        'no new pedestrian (crowd slot or door blocked)',
      );
      if (!ejected) return results;
      check(
        'test 18: the ejected driver faces the car from just outside the left door',
        (() => {
          const local = car.localPoint(ejected.x, ejected.z);
          return local.x < 0
            && Math.abs(local.x) >= car.halfWidth + 0.3
            && Math.abs(local.x) <= car.halfWidth + 1.2
            && Math.abs(local.z) <= 1.2;
        })(),
        JSON.stringify({ x: round(ejected.x), z: round(ejected.z), car: [round(car.position.x), round(car.position.z)] }),
      );
      check(
        'test 18: the ejected driver is a normal, fleeing crowd member',
        ejected.health === 55
          && ejected.dead === false
          && ejected.armed === false
          && ejected.mode === 'idle'
          && ejected.fleeTimer === 6
          && ejected.fleeResumeTarget === null
          && ejected.fleeFromX === car.position.x
          && ejected.fleeFromZ === car.position.z,
        JSON.stringify({
          health: ejected.health,
          dead: ejected.dead,
          armed: ejected.armed,
          mode: ejected.mode,
          flee: ejected.fleeTimer,
          resume: ejected.fleeResumeTarget,
        }),
      );

      const distanceBefore = Math.hypot(ejected.x - car.position.x, ejected.z - car.position.z);
      traffic.update(0.2, 0);
      const distanceAfter = Math.hypot(ejected.x - car.position.x, ejected.z - car.position.z);
      check(
        'test 18: the ejected driver runs away from the car',
        distanceAfter > distanceBefore && ejected.fleeTimer < 6 && ejected.fleeTimer > 5,
        `distance ${round(distanceBefore)} -> ${round(distanceAfter)} flee=${round(ejected.fleeTimer)}`,
      );

      const lootBefore = neon.loot.count;
      traffic.applyPlayerHit({ ped: ejected, headshot: false }, 500);
      check(
        'test 18: the ejected driver is still a normal target and drops loot',
        ejected.dead === true && neon.loot.count > lootBefore,
        `dead=${ejected.dead} loot ${lootBefore} -> ${neon.loot.count}`,
      );

      // A police cruiser is not a civilian car: no driver is ejected.
      player.exitVehicle();
      resetWorld();
      player.teleport(baseX, baseZ, Math.PI, 0);
      const cruiser = vehicles.spawn('police', { x: baseX + 2.2, z: baseZ, yaw: Math.PI / 2, driver: 'ai' });
      const pedsBeforeCruiser = traffic.peds.filter((ped) => ped.active).length;
      player.enterVehicle(cruiser);
      const pedsAfterCruiser = traffic.peds.filter((ped) => ped.active).length;
      check(
        'test 18: a police cruiser is taken without ejecting a driver',
        cruiser.driver === 'player' && pedsAfterCruiser === pedsBeforeCruiser,
        `driver=${cruiser.driver} peds ${pedsBeforeCruiser} -> ${pedsAfterCruiser}`,
      );

      // The real key path raises the one-shot CARJACKED / DRIVER BAILED toast.
      player.exitVehicle();
      resetWorld();
      player.teleport(baseX, baseZ, Math.PI, 0);
      const toastCar = vehicles.spawn('sedan', { x: baseX + 2.2, z: baseZ, yaw: Math.PI / 2, driver: 'ai' });
      player.exitCooldown = 0;
      hud.suppressToasts = false;
      hud.toast = null;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true }));
      neon.advance(1 / 60);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f', bubbles: true }));
      check(
        'test 18: entering with F drives the car and shows CARJACKED / DRIVER BAILED',
        player.driving === toastCar
          && hud.toast !== null
          && hud.toast.title === 'CARJACKED'
          && hud.toast.sub === 'DRIVER BAILED',
        JSON.stringify({ driving: player.driving ? player.driving.name : null, toast: hud.toast }),
      );
      const toastPeds = traffic.peds.filter((ped) => ped.active && ped.fleeTimer > 0);
      check(
        'test 18: the key-path carjack leaves one fleeing driver',
        toastPeds.length === 1,
        `fleeing=${toastPeds.length}`,
      );

      neon.advance(3);
      check(
        'test 18: the carjack toast fires once and is not repeated',
        hud.toast === null || hud.toast.title !== 'CARJACKED',
        JSON.stringify(hud.toast),
      );
      return results;
    },
  },
  {
    name: 'test 19: volume settings',
    shot: 'street',
    body: function volumeSettings() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const audio = debug && debug.audio;
      const titleSlider = document.getElementById('title-volume');
      const pauseSlider = document.getElementById('pause-volume');
      const titleValue = document.getElementById('title-volume-value');
      const pauseValue = document.getElementById('pause-volume-value');
      const titleMute = document.getElementById('title-mute');
      const pauseMute = document.getElementById('pause-mute');
      const missing = [];
      if (!neon || !neon.audio) missing.push('__neon.audio');
      if (!audio || typeof audio.unlock !== 'function') missing.push('__neon.debug.audio');
      if (!titleSlider || !pauseSlider) missing.push('volume sliders');
      if (!titleValue || !pauseValue) missing.push('volume labels');
      if (!titleMute || !pauseMute) missing.push('mute buttons');
      if (!neon || typeof neon.pauseGame !== 'function' || typeof neon.resumeGame !== 'function') missing.push('pause hooks');
      check('test 19: volume hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const readSettings = () => {
        try {
          return JSON.parse(localStorage.getItem('neon-harbor.settings.v1') || 'null');
        } catch {
          return null;
        }
      };
      const key = (type, code) => {
        const event = new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true });
        window.dispatchEvent(event);
        return event;
      };
      const tap = (code) => {
        key('keydown', code);
        neon.advance(0.1);
        key('keyup', code);
      };

      audio.unlock();
      const startPercent = Math.round(audio.volume * 100);
      check(
        'test 19: both panels start in sync with the loaded settings',
        titleSlider.value === String(startPercent)
          && pauseSlider.value === String(startPercent)
          && titleValue.textContent === `${startPercent}%`
          && pauseValue.textContent === `${startPercent}%`,
        JSON.stringify({ startPercent, title: titleSlider.value, pause: pauseSlider.value }),
      );
      check(
        'test 19: the sliders are 0-100 range inputs',
        [titleSlider, pauseSlider].every((slider) => (
          slider.type === 'range' && slider.min === '0' && slider.max === '100' && slider.step === '1'
        )),
        JSON.stringify([titleSlider, pauseSlider].map((slider) => ({
          type: slider.type, min: slider.min, max: slider.max, step: slider.step,
        }))),
      );

      // Dragging the title slider changes the live output, both readouts and
      // the persisted settings.
      titleSlider.value = '32';
      titleSlider.dispatchEvent(new Event('input', { bubbles: true }));
      let saved = readSettings();
      check(
        'test 19: the title slider sets the master volume to 32%',
        neon.audio.volume === 0.32
          && audio.volume === 0.32
          && titleValue.textContent === '32%'
          && pauseValue.textContent === '32%'
          && pauseSlider.value === '32',
        JSON.stringify({ volume: audio.volume, title: titleValue.textContent, pause: pauseValue.textContent }),
      );
      check(
        'test 19: the slider writes the volume and unmuted state into settings',
        saved !== null && saved.volume === 0.32 && saved.muted === false,
        JSON.stringify(saved),
      );

      // Mute from the title panel updates both panels and the save.
      titleMute.click();
      saved = readSettings();
      check(
        'test 19: the title mute button mutes and updates both panels',
        audio.muted === true
          && neon.audio.muted === true
          && titleMute.getAttribute('aria-pressed') === 'true'
          && pauseMute.getAttribute('aria-pressed') === 'true'
          && titleMute.textContent === 'Muted'
          && pauseMute.textContent === 'Muted'
          && saved !== null
          && saved.muted === true,
        JSON.stringify({ muted: audio.muted, title: titleMute.textContent, saved }),
      );

      // The = key raises the volume, lifts the mute and syncs both sliders.
      tap('Equal');
      saved = readSettings();
      check(
        'test 19: = raises the volume, unmutes and syncs the sliders',
        Math.abs(audio.volume - 0.4) < 1e-9
          && audio.muted === false
          && titleSlider.value === '40'
          && pauseSlider.value === '40'
          && titleValue.textContent === '40%'
          && pauseValue.textContent === '40%'
          && titleMute.getAttribute('aria-pressed') === 'false'
          && saved !== null
          && Math.abs(saved.volume - 0.4) < 1e-9
          && saved.muted === false,
        JSON.stringify({ volume: audio.volume, muted: audio.muted, title: titleSlider.value, saved }),
      );

      // M stays in sync with the buttons, and pressing it again restores.
      tap('KeyM');
      check(
        'test 19: M mutes in sync with both panels',
        audio.muted === true
          && titleMute.getAttribute('aria-pressed') === 'true'
          && pauseMute.getAttribute('aria-pressed') === 'true'
          && titleSlider.value === '40',
        JSON.stringify({ muted: audio.muted, title: titleMute.textContent, slider: titleSlider.value }),
      );
      tap('KeyM');
      check(
        'test 19: M restores the level without changing the percentage',
        audio.muted === false
          && titleMute.getAttribute('aria-pressed') === 'false'
          && Math.abs(audio.volume - 0.4) < 1e-9,
        JSON.stringify({ muted: audio.muted, volume: audio.volume }),
      );

      // The pause panel is wired to the same path.
      neon.pauseGame();
      const pauseVisible = document.getElementById('screen-pause').hidden === false;
      pauseSlider.value = '64';
      pauseSlider.dispatchEvent(new Event('input', { bubbles: true }));
      saved = readSettings();
      check(
        'test 19: the pause slider sets 64% and syncs the title panel',
        pauseVisible
          && neon.audio.volume === 0.64
          && titleSlider.value === '64'
          && pauseValue.textContent === '64%'
          && titleValue.textContent === '64%'
          && saved !== null
          && saved.volume === 0.64,
        JSON.stringify({ visible: pauseVisible, volume: audio.volume, title: titleSlider.value, saved }),
      );
      pauseMute.click();
      check(
        'test 19: the pause mute button mutes both panels',
        audio.muted === true
          && titleMute.getAttribute('aria-pressed') === 'true'
          && pauseMute.getAttribute('aria-pressed') === 'true',
        JSON.stringify({ muted: audio.muted, title: titleMute.textContent }),
      );
      pauseMute.click();
      neon.resumeGame();

      // Clamping at both ends keeps the UI honest.
      titleSlider.value = '0';
      titleSlider.dispatchEvent(new Event('input', { bubbles: true }));
      check(
        'test 19: zero volume shows 0%',
        audio.volume === 0 && titleValue.textContent === '0%' && pauseSlider.value === '0',
        JSON.stringify({ volume: audio.volume, label: titleValue.textContent }),
      );
      titleSlider.value = '137';
      titleSlider.dispatchEvent(new Event('input', { bubbles: true }));
      check(
        'test 19: values above 100 clamp to 100%',
        audio.volume === 1
          && titleValue.textContent === '100%'
          && pauseValue.textContent === '100%'
          && titleSlider.value === '100',
        JSON.stringify({ volume: audio.volume, label: titleValue.textContent, slider: titleSlider.value }),
      );

      // Leave the profile where the next run expects it.
      titleSlider.value = '72';
      titleSlider.dispatchEvent(new Event('input', { bubbles: true }));
      return results;
    },
  },
  {
    name: 'test 20: ambient cars stay on the road grid',
    shot: 'street',
    body: function ambientRoadGrid() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const traffic = neon?.debug?.traffic;
      const player = neon?.debug?.player;
      const ROADS_X = [-135, -81, -27, 27, 81, 135, 189, 243, 297, 351];
      const ROADS_Z = [-243, -189, -135, -81, -27, 27, 81, 135, 189, 243];
      if (!traffic || !player) {
        check('test 20: traffic and player debug handles exist', false, 'missing handles');
        return results;
      }
      const rng = traffic.rng;
      const saved = { chance: rng.chance, pick: rng.pick, sign: rng.sign, range: rng.range };
      try {
        // Axis z must take its line from the x roads. The first x road is
        // -135; the first z road is -243, which is sand.
        traffic.reset({ spawnBeach: false });
        rng.chance = () => false;
        rng.pick = (list) => list[0];
        rng.sign = () => 1;
        rng.range = (min, max) => (min + max) / 2;
        const zCar = traffic.spawnAmbientCar(player, 0, 5000);
        check(
          'test 20: a z-axis car spawns on an x road, not the beach',
          Boolean(zCar) && zCar.ai.axis === 'z' && ROADS_X.includes(zCar.ai.line) && zCar.position.x >= -142,
          JSON.stringify(zCar ? { axis: zCar.ai.axis, line: zCar.ai.line, x: zCar.position.x, z: zCar.position.z } : null),
        );

        // Axis x must take its line from the z roads. 297 exists only on the
        // x list, so the old mapping puts the car at z = 293.8, off the map.
        traffic.reset({ spawnBeach: false });
        rng.chance = () => true;
        rng.pick = (list) => (list.includes(297) ? 297 : list[0]);
        rng.sign = () => -1;
        rng.range = (min, max) => (min + max) / 2;
        const xCar = traffic.spawnAmbientCar(player, 0, 5000);
        check(
          'test 20: an x-axis car spawns on a z road, inside the city',
          Boolean(xCar) && xCar.ai.axis === 'x' && ROADS_Z.includes(xCar.ai.line) && Math.abs(xCar.position.z) <= 250,
          JSON.stringify(xCar ? { axis: xCar.ai.axis, line: xCar.ai.line, x: xCar.position.x, z: xCar.position.z } : null),
        );

        // A car already off the grid (old build, or pushed onto the sand) is
        // removed on the next traffic tick instead of queueing at a phantom
        // signal.
        traffic.reset({ spawnBeach: false });
        const stray = traffic.spawnLaneCar('sedan', 'z', 1, -189, 0, 10);
        check(
          'test 20: a stray beach car is listed before the tick',
          Boolean(stray) && traffic.cars.includes(stray),
          'stray did not spawn',
        );
        traffic.updateCars(0.016, 0, player);
        check(
          'test 20: the off-grid car is removed by updateCars',
          Boolean(stray) && (!traffic.cars.includes(stray) || stray.removed === true),
          stray ? `still listed=${traffic.cars.includes(stray)} removed=${stray.removed}` : 'stray missing',
        );
      } finally {
        rng.chance = saved.chance;
        rng.pick = saved.pick;
        rng.sign = saved.sign;
        rng.range = saved.range;
      }
      return results;
    },
  },
];
