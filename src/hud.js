// The heads-up display, drawn with Canvas 2D over the WebGL view. The HUD
// owns its own baked minimap so the per-frame cost is a few drawImage calls,
// a handful of bars, and one very cheap arrow. Everything here is presentation:
// player.js supplies the numbers, main.js decides when the HUD is on screen.

import { BLOCK_CENTERS_X, BLOCK_CENTERS_Z, ROADS_X, ROADS_Z, WORLD } from './config.js';
import { MAP_MAX_X, MAP_MAX_Z, MAP_MIN_X, MAP_MIN_Z, MAP_SCALE, drawMinimap } from './hud/minimap.js';
import {
  drawAirBanner, drawChallenge, drawCrewPanel, drawDialogue, drawDistrict,
  drawMissionCard, drawObjective, drawPoliceRoster, drawStateCard, drawVitals,
} from './hud/panels.js';
import {
  drawEnding, drawFailure, drawReward, drawToast, drawVehicleCard, drawWeaponStrip,
} from './hud/cards.js';
import {
  drawCrosshair, drawDamage, drawDown, drawPrompt, drawRadioWheel,
} from './hud/prompts.js';

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
    drawPrompt(this, ctx, state);
    drawCrosshair(this, ctx, state);
    if (this.toast) drawToast(this, ctx, this.toast);
    if (this.reward) drawReward(this, ctx, this.reward, state);
    drawDamage(this, ctx, state);
    if (state.fail) drawFailure(this, ctx, state.fail);
    if (state.down) drawDown(this, ctx, state.down);
    if (this.ending) drawEnding(this, ctx, this.ending);
    if (state.radio?.wheel?.open) drawRadioWheel(this, ctx, state);
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













}
