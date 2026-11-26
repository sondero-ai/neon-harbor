// The heads-up display, drawn with Canvas 2D over the WebGL view. The HUD
// owns its own baked minimap so the per-frame cost is a few drawImage calls,
// a handful of bars, and one very cheap arrow. Everything here is presentation:
// player.js supplies the numbers, main.js decides when the HUD is on screen.

import { BLOCK_CENTERS_X, BLOCK_CENTERS_Z, RADIO, ROADS_X, ROADS_Z, WORLD } from './config.js';

import {
  CREAM, CREAM_DIM, CORAL, TEAL, GOLD,
  DISPLAY, UI, MONO,
  chamferPath, drawPanel, label, truncateText,
} from './hud/draw-utils.js';
import { MAP_MAX_X, MAP_MAX_Z, MAP_MIN_X, MAP_MIN_Z, MAP_SCALE, drawMinimap } from './hud/minimap.js';
import {
  drawAirBanner, drawChallenge, drawCrewPanel, drawDialogue, drawDistrict,
  drawMissionCard, drawObjective, drawPoliceRoster, drawStateCard, drawVitals,
} from './hud/panels.js';
import {
  drawEnding, drawFailure, drawReward, drawToast, drawVehicleCard, drawWeaponStrip,
} from './hud/cards.js';

