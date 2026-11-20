// The heads-up display, drawn with Canvas 2D over the WebGL view. The HUD
// owns its own baked minimap so the per-frame cost is a few drawImage calls,
// a handful of bars, and one very cheap arrow. Everything here is presentation:
// player.js supplies the numbers, main.js decides when the HUD is on screen.

import { PALETTE, ROADS, WORLD } from './config.js';

const DISPLAY = '"Bahnschrift SemiCondensed", "Bahnschrift", "Arial Narrow", sans-serif';
const UI = '"Bahnschrift", "Segoe UI", sans-serif';
const MONO = '"Consolas", "Courier New", monospace';

const CREAM = PALETTE.cream;
const CREAM_DIM = 'rgba(247, 232, 210, 0.55)';
const CORAL = PALETTE.coral;
const TEAL = PALETTE.teal;
const GOLD = PALETTE.gold;
const INK = 'rgba(10, 7, 18, 0.72)';
const INK_DEEP = 'rgba(10, 7, 18, 0.88)';
const LINE = 'rgba(247, 232, 210, 0.17)';

const MAP_MIN_X = -340;
const MAP_MAX_X = 210;
const MAP_MIN_Z = -210;
const MAP_MAX_Z = 210;
const MAP_SCALE = 2;

function chamferPath(ctx, x, y, width, height, cut = 12) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + height - cut);
  ctx.lineTo(x + width - cut, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

function drawPanel(ctx, x, y, width, height, { cut = 12, fill = INK, stroke = LINE, accent = null } = {}) {
  chamferPath(ctx, x, y, width, height, cut);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(x, y + 9, 3, height - 18);
  }
}

