// Neon Harbor E2E groups 13-16: living clock, radio, vehicle hit response and the knife arm.
// Entries are moved verbatim from tools/test-npc-loot.mjs.
export const groups = [
  {
    name: 'test 13: living clock',
    shot: 'street',
    body: function livingClock() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const env = neon && neon.debug && neon.debug.environment;
      const debug = neon && neon.debug;
      const missing = [];
      if (!env || typeof env.setClock !== 'function') missing.push('environment.setClock');
      if (!debug || !debug.renderer || !debug.effects || !debug.vehicles || !debug.signals) {
        missing.push('environment targets');
      }
      if (!neon || !neon.city || !neon.time) missing.push('__neon.city/__neon.time');
      check('test 13: clock hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      check(
        'test 13: the expanded city is 81 blocks',
        neon.city.blocks === 81,
        `blocks=${neon.city.blocks}`,
      );
      const shotTime = neon.time;
      check(
        'test 13: a capture pins 23:41 night at 2.5 minutes per second',
        shotTime.clock === '23:41' && shotTime.period === 'night' && shotTime.rate === 2.5,
        JSON.stringify({ clock: shotTime.clock, period: shotTime.period, rate: shotTime.rate }),
      );

      const apply = () => env.apply({
        scene: neon.scene,
        renderer: debug.renderer,
        world: debug.world,
        effects: debug.effects,
        vehicles: debug.vehicles,
        signals: debug.signals,
      }, { force: true });
      const world = debug.world;
      const cases = [
        [6 * 60, 'dawn'],
        [12 * 60, 'day'],
        [18 * 60, 'dusk'],
        [23 * 60, 'night'],
      ];
      const rows = [];
      for (const [minutes, want] of cases) {
        env.setClock(minutes);
        apply();
        const time = neon.time;
        rows.push({
          minutes,
          want,
          period: time.period,
          window: time.palette.window,
          street: time.palette.street,
          stars: time.palette.stars,
          sun: time.palette.sunIntensity,
          sky: world.skyA.material.map === world.skyTextures[want],
        });
      }
      const rowFor = (name) => rows.find((row) => row.want === name);
      check(
        'test 13: all four periods come from the clock',
        rows.every((row) => row.period === row.want),
        JSON.stringify(rows.map((row) => `${row.minutes}:${row.period}`)),
      );
      check(
        'test 13: each period swaps in its own sky texture',
        rows.every((row) => row.sky === true),
        JSON.stringify(rows.map((row) => row.sky)),
      );
      check(
        'test 13: day is bright with no lamps or stars',
        rowFor('day').sun > 2 && rowFor('day').window <= 0.2
          && rowFor('day').street === 0 && rowFor('day').stars === 0,
        JSON.stringify(rowFor('day')),
      );
      check(
        'test 13: night is full window light, stars and moon',
        rowFor('night').window === 1 && rowFor('night').stars >= 0.85
          && neon.time.palette.moon === 1,
        JSON.stringify({ ...rowFor('night'), moon: neon.time.palette.moon }),
      );
      check(
        'test 13: dawn and dusk are partial-light states',
        rowFor('dawn').window > 0.4 && rowFor('dawn').window < 0.8
          && rowFor('dusk').window > 0.4 && rowFor('dusk').window < 0.9,
        JSON.stringify({ dawn: rowFor('dawn').window, dusk: rowFor('dusk').window }),
      );

      neon.newGame();
      const startClock = neon.time.clock;
      neon.advance(30);
      const advanced = neon.time.clock;
      neon.saveGame();
      env.setClock(12 * 60);
      apply();
      const beforeContinue = neon.time.clock;
      neon.continueGame();
      const restored = neon.time.clock;
      check(
        'test 13: a New Game starts at 18:00',
        startClock === '18:00',
        `start=${startClock}`,
      );
      check(
        'test 13: thirty real seconds move the clock seventy-five minutes',
        advanced === '19:15',
        `advanced=${advanced}`,
      );
      check(
        'test 13: Continue restores the saved minute',
        beforeContinue === '12:00' && restored === '19:15',
        JSON.stringify({ beforeContinue, restored }),
      );

      const dayBefore = neon.time.day;
      env.setClock(23 * 60 + 50);
      neon.advance(30);
      check(
        'test 13: crossing midnight rolls the day counter',
        neon.time.clock === '01:05' && neon.time.day === dayBefore + 1,
        JSON.stringify({ clock: neon.time.clock, day: neon.time.day, dayBefore }),
      );
      return results;
    },
  },
  {
    name: 'test 14: radio',
    shot: 'street',
    body: async function radio() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };
      const neon = window.__neon;
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
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (test, timeout = 6000) => {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          if (test()) return true;
          await sleep(100);
        }
        return false;
      };

      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!neon || !neon.radio) missing.push('__neon.radio');
      if (!neon || !neon.debug || !neon.debug.radio || !neon.debug.radio.player) missing.push('__neon.debug.radio');
      if (!neon || !neon.debug || !neon.debug.hud) missing.push('__neon.debug.hud');
      if (!neon || !neon.debug || !neon.debug.audio) missing.push('__neon.debug.audio');
      if (!neon || !neon.hudRadio) missing.push('__neon.hudRadio');
      check('test 14: radio QA hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      // Create the context while the CDP evaluate's user gesture is fresh.
      const audio = neon.debug.audio;
      audio.unlock();
      const stations = neon.debug.radio.stations;
      const player = neon.debug.radio.player;
      const initial = neon.radio;
      check(
        'test 14: Vega 105.1 track 0 is the default',
        initial.stationId === 'vega'
          && initial.station === 'Vega 105.1'
          && initial.track === 'Vega Strip Money'
          && initial.artist === 'Kade Voss'
          && initial.index === 0
          && initial.trackNumber === 1
          && initial.trackCount === 3
          && initial.enabled === true,
        JSON.stringify(initial),
      );
      check(
        'test 14: six stations carry three tracks each',
        stations.length === 6 && stations.every((station) => station.tracks.length === 3),
        JSON.stringify(stations.map((station) => `${station.id}:${station.tracks.length}`)),
      );
      const hud = neon.hudRadio;
      check(
        'test 14: the HUD reads the same radio state',
        hud.stationId === initial.stationId
          && hud.track === initial.track
          && hud.artist === initial.artist
          && hud.trackNumber === initial.trackNumber
          && hud.trackCount === initial.trackCount
          && hud.enabled === initial.enabled,
        JSON.stringify(hud),
      );

      tap('KeyT');
      check('test 14: T switches the radio off', neon.radio.enabled === false && neon.radio.mode === 'off', JSON.stringify(neon.radio));
      tap('KeyT');
      check('test 14: T switches the radio back on', neon.radio.enabled === true, JSON.stringify(neon.radio));
      tap('BracketRight');
      check(
        'test 14: ] moves to the next station at track 0',
        neon.radio.stationId === 'night-tide' && neon.radio.index === 0 && neon.radio.track === 'Harbor Lights',
        JSON.stringify(neon.radio),
      );
      tap('BracketLeft');
      check('test 14: [ moves back to Vega', neon.radio.stationId === 'vega', JSON.stringify(neon.radio));
      tap('Period');
      check(
        'test 14: . advances the track',
        neon.radio.index === 1 && neon.radio.track === 'Ledger Season' && neon.radio.artist === 'Nia Vex',
        JSON.stringify(neon.radio),
      );
      tap('Comma');
      check(
        'test 14: , rewinds and wraps to track 0',
        neon.radio.index === 0 && neon.radio.track === 'Vega Strip Money',
        JSON.stringify(neon.radio),
      );
      const wasMuted = neon.audio.muted;
      tap('KeyM');
      const nowMuted = neon.audio.muted;
      tap('KeyM');
      check(
        'test 14: M mutes and restores the master output',
        nowMuted === !wasMuted && neon.audio.muted === wasMuted,
        JSON.stringify({ wasMuted, nowMuted, after: neon.audio.muted }),
      );
      player.setStation(0, 2, { autoplay: false });
      neon.advance(0.05);
      tap('Period');
      check(
        'test 14: track keys wrap from the last track to the first',
        neon.radio.stationId === 'vega' && neon.radio.index === 0,
        JSON.stringify(neon.radio),
      );
      player.setStation(5, 0, { autoplay: false });
      neon.advance(0.05);
      tap('BracketRight');
      check(
        'test 14: station keys wrap from Foundry to Vega',
        neon.radio.stationId === 'vega' && neon.radio.index === 0,
        JSON.stringify(neon.radio),
      );

      const tab = key('keydown', 'Tab');
      check('test 14: Tab is prevented from moving focus', tab.defaultPrevented === true, `defaultPrevented=${tab.defaultPrevented}`);
      neon.advance(0.1);
      check('test 14: holding Tab opens the wheel', neon.radio.wheel.open === true, JSON.stringify(neon.radio.wheel));
      check(
        'test 14: the wheel cursor starts on the live tune',
        neon.radio.wheel.station === 0 && neon.radio.wheel.track === 0,
        JSON.stringify(neon.radio.wheel),
      );
      key('keydown', 'ArrowRight');
      neon.advance(0.1);
      key('keyup', 'ArrowRight');
      key('keydown', 'ArrowDown');
      neon.advance(0.1);
      key('keyup', 'ArrowDown');
      check(
        'test 14: arrows move the wheel cursor',
        neon.radio.wheel.station === 1 && neon.radio.wheel.track === 1,
        JSON.stringify(neon.radio.wheel),
      );
      key('keydown', 'Enter');
      neon.advance(0.1);
      key('keyup', 'Enter');
      check(
        'test 14: Enter tunes the wheel selection',
        neon.radio.stationId === 'night-tide' && neon.radio.index === 1 && neon.radio.track === 'Neon Coastline',
        JSON.stringify(neon.radio),
      );
      check('test 14: the wheel stays open until Tab is released', neon.radio.wheel.open === true, JSON.stringify(neon.radio.wheel));

      const hudDebug = neon.debug.hud;
      const clickTarget = hudDebug.wheelHits.find((hit) => hit.station === 5 && hit.track === 2);
      check('test 14: the wheel exposes per-track click targets', Boolean(clickTarget), `${hudDebug.wheelHits.length} targets`);
      if (clickTarget) {
        document.getElementById('hud').dispatchEvent(new MouseEvent('click', {
          clientX: clickTarget.x + clickTarget.width / 2,
          clientY: clickTarget.y + clickTarget.height / 2,
          bubbles: true,
          cancelable: true,
        }));
        neon.advance(0.05);
      }
      check(
        'test 14: a click tunes the clicked track',
        neon.radio.stationId === 'foundry' && neon.radio.index === 2 && neon.radio.track === 'Graveyard Shift',
        JSON.stringify(neon.radio),
      );
      key('keyup', 'Tab');
      neon.advance(0.1);
      check('test 14: releasing Tab closes the wheel', neon.radio.wheel.open === false, JSON.stringify(neon.radio.wheel));

      player.setStation(4, 1, { autoplay: false });
      neon.advance(0.05);
      const saved = neon.saveGame();
      check(
        'test 14: the save carries station, track and on/off',
        saved.radioStation === 'solano-soul' && saved.radioTrack === 1 && saved.radioEnabled === true,
        JSON.stringify({ station: saved.radioStation, track: saved.radioTrack, enabled: saved.radioEnabled }),
      );
      player.setStation(0, 0, { autoplay: false });
      neon.continueGame();
      neon.advance(0.1);
      check(
        'test 14: Continue restores the saved station and track',
        neon.radio.stationId === 'solano-soul'
          && neon.radio.index === 1
          && neon.radio.track === 'Beachside Cantina'
          && neon.radio.enabled === true,
        JSON.stringify(neon.radio),
      );

      const raw = JSON.parse(localStorage.getItem('neon-harbor.save.v1') || 'null');
      if (raw) {
        delete raw.radioStation;
        delete raw.radioTrack;
        delete raw.radioEnabled;
        localStorage.setItem('neon-harbor.save.v1', JSON.stringify(raw));
      }
      neon.continueGame();
      neon.advance(0.1);
      check(
        'test 14: an old save defaults to Vega, track 0, radio on',
        Boolean(raw)
          && neon.radio.stationId === 'vega'
          && neon.radio.index === 0
          && neon.radio.enabled === true,
        JSON.stringify(neon.radio),
      );

      const audioRunning = await waitFor(() => neon.audio.state === 'running', 5000);
      check('test 14: the first-gesture audio unlock reaches running', audioRunning, `state=${neon.audio.state}`);

      const vegaFile = stations[0].tracks[0].file;
      const tideFile = stations[1].tracks[0].file;
      try {
        stations[1].tracks[0].file = 'audio/radio/__missing__.ogg';
        player.setEnabled(true, { autoplay: false });
        player.setStation(1, 0);
        const fellBack = await waitFor(() => neon.radio.fallback === true, 7000);
        check(
          'test 14: a missing file falls back to the station synth bed',
          fellBack && neon.radio.mode === 'synth' && neon.radio.enabled === true,
          JSON.stringify(neon.radio),
        );
        check(
          'test 14: the fallback still reports the track metadata',
          neon.radio.stationId === 'night-tide' && neon.radio.track === 'Harbor Lights' && neon.radio.artist === 'Sable Youth',
          JSON.stringify(neon.radio),
        );
        check('test 14: the procedural sequencer is running', neon.audio.fallbackActive === true, JSON.stringify(neon.audio));

        player.setStation(1, 1);
        const recovered = await waitFor(() => neon.radio.fallback === false && neon.radio.mode === 'file' && neon.radio.playing === true, 7000);
        check('test 14: the next real track leaves the fallback', recovered, JSON.stringify(neon.radio));

        stations[0].tracks[0].file = 'audio/radio/__missing__.ogg';
        player.setStation(0, 0);
        const offAir = await waitFor(() => neon.radio.offAir === true && neon.radio.mode === 'offair', 7000);
        check(
          'test 14: a station with no fallback shows OFF AIR',
          offAir && neon.radio.playing === false && neon.radio.fallback === false,
          JSON.stringify(neon.radio),
        );
        check(
          'test 14: OFF AIR still reports the track metadata',
          neon.radio.station === 'Vega 105.1' && neon.radio.track === 'Vega Strip Money',
          JSON.stringify(neon.radio),
        );

        stations[0].tracks[0].file = vegaFile;
        player.setStation(0, 0);
        const backOnAir = await waitFor(() => neon.radio.offAir === false && neon.radio.mode === 'file' && neon.radio.playing === true, 7000);
        check('test 14: restoring the file brings the station back on air', backOnAir, JSON.stringify(neon.radio));

        const beforeEnded = neon.radio.index;
        player.onEnded(player.activeDeck);
        neon.advance(0.1);
        check(
          'test 14: an ended track auto-advances within the station',
          neon.radio.index === (beforeEnded + 1) % 3,
          `${beforeEnded} -> ${neon.radio.index}`,
        );
      } finally {
        stations[0].tracks[0].file = vegaFile;
        stations[1].tracks[0].file = tideFile;
      }

      const files = stations.flatMap((station) => station.tracks.map((track) => track.file));
      let present = 0;
      let oggMime = 0;
      for (const file of files) {
        const response = await fetch(file, { method: 'HEAD', cache: 'no-store' });
        if (response.ok) present += 1;
        if ((response.headers.get('content-type') || '').includes('audio/ogg')) oggMime += 1;
      }
      check('test 14: all eighteen declared radio files are served', present === 18, `${present}/18`);
      check('test 14: radio files are served as audio/ogg', oggMime === 18, `${oggMime}/18`);
      return results;
    },
  },
  {
    name: 'test 15: vehicle hit response',
    shot: 'street',
    body: function vehicleHits() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const player = debug && debug.player;
      const vehicles = debug && debug.vehicles;
      const traffic = debug && debug.traffic;
      const police = debug && debug.police;
      const missing = [];
      if (!neon) missing.push('window.__neon');
      if (!player || typeof player.hitByVehicle !== 'function') missing.push('player.hitByVehicle');
      if (!vehicles || typeof vehicles.spawn !== 'function') missing.push('vehicles.spawn');
      if (!vehicles || !vehicles.list) missing.push('vehicles.list');
      if (!traffic || typeof traffic.reset !== 'function') missing.push('traffic.reset');
      if (!police || typeof police.ramCheck !== 'function') missing.push('police.ramCheck');
      const sample = vehicles && vehicles.list && vehicles.list[0];
      if (!sample || typeof sample.overlapCircle !== 'function') missing.push('vehicle.overlapCircle');
      check('test 15: vehicle-hit hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const round = (value) => Math.round(value * 1000) / 1000;
      const hv = vehicles;

      // The circle/box normal, before any gameplay state is touched.
      const probe = hv.spawn('sedan', { x: 0, z: 0, yaw: 0 });
      const frontHit = probe.overlapCircle(0, probe.halfLength + 0.2, 0.5);
      check(
        'test 15: overlapCircle returns the front face penetration and normal',
        Math.abs(frontHit.penetration - 0.3) < 1e-6
          && Math.abs(frontHit.nx) < 1e-6
          && Math.abs(frontHit.nz - 1) < 1e-6,
        JSON.stringify(frontHit),
      );
      const insideHit = probe.overlapCircle(0, 0, 0.5);
      check(
        'test 15: a centre inside the box exits through the nearest face',
        insideHit.penetration > 0.5 && (Math.abs(insideHit.nx) === 1 || Math.abs(insideHit.nz) === 1),
        JSON.stringify(insideHit),
      );
      const clearHit = probe.overlapCircle(0, probe.halfLength + 2, 0.5);
      check('test 15: a clear circle reports no penetration', clearHit.penetration === 0, JSON.stringify(clearHit));
      hv.remove(probe);

      // A quiet stretch of the 81 road, away from seeded lanes and parked cars.
      traffic.reset({ spawnBeach: false });
      for (const car of [...hv.list]) hv.remove(car);
      police.clearWanted({ quiet: true });
      police.clearUnits();
      police.clearOfficers();
      police.stageAir({ x: 640, y: 40, z: 640 });

      const baseX = 81;
      const baseZ = 0;
      const resetTo = () => {
        player.teleport(baseX, baseZ, Math.PI, 0);
        player.health = 100;
        player.armor = 0;
        player.dead = false;
        player.velocity.set(0, 0, 0);
        return player.health;
      };

      // A fast AI car centred on the player: one hit, a push-out and a knockdown.
      let health = resetTo();
      const fast = hv.spawn('sedan', { x: baseX, z: baseZ, yaw: 0, driver: 'ai' });
      fast.velocity.set(0, 0, 10);
      neon.advance(1 / 60);
      const afterFirst = player.health;
      check(
        'test 15: a 10 m/s overlap lands one damage hit',
        afterFirst < health,
        `health ${health} -> ${afterFirst}`,
      );
      check(
        'test 15: the impact pushes the player out of the car body',
        fast.overlapCircle(player.position.x, player.position.z, 0.46).penetration === 0,
        JSON.stringify({ player: [round(player.position.x), round(player.position.z)], car: [fast.position.x, fast.position.z] }),
      );
      check(
        'test 15: the hit sets the knockdown timer and the QA readout',
        player.knockdown > 0 && neon.player.knockdown > 0 && neon.player.lastVehicleHit !== null,
        JSON.stringify({ knockdown: player.knockdown, qa: neon.player }),
      );
      check(
        'test 15: the last vehicle hit records the car and damage',
        neon.player.lastVehicleHit
          && neon.player.lastVehicleHit.type === 'sedan'
          && neon.player.lastVehicleHit.damage === 16
          && neon.player.lastVehicleHit.speed === 10,
        JSON.stringify(neon.player.lastVehicleHit),
      );

      neon.advance(0.2);
      const healthMid = player.health;
      check(
        'test 15: the knocked-down body tilts toward the fall pose',
        player.knockdown > 0 && player.humanoid.group.rotation.z > 0.35,
        `knockdown=${round(player.knockdown)} tilt=${round(player.humanoid.group.rotation.z)}`,
      );
      check(
        'test 15: one impact never double-hits while the player is down',
        healthMid === afterFirst && player.knockdown > 0,
        `health ${afterFirst} -> ${healthMid}`,
      );

      // A second fast car during the cooldown pushes but cannot damage again.
      hv.remove(fast);
      const during = hv.spawn('sedan', { x: player.position.x, z: player.position.z, yaw: 0, driver: 'ai' });
      during.velocity.set(0, 0, 8);
      neon.advance(1 / 60);
      check(
        'test 15: the shared cooldown blocks a second hit',
        player.health === healthMid,
        `health ${healthMid} -> ${player.health}`,
      );
      check(
        'test 15: the cooldown push still clears the car body',
        during.overlapCircle(player.position.x, player.position.z, 0.46).penetration === 0,
        JSON.stringify({ player: [round(player.position.x), round(player.position.z)] }),
      );
      hv.remove(during);

      neon.advance(1.2);
      check(
        'test 15: the player stands up when the 0.9 s knockdown ends',
        player.knockdown === 0 && player.humanoid.group.rotation.z === 0,
        `knockdown=${player.knockdown} tilt=${player.humanoid.group.rotation.z}`,
      );

      // Movement and fire are ignored while down, then resume.
      const standX = player.position.x;
      const standZ = player.position.z;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      neon.advance(0.4);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
      check(
        'test 15: movement resumes after standing up',
        Math.hypot(player.position.x - standX, player.position.z - standZ) > 0.5,
        `moved=${round(Math.hypot(player.position.x - standX, player.position.z - standZ))}`,
      );

      // A fresh hit after the full cooldown lands again.
      health = resetTo();
      const second = hv.spawn('sedan', { x: baseX, z: baseZ, yaw: 0, driver: 'ai' });
      second.velocity.set(0, 0, 9);
      neon.advance(1 / 60);
      check(
        'test 15: a fresh hit after the cooldown lands',
        player.health < health && player.knockdown > 0,
        `health ${health} -> ${player.health}`,
      );
      hv.remove(second);

      // Below 2.5 m/s the contact is only a shove.
      health = resetTo();
      const slow = hv.spawn('sedan', { x: baseX, z: baseZ, yaw: 0, driver: 'ai' });
      slow.velocity.set(0, 0, 1.4);
      neon.advance(1 / 60);
      check(
        'test 15: a slow overlap pushes out without damage or knockdown',
        player.health === health
          && player.knockdown === 0
          && slow.overlapCircle(player.position.x, player.position.z, 0.46).penetration === 0,
        JSON.stringify({ health: player.health, knockdown: player.knockdown }),
      );
      hv.remove(slow);

      // The police ram branch must use the same hit path.
      resetTo();
      const cruiser = hv.spawn('police', { x: baseX, z: baseZ + 2.5, yaw: 0, driver: 'ai' });
      cruiser.velocity.set(0, 0, 8);
      const unit = { car: cruiser, ramCooldown: 0 };
      police.ramCheck(unit, 0);
      check(
        'test 15: police.ramCheck routes through hitByVehicle',
        unit.ramCooldown === 1.4
          && player.knockdown > 0
          && neon.player.lastVehicleHit !== null
          && neon.player.lastVehicleHit.damage === 18
          && neon.player.lastVehicleHit.type === 'police',
        JSON.stringify({ cooldown: unit.ramCooldown, hit: neon.player.lastVehicleHit }),
      );
      check(
        'test 15: the ram leaves the player outside the cruiser',
        cruiser.overlapCircle(player.position.x, player.position.z, 0.46).penetration === 0,
        JSON.stringify({ player: [round(player.position.x), round(player.position.z)] }),
      );
      hv.remove(cruiser);

      // Ignore-fire while down: the knife cannot swing during the knockdown.
      resetTo();
      player.selectWeapon('knife');
      player.fireCooldown = 0;
      const rammer = hv.spawn('sedan', { x: baseX, z: baseZ, yaw: 0, driver: 'ai' });
      rammer.velocity.set(0, 0, 10);
      neon.advance(1 / 60);
      player.fireCooldown = 0;
      player.updateCombat(1 / 60, {
        isMouseDown: () => false,
        wasMousePressed: () => true,
        wasPressed: () => false,
      }, debug.camera);
      check(
        'test 15: fire input is ignored while knocked down',
        player.knockdown > 0 && player.meleeSwing === 0 && player.fireCooldown === 0,
        `knockdown=${round(player.knockdown)} swing=${player.meleeSwing} cooldown=${player.fireCooldown}`,
      );
      hv.remove(rammer);
      return results;
    },
  },
  {
    name: 'test 16: knife arm',
    shot: 'street',
    body: function knifeArm() {
      const results = [];
      const check = (name, ok, detail = '') => {
        results.push({ name, ok: ok === true, detail: ok === true ? '' : String(detail || '') });
      };

      const neon = window.__neon;
      const debug = neon && neon.debug;
      const player = debug && debug.player;
      const humanoid = player && player.humanoid;
      const traffic = debug && debug.traffic;
      const police = debug && debug.police;
      const camera = debug && debug.camera;
      const vehicles = debug && debug.vehicles;
      const missing = [];
      if (!player || typeof player.fireWeapon !== 'function') missing.push('player.fireWeapon');
      if (!humanoid || !humanoid.arms || !humanoid.arms.right) missing.push('humanoid.arms.right');
      if (!traffic || typeof traffic.spawnPed !== 'function') missing.push('traffic.spawnPed');
      if (!police || typeof police.clearWanted !== 'function') missing.push('police.clearWanted');
      if (!camera || !camera.position) missing.push('__neon.debug.camera');
      if (!vehicles || !vehicles.list) missing.push('__neon.debug.vehicles');
      check('test 16: knife-arm hooks are exposed', missing.length === 0, `${missing.join(', ')} missing`);
      if (missing.length > 0) return results;

      const round = (value) => Math.round(value * 1000) / 1000;
      police.clearWanted({ quiet: true });
      police.clearUnits();
      police.clearOfficers();
      police.stageAir({ x: 640, y: 40, z: 640 });
      traffic.reset({ spawnBeach: false });
      for (const car of [...vehicles.list]) vehicles.remove(car);

      player.teleport(81, 0, Math.PI, 0);
      player.health = 100;
      player.armor = 0;
      player.dead = false;
      player.weaponKey = 'pistol';
      player.gun.visible = false;
      player.syncGunModel();
      player.cameraPitch = -0.27;
      player.cameraDistance = 3.1;
      player.updateView(camera, 1 / 60, true);
      neon.advance(1 / 60);
      player.selectWeapon('knife');
      neon.advance(1 / 60);

      const right = humanoid.arms.right;
      const measureElbow = () => {
        right.elbowPivot.updateWorldMatrix(true, false);
        const elements = right.elbowPivot.matrixWorld.elements;
        return { x: elements[12], y: elements[13], z: elements[14] };
      };
      const idleShoulder = right.shoulderPivot.rotation.x;
      const idleElbow = measureElbow();
      check(
        'test 16: the knife arm starts in the idle pose',
        humanoid.melee === 0 && Math.abs(idleShoulder) < 0.01,
        `melee=${humanoid.melee} shoulder=${round(idleShoulder)}`,
      );

      const forwardX = -Math.sin(player.cameraYaw);
      const forwardZ = -Math.cos(player.cameraYaw);
      const victim = traffic.spawnPed({
        x: player.position.x + forwardX * 1.5,
        z: player.position.z + forwardZ * 1.5,
        armed: false,
      });
      check('test 16: a stab target spawns', Boolean(victim), 'spawnPed returned null');
      if (!victim) return results;

      player.fireCooldown = 0;
      player.fireWeapon(camera);
      check(
        'test 16: the stab still kills the target and starts the swing',
        victim.dead === true && player.meleeSwing === 0.28,
        `dead=${victim.dead} swing=${player.meleeSwing}`,
      );

      neon.advance(0.14);
      const duringShoulder = right.shoulderPivot.rotation.x;
      const duringElbow = measureElbow();
      const forwardGain = (duringElbow.x - idleElbow.x) * Math.sin(player.facing)
        + (duringElbow.z - idleElbow.z) * Math.cos(player.facing);
      check(
        'test 16: the right shoulder swings forward at the start of the stab',
        duringShoulder < idleShoulder - 0.5 && humanoid.melee > 0.3,
        `idle=${round(idleShoulder)} during=${round(duringShoulder)} melee=${round(humanoid.melee)}`,
      );
      check(
        'test 16: the hand itself thrusts ahead of the chest',
        forwardGain > 0.25,
        `forward=${round(forwardGain)}`,
      );
      check(
        'test 16: the blade keeps its secondary rotation',
        player.knifeModel.rotation.x < -0.5,
        `blade=${round(player.knifeModel.rotation.x)}`,
      );

      neon.advance(0.3);
      const returned = measureElbow();
      const returnDistance = Math.hypot(
        returned.x - idleElbow.x,
        returned.y - idleElbow.y,
        returned.z - idleElbow.z,
      );
      check(
        'test 16: the arm returns to the idle pose when the swing ends',
        humanoid.melee === 0
          && player.meleeSwing === 0
          && Math.abs(right.shoulderPivot.rotation.x - idleShoulder) < 0.02
          && returnDistance < 0.06,
        `melee=${humanoid.melee} shoulder=${round(right.shoulderPivot.rotation.x)} distance=${round(returnDistance)}`,
      );
      return results;
    },
  },
];
