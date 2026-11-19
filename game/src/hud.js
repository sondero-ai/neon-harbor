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
    this.suppressToasts = false;
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
    this.drawMoneyAndStars(ctx, state.player);
    this.drawDistrict(ctx, state);
    this.drawMinimap(ctx, state);
    this.drawObjective(ctx, state);
    this.drawRadio(ctx, state);
    this.drawSpeed(ctx, state.player);
    if (this.toast) this.drawToast(ctx, this.toast);
  }

  drawVitals(ctx, player) {
    const x = 28;
    const y = 26;
    const width = 254;
    const height = 70;
    drawPanel(ctx, x, y, width, height, { cut: 13, accent: CORAL });
    label(ctx, 'RAE SOLANO', x + 16, y + 21, { size: 11, color: CREAM, spacing: '3px', weight: 700 });
    label(ctx, 'ON FOOT', x + width - 16, y + 21, { size: 8, color: 'rgba(63,224,207,0.72)', spacing: '1.5px', align: 'right' });

    const barX = x + 16;
    const barWidth = width - 72;
    this.drawBar(ctx, barX, y + 32, barWidth, 9, player.health / 100, CORAL, '#ff9c8b');
    label(ctx, 'HP', barX, y + 30, { size: 8, color: 'rgba(247,232,210,0.42)', spacing: '1px' });
    label(ctx, String(Math.round(player.health)), x + width - 16, y + 41, { size: 11, color: CREAM, align: 'right', font: MONO, weight: 700 });

    this.drawBar(ctx, barX, y + 49, barWidth * 0.78, 6, player.armor / 100, TEAL, '#9af8eb');
    label(ctx, 'AR', barX, y + 47, { size: 7, color: 'rgba(247,232,210,0.36)', spacing: '1px' });
    label(ctx, String(Math.round(player.armor)), x + width - 16, y + 56, { size: 10, color: CREAM_DIM, align: 'right', font: MONO });
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

  drawMoneyAndStars(ctx, player) {
    const right = this.width - 28;
    label(ctx, 'CASH', right, 40, { size: 9, color: 'rgba(247,232,210,0.46)', spacing: '3px', align: 'right' });
    ctx.save();
    ctx.font = `900 35px ${DISPLAY}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = GOLD;
    ctx.shadowColor = 'rgba(255, 201, 92, 0.35)';
    ctx.shadowBlur = 14;
    ctx.fillText(cashString(player.cash), right, 76);
    ctx.restore();

    label(ctx, 'WANTED', right, 101, { size: 8, color: 'rgba(247,232,210,0.4)', spacing: '2.5px', align: 'right' });
    const starRadius = 9;
    const gap = 23;
    for (let i = 0; i < 5; i += 1) {
      const cx = right - (4 - i) * gap - starRadius;
      const cy = 122;
      ctx.save();
      starPath(ctx, cx, cy, starRadius);
      if (i < player.wanted) {
        ctx.fillStyle = GOLD;
        ctx.shadowColor = GOLD;
        ctx.shadowBlur = 8;
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(247,232,210,0.22)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      ctx.restore();
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
    label(ctx, 'NEON HARBOR', x + 2, y + size + 17, { size: 8, color: 'rgba(247,232,210,0.38)', spacing: '2.5px' });
    label(ctx, (state.district || '').toUpperCase(), x + size - 2, y + size + 17, { size: 8, color: 'rgba(63,224,207,0.62)', spacing: '1.5px', align: 'right' });
  }

  drawObjective(ctx, state) {
    const objective = state.objective;
    if (!objective) return;
    const width = 382;
    const height = 68;
    const x = (this.width - width) / 2;
    const y = this.height - height - 28;
    drawPanel(ctx, x, y, width, height, { cut: 13, accent: CORAL });
    const distance = Math.round(Math.hypot(
      objective.marker.x - state.player.position.x,
      objective.marker.z - state.player.position.z,
    ));
    label(ctx, `OBJECTIVE · ${distance} M`, x + 17, y + 20, { size: 8, color: 'rgba(255,143,122,0.9)', spacing: '2.5px', weight: 700 });
    label(ctx, objective.title.toUpperCase(), x + 17, y + 42, { size: 17, color: CREAM, spacing: '1.5px', font: DISPLAY, weight: 800 });
    label(ctx, objective.sub, x + 17, y + 57, { size: 9, color: CREAM_DIM, spacing: '0.5px', weight: 500, font: UI });
  }

  drawRadio(ctx, state) {
    const right = this.width - 28;
    const y = this.height - 155;
    const bars = 4;
    for (let i = 0; i < bars; i += 1) {
      const level = 0.35 + 0.65 * (0.5 + Math.sin(this.time * (2.4 + i * 0.8) + i) * 0.5);
      const barHeight = 4 + level * 10;
      ctx.fillStyle = `rgba(63,224,207,${0.4 + level * 0.5})`;
      ctx.fillRect(right - 86 + i * 5, y - 18 - barHeight, 2.5, barHeight);
    }
    label(ctx, (state.radio?.station || 'NIGHT TIDE 88.3').toUpperCase(), right, y - 10, { size: 10, color: TEAL, spacing: '1.8px', align: 'right', weight: 700 });
    label(ctx, state.radio?.track || 'Harbor Lights — Sable Youth', right, y + 5, { size: 8, color: 'rgba(247,232,210,0.46)', spacing: '0.8px', align: 'right', weight: 500 });
  }

  drawSpeed(ctx, player) {
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
    label(ctx, 'FOOT MOBILITY', barX, barY + 16, { size: 7, color: 'rgba(247,232,210,0.32)', spacing: '1.4px' });
  }

  drawToast(ctx, toast) {
    const alpha = Math.min(1, toast.life * 0.8);
    const cx = this.width / 2;
    const y = 104;
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