function starPath(ctx, cx, cy, radius) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? radius : radius * 0.44;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function label(ctx, text, x, y, { size = 10, color = CREAM_DIM, spacing = '2px', align = 'left', font = UI, weight = 600 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function cashString(value) {
  return `$ ${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;
}

function timerString(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function speakerColor(speaker) {
  if (speaker === 'TOMAS' || speaker === 'AURELIO') return CORAL;
  if (speaker === 'MIRA') return GOLD;
  return TEAL;
}

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
    this.map = this.buildMinimap();
    this.resize();
    window.addEventListener('resize', () => this.resize());
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
    ctx.fillRect(toX(WORLD.shorelineX), toY(WORLD.beachMinZ), (WORLD.cityMin - WORLD.shorelineX) * MAP_SCALE, (WORLD.beachMaxZ - WORLD.beachMinZ) * MAP_SCALE);
    ctx.fillStyle = '#17151f';
    ctx.fillRect(toX(WORLD.cityMin), toY(WORLD.cityMin), (WORLD.cityMax - WORLD.cityMin) * MAP_SCALE, (WORLD.cityMax - WORLD.cityMin) * MAP_SCALE);

    // Blocks first, then the road channels between them.
    for (const cx of [-108, -54, 0, 54, 108, 162]) {
      for (const cz of [-108, -54, 0, 54, 108, 162]) {
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
    for (const line of ROADS) {
      ctx.beginPath();
      ctx.moveTo(toX(line), toY(WORLD.cityMin));
      ctx.lineTo(toX(line), toY(WORLD.cityMax));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(WORLD.cityMin), toY(line));
      ctx.lineTo(toX(WORLD.cityMax), toY(line));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,236,210,0.12)';
    ctx.lineWidth = 1;
    for (const line of ROADS) {
      ctx.beginPath();
      ctx.moveTo(toX(line), toY(WORLD.cityMin));
      ctx.lineTo(toX(line), toY(WORLD.cityMax));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(WORLD.cityMin), toY(line));
      ctx.lineTo(toX(WORLD.cityMax), toY(line));
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

    this.drawVitals(ctx, state.player);
    this.drawMoneyAndStars(ctx, state.player, state.police);
    this.drawDistrict(ctx, state);
    this.drawAirUnitCue(ctx, state);
    this.drawMinimap(ctx, state);
    this.drawObjective(ctx, state);
    this.drawChallenge(ctx, state);
    this.drawSubtitle(ctx, state);
    this.drawRadio(ctx, state);
    this.drawSpeed(ctx, state);
    this.drawWeaponStrip(ctx, state);
    this.drawWeapon(ctx, state);
    this.drawPrompt(ctx, state);
    this.drawCrosshair(ctx, state);
    if (this.toast) this.drawToast(ctx, this.toast);
    if (this.reward) this.drawReward(ctx, this.reward, state);
    this.drawDamage(ctx, state);
    if (state.fail) this.drawFailure(ctx, state.fail);
    if (state.down) this.drawDown(ctx, state.down);
    if (this.ending) this.drawEnding(ctx, this.ending);
  }

  drawVitals(ctx, player) {
    const x = 28;
    const y = 26;
    const width = 254;
    const height = 70;
    drawPanel(ctx, x, y, width, height, { cut: 13, accent: CORAL });
    label(ctx, 'RAE SOLANO', x + 16, y + 21, { size: 11, color: CREAM, spacing: '3px', weight: 700 });
    label(ctx, player.driving ? 'DRIVING' : 'ON FOOT', x + width - 16, y + 21, { size: 8, color: 'rgba(63,224,207,0.72)', spacing: '1.5px', align: 'right' });

    const barX = x + 16;
    const barWidth = width - 72;
    this.drawBar(ctx, barX, y + 32, barWidth, 9, player.health / 100, CORAL, '#ff9c8b');
    label(ctx, 'HP', barX, y + 30, { size: 8, color: 'rgba(247,232,210,0.42)', spacing: '1px' });
    label(ctx, String(Math.round(player.health)), x + width - 16, y + 41, { size: 11, color: CREAM, align: 'right', font: MONO, weight: 700 });

    this.drawBar(ctx, barX, y + 49, barWidth * 0.78, 6, player.armor / 100, TEAL, '#9af8eb');
    label(ctx, 'AR', barX, y + 47, { size: 7, color: 'rgba(247,232,210,0.36)', spacing: '1px' });
    label(ctx, String(Math.round(player.armor)), x + width - 16, y + 56, { size: 10, color: CREAM_DIM, align: 'right', font: MONO });

    if (this.healthFlash > 0.02) {
      ctx.save();
      chamferPath(ctx, x, y, width, height, 13);
      ctx.strokeStyle = `rgba(255,84,70,${0.25 + this.healthFlash * 0.65})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = CORAL;
      ctx.shadowBlur = 16 * this.healthFlash;
      ctx.stroke();
      ctx.restore();
      label(ctx, 'HIT', x + width - 16, y + 21, { size: 8, color: CORAL, spacing: '1.5px', align: 'right', weight: 800 });
    } else if (this.armorFlash > 0.02 && player.armor < 100) {
      ctx.save();
      chamferPath(ctx, x, y, width, height, 13);
      ctx.strokeStyle = `rgba(63,224,207,${0.2 + this.armorFlash * 0.4})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawBar(ctx, x, y, width, height, value, color, highlight) {
    const clamped = Math.max(0, Math.min(1, value));
    ctx.save();
    ctx.fillStyle = 'rgba(247,232,210,0.10)';
    ctx.fillRect(x, y, width, height);
    const segments = 12;
    const gap = 2;
    const segmentWidth = (width - gap * (segments - 1)) / segments;
    const lit = Math.ceil(clamped * segments);
    for (let i = 0; i < segments; i += 1) {
      ctx.fillStyle = i < lit ? color : 'rgba(247,232,210,0.055)';
      ctx.fillRect(x + i * (segmentWidth + gap), y, segmentWidth, height);
    }
    const filled = width * clamped;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, y, filled, Math.max(1, height * 0.3));
    ctx.fillStyle = highlight;
    ctx.globalAlpha = 0.34;
    ctx.fillRect(x, y, filled, 1);
    ctx.restore();
  }

  drawMoneyAndStars(ctx, player, police = null) {
    // The sky is brightest exactly where the cash and stars sit. A slim plate
    // the mirror of the vitals card keeps both legible without hiding the city.
    const wanted = police?.wanted ?? player.wanted ?? 0;
    const panelWidth = 238;
    const panelHeight = wanted > 0 ? 150 : 138;
    const panelX = this.width - panelWidth - 28;
    const panelY = 18;
    drawPanel(ctx, panelX, panelY, panelWidth, panelHeight, {
      cut: 14,
      fill: 'rgba(9,6,16,0.72)',
      stroke: 'rgba(247,232,210,0.19)',
      accent: 'rgba(255,201,92,0.85)',
    });
    const right = panelX + panelWidth - 16;
    label(ctx, 'CASH', right, 40, { size: 9, color: 'rgba(247,232,210,0.52)', spacing: '3px', align: 'right' });
    ctx.save();
    ctx.font = `900 35px ${DISPLAY}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = GOLD;
    ctx.shadowColor = 'rgba(255, 201, 92, 0.45)';
    ctx.shadowBlur = 14;
    ctx.fillText(cashString(player.cash), right, 76);
    ctx.restore();

    const flash = police?.wantedFlash ?? 0;
    label(ctx, 'WANTED', right, 101, { size: 8, color: 'rgba(247,232,210,0.5)', spacing: '2.5px', align: 'right' });
    const starRadius = 9.5;
    const gap = 23.5;
    for (let i = 0; i < 5; i += 1) {
      const cx = right - (4 - i) * gap - starRadius;
      const cy = 122;
      const active = i < wanted;
      const scale = active ? 1 + flash * 0.24 : 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      starPath(ctx, 0, 0, starRadius);
      if (active) {
        ctx.fillStyle = flash > 0.45 && Math.sin(this.time * 28) > 0 ? '#fff3c9' : GOLD;
        ctx.shadowColor = 'rgba(255,120,80,0.9)';
        ctx.shadowBlur = 8 + flash * 14;
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(247,232,210,0.32)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }

    if (wanted > 0) {
      const searching = police?.status === 'search';
      const units = police?.units?.length ?? 0;
      const air = police?.airUnit?.active === true;
      const blink = Math.sin(this.time * 7.5) > 0;
      const statusColor = searching ? GOLD : CORAL;
      ctx.save();
      ctx.fillStyle = statusColor;
      ctx.globalAlpha = 0.55 + 0.45 * (blink ? 1 : 0.4);
      ctx.fillRect(right - 8, 136, 5, 5);
      ctx.restore();
      label(
        ctx,
        searching
          ? `SEARCHING · ${air ? 'AIR UNIT OVERHEAD' : 'LAST KNOWN AREA'}`
          : units > 0
            ? `PURSUIT · ${units} UNIT${units === 1 ? '' : 'S'}${air ? ' · AIR' : ''}`
            : `PURSUIT · ${air ? 'AIR UNIT' : 'NO UNITS'}`,
        right,
        145,
        { size: 8, color: statusColor, spacing: '1.7px', align: 'right', weight: 800 },
      );
      const bust = police?.bustProgress ?? 0;
      if (bust > 0.01) {
        label(ctx, 'BUSTED', right - 86, 160, { size: 7, color: CREAM, spacing: '1.6px', align: 'right', weight: 800 });
        ctx.fillStyle = 'rgba(247,232,210,0.16)';
        ctx.fillRect(right - 80, 154, 80, 4);
        ctx.fillStyle = CORAL;
        ctx.fillRect(right - 80, 154, 80 * Math.min(1, bust), 4);
      }
    } else {
      label(ctx, 'NO ACTIVE BOLO', right, 145, {
        size: 7.5,
        color: 'rgba(63,224,207,0.5)',
        spacing: '1.6px',
        align: 'right',
        weight: 700,
      });
    }
  }

  drawDistrict(ctx, state) {
    const cx = this.width / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 10px ${UI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.fillStyle = 'rgba(247,232,210,0.66)';
    ctx.fillText((state.district || 'NEON HARBOR').toUpperCase(), cx, 38);
    ctx.font = `600 10px ${MONO}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillStyle = 'rgba(63,224,207,0.8)';
    ctx.fillText(state.clock || '18:42', cx, 54);
    ctx.strokeStyle = 'rgba(247,232,210,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 94, 63);
    ctx.lineTo(cx - 32, 63);
    ctx.moveTo(cx + 32, 63);
    ctx.lineTo(cx + 94, 63);
    ctx.stroke();
    ctx.restore();
  }

  drawAirUnitCue(ctx, state) {
    const air = state.police?.airUnit;
    if (!air?.active) return;
    const width = 202;
    const height = 24;
    const x = (this.width - width) / 2;
    const y = 70;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6.2);
    drawPanel(ctx, x, y, width, height, {
      cut: 8,
      fill: 'rgba(18,7,10,0.8)',
      stroke: `rgba(255,111,97,${0.35 + pulse * 0.35})`,
      accent: CORAL,
    });
    ctx.save();
    ctx.translate(x + 16, y + 12);
    ctx.rotate(this.time * 2.6);
    ctx.strokeStyle = `rgba(255,160,135,${0.55 + pulse * 0.4})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
    ctx.moveTo(0, -6); ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = CORAL;
    ctx.fill();
    ctx.rotate(-this.time * 2.6);
    ctx.strokeStyle = 'rgba(255,220,205,0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, 8.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    label(ctx, 'AIR UNIT', x + 31, y + 16, {
      size: 8.5,
      color: CORAL,
      spacing: '2.4px',
      weight: 800,
    });
    label(ctx, air.searchlight ? 'SEARCHLIGHT' : 'OVERWATCH', x + width - 11, y + 16, {
      size: 6.5,
      color: 'rgba(247,232,210,0.62)',
      spacing: '1.4px',
      align: 'right',
      weight: 700,
    });
    label(ctx, `${air.altitude} M`, x + width - 86, y + 16, {
      size: 6.5,
      color: 'rgba(255,201,92,0.72)',
      spacing: '1px',
      align: 'right',
      font: MONO,
      weight: 700,
    });
  }

  drawMinimap(ctx, state) {
    const size = 196;
    const x = 28;
    const y = this.height - size - 28;
    drawPanel(ctx, x - 5, y - 5, size + 10, size + 10, { cut: 16, fill: 'rgba(9,6,16,0.8)', stroke: 'rgba(247,232,210,0.24)' });
    ctx.save();
    chamferPath(ctx, x, y, size, size, 12);
    ctx.clip();
    ctx.fillStyle = '#0d2b34';
    ctx.fillRect(x, y, size, size);

    const viewMeters = 168;
    const sourceSize = viewMeters * MAP_SCALE;
    const sourceX = (state.player.position.x - MAP_MIN_X) * MAP_SCALE - sourceSize / 2;
    const sourceY = (state.player.position.z - MAP_MIN_Z) * MAP_SCALE - sourceSize / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.map, sourceX, sourceY, sourceSize, sourceSize, x, y, size, size);

    const vignette = ctx.createRadialGradient(x + size / 2, y + size / 2, size * 0.2, x + size / 2, y + size / 2, size * 0.72);
    vignette.addColorStop(0, 'rgba(5,4,12,0)');
    vignette.addColorStop(1, 'rgba(5,4,12,0.56)');
    ctx.fillStyle = vignette;
    ctx.fillRect(x, y, size, size);

    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const destScale = size / viewMeters;
    const objective = state.objective?.marker;
    if (objective) {
      let dx = (objective.x - state.player.position.x) * destScale;
      let dy = (objective.z - state.player.position.z) * destScale;
      const limit = size / 2 - 17;
      const distance = Math.hypot(dx, dy);
      if (distance > limit) {
        dx = (dx / distance) * limit;
        dy = (dy / distance) * limit;
      }
      const mx = centerX + dx;
      const my = centerY + dy;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3.2);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = CORAL;
      ctx.shadowColor = CORAL;
      ctx.shadowBlur = 10;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeStyle = `rgba(255, 232, 210, ${0.3 + pulse * 0.45})`;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.restore();
    }

    const vehicles = state.vehicles ?? [];
    for (const vehicle of vehicles) {
      if (vehicle.kind === 'police' && !vehicle.player) continue;
      const dx = (vehicle.x - state.player.position.x) * destScale;
      const dy = (vehicle.z - state.player.position.z) * destScale;
      if (Math.hypot(dx, dy) > size / 2 - 10) continue;
      ctx.save();
      ctx.translate(centerX + dx, centerY + dy);
      ctx.rotate(Math.PI - vehicle.yaw);
      ctx.globalAlpha = vehicle.player ? 0.95 : vehicle.parked ? 0.42 : 0.82;
      ctx.fillStyle = vehicle.player ? CREAM : GOLD;
      ctx.fillRect(-2.4, -5, 4.8, 10);
      ctx.restore();
    }

    // Cruiser and officer blips sit above the traffic blips. They alternate
    // red and blue in step with the light bar so the minimap reads "police"
    // even when the cars themselves are off the top of the frame.
    const police = state.police;
    if (police && police.wanted > 0) {
      const limit = size / 2 - 12;
      for (let i = 0; i < police.units.length; i += 1) {
        const unit = police.units[i];
        let dx = (unit.x - state.player.position.x) * destScale;
        let dy = (unit.z - state.player.position.z) * destScale;
        const distance = Math.hypot(dx, dy);
        if (distance > limit) {
          dx = (dx / distance) * limit;
          dy = (dy / distance) * limit;
        }
        const red = Math.sin(this.time * 9 + i * 2.1) > 0;
        ctx.save();
        ctx.translate(centerX + dx, centerY + dy);
        ctx.shadowColor = red ? '#ff4a3c' : '#5b7dff';
        ctx.shadowBlur = 9;
        ctx.fillStyle = red ? '#ff4a3c' : '#5b7dff';
        ctx.beginPath();
        ctx.arc(0, 0, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(247,232,210,0.86)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(0, 0, 6.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      for (const officer of police.officers) {
        const dx = (officer.x - state.player.position.x) * destScale;
        const dy = (officer.z - state.player.position.z) * destScale;
        if (Math.hypot(dx, dy) > limit) continue;
        ctx.save();
        ctx.fillStyle = 'rgba(126,156,255,0.95)';
        ctx.shadowColor = '#5b7dff';
        ctx.shadowBlur = 6;
        ctx.fillRect(centerX + dx - 2, centerY + dy - 2, 4, 4);
        ctx.restore();
      }
      const air = police.airUnit;
      if (air?.active) {
        let dx = (air.x - state.player.position.x) * destScale;
        let dy = (air.z - state.player.position.z) * destScale;
        const distance = Math.hypot(dx, dy);
        if (distance > limit) {
          dx = (dx / distance) * limit;
          dy = (dy / distance) * limit;
        }
        ctx.save();
        ctx.translate(centerX + dx, centerY + dy);
        ctx.rotate(this.time * 2.2);
        ctx.strokeStyle = 'rgba(255,150,125,0.95)';
        ctx.lineWidth = 1.6;
        ctx.shadowColor = CORAL;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(-7, 0); ctx.lineTo(7, 0);
        ctx.moveTo(0, -7); ctx.lineTo(0, 7);
        ctx.stroke();
        ctx.fillStyle = CORAL;
        ctx.beginPath();
        ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (state.missionEnemies?.length) {
      const limit = size / 2 - 10;
      for (const enemy of state.missionEnemies) {
        let dx = (enemy.x - state.player.position.x) * destScale;
        let dy = (enemy.z - state.player.position.z) * destScale;
        const distance = Math.hypot(dx, dy);
        if (distance > limit) {
          dx = (dx / distance) * limit;
          dy = (dy / distance) * limit;
        }
        ctx.save();
        ctx.translate(centerX + dx, centerY + dy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#ff8a6a';
        ctx.shadowColor = CORAL;
        ctx.shadowBlur = 6;
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(Math.PI - state.player.facing);
    ctx.fillStyle = CREAM;
    ctx.shadowColor = 'rgba(255,255,255,0.7)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = CORAL;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(2.5, 3);
    ctx.lineTo(-2.5, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // A north notch and a small scale bar keep the map oriented.
    ctx.fillStyle = 'rgba(9,6,16,0.8)';
    ctx.fillRect(centerX - 15, y + 7, 30, 15);
    label(ctx, 'N', centerX, y + 19, { size: 9, color: 'rgba(247,232,210,0.7)', spacing: '1px', align: 'center', weight: 700 });
    ctx.fillStyle = 'rgba(247,232,210,0.22)';
    ctx.fillRect(x + 14, y + size - 15, 24, 1);
    ctx.fillRect(x + 14, y + size - 18, 1, 7);
    ctx.fillRect(x + 38, y + size - 18, 1, 7);
    label(ctx, '50 M', x + 44, y + size - 11, { size: 7, color: 'rgba(247,232,210,0.4)', spacing: '1px' });

    ctx.restore();
    const density = state.density ?? { cars: 0, walkers: 0 };
    drawPanel(ctx, x - 5, y - 45, size + 10, 27, {
      cut: 8,
      fill: 'rgba(9,6,16,0.62)',
      stroke: 'rgba(247,232,210,0.13)',
    });
    label(ctx, 'STREETS', x + 9, y - 27, { size: 7, color: 'rgba(247,232,210,0.48)', spacing: '1.6px', weight: 700 });
    label(ctx, `CARS ${String(density.cars).padStart(2, '0')}`, x + 78, y - 27, { size: 7, color: GOLD, spacing: '1.2px' });
    label(ctx, `WALKERS ${String(density.walkers).padStart(2, '0')}`, x + size - 2, y - 27, { size: 7, color: TEAL, spacing: '1.2px', align: 'right' });
    label(ctx, 'NEON HARBOR', x + 2, y + size + 17, { size: 8, color: 'rgba(247,232,210,0.38)', spacing: '2.5px' });
    label(ctx, (state.district || '').toUpperCase(), x + size - 2, y + size + 17, { size: 8, color: 'rgba(63,224,207,0.62)', spacing: '1.5px', align: 'right' });
  }

  drawObjective(ctx, state) {
    const objective = state.objective;
    if (!objective) return;
    const width = 424;
    const height = 88;
    const x = (this.width - width) / 2;
    const y = this.height - height - 26;
    const failed = objective.failed === true;
    drawPanel(ctx, x, y, width, height, {
      cut: 13,
      accent: failed ? CORAL : 'rgba(255,111,97,0.9)',
      stroke: failed ? 'rgba(255,111,97,0.4)' : LINE,
    });
    const distance = objective.marker
      ? Math.round(Math.hypot(objective.marker.x - state.player.position.x, objective.marker.z - state.player.position.z))
      : null;
    let rightText = distance === null ? '' : `${distance} M`;
    let rightColor = 'rgba(247,232,210,0.55)';
    if (Number.isFinite(objective.timer)) {
      rightText = timerString(objective.timer);
      rightColor = objective.timer < 20 ? CORAL : GOLD;
    } else if (objective.progress) {
      const p = objective.progress;
      rightText = `${p.label} ${p.value}/${p.max}`;
      rightColor = GOLD;
    }
    label(ctx, (objective.tag || 'OBJECTIVE').toUpperCase(), x + 17, y + 19, {
      size: 8,
      color: failed ? CORAL : 'rgba(255,143,122,0.9)',
      spacing: '2.2px',
      weight: 700,
    });
    label(ctx, rightText, x + width - 17, y + 19, {
      size: 8,
      color: rightColor,
      spacing: '1.7px',
      align: 'right',
      weight: 700,
    });
    label(ctx, (objective.stage || 'STAGE · FREE ROAM').toUpperCase(), x + 17, y + 34, {
      size: 7.2,
      color: failed ? 'rgba(255,170,150,0.8)' : 'rgba(63,224,207,0.86)',
      spacing: '1.5px',
      weight: 700,
    });
    label(ctx, objective.title.toUpperCase(), x + 17, y + 58, {
      size: 18,
      color: CREAM,
      spacing: '1.2px',
      font: DISPLAY,
      weight: 800,
    });
    label(ctx, objective.sub, x + 17, y + 74, {
      size: 9,
      color: CREAM_DIM,
      spacing: '0.35px',
      weight: 500,
      font: UI,
    });
    if (objective.progress) {
      const p = objective.progress;
      const barX = x + 17;
      const barWidth = width - 34;
      const barY = y + height - 4;
      ctx.fillStyle = 'rgba(247,232,210,0.1)';
      ctx.fillRect(barX, barY, barWidth, 2);
      ctx.fillStyle = failed ? CORAL : GOLD;
      ctx.fillRect(barX, barY, barWidth * Math.max(0, Math.min(1, p.value / Math.max(1, p.max))), 2);
    } else if (Number.isFinite(objective.timer) && objective.timer > 0) {
      const barX = x + 17;
      const barWidth = width - 34;
      const barY = y + height - 4;
      const total = objective.progress?.maxTimer ?? 108;
      ctx.fillStyle = 'rgba(247,232,210,0.1)';
      ctx.fillRect(barX, barY, barWidth, 2);
      ctx.fillStyle = objective.timer < 20 ? CORAL : TEAL;
      ctx.fillRect(barX, barY, barWidth * Math.max(0, Math.min(1, objective.timer / total)), 2);
    }
  }

  drawChallenge(ctx, state) {
    const challenge = state.challenge;
    if (!challenge) return;
    const width = 268;
    const height = 62;
    const x = 28;
    const y = this.height - 196 - 28 - 45 - 10 - height;
    const accent = challenge.tone === 'coral' ? CORAL : GOLD;
    drawPanel(ctx, x, y, width, height, {
      cut: 10,
      fill: 'rgba(9,6,16,0.82)',
      stroke: 'rgba(247,232,210,0.2)',
      accent,
    });
    label(ctx, 'STREET JOB', x + 15, y + 16, { size: 7, color: accent, spacing: '2.4px', weight: 800 });
    label(ctx, challenge.title.toUpperCase(), x + 15, y + 35, { size: 15, color: CREAM, spacing: '1.2px', font: DISPLAY, weight: 800 });
    if (Number.isFinite(challenge.timer)) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = `800 21px ${MONO}`;
      ctx.fillStyle = challenge.timer < 12 ? CORAL : GOLD;
      ctx.fillText(timerString(challenge.timer), x + width - 15, y + 32);
      ctx.restore();
    }
    label(ctx, challenge.sub, x + 15, y + 52, {
      size: 7,
      color: 'rgba(247,232,210,0.55)',
      spacing: '1.1px',
      weight: 600,
    });
    if (challenge.detail) {
      label(ctx, challenge.detail, x + width - 15, y + 52, {
        size: 8,
        color: GOLD,
        spacing: '1.2px',
        align: 'right',
        weight: 700,
      });
    }
    if (Number.isFinite(challenge.timer) && Number.isFinite(challenge.maxTimer)) {
      const fill = Math.max(0, Math.min(1, challenge.timer / challenge.maxTimer));
      ctx.fillStyle = 'rgba(247,232,210,0.1)';
      ctx.fillRect(x + 15, y + height - 5, width - 30, 2);
      ctx.fillStyle = accent;
      ctx.fillRect(x + 15, y + height - 5, (width - 30) * fill, 2);
    }
  }

  drawSubtitle(ctx, state) {
    const subtitle = state.subtitle;
    if (!subtitle) return;
    const color = speakerColor(subtitle.speaker);
    ctx.save();
    ctx.font = `500 16px ${UI}`;
    const measured = Math.min(736, Math.max(410, ctx.measureText(subtitle.text).width + 52));
    ctx.restore();
    const width = measured;
    const height = 64;
    const x = (this.width - width) / 2;
    const y = this.height - 72 - 26 - 12 - height;
    drawPanel(ctx, x, y, width, height, {
      cut: 12,
      fill: 'rgba(8,5,15,0.88)',
      stroke: 'rgba(247,232,210,0.22)',
      accent: color,
    });
    label(ctx, (subtitle.speaker || 'RAE').toUpperCase(), x + 19, y + 21, {
      size: 8,
      color,
      spacing: '3px',
      weight: 800,
    });
    ctx.save();
    ctx.font = `500 16px ${UI}`;
    ctx.fillStyle = CREAM;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.2px';
    ctx.fillText(subtitle.text, x + 19, y + 44, width - 38);
    ctx.restore();
    ctx.strokeStyle = 'rgba(247,232,210,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 19, y + 51);
    ctx.lineTo(x + width - 19, y + 51);
    ctx.stroke();
  }

  drawReward(ctx, reward, state) {
    const alpha = Math.min(1, reward.life * 1.4);
    const cx = this.width / 2;
    const y = 164;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = `900 32px ${DISPLAY}`;
    ctx.fillStyle = GOLD;
    ctx.shadowColor = 'rgba(255,201,92,0.6)';
    ctx.shadowBlur = 20;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillText(`+ ${cashString(reward.amount)}`, cx, y);
    ctx.shadowBlur = 0;
    ctx.font = `700 8px ${UI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3.2px';
    ctx.fillStyle = 'rgba(63,224,207,0.85)';
    ctx.fillText((reward.label || 'REWARD').toUpperCase(), cx, y + 17);
    const rule = ctx.createLinearGradient(cx - 130, 0, cx + 130, 0);
    rule.addColorStop(0, 'rgba(255,201,92,0)');
    rule.addColorStop(0.5, 'rgba(255,201,92,0.55)');
    rule.addColorStop(1, 'rgba(255,201,92,0)');
    ctx.fillStyle = rule;
    ctx.fillRect(cx - 130, y + 26, 260, 1);
    ctx.restore();
  }

  drawFailure(ctx, fail) {
    const width = 560;
    const height = 104;
    const x = (this.width - width) / 2;
    const y = 188;
    const pulse = 0.5 + Math.sin(this.time * 4.4) * 0.5;
    drawPanel(ctx, x, y, width, height, {
      cut: 12,
      fill: 'rgba(22,6,10,0.9)',
      stroke: `rgba(255,111,97,${0.35 + pulse * 0.35})`,
      accent: CORAL,
    });
    ctx.save();
    ctx.globalAlpha = 0.16 + pulse * 0.1;
    ctx.fillStyle = CORAL;
    for (let i = -height; i < width; i += 34) {
      ctx.save();
      ctx.translate(x + i, y);
      ctx.rotate(-0.4);
      ctx.fillRect(0, -height, 2, height * 3);
      ctx.restore();
    }
    ctx.restore();
    label(ctx, 'MISSION FAILED', x + 22, y + 24, { size: 9, color: CORAL, spacing: '4px', weight: 800 });
    label(ctx, fail.title.toUpperCase(), x + 22, y + 51, { size: 23, color: CREAM, spacing: '1px', font: DISPLAY, weight: 900 });
    label(ctx, fail.reason, x + 22, y + 70, { size: 10, color: CREAM_DIM, spacing: '0.2px', weight: 500 });
    label(ctx, 'ENTER · RETRY      OR WALK INTO THE MARKER', x + width - 22, y + 90, {
      size: 8,
      color: GOLD,
      spacing: '1.8px',
      align: 'right',
      weight: 800,
    });
  }

  drawEnding(ctx, ending) {
    const alpha = Math.min(1, ending.life * 0.7);
    ctx.save();
    ctx.globalAlpha = alpha;
    const gradient = ctx.createRadialGradient(
      this.width / 2, this.height * 0.46, 40,
      this.width / 2, this.height * 0.46, this.width * 0.72,
    );
    gradient.addColorStop(0, 'rgba(36,24,16,0.78)');
    gradient.addColorStop(0.65, 'rgba(14,9,16,0.9)');
    gradient.addColorStop(1, 'rgba(5,4,12,0.97)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    const rule = ctx.createLinearGradient(this.width / 2 - 280, 0, this.width / 2 + 280, 0);
    rule.addColorStop(0, 'rgba(255,201,92,0)');
    rule.addColorStop(0.5, 'rgba(255,201,92,0.7)');
    rule.addColorStop(1, 'rgba(255,201,92,0)');
    ctx.fillStyle = rule;
    ctx.fillRect(this.width / 2 - 280, this.height / 2 - 62, 560, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.min(72, this.width * 0.062)}px ${DISPLAY}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
    ctx.fillStyle = CREAM;
    ctx.shadowColor = 'rgba(255,201,92,0.55)';
    ctx.shadowBlur = 28;
    ctx.fillText('THE HARBOR IS YOURS', this.width / 2, this.height / 2 - 18);
    ctx.shadowBlur = 0;
    ctx.font = `600 11px ${UI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.fillStyle = GOLD;
    ctx.fillText('THE SOLANO STORY · COMPLETE', this.width / 2, this.height / 2 + 42);
    ctx.font = `500 11px ${UI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
    ctx.fillStyle = 'rgba(247,232,210,0.55)';
    ctx.fillText('Free roam is open. The streets still pay.', this.width / 2, this.height / 2 + 66);
    ctx.restore();
  }

  drawRadio(ctx, state) {
    const right = this.width - 44;
    const y = this.height - 155;
    drawPanel(ctx, this.width - 28 - 228, y - 32, 228, 46, {
      cut: 8,
      fill: 'rgba(9,6,16,0.65)',
      stroke: 'rgba(247,232,210,0.13)',
      accent: 'rgba(63,224,207,0.55)',
    });
    const enabled = state.radio?.enabled !== false;
    const bars = 4;
    for (let i = 0; i < bars; i += 1) {
      const level = enabled ? 0.35 + 0.65 * (0.5 + Math.sin(this.time * (2.4 + i * 0.8) + i) * 0.5) : 0.1;
      const barHeight = 4 + level * 10;
      ctx.fillStyle = `rgba(63,224,207,${enabled ? 0.4 + level * 0.5 : 0.18})`;
      ctx.fillRect(right - 86 + i * 5, y - 18 - barHeight, 2.5, barHeight);
    }
    label(
      ctx,
      (enabled ? (state.radio?.station || 'NIGHT TIDE 88.3') : 'RADIO OFF').toUpperCase(),
      right,
      y - 10,
      { size: 10, color: enabled ? TEAL : 'rgba(247,232,210,0.4)', spacing: '1.8px', align: 'right', weight: 700 },
    );
    label(
      ctx,
      enabled ? (state.radio?.track || 'Harbor Lights — Sable Youth') : 'PRESS T TO TUNE IN',
      right,
      y + 5,
      { size: 8, color: 'rgba(247,232,210,0.46)', spacing: '0.8px', align: 'right', weight: 500 },
    );
  }

  drawWeaponStrip(ctx, state) {
    const weapons = state.weapons;
    const slots = weapons?.slots;
    if (!weapons || weapons.dead || !slots?.length) return;
    const width = 228;
    const height = 30;
    const x = this.width - width - 28;
    const y = state.player.driving ? this.height - 222 : this.height - 300;
    drawPanel(ctx, x, y, width, height, {
      cut: 8,
      fill: 'rgba(9,6,16,0.74)',
      stroke: 'rgba(247,232,210,0.16)',
      accent: 'rgba(255,201,92,0.7)',
    });
    const gap = 4;
    const slotWidth = (width - 16 - gap * (slots.length - 1)) / slots.length;
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      const sx = x + 8 + i * (slotWidth + gap);
      const sy = y + 5;
      chamferPath(ctx, sx, sy, slotWidth, 20, 5);
      ctx.fillStyle = slot.active
        ? 'rgba(255,201,92,0.17)'
        : slot.owned ? 'rgba(247,232,210,0.065)' : 'rgba(247,232,210,0.025)';
      ctx.fill();
      ctx.strokeStyle = slot.active
        ? 'rgba(255,201,92,0.9)'
        : slot.owned ? 'rgba(247,232,210,0.24)' : 'rgba(247,232,210,0.09)';
      ctx.lineWidth = 1;
      ctx.stroke();
      label(ctx, String(slot.slot), sx + 5, sy + 14, {
        size: 6.5,
        color: slot.active ? GOLD : slot.owned ? 'rgba(247,232,210,0.5)' : 'rgba(247,232,210,0.2)',
        font: MONO,
        weight: 700,
      });
      label(ctx, slot.short, sx + 14, sy + 14, {
        size: 6.2,
        color: slot.active ? CREAM : slot.owned ? 'rgba(247,232,210,0.66)' : 'rgba(247,232,210,0.24)',
        spacing: '0.5px',
        weight: 700,
      });
      if (slot.owned) {
        label(ctx, String(slot.ammo), sx + slotWidth - 5, sy + 14, {
          size: 7,
          color: slot.active ? GOLD : 'rgba(247,232,210,0.45)',
          align: 'right',
          font: MONO,
          weight: 700,
        });
      }
    }
  }

  drawWeapon(ctx, state) {
    const weapons = state.weapons;
    if (!weapons || weapons.dead || state.player.driving) return;
    const width = 200;
    const height = 64;
    const x = this.width - width - 28;
    const y = this.height - 262;
    const low = weapons.ammo <= Math.max(1, Math.floor(weapons.mag * 0.2));
    drawPanel(ctx, x, y, width, height, {
      cut: 10,
      fill: 'rgba(9,6,16,0.78)',
      stroke: 'rgba(247,232,210,0.18)',
      accent: low ? CORAL : GOLD,
    });
    label(ctx, weapons.name.toUpperCase(), x + 14, y + 18, { size: 9, color: CREAM, spacing: '1.3px', weight: 800 });
    label(ctx, weapons.short, x + width - 12, y + 18, { size: 7, color: 'rgba(255,201,92,0.75)', spacing: '1.3px', align: 'right', weight: 700 });
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = `900 28px ${DISPLAY}`;
    ctx.fillStyle = low ? CORAL : CREAM;
    ctx.fillText(String(weapons.ammo), x + width - 44, y + 48);
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = 'rgba(247,232,210,0.48)';
    ctx.fillText(`/ ${weapons.reserve}`, x + width - 12, y + 47);
    ctx.restore();
    const barX = x + 14;
    const barY = y + 25;
    const barWidth = width - 82;
    ctx.fillStyle = 'rgba(247,232,210,0.1)';
    ctx.fillRect(barX, barY, barWidth, 4);
    const fill = Math.max(0, Math.min(1, weapons.ammo / Math.max(1, weapons.mag)));
    ctx.fillStyle = low ? CORAL : GOLD;
    ctx.fillRect(barX, barY, barWidth * fill, 4);
    label(ctx, weapons.reloading ? 'RELOADING' : (weapons.aiming ? 'AIMED · RMB' : 'HIP · RMB TO AIM'), barX, y + 54, {
      size: 6.5,
      color: weapons.reloading ? TEAL : 'rgba(247,232,210,0.36)',
      spacing: '1.1px',
      weight: 700,
    });
    label(ctx, 'SLOTS 1-3 · R', x + width - 12, y + 54, {
      size: 6.5,
      color: 'rgba(247,232,210,0.34)',
      spacing: '1px',
      align: 'right',
    });
    if (weapons.reloading) {
      ctx.fillStyle = TEAL;
      ctx.fillRect(barX, barY, barWidth * Math.max(0, Math.min(1, weapons.reloadProgress)), 4);
    }
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

  drawSpeed(ctx, state) {
    const player = state.player;
    const car = player.driving;
    if (car) {
      const width = 252;
      const height = 108;
      const x = this.width - width - 28;
      const y = this.height - height - 28;
      drawPanel(ctx, x, y, width, height, { cut: 12, accent: TEAL });
      label(ctx, car.name.toUpperCase(), x + 15, y + 21, { size: 10, color: CREAM, spacing: '1.3px', weight: 700 });
      label(ctx, car.className || 'VEHICLE', x + width - 15, y + 21, { size: 7, color: 'rgba(63,224,207,0.7)', spacing: '1.4px', align: 'right' });

      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = `900 43px ${DISPLAY}`;
      ctx.fillStyle = CREAM;
      ctx.fillText(String(Math.round(car.speedKmh)), x + width - 15, y + 65);
      ctx.restore();
      label(ctx, 'KM/H', x + width - 15, y + 78, { size: 8, color: 'rgba(247,232,210,0.42)', spacing: '1.5px', align: 'right' });

      chamferPath(ctx, x + 15, y + 34, 36, 36, 7);
      ctx.fillStyle = 'rgba(247,232,210,0.08)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(63,224,207,0.48)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.save();
      ctx.font = `900 21px ${DISPLAY}`;
      ctx.fillStyle = GOLD;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(car.gear, x + 33, y + 53);
      ctx.restore();
      label(ctx, 'GEAR', x + 33, y + 82, { size: 6, color: 'rgba(247,232,210,0.38)', spacing: '1.2px', align: 'center' });

      const barX = x + 66;
      const barY = y + 79;
      const barWidth = width - 151;
      label(ctx, 'ENGINE', barX, y + 73, { size: 6, color: 'rgba(247,232,210,0.38)', spacing: '1.2px' });
      ctx.fillStyle = 'rgba(247,232,210,0.1)';
      ctx.fillRect(barX, barY, barWidth, 3);
      const rpm = Math.min(1, car.engineRpm / 6400);
      ctx.fillStyle = rpm > 0.82 ? CORAL : TEAL;
      ctx.fillRect(barX, barY, barWidth * rpm, 3);
      const damage = Math.max(0, Math.min(100, car.damagePercent ?? 0));
      const severity = damage > 60 ? CORAL : damage > 20 ? GOLD : TEAL;
      label(ctx, `DAMAGE ${damage}%`, x + 15, y + 98, {
        size: 6.8,
        color: severity,
        spacing: '1.1px',
        weight: 800,
      });
      ctx.fillStyle = 'rgba(247,232,210,0.1)';
      ctx.fillRect(x + 94, y + 94, width - 109, 3);
      ctx.fillStyle = severity;
      ctx.globalAlpha = damage > 60 ? 0.62 + 0.38 * (0.5 + Math.sin(this.time * 5) * 0.5) : 1;
      ctx.fillRect(x + 94, y + 94, (width - 109) * (damage / 100), 3);
      ctx.globalAlpha = 1;
      return;
    }

    const width = 188;
    const height = 88;
    const x = this.width - width - 28;
    const y = this.height - height - 28;
    drawPanel(ctx, x, y, width, height, { cut: 12, accent: TEAL });
    label(ctx, 'ON FOOT', x + 15, y + 21, { size: 8, color: 'rgba(63,224,207,0.74)', spacing: '2px', weight: 700 });
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = `900 43px ${DISPLAY}`;
    ctx.fillStyle = CREAM;
    ctx.fillText(String(Math.round(player.speedKmh)), x + width - 16, y + 64);
    ctx.restore();
    label(ctx, 'KM/H', x + width - 16, y + 78, { size: 8, color: 'rgba(247,232,210,0.4)', spacing: '1.5px', align: 'right' });
    const barX = x + 15;
    const barY = y + 66;
    const barWidth = width - 92;
    ctx.fillStyle = 'rgba(247,232,210,0.1)';
    ctx.fillRect(barX, barY, barWidth, 3);
    const level = Math.min(1, Math.abs(player.speedKmh) / 32);
    ctx.fillStyle = TEAL;
    ctx.fillRect(barX, barY, barWidth * level, 3);
    label(ctx, player.nearVehicle ? 'VEHICLE IN REACH' : 'FOOT MOBILITY', barX, barY + 16, {
      size: 7,
      color: player.nearVehicle ? 'rgba(255,201,92,0.8)' : 'rgba(247,232,210,0.32)',
      spacing: '1.4px',
    });
  }

  drawPrompt(ctx, state) {
    const prompt = state.vehiclePrompt;
    if (!prompt) return;
    const action = prompt.action === 'exit' ? 'EXIT VEHICLE' : `ENTER ${prompt.name.toUpperCase()}`;
    const width = Math.max(224, Math.min(370, 108 + action.length * 6.4));
    const height = 34;
    const x = (this.width - width) / 2;
    const y = this.height - 144;
    drawPanel(ctx, x, y, width, height, {
      cut: 9,
      fill: 'rgba(9,6,16,0.76)',
      stroke: 'rgba(247,232,210,0.2)',
      accent: prompt.action === 'exit' ? TEAL : GOLD,
    });
    chamferPath(ctx, x + 10, y + 8, 47, 18, 5);
    ctx.fillStyle = 'rgba(247,232,210,0.92)';
    ctx.fill();
    label(ctx, 'F / E', x + 33, y + 21, { size: 8, color: '#140f1c', spacing: '0.5px', align: 'center', weight: 800 });
    label(ctx, action, x + 68, y + 22, { size: 8, color: CREAM, spacing: '1.5px', weight: 700 });
    if (prompt.action === 'enter') {
      label(ctx, prompt.distance ? `${Math.round(prompt.distance)} M` : 'NEARBY', x + width - 12, y + 22, {
        size: 7,
        color: 'rgba(247,232,210,0.42)',
        spacing: '1.2px',
        align: 'right',
      });
    }
  }

  drawToast(ctx, toast) {
    const alpha = Math.min(1, toast.life * 0.8);
    const cx = this.width / 2;
    const y = 128;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = `900 29px ${DISPLAY}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
    ctx.fillStyle = CREAM;
    ctx.shadowColor = 'rgba(255, 140, 100, 0.4)';
    ctx.shadowBlur = 18;
    ctx.fillText(toast.title.toUpperCase(), cx, y);
    ctx.shadowBlur = 0;
    ctx.font = `600 9px ${UI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.fillStyle = 'rgba(63,224,207,0.8)';
    ctx.fillText(toast.sub, cx, y + 17);
    ctx.strokeStyle = 'rgba(247,232,210,0.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 120, y + 28);
    ctx.lineTo(cx - 42, y + 28);
    ctx.moveTo(cx + 42, y + 28);
    ctx.lineTo(cx + 120, y + 28);
    ctx.stroke();
    ctx.restore();
  }
}