export class Hud {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.visible = false;
    this.width = 1280;
    this.height = 720;
    this.dpr = 1;
    this.time = 0;
    this.lastDistrict = '';
    this.toast = null;
    this.reward = null;
    this.ending = null;
    this.suppressToasts = false;
    this.lastHealth = null;
    this.lastArmor = null;
    this.healthFlash = 0;
    this.armorFlash = 0;
    this.hitFlash = 0;
    this.wheelOpen = false;
    this.wheelHits = [];
    this.onWheelPick = null;
    this.map = this.buildMinimap();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // The wheel is the only HUD surface that takes clicks; CSS keeps the
    // canvas transparent to the pointer everywhere else.
    this.canvas.addEventListener('click', (event) => {
      if (!this.wheelOpen || typeof this.onWheelPick !== 'function') return;
      const hit = this.wheelHitTest(event.clientX, event.clientY);
      if (hit) {
        event.preventDefault();
        this.onWheelPick(hit);
      }
    });
  }

  setWheelInteractive(open) {
    this.wheelOpen = Boolean(open);
    this.canvas.classList.toggle('wheel-open', this.wheelOpen);
    if (!this.wheelOpen) this.wheelHits = [];
  }

  wheelHitTest(clientX, clientY) {
    const x = clientX;
    const y = clientY;
    for (let i = this.wheelHits.length - 1; i >= 0; i -= 1) {
      const hit = this.wheelHits[i];
      if (x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height) {
        return { station: hit.station, track: hit.track };
      }
    }
    return null;
  }

  buildMinimap() {
    const map = document.createElement('canvas');
    map.width = Math.ceil((MAP_MAX_X - MAP_MIN_X) * MAP_SCALE);
    map.height = Math.ceil((MAP_MAX_Z - MAP_MIN_Z) * MAP_SCALE);
    const ctx = map.getContext('2d');
    const toX = (x) => (x - MAP_MIN_X) * MAP_SCALE;
    const toY = (z) => (z - MAP_MIN_Z) * MAP_SCALE;

    ctx.fillStyle = '#0d2b34';
    ctx.fillRect(0, 0, map.width, map.height);

    // Sand runs from the waterline to the city's western edge.
    ctx.fillStyle = '#a9855f';
    ctx.fillRect(toX(WORLD.shorelineX), toY(WORLD.beachMinZ), (WORLD.cityMinX - WORLD.shorelineX) * MAP_SCALE, (WORLD.beachMaxZ - WORLD.beachMinZ) * MAP_SCALE);
    ctx.fillStyle = '#17151f';
    ctx.fillRect(toX(WORLD.cityMinX), toY(WORLD.cityMinZ), (WORLD.cityMaxX - WORLD.cityMinX) * MAP_SCALE, (WORLD.cityMaxZ - WORLD.cityMinZ) * MAP_SCALE);

    // Blocks first, then the road channels between them.
    for (const cx of BLOCK_CENTERS_X) {
      for (const cz of BLOCK_CENTERS_Z) {
        ctx.fillStyle = '#38303f';
        ctx.fillRect(toX(cx - 20), toY(cz - 20), 40 * MAP_SCALE, 40 * MAP_SCALE);
        ctx.strokeStyle = 'rgba(255,236,210,0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(toX(cx - 20) + 1, toY(cz - 20) + 1, 40 * MAP_SCALE - 2, 40 * MAP_SCALE - 2);
      }
    }
    ctx.strokeStyle = '#292633';
    ctx.lineCap = 'butt';
    ctx.lineWidth = WORLD.roadWidth * MAP_SCALE;
    for (const line of ROADS_X) {
      ctx.beginPath();
      ctx.moveTo(toX(line), toY(WORLD.cityMinZ));
      ctx.lineTo(toX(line), toY(WORLD.cityMaxZ));
      ctx.stroke();
    }
    for (const line of ROADS_Z) {
      ctx.beginPath();
      ctx.moveTo(toX(WORLD.cityMinX), toY(line));
      ctx.lineTo(toX(WORLD.cityMaxX), toY(line));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,236,210,0.12)';
    ctx.lineWidth = 1;
    for (const line of ROADS_X) {
      ctx.beginPath();
      ctx.moveTo(toX(line), toY(WORLD.cityMinZ));
      ctx.lineTo(toX(line), toY(WORLD.cityMaxZ));
      ctx.stroke();
    }
    for (const line of ROADS_Z) {
      ctx.beginPath();
      ctx.moveTo(toX(WORLD.cityMinX), toY(line));
      ctx.lineTo(toX(WORLD.cityMaxX), toY(line));
      ctx.stroke();
    }

    // Landmark plots and the shaded tower footprints read as the city from above.
    for (const collider of this.world.colliders) {
      if (collider.kind !== 'building') continue;
      const width = (collider.maxX - collider.minX) * MAP_SCALE;
      const height = (collider.maxZ - collider.minZ) * MAP_SCALE;
      const tall = collider.maxY > 34;
      ctx.fillStyle = tall ? 'rgba(109, 89, 108, 0.95)' : 'rgba(83, 69, 87, 0.95)';
      ctx.fillRect(toX(collider.minX) + 1, toY(collider.minZ) + 1, Math.max(1, width - 2), Math.max(1, height - 2));
      if (tall) {
        ctx.fillStyle = 'rgba(255, 206, 143, 0.14)';
        ctx.fillRect(toX(collider.minX) + 2, toY(collider.minZ) + 2, Math.max(1, width - 4), 2);
      }
    }

    // The plaza's ring and the pier.
    const plaza = this.world.landmarks?.plaza;
    if (plaza) {
      ctx.strokeStyle = 'rgba(63, 224, 207, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toX(plaza.x), toY(plaza.z), 11 * MAP_SCALE, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#c39b69';
    ctx.fillRect(toX(WORLD.pier.minX), toY(WORLD.pier.z - WORLD.pier.halfWidth), (WORLD.pier.maxX - WORLD.pier.minX) * MAP_SCALE, WORLD.pier.halfWidth * 2 * MAP_SCALE);
    ctx.fillRect(toX(WORLD.pier.rampMinX), toY(WORLD.pier.z - WORLD.pier.rampHalfWidth), (WORLD.pier.rampMaxX - WORLD.pier.rampMinX) * MAP_SCALE, WORLD.pier.rampHalfWidth * 2 * MAP_SCALE);
    const lighthouse = this.world.landmarks?.lighthouse;
    if (lighthouse) {
      ctx.fillStyle = '#ffcf86';
      ctx.beginPath();
      ctx.arc(toX(lighthouse.x), toY(lighthouse.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // The Solano Mall footprint and its parking lot, labelled on the scan.
    const mall = this.world.mall;
    if (mall) {
      const bounds = mall.bounds;
      ctx.fillStyle = 'rgba(255,201,92,0.22)';
      ctx.fillRect(toX(bounds.minX), toY(bounds.minZ), (bounds.maxX - bounds.minX) * MAP_SCALE, (bounds.maxZ - bounds.minZ) * MAP_SCALE);
      ctx.strokeStyle = 'rgba(255,201,92,0.82)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(toX(bounds.minX) + 0.5, toY(bounds.minZ) + 0.5, (bounds.maxX - bounds.minX) * MAP_SCALE - 1, (bounds.maxZ - bounds.minZ) * MAP_SCALE - 1);
      ctx.fillStyle = 'rgba(63,224,207,0.16)';
      ctx.fillRect(toX(bounds.minX), toY(bounds.minZ - 16), (bounds.maxX - bounds.minX) * MAP_SCALE, 16 * MAP_SCALE);
      ctx.strokeStyle = 'rgba(63,224,207,0.5)';
      ctx.strokeRect(toX(bounds.minX) + 0.5, toY(bounds.minZ - 16) + 0.5, (bounds.maxX - bounds.minX) * MAP_SCALE - 1, 16 * MAP_SCALE - 1);
      ctx.fillStyle = 'rgba(255,232,210,0.92)';
      ctx.font = '700 9px "Bahnschrift", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(mall.label, toX((bounds.minX + bounds.maxX) / 2), toY((bounds.minZ + bounds.maxZ) / 2) + 3);
      ctx.fillStyle = 'rgba(63,224,207,0.9)';
      ctx.font = '700 8px "Bahnschrift", "Segoe UI", sans-serif';
      ctx.fillText('PARKING', toX((bounds.minX + bounds.maxX) / 2), toY(bounds.minZ - 8) + 3);
    }

    // The waterline and a faint scan of city blocks over the whole map.
    ctx.strokeStyle = 'rgba(214, 244, 238, 0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toX(WORLD.shorelineX), toY(WORLD.beachMinZ));
    ctx.lineTo(toX(WORLD.shorelineX), toY(WORLD.beachMaxZ));
    ctx.stroke();
    return map;
  }

  resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    if (!this.visible) {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  setVisible(visible) {
    this.visible = visible;
    if (!visible) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  update(dt, state) {
    this.time += dt;
    if (!this.visible) return;
    const health = state.player.health;
    const armor = state.player.armor;
    if (this.lastHealth !== null && health < this.lastHealth - 0.01) this.healthFlash = 1;
    if (this.lastArmor !== null && armor < this.lastArmor - 0.01) this.armorFlash = 1;
    this.lastHealth = health;
    this.lastArmor = armor;
    this.healthFlash = Math.max(0, this.healthFlash - dt * 2.1);
    this.armorFlash = Math.max(0, this.armorFlash - dt * 2.1);
    this.hitFlash = Math.max(0, (state.weapons?.hitMarker ?? 0));
    if (state.district && state.district !== this.lastDistrict) {
      if (!this.suppressToasts) {
        this.toast = {
          title: state.district,
          sub: state.district === 'Vega Strip'
            ? 'THE STRIP · PIER 9 AHEAD'
            : 'NEON HARBOR · GOLDEN HOUR',
          life: 3.2,
        };
      }
      this.lastDistrict = state.district;
    }
    if (this.toast) {
      this.toast.life -= dt;
      if (this.toast.life <= 0) this.toast = null;
    }
    if (this.reward) {
      this.reward.life -= dt;
      if (this.reward.life <= 0) this.reward = null;
    }
    if (this.ending) {
      this.ending.life -= dt;
      if (this.ending.life <= 0) this.ending = null;
    }
    this.draw(state);
  }

  draw(state) {
    const ctx = this.ctx;
    const { width, height } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    drawMissionCard(this, ctx, state);
    drawVitals(this, ctx, state.player);
    drawStateCard(this, ctx, state.player, state.police, state);
    drawDistrict(this, ctx, state);
    drawAirBanner(this, ctx, state.police?.air);
    drawMinimap(this, ctx, state);
    drawCrewPanel(this, ctx, state);
    drawObjective(this, ctx, state);
    drawChallenge(this, ctx, state);
    drawDialogue(this, ctx, state);
    drawPoliceRoster(this, ctx, state);
    drawWeaponStrip(this, ctx, state);
    drawVehicleCard(this, ctx, state);
    this.drawPrompt(ctx, state);
    this.drawCrosshair(ctx, state);
    if (this.toast) drawToast(this, ctx, this.toast);
    if (this.reward) drawReward(this, ctx, this.reward, state);
    this.drawDamage(ctx, state);
    if (state.fail) drawFailure(this, ctx, state.fail);
    if (state.down) this.drawDown(ctx, state.down);
    if (this.ending) drawEnding(this, ctx, this.ending);
    if (state.radio?.wheel?.open) this.drawRadioWheel(ctx, state);
  }










  // The right-hand HUD column hugs the window's right edge, like the state card
  // above it, so the panels never drift inward over the road on wide screens.
  // Its height follows the roster so a quiet patrol is a compact card, while a
  // five-unit pursuit lands on the same stack the 1280x720 shots were framed for.
  rightColumn(state) {
    const width = 252;
    const x = this.width - width - 28;
    const roster = (state.police?.roster ?? []).slice(0, 5);
    const rows = Math.max(1, roster.length);
    const rosterY = 188;
    const rosterHeight = 90 + (rows - 1) * 24;
    const weaponsY = rosterY + rosterHeight + 10;
    const weaponsHeight = 142;
    const vehicleY = weaponsY + weaponsHeight + 10;
    const vehicleHeight = 166;
    return { x, width, roster, rosterY, rosterHeight, weaponsY, weaponsHeight, vehicleY, vehicleHeight };
  }







  drawCrosshair(ctx, state) {
    const weapons = state.weapons;
    if (!weapons || weapons.dead || state.player.driving) return;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const gap = Math.max(4, Math.min(26, weapons.crosshair));
    ctx.save();
    ctx.strokeStyle = weapons.aiming ? 'rgba(247,232,210,0.92)' : 'rgba(247,232,210,0.55)';
    ctx.fillStyle = weapons.aiming ? 'rgba(255,201,92,0.95)' : 'rgba(247,232,210,0.7)';
    ctx.lineWidth = 1.2;
    if (weapons.melee) {
      // The knife keeps one fixed reticle: no spread, no bloom, no ticks.
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const tick = weapons.aiming ? 5 : 3.5;
      ctx.beginPath();
      ctx.moveTo(cx - gap - tick, cy); ctx.lineTo(cx - gap, cy);
      ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + tick, cy);
      ctx.moveTo(cx, cy - gap - tick); ctx.lineTo(cx, cy - gap);
      ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + tick);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (weapons.hitMarker > 0.02) {
      const a = Math.min(1, weapons.hitMarker);
      const spread = 7 + (1 - a) * 6;
      ctx.strokeStyle = `rgba(255,110,90,${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - spread, cy - spread); ctx.lineTo(cx - spread + 4, cy - spread + 4);
      ctx.moveTo(cx + spread, cy - spread); ctx.lineTo(cx + spread - 4, cy - spread + 4);
      ctx.moveTo(cx - spread, cy + spread); ctx.lineTo(cx - spread + 4, cy + spread - 4);
      ctx.moveTo(cx + spread, cy + spread); ctx.lineTo(cx + spread - 4, cy + spread - 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawDamage(ctx, state) {
    const hurt = state.effects?.hurt ?? 0;
    const health = state.player.health;
    const low = health < 32 && !state.player.driving ? 0.16 + Math.sin(this.time * 5.4) * 0.07 : 0;
    const flash = Math.max(hurt, low, this.healthFlash * 0.32, (state.effects?.flash ?? 0) * 0.22);
    if (flash < 0.015) return;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const inner = Math.min(this.width, this.height) * 0.28;
    const outer = Math.max(this.width, this.height) * 0.68;
    const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    gradient.addColorStop(0, 'rgba(170,18,32,0)');
    gradient.addColorStop(0.72, `rgba(170,18,32,${Math.min(0.26, flash * 0.32)})`);
    gradient.addColorStop(1, `rgba(120,8,22,${Math.min(0.72, flash * 0.8)})`);
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = `rgba(255,80,64,${Math.min(0.5, flash * 0.45)})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, this.width - 2, this.height - 2);
    ctx.restore();
  }

  drawDown(ctx, down) {
    const elapsed = down.duration - down.timer;
    const alpha = Math.min(1, Math.max(0, elapsed * 5), Math.max(0.25, down.timer * 1.4));
    if (alpha <= 0) return;
    const busted = down.type === 'busted';
    ctx.save();
    ctx.globalAlpha = alpha;
    const gradient = ctx.createRadialGradient(
      this.width / 2, this.height / 2, 40,
      this.width / 2, this.height / 2, this.width * 0.72,
    );
    if (busted) {
      gradient.addColorStop(0, 'rgba(18,26,48,0.9)');
      gradient.addColorStop(0.7, 'rgba(10,14,32,0.94)');
      gradient.addColorStop(1, 'rgba(4,6,16,0.99)');
    } else {
      gradient.addColorStop(0, 'rgba(58,10,18,0.9)');
      gradient.addColorStop(0.7, 'rgba(26,5,12,0.95)');
      gradient.addColorStop(1, 'rgba(8,3,8,0.99)');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = busted ? 'rgba(86,120,255,0.16)' : 'rgba(255,72,58,0.14)';
    for (let i = -this.height; i < this.width; i += 46) {
      ctx.save();
      ctx.translate(i, 0);
      ctx.rotate(-0.36);
      ctx.fillRect(0, -this.height, 3, this.height * 3);
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.min(138, this.width * 0.115)}px ${DISPLAY}`;
    ctx.fillStyle = busted ? '#dae4ff' : '#ffe3d8';
    ctx.shadowColor = busted ? 'rgba(76,118,255,0.85)' : 'rgba(255,72,48,0.8)';
    ctx.shadowBlur = 34;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
    ctx.fillText(busted ? 'BUSTED' : 'WASTED', this.width / 2, this.height / 2 - 18);
    ctx.shadowBlur = 0;
    ctx.font = `600 12px ${UI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.fillStyle = busted ? 'rgba(200,216,255,0.78)' : 'rgba(255,190,175,0.75)';
    ctx.fillText(
      busted ? 'HARBOR PD HAS YOU · THE CITY KEEPS ITS CUT' : 'THE HARBOR CLAIMS ANOTHER · YOU WAKE ON THE STRIP',
      this.width / 2,
      this.height / 2 + 74,
    );
    ctx.strokeStyle = busted ? 'rgba(120,150,255,0.5)' : 'rgba(255,110,90,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.width / 2 - 190, this.height / 2 + 46);
    ctx.lineTo(this.width / 2 - 70, this.height / 2 + 46);
    ctx.moveTo(this.width / 2 + 70, this.height / 2 + 46);
    ctx.lineTo(this.width / 2 + 190, this.height / 2 + 46);
    ctx.stroke();
    ctx.restore();
  }


  drawRadioWheel(ctx, state) {
    const radio = state.radio;
    const wheel = radio.wheel;
    const stations = RADIO.stations;
    const panelWidth = Math.min(this.width - 96, 1120);
    const panelHeight = Math.min(this.height - 120, 420);
    const panelX = (this.width - panelWidth) / 2;
    const panelY = (this.height - panelHeight) / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(6,4,12,0.76)';
    ctx.fillRect(0, 0, this.width, this.height);
    drawPanel(ctx, panelX, panelY, panelWidth, panelHeight, {
      cut: 16,
      fill: 'rgba(9,6,16,0.96)',
      stroke: 'rgba(247,232,210,0.28)',
      accent: 'rgba(255,201,92,0.9)',
    });
    label(ctx, 'NEON HARBOR RADIO', panelX + 24, panelY + 30, {
      size: 18,
      color: CREAM,
      spacing: '3px',
      weight: 900,
      font: DISPLAY,
    });
    label(ctx, 'HOLD TAB · RELEASE TO CLOSE', panelX + panelWidth - 24, panelY + 30, {
      size: 10,
      color: CREAM_DIM,
      spacing: '1.4px',
      align: 'right',
      weight: 800,
    });
    const mode = !radio.enabled ? 'RADIO OFF' : radio.offAir ? 'OFF AIR' : radio.fallback ? 'SYNTH FALLBACK' : radio.playing ? 'ON AIR' : 'STANDBY';
    label(ctx, `${stations.length} STATIONS · ${mode}`, panelX + 24, panelY + 48, {
      size: 10,
      color: radio.offAir ? CORAL : radio.fallback ? GOLD : TEAL,
      spacing: '1.2px',
      weight: 700,
    });

    const top = panelY + 64;
    const pad = 18;
    const gap = 10;
    const columnWidth = (panelWidth - pad * 2 - gap * (stations.length - 1)) / stations.length;
    const columnHeight = panelHeight - 64 - 52;
    this.wheelHits = [];
    stations.forEach((station, index) => {
      const columnX = panelX + pad + index * (columnWidth + gap);
      const current = index === radio.stationIndex;
      const cursorStation = index === wheel.station;
      drawPanel(ctx, columnX, top, columnWidth, columnHeight, {
        cut: 10,
        fill: current ? 'rgba(22,15,34,0.96)' : 'rgba(9,6,16,0.82)',
        stroke: cursorStation ? station.color : current ? 'rgba(247,232,210,0.34)' : 'rgba(247,232,210,0.14)',
        accent: station.color,
      });
      label(ctx, truncateText(ctx, station.station.toUpperCase(), columnWidth - (current ? 64 : 24), `800 12px ${UI}`), columnX + 12, top + 24, {
        size: 12,
        color: current || cursorStation ? station.color : CREAM,
        spacing: '0.6px',
        weight: 800,
      });
      label(ctx, truncateText(ctx, station.genre.toUpperCase(), columnWidth - 24, `600 10px ${UI}`), columnX + 12, top + 40, {
        size: 10,
        color: CREAM_DIM,
        spacing: '0.7px',
        weight: 600,
      });
      if (current) {
        label(ctx, 'TUNED', columnX + columnWidth - 12, top + 24, {
          size: 10,
          color: station.color,
          spacing: '0.6px',
          align: 'right',
          weight: 800,
        });
      }
      this.wheelHits.push({ x: columnX, y: top, width: columnWidth, height: 64, station: index, track: 0 });
      station.tracks.forEach((track, trackIndex) => {
        const rowY = top + 54 + trackIndex * 54;
        const active = current && trackIndex === radio.trackIndex;
        const picked = cursorStation && trackIndex === wheel.track;
        if (active) {
          ctx.fillStyle = 'rgba(255,201,92,0.1)';
          ctx.fillRect(columnX + 6, rowY, columnWidth - 12, 46);
        }
        if (picked) {
          ctx.fillStyle = 'rgba(247,232,210,0.06)';
          ctx.fillRect(columnX + 6, rowY, columnWidth - 12, 46);
          ctx.strokeStyle = station.color;
          ctx.lineWidth = 1;
          ctx.strokeRect(columnX + 6.5, rowY + 0.5, columnWidth - 13, 45);
        }
        label(ctx, `0${trackIndex + 1}`, columnX + 12, rowY + 14, {
          size: 10,
          color: picked || active ? station.color : 'rgba(247,232,210,0.42)',
          spacing: '0.4px',
          font: MONO,
          weight: 700,
        });
        label(ctx, truncateText(ctx, track.title.toUpperCase(), columnWidth - 34, `700 11px ${UI}`), columnX + 30, rowY + 14, {
          size: 11,
          color: picked || active ? CREAM : 'rgba(247,232,210,0.76)',
          spacing: '0.2px',
          weight: 700,
        });
        label(ctx, truncateText(ctx, track.artist.toUpperCase(), columnWidth - 34, `600 10px ${UI}`), columnX + 30, rowY + 31, {
          size: 10,
          color: 'rgba(247,232,210,0.46)',
          spacing: '0.2px',
          weight: 600,
        });
        this.wheelHits.push({ x: columnX + 6, y: rowY, width: columnWidth - 12, height: 46, station: index, track: trackIndex });
      });
    });

    const footY = panelY + panelHeight - 18;
    label(ctx, '← →  STATION', panelX + 24, footY, {
      size: 10,
      color: CREAM_DIM,
      spacing: '1px',
      weight: 700,
    });
    label(ctx, '↑ ↓  TRACK', panelX + 168, footY, {
      size: 10,
      color: CREAM_DIM,
      spacing: '1px',
      weight: 700,
    });
    label(ctx, 'ENTER  TUNE', panelX + 290, footY, {
      size: 10,
      color: GOLD,
      spacing: '1px',
      weight: 800,
    });
    label(ctx, 'CLICK A TRACK', panelX + 410, footY, {
      size: 10,
      color: 'rgba(247,232,210,0.42)',
      spacing: '1px',
      weight: 700,
    });
    label(ctx, `${radio.station.toUpperCase()} · ${radio.track.toUpperCase()} — ${radio.artist.toUpperCase()}`, panelX + panelWidth - 24, footY, {
      size: 10,
      color: TEAL,
      spacing: '0.8px',
      align: 'right',
      weight: 700,
    });
    ctx.restore();
  }

  drawPrompt(ctx, state) {
    const context = state.contextPrompt;
    const vehicle = state.vehiclePrompt;
    const prompt = context ?? vehicle;
    if (!prompt) return;
    // A contextual action wins over the vehicle prompt, matching the input
    // precedence in interactions.js: seat > register > car > valet > entry.
    const isContext = Boolean(context);
    let action;
    if (isContext) {
      const verb = prompt.action === 'stand' ? 'STAND' : prompt.action === 'sit' ? 'SIT' : prompt.label;
      action = verb;
    } else {
      action = prompt.action === 'exit' ? 'EXIT VEHICLE' : `ENTER ${prompt.name.toUpperCase()}`;
    }
    const width = Math.max(250, Math.min(390, 126 + action.length * 7.2 + (isContext && prompt.detail ? 92 : 0)));
    const height = 36;
    const x = (this.width - width) / 2;
    const y = 582;
    drawPanel(ctx, x, y, width, height, {
      cut: 9,
      fill: 'rgba(9,6,16,0.82)',
      stroke: 'rgba(247,232,210,0.2)',
      accent: isContext ? TEAL : prompt.action === 'exit' ? TEAL : GOLD,
    });
    chamferPath(ctx, x + 10, y + 8, 50, 20, 5);
    ctx.fillStyle = 'rgba(247,232,210,0.92)';
    ctx.fill();
    label(ctx, isContext ? 'E' : 'F / E', x + 35, y + 22, { size: 10, color: '#140f1c', spacing: '0.4px', align: 'center', weight: 800 });
    label(ctx, action, x + 72, y + 23, { size: 11, color: CREAM, spacing: '0.9px', weight: 800 });
    if (isContext && prompt.detail) {
      label(ctx, String(prompt.detail).toUpperCase(), x + width - 12, y + 23, {
        size: 10,
        color: 'rgba(63,224,207,0.7)',
        spacing: '0.8px',
        align: 'right',
        weight: 700,
      });
    } else if (prompt.action === 'enter') {
      label(ctx, prompt.distance ? `${Math.round(prompt.distance)} M` : 'NEARBY', x + width - 12, y + 23, {
        size: 10,
        color: 'rgba(247,232,210,0.5)',
        spacing: '0.8px',
        align: 'right',
        weight: 700,
      });
    }
  }

}
