// The heads-up display, drawn with Canvas 2D over the WebGL view. The HUD
// owns its own baked minimap so the per-frame cost is a few drawImage calls,
// a handful of bars, and one very cheap arrow. Everything here is presentation:
// player.js supplies the numbers, main.js decides when the HUD is on screen.

import { BLOCK_CENTERS_X, BLOCK_CENTERS_Z, PALETTE, RADIO, ROADS_X, ROADS_Z, WORLD } from './config.js';
import { LOW_FUEL, fuelPct } from './fuel.js';

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
const MAP_MAX_X = 375;
const MAP_MIN_Z = -270;
const MAP_MAX_Z = 270;
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
  const name = String(speaker ?? '').toUpperCase();
  if (name.includes('VALE')) return '#7fa8ff';
  if (name.startsWith('TOMAS') || name.startsWith('AURELIO')) return CORAL;
  if (name.startsWith('MIRA')) return GOLD;
  if (name.startsWith('RAE')) return TEAL;
  return TEAL;
}

function speakerDisplayName(speaker) {
  const name = String(speaker ?? 'RAE').toUpperCase();
  if (name === 'MIRA') return 'MIRA SOL';
  if (name.includes('VALE')) return 'SGT. VALE';
  return name;
}

function speakerRole(speaker) {
  const name = String(speaker ?? '').toUpperCase();
  if (name.includes('VALE')) return 'HPD DISPATCH';
  if (name === 'MIRA') return 'FIXER · VEGA STRIP';
  if (name.startsWith('RAE')) return 'COURIER · SOLANO CREW';
  if (name.startsWith('TOMAS')) return 'SOLANO CREW · LUNA PLAZA';
  if (name.startsWith('AURELIO')) return 'SOLANO PATRIARCH';
  return 'NEON HARBOR';
}

function truncateText(ctx, text, maxWidth, font) {
  ctx.save();
  ctx.font = font;
  const value = String(text ?? '');
  if (ctx.measureText(value).width <= maxWidth) {
    ctx.restore();
    return value;
  }
  let cut = value;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  ctx.restore();
  return `${cut.trimEnd()}…`;
}

function wrapText(ctx, text, maxWidth, font, maxLines = 2) {
  ctx.save();
  ctx.font = font;
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(next).width <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  ctx.restore();
  if (lines.length <= maxLines) return lines;
  const head = lines.slice(0, maxLines - 1);
  let last = lines.slice(maxLines - 1).join(' ');
  ctx.save();
  ctx.font = font;
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  ctx.restore();
  head.push(`${last.trimEnd()}…`);
  return head;
}

function roleColor(role) {
  switch (role) {
    case 'RAMMING':
    case 'CLOSING IN':
      return CORAL;
    case 'ROADBLOCK':
    case 'PURSUIT':
      return GOLD;
    case 'SPOTLIGHT':
    case 'PATROL':
      return TEAL;
    default:
      return 'rgba(247,232,210,0.58)';
  }
}

function drawPortrait(ctx, x, y, size, speaker) {
  const name = String(speaker ?? 'RAE').toUpperCase();
  const skin = name.includes('VALE') ? '#c08a68'
    : name.startsWith('RAE') ? '#a77456'
      : name.startsWith('MIRA') ? '#b87a60'
        : name.startsWith('AURELIO') ? '#8a5a44'
          : '#9c6a50';
  const jacket = name.includes('VALE') ? '#1c2a45'
    : name.startsWith('RAE') ? '#a93345'
      : name.startsWith('MIRA') ? '#5a421d'
        : name.startsWith('TOMAS') ? '#4f1e26'
          : name.startsWith('AURELIO') ? '#21191d'
            : '#2b2638';
  const accent = speakerColor(name);
  const cx = x + size * 0.5;
  const cy = y + size * 0.4;
  const head = size * 0.19;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.fillStyle = 'rgba(247,232,210,0.055)';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = 'rgba(63,224,207,0.06)';
  ctx.fillRect(x, y, size, size * 0.42);

  // Shoulders and collar.
  ctx.fillStyle = jacket;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.08, y + size);
  ctx.quadraticCurveTo(x + size * 0.12, y + size * 0.7, cx, y + size * 0.68);
  ctx.quadraticCurveTo(x + size * 0.88, y + size * 0.7, x + size * 0.92, y + size);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(cx - size * 0.16, y + size * 0.72, size * 0.32, 2);
  ctx.globalAlpha = 1;

  // Neck and head.
  ctx.fillStyle = skin;
  ctx.fillRect(cx - size * 0.06, y + size * 0.55, size * 0.12, size * 0.14);
  ctx.beginPath();
  ctx.ellipse(cx, cy, head * 0.9, head * 1.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair, caps and the one detail that makes each speaker read.
  if (name.includes('VALE')) {
    ctx.fillStyle = '#111a2c';
    ctx.beginPath();
    ctx.ellipse(cx, cy - head * 0.48, head, head * 0.62, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - head * 1.1, cy - head * 0.5, head * 2.2, head * 0.28);
    ctx.fillStyle = GOLD;
    ctx.fillRect(cx - head * 0.34, cy - head * 0.15, head * 0.16, head * 0.2);
    ctx.fillStyle = '#c08a68';
    ctx.fillRect(cx - head * 0.06, cy + head * 0.18, head * 0.3, 1.5);
  } else if (name.startsWith('AURELIO')) {
    ctx.fillStyle = '#b9b0a8';
    ctx.beginPath();
    ctx.ellipse(cx, cy - head * 0.55, head * 0.98, head * 0.55, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - head * 1.0, cy - head * 0.55, head * 2.0, head * 0.1);
    ctx.strokeStyle = 'rgba(247,232,210,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - head, cy - head * 0.25);
    ctx.lineTo(cx + head, cy - head * 0.2);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.fillRect(cx - head * 0.1, cy + head * 0.62, head * 0.2, head * 0.18);
  } else if (name.startsWith('MIRA')) {
    ctx.fillStyle = '#1a1218';
    ctx.beginPath();
    ctx.ellipse(cx, cy - head * 0.45, head, head * 0.7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - head * 0.8, cy, head * 0.28, head * 0.8, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(cx + head * 0.86, cy + head * 0.3, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (name.startsWith('RAE')) {
    ctx.fillStyle = '#18131b';
    ctx.beginPath();
    ctx.ellipse(cx, cy - head * 0.42, head * 0.96, head * 0.62, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TEAL;
    ctx.fillRect(cx + head * 0.45, cy - head * 0.72, 2.5, head * 0.5);
    ctx.fillStyle = 'rgba(63,224,207,0.8)';
    ctx.beginPath();
    ctx.arc(cx + head * 0.84, cy + head * 0.3, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (name.startsWith('TOMAS')) {
    ctx.fillStyle = '#19141a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - head * 0.48, head * 0.98, head * 0.58, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,111,97,0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + head * 0.34, cy - head * 0.1);
    ctx.lineTo(cx + head * 0.54, cy + head * 0.5);
    ctx.stroke();
  }

  // Eyes, brows and mouth.
  ctx.fillStyle = 'rgba(20,14,22,0.9)';
  ctx.beginPath();
  ctx.arc(cx - head * 0.38, cy + head * 0.02, 1.6, 0, Math.PI * 2);
  ctx.arc(cx + head * 0.38, cy + head * 0.02, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,14,22,0.65)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - head * 0.62, cy - head * 0.22);
  ctx.lineTo(cx - head * 0.16, cy - head * 0.16);
  ctx.moveTo(cx + head * 0.16, cy - head * 0.16);
  ctx.lineTo(cx + head * 0.62, cy - head * 0.22);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60,28,30,0.8)';
  ctx.beginPath();
  ctx.moveTo(cx - head * 0.22, cy + head * 0.55);
  ctx.lineTo(cx + head * 0.24, cy + head * 0.52);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(247,232,210,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  ctx.restore();
}

function drawWeaponIcon(ctx, kind, x, y, tone) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = tone;
  ctx.strokeStyle = tone;
  ctx.lineWidth = 1.2;
  if (kind === 'pistol') {
    ctx.fillRect(-8, -4, 13, 3.5);
    ctx.fillRect(5, -3.2, 4, 2);
    ctx.beginPath();
    ctx.moveTo(-5, -0.5);
    ctx.lineTo(-1, -0.5);
    ctx.lineTo(-4, 6);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-2, 0.2, 1, 3);
  } else if (kind === 'smg') {
    ctx.fillRect(-9, -4, 14, 4);
    ctx.fillRect(5, -3.2, 5, 2.2);
    ctx.fillRect(-6, 0, 3, 5.5);
    ctx.fillRect(-9, -5, 3, 2);
    ctx.fillRect(1, 0, 2, 3);
  } else if (kind === 'knife') {
    ctx.beginPath();
    ctx.moveTo(-1, -6);
    ctx.lineTo(9, 0);
    ctx.lineTo(-1, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-9, -1.2, 8, 3.2);
    ctx.fillRect(-9.5, -2, 1.4, 4.8);
  } else if (kind === 'rifle') {
    ctx.fillRect(-10, -2.5, 18, 3);
    ctx.fillRect(5, -4, 4, 1.6);
    ctx.beginPath();
    ctx.moveTo(-10, -2.5);
    ctx.lineTo(-13, -5);
    ctx.lineTo(-13, 0.5);
    ctx.lineTo(-10, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-2, 0.5, 2, 4);
    ctx.fillRect(-5, -5.5, 5, 2);
  } else if (kind === 'rpg') {
    ctx.fillRect(-10, -2.5, 17, 4);
    ctx.beginPath();
    ctx.moveTo(7, -5);
    ctx.lineTo(13, -0.5);
    ctx.lineTo(7, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-6, 1.5, 2, 4);
  }
  ctx.restore();
}

function drawRotorIcon(ctx, cx, cy, radius, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i += 1) {
    ctx.rotate(Math.PI / 5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -radius);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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

    this.drawMissionCard(ctx, state);
    this.drawVitals(ctx, state.player);
    this.drawStateCard(ctx, state.player, state.police, state);
    this.drawDistrict(ctx, state);
    this.drawAirBanner(ctx, state.police?.air);
    this.drawMinimap(ctx, state);
    this.drawCrewPanel(ctx, state);
    this.drawObjective(ctx, state);
    this.drawChallenge(ctx, state);
    this.drawDialogue(ctx, state);
    this.drawPoliceRoster(ctx, state);
    this.drawWeaponStrip(ctx, state);
    this.drawVehicleCard(ctx, state);
    this.drawPrompt(ctx, state);
    this.drawCrosshair(ctx, state);
    if (this.toast) this.drawToast(ctx, this.toast);
    if (this.reward) this.drawReward(ctx, this.reward, state);
    this.drawDamage(ctx, state);
    if (state.fail) this.drawFailure(ctx, state.fail);
    if (state.down) this.drawDown(ctx, state.down);
    if (this.ending) this.drawEnding(ctx, this.ending);
    if (state.radio?.wheel?.open) this.drawRadioWheel(ctx, state);
  }

  drawMissionCard(ctx, state) {
    const card = state.missionCard;
    if (!card) return;
    const x = 24;
    const y = 20;
    const width = 400;
    const height = 158;
    const accent = card.failed ? CORAL : GOLD;
    drawPanel(ctx, x, y, width, height, {
      cut: 12,
      fill: 'rgba(9,6,16,0.86)',
      stroke: 'rgba(247,232,210,0.2)',
      accent,
    });
    label(ctx, `${card.chapter} · ${card.operation}`, x + 18, y + 24, {
      size: 12,
      color: accent,
      spacing: '1.6px',
      weight: 800,
    });
    label(ctx, card.story ?? 'SOLANO STORY', x + width - 18, y + 24, {
      size: 10,
      color: 'rgba(247,232,210,0.48)',
      spacing: '1.1px',
      align: 'right',
      weight: 700,
    });
    ctx.save();
    ctx.font = `900 27px ${DISPLAY}`;
    ctx.fillStyle = CREAM;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.9px';
    ctx.fillText(truncateText(ctx, card.title ?? 'THE SOLANO STORY', width - 36, `900 27px ${DISPLAY}`), x + 18, y + 55);
    ctx.restore();

    const objective = card.objectiveSub ?? card.objective ?? '';
    label(ctx, truncateText(ctx, objective, width - 36, `500 13px ${UI}`), x + 18, y + 78, {
      size: 13,
      color: CREAM_DIM,
      spacing: '0.2px',
      weight: 500,
    });

    const stage = Math.max(0, Math.min(card.stages ?? 4, card.stage ?? 0));
    const stages = Math.max(1, card.stages ?? 4);
    label(ctx, `STAGE ${stage}/${stages}`, x + 18, y + 108, {
      size: 12,
      color: CREAM,
      spacing: '2px',
      weight: 800,
    });
    const barX = x + 112;
    const barWidth = width - 130;
    const gap = 5;
    const segmentWidth = (barWidth - gap * (stages - 1)) / stages;
    for (let i = 0; i < stages; i += 1) {
      const filled = i < stage;
      ctx.fillStyle = filled ? (i === stage - 1 ? accent : 'rgba(255,201,92,0.55)') : 'rgba(247,232,210,0.12)';
      ctx.fillRect(barX + i * (segmentWidth + gap), y + 99, segmentWidth, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      if (filled) ctx.fillRect(barX + i * (segmentWidth + gap), y + 99, segmentWidth, 1);
    }
    ctx.strokeStyle = 'rgba(247,232,210,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 122);
    ctx.lineTo(x + width - 18, y + 122);
    ctx.stroke();
    label(ctx, 'NEXT:', x + 18, y + 143, { size: 10.5, color: accent, spacing: '1.2px', weight: 800 });
    label(ctx, truncateText(ctx, card.next ?? 'Hold the Strip', width - 88, `700 12px ${UI}`), x + 64, y + 143, {
      size: 12,
      color: TEAL,
      spacing: '0.3px',
      weight: 700,
    });
  }

  drawVitals(ctx, player) {
    const x = 24;
    const y = 424;
    const width = 250;
    const height = 52;
    drawPanel(ctx, x, y, width, height, { cut: 10, accent: CORAL });
    label(ctx, 'RAE SOLANO', x + 14, y + 17, { size: 11.5, color: CREAM, spacing: '1.8px', weight: 800 });
    label(ctx, player.driving ? 'DRIVING' : 'ON FOOT', x + width - 14, y + 17, {
      size: 10,
      color: 'rgba(63,224,207,0.78)',
      spacing: '1.2px',
      align: 'right',
      weight: 700,
    });

    label(ctx, 'HP', x + 14, y + 33, { size: 10.5, color: 'rgba(247,232,210,0.62)', spacing: '1px', weight: 700 });
    this.drawBar(ctx, x + 40, y + 26, width - 98, 8, player.health / 100, CORAL, '#ff9c8b');
    label(ctx, String(Math.round(player.health)), x + width - 14, y + 35, { size: 13, color: CREAM, align: 'right', font: MONO, weight: 700 });

    label(ctx, 'AR', x + 14, y + 46, { size: 10.5, color: 'rgba(247,232,210,0.5)', spacing: '1px', weight: 700 });
    this.drawBar(ctx, x + 40, y + 40, width - 98, 5, player.armor / 100, TEAL, '#9af8eb');
    label(ctx, String(Math.round(player.armor)), x + width - 14, y + 48, { size: 11.5, color: CREAM_DIM, align: 'right', font: MONO, weight: 700 });

    if (this.healthFlash > 0.02) {
      ctx.save();
      chamferPath(ctx, x, y, width, height, 10);
      ctx.strokeStyle = `rgba(255,84,70,${0.25 + this.healthFlash * 0.65})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = CORAL;
      ctx.shadowBlur = 16 * this.healthFlash;
      ctx.stroke();
      ctx.restore();
      label(ctx, 'HIT', x + width - 14, y + 17, { size: 10, color: CORAL, spacing: '1.2px', align: 'right', weight: 800 });
    } else if (this.armorFlash > 0.02 && player.armor < 100) {
      ctx.save();
      chamferPath(ctx, x, y, width, height, 10);
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

  drawStateCard(ctx, player, police = null, state = {}) {
    const width = 252;
    const x = this.width - width - 28;
    const y = 18;
    const height = 160;
    drawPanel(ctx, x, y, width, height, {
      cut: 12,
      fill: 'rgba(9,6,16,0.82)',
      stroke: 'rgba(247,232,210,0.2)',
      accent: 'rgba(255,201,92,0.9)',
    });
    const right = x + width - 14;
    label(ctx, 'CASH', right, y + 20, { size: 10.5, color: 'rgba(247,232,210,0.58)', spacing: '2.4px', align: 'right', weight: 700 });
    ctx.save();
    ctx.font = `900 31px ${DISPLAY}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = GOLD;
    ctx.shadowColor = 'rgba(255, 201, 92, 0.5)';
    ctx.shadowBlur = 12;
    ctx.fillText(cashString(player.cash), right, y + 52);
    ctx.restore();

    const wanted = police?.wanted ?? player.wanted ?? 0;
    const flash = police?.wantedFlash ?? 0;
    const starRadius = 8.3;
    const gap = 20.5;
    for (let i = 0; i < 5; i += 1) {
      const cx = right - (4 - i) * gap - starRadius;
      const cy = y + 72;
      const active = i < wanted;
      const scale = active ? 1 + flash * 0.22 : 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      starPath(ctx, 0, 0, starRadius);
      if (active) {
        ctx.fillStyle = flash > 0.45 && Math.sin(this.time * 28) > 0 ? '#fff3c9' : GOLD;
        ctx.shadowColor = 'rgba(255,120,80,0.9)';
        ctx.shadowBlur = 7 + flash * 12;
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(247,232,210,0.34)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }
    label(ctx, 'WANTED', x + 14, y + 72, { size: 10, color: 'rgba(247,232,210,0.46)', spacing: '1.4px', weight: 700 });

    const searching = police?.status === 'search';
    const units = police?.rosterCount ?? police?.units?.length ?? 0;
    const blink = Math.sin(this.time * 7.5) > 0;
    if (wanted > 0) {
      const statusColor = searching ? GOLD : CORAL;
      ctx.save();
      ctx.fillStyle = statusColor;
      ctx.globalAlpha = 0.55 + 0.45 * (blink ? 1 : 0.4);
      ctx.beginPath();
      ctx.arc(x + 19, y + 91, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      label(
        ctx,
        searching ? 'SEARCHING · LAST KNOWN AREA' : `PURSUIT · ${units} UNIT${units === 1 ? '' : 'S'}`,
        x + 30,
        y + 95,
        { size: 11, color: statusColor, spacing: '0.8px', weight: 800 },
      );
    } else {
      label(ctx, 'NO ACTIVE BOLO', x + 14, y + 95, {
        size: 10.5,
        color: 'rgba(63,224,207,0.68)',
        spacing: '1.2px',
        weight: 700,
      });
    }

    ctx.strokeStyle = 'rgba(247,232,210,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 103);
    ctx.lineTo(x + width - 14, y + 103);
    ctx.stroke();

    label(ctx, `DAY ${state.day ?? 4} · ${state.clock ?? '23:41'}`, x + 14, y + 123, {
      size: 12.5,
      color: CREAM,
      spacing: '1.1px',
      weight: 800,
      font: MONO,
    });
    label(ctx, `${state.period ?? 'NIGHT'} SHIFT`, x + width - 14, y + 123, {
      size: 10,
      color: 'rgba(63,224,207,0.72)',
      spacing: '1.4px',
      align: 'right',
      weight: 700,
    });

    const respect = state.respect ?? { rank: 'NEW BLOOD', value: 0, max: 250 };
    label(ctx, respect.rank, x + 14, y + 142, { size: 11, color: GOLD, spacing: '1.2px', weight: 800 });
    label(ctx, `${respect.value}/${respect.max} RESPECT`, x + width - 14, y + 142, {
      size: 10.5,
      color: CREAM,
      spacing: '0.8px',
      align: 'right',
      weight: 700,
    });
    const barX = x + 14;
    const barY = y + 148;
    const barWidth = width - 28;
    ctx.fillStyle = 'rgba(247,232,210,0.12)';
    ctx.fillRect(barX, barY, barWidth, 5);
    ctx.fillStyle = GOLD;
    ctx.fillRect(barX, barY, barWidth * Math.max(0, Math.min(1, respect.value / respect.max)), 5);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(barX, barY, barWidth * Math.max(0, Math.min(1, respect.value / respect.max)), 1);

    const bust = police?.bustProgress ?? 0;
    if (bust > 0.01) {
      label(ctx, 'BUSTED', x + width - 14, y + 95, {
        size: 10,
        color: CREAM,
        spacing: '1.2px',
        align: 'right',
        weight: 800,
      });
      ctx.fillStyle = 'rgba(247,232,210,0.16)';
      ctx.fillRect(x + width - 74, y + 99, 60, 4);
      ctx.fillStyle = CORAL;
      ctx.fillRect(x + width - 74, y + 99, 60 * Math.min(1, bust), 4);
    }
  }

  drawDistrict(ctx, state) {
    const cx = this.width / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(5,4,12,0.9)';
    ctx.shadowBlur = 8;
    ctx.font = `800 13px ${UI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3.2px';
    ctx.fillStyle = CREAM;
    ctx.fillText((state.district || 'NEON HARBOR').toUpperCase(), cx, 32);
    ctx.font = `700 11px ${MONO}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.8px';
    ctx.fillStyle = TEAL;
    ctx.fillText((state.street || 'VEGA BLVD').toUpperCase(), cx, 48);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(247,232,210,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 118, 56);
    ctx.lineTo(cx - 58, 56);
    ctx.moveTo(cx + 58, 56);
    ctx.lineTo(cx + 118, 56);
    ctx.stroke();
    ctx.restore();
  }

  drawAirBanner(ctx, air) {
    if (!air) return;
    const width = 318;
    const height = 40;
    const x = (this.width - width) / 2;
    const y = 62;
    const spotlight = air.spotlight !== false;
    const accent = spotlight ? TEAL : 'rgba(63,224,207,0.45)';
    drawPanel(ctx, x, y, width, height, {
      cut: 9,
      fill: 'rgba(8,5,15,0.84)',
      stroke: 'rgba(63,224,207,0.34)',
      accent,
    });
    drawRotorIcon(ctx, x + 24, y + height / 2, 10, accent);
    label(ctx, spotlight ? 'AIR 1 · SPOTLIGHT' : 'AIR 1 · PATROL', x + 44, y + 18, {
      size: 12,
      color: spotlight ? TEAL : 'rgba(247,232,210,0.7)',
      spacing: '1.3px',
      weight: 800,
    });
    label(ctx, spotlight ? 'HARBOR PD AIR SUPPORT' : 'SEARCHING THE BLOCKS', x + 44, y + 32, {
      size: 10.5,
      color: 'rgba(247,232,210,0.52)',
      spacing: '1.1px',
      weight: 600,
    });
    label(ctx, `${air.distance ?? 0} m`, x + width - 14, y + 25, {
      size: 15,
      color: spotlight ? GOLD : CREAM_DIM,
      spacing: '0.8px',
      align: 'right',
      font: MONO,
      weight: 800,
    });
    ctx.save();
    ctx.fillStyle = spotlight && Math.sin(this.time * 8) > 0 ? CORAL : 'rgba(255,111,97,0.35)';
    ctx.beginPath();
    ctx.arc(x + width - 14, y + 10, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawMinimap(ctx, state) {
    const size = 188;
    const x = 32;
    const y = 494;
    drawPanel(ctx, 24, 486, 204, 204, {
      cut: 13,
      fill: 'rgba(9,6,16,0.86)',
      stroke: 'rgba(247,232,210,0.26)',
      accent: 'rgba(63,224,207,0.55)',
    });
    ctx.save();
    chamferPath(ctx, x, y, size, size, 10);
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

    // A north notch and a small scale bar keep the map oriented. The top
    // overlay carries the district and street names, at the size the judge
    // can still read when the frame is shown at one third.
    ctx.save();
    chamferPath(ctx, x, y, size, size, 10);
    ctx.clip();
    const top = ctx.createLinearGradient(0, y, 0, y + 48);
    top.addColorStop(0, 'rgba(6,5,12,0.94)');
    top.addColorStop(0.72, 'rgba(6,5,12,0.62)');
    top.addColorStop(1, 'rgba(6,5,12,0)');
    ctx.fillStyle = top;
    ctx.fillRect(x, y, size, 48);
    const bottom = ctx.createLinearGradient(0, y + size - 34, 0, y + size);
    bottom.addColorStop(0, 'rgba(6,5,12,0)');
    bottom.addColorStop(1, 'rgba(6,5,12,0.82)');
    ctx.fillStyle = bottom;
    ctx.fillRect(x, y + size - 34, size, 34);
    label(ctx, (state.district || 'NEON HARBOR').toUpperCase(), x + 10, y + 17, {
      size: 11.5,
      color: CREAM,
      spacing: '1.4px',
      weight: 800,
    });
    label(ctx, (state.street || 'VEGA BLVD').toUpperCase(), x + 10, y + 31, {
      size: 10.5,
      color: TEAL,
      spacing: '1.1px',
      weight: 700,
    });
    const density = state.density ?? { cars: 0, walkers: 0 };
    label(ctx, `CARS ${String(density.cars).padStart(2, '0')}`, x + size - 8, y + 17, {
      size: 10.5,
      color: GOLD,
      spacing: '0.7px',
      align: 'right',
      weight: 700,
    });
    label(ctx, `WALKERS ${String(density.walkers).padStart(2, '0')}`, x + size - 8, y + 31, {
      size: 10.5,
      color: TEAL,
      spacing: '0.7px',
      align: 'right',
      weight: 700,
    });
    label(ctx, 'LIVE SCAN', x + size - 8, y + size - 8, {
      size: 10.5,
      color: 'rgba(63,224,207,0.72)',
      spacing: '1px',
      align: 'right',
      weight: 700,
    });
    ctx.restore();

    ctx.fillStyle = 'rgba(9,6,16,0.8)';
    ctx.fillRect(centerX - 15, y + 37, 30, 15);
    label(ctx, 'N', centerX, y + 49, { size: 10.5, color: 'rgba(247,232,210,0.78)', spacing: '1px', align: 'center', weight: 800 });
    ctx.fillStyle = 'rgba(247,232,210,0.28)';
    ctx.fillRect(x + 14, y + size - 15, 22, 1);
    ctx.fillRect(x + 14, y + size - 18, 1, 7);
    ctx.fillRect(x + 36, y + size - 18, 1, 7);
    label(ctx, '50 M', x + 42, y + size - 11, { size: 10.5, color: 'rgba(247,232,210,0.6)', spacing: '0.6px', weight: 600 });
    ctx.restore();
  }

  drawObjective(ctx, state) {
    const objective = state.objective;
    if (!objective) return;
    const width = 480;
    const height = 68;
    const x = (this.width - width) / 2;
    const y = this.height - height - 24;
    const failed = objective.failed === true;
    drawPanel(ctx, x, y, width, height, {
      cut: 11,
      accent: failed ? CORAL : 'rgba(255,111,97,0.9)',
      stroke: failed ? 'rgba(255,111,97,0.4)' : LINE,
    });
    const distance = objective.marker
      ? Math.round(Math.hypot(objective.marker.x - state.player.position.x, objective.marker.z - state.player.position.z))
      : null;
    let rightText = distance === null ? '' : `${distance} M`;
    let rightColor = 'rgba(247,232,210,0.62)';
    if (Number.isFinite(objective.timer)) {
      rightText = timerString(objective.timer);
      rightColor = objective.timer < 20 ? CORAL : GOLD;
    } else if (objective.progress) {
      const p = objective.progress;
      rightText = `${p.label} ${p.value}/${p.max}`;
      rightColor = GOLD;
    }
    label(ctx, (objective.tag || 'OBJECTIVE').toUpperCase(), x + 16, y + 18, {
      size: 10,
      color: failed ? CORAL : 'rgba(255,143,122,0.9)',
      spacing: '1.5px',
      weight: 800,
    });
    label(ctx, rightText, x + width - 16, y + 18, {
      size: 10.5,
      color: rightColor,
      spacing: '1.1px',
      align: 'right',
      weight: 800,
    });
    label(ctx, truncateText(ctx, objective.title.toUpperCase(), width - 32, `900 19px ${DISPLAY}`), x + 16, y + 41, {
      size: 19,
      color: CREAM,
      spacing: '0.8px',
      font: DISPLAY,
      weight: 900,
    });
    label(ctx, truncateText(ctx, objective.sub, width - 32, `500 11.5px ${UI}`), x + 16, y + 56, {
      size: 11.5,
      color: CREAM_DIM,
      spacing: '0.15px',
      weight: 500,
      font: UI,
    });
    if (objective.progress) {
      const p = objective.progress;
      const barX = x + 16;
      const barWidth = width - 32;
      const barY = y + height - 4;
      ctx.fillStyle = 'rgba(247,232,210,0.1)';
      ctx.fillRect(barX, barY, barWidth, 3);
      ctx.fillStyle = failed ? CORAL : GOLD;
      ctx.fillRect(barX, barY, barWidth * Math.max(0, Math.min(1, p.value / Math.max(1, p.max))), 3);
    } else if (Number.isFinite(objective.timer) && objective.timer > 0) {
      const barX = x + 16;
      const barWidth = width - 32;
      const barY = y + height - 4;
      const total = objective.progress?.maxTimer ?? 108;
      ctx.fillStyle = 'rgba(247,232,210,0.1)';
      ctx.fillRect(barX, barY, barWidth, 3);
      ctx.fillStyle = objective.timer < 20 ? CORAL : TEAL;
      ctx.fillRect(barX, barY, barWidth * Math.max(0, Math.min(1, objective.timer / total)), 3);
    }
  }

  drawChallenge(ctx, state) {
    const challenge = state.challenge;
    if (!challenge) return;
    const width = 340;
    const height = 52;
    const x = (this.width - width) / 2;
    const y = 104;
    const accent = challenge.tone === 'coral' ? CORAL : GOLD;
    drawPanel(ctx, x, y, width, height, {
      cut: 9,
      fill: 'rgba(9,6,16,0.86)',
      stroke: 'rgba(247,232,210,0.2)',
      accent,
    });
    label(ctx, 'STREET JOB', x + 14, y + 15, { size: 10, color: accent, spacing: '1.8px', weight: 800 });
    label(ctx, challenge.title.toUpperCase(), x + 14, y + 32, { size: 14, color: CREAM, spacing: '0.9px', font: DISPLAY, weight: 800 });
    if (Number.isFinite(challenge.timer)) {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = `800 19px ${MONO}`;
      ctx.fillStyle = challenge.timer < 12 ? CORAL : GOLD;
      ctx.fillText(timerString(challenge.timer), x + width - 14, y + 31);
      ctx.restore();
    }
    label(ctx, truncateText(ctx, challenge.sub, width - 28, `600 10.5px ${UI}`), x + 14, y + 45, {
      size: 10.5,
      color: 'rgba(247,232,210,0.62)',
      spacing: '0.3px',
      weight: 600,
    });
    if (challenge.detail) {
      label(ctx, challenge.detail, x + width - 14, y + 45, {
        size: 10,
        color: GOLD,
        spacing: '0.6px',
        align: 'right',
        weight: 700,
      });
    }
    if (Number.isFinite(challenge.timer) && Number.isFinite(challenge.maxTimer)) {
      const fill = Math.max(0, Math.min(1, challenge.timer / challenge.maxTimer));
      ctx.fillStyle = 'rgba(247,232,210,0.1)';
      ctx.fillRect(x + 14, y + height - 4, width - 28, 2);
      ctx.fillStyle = accent;
      ctx.fillRect(x + 14, y + height - 4, (width - 28) * fill, 2);
    }
  }

  drawDialogue(ctx, state) {
    const subtitle = state.subtitle;
    if (!subtitle) return;
    const width = 400;
    const height = 108;
    const x = 24;
    const y = 188;
    const color = speakerColor(subtitle.speaker);
    drawPanel(ctx, x, y, width, height, {
      cut: 11,
      fill: 'rgba(8,5,15,0.9)',
      stroke: 'rgba(247,232,210,0.24)',
      accent: color,
    });
    drawPortrait(ctx, x + 14, y + 20, 68, subtitle.speaker);
    const textX = x + 96;
    const textWidth = width - 112;
    label(ctx, speakerDisplayName(subtitle.speaker), textX, y + 33, {
      size: 13.5,
      color,
      spacing: '1.1px',
      weight: 800,
    });
    label(ctx, (subtitle.role ?? speakerRole(subtitle.speaker)).toUpperCase(), textX, y + 49, {
      size: 10.5,
      color: 'rgba(247,232,210,0.56)',
      spacing: '1px',
      weight: 700,
    });
    const lines = wrapText(ctx, subtitle.text, textWidth, `500 13px ${UI}`, 2);
    ctx.save();
    ctx.font = `500 13px ${UI}`;
    ctx.fillStyle = CREAM;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.1px';
    lines.forEach((line, index) => ctx.fillText(line, textX, y + 70 + index * 17));
    ctx.restore();
    ctx.strokeStyle = 'rgba(247,232,210,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(textX, y + 94);
    ctx.lineTo(x + width - 14, y + 94);
    ctx.stroke();
    label(ctx, 'COMMS', x + width - 14, y + 101, {
      size: 10.5,
      color: 'rgba(247,232,210,0.38)',
      spacing: '1.1px',
      align: 'right',
      weight: 700,
    });
  }

  drawCrewPanel(ctx, state) {
    const crew = state.crew;
    if (!crew) return;
    const x = 24;
    const y = 306;
    const width = 250;
    const height = 108;
    drawPanel(ctx, x, y, width, height, {
      cut: 10,
      fill: 'rgba(9,6,16,0.84)',
      stroke: 'rgba(247,232,210,0.18)',
      accent: 'rgba(63,224,207,0.65)',
    });
    label(ctx, 'CREW · SOLANO', x + 14, y + 18, { size: 10.5, color: GOLD, spacing: '1.5px', weight: 800 });
    label(ctx, '3 CONTACTS', x + width - 14, y + 18, {
      size: 10.5,
      color: 'rgba(247,232,210,0.44)',
      spacing: '0.9px',
      align: 'right',
      weight: 700,
    });
    const colors = [GOLD, TEAL, CORAL];
    crew.forEach((contact, index) => {
      const rowY = y + 38 + index * 25;
      const color = colors[index % colors.length];
      const status = String(contact.status ?? 'READY').toUpperCase();
      const statusColor = /EYES ON|READY|ON COMMS/.test(status)
        ? TEAL
        : /EN ROUTE|IN THE BAY/.test(status)
          ? GOLD
          : CORAL;
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 17, rowY - 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      label(ctx, contact.name, x + 26, rowY, { size: 12, color: CREAM, spacing: '0.8px', weight: 800 });
      label(ctx, status, x + width - 14, rowY, {
        size: 11,
        color: statusColor,
        spacing: '0.8px',
        align: 'right',
        weight: 800,
      });
      label(ctx, contact.role, x + 26, rowY + 11, {
        size: 10,
        color: 'rgba(247,232,210,0.5)',
        spacing: '1px',
        weight: 600,
      });
    });
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

  drawPoliceRoster(ctx, state) {
    const police = state.police;
    if (!police) return;
    const column = this.rightColumn(state);
    const { x, width, roster } = column;
    const y = column.rosterY;
    const height = column.rosterHeight;
    const wanted = police.wanted ?? 0;
    const accent = wanted > 0 ? CORAL : 'rgba(63,224,207,0.65)';
    drawPanel(ctx, x, y, width, height, {
      cut: 11,
      fill: 'rgba(9,6,16,0.84)',
      stroke: 'rgba(247,232,210,0.18)',
      accent,
    });
    label(ctx, 'HPD RESPONSE', x + 14, y + 20, {
      size: 10.5,
      color: wanted > 0 ? CORAL : TEAL,
      spacing: '1px',
      weight: 800,
    });
    const count = police.rosterCount ?? (police.roster?.length ?? 0);
    label(ctx, `— ${count} UNIT${count === 1 ? '' : 'S'} · ${wanted}★`, x + width - 14, y + 20, {
      size: 10.5,
      color: wanted > 0 ? GOLD : 'rgba(247,232,210,0.55)',
      spacing: '0.5px',
      align: 'right',
      weight: 800,
    });
    ctx.strokeStyle = 'rgba(247,232,210,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 28);
    ctx.lineTo(x + width - 14, y + 28);
    ctx.stroke();

    roster.forEach((entry, index) => {
      const rowY = y + 45 + index * 24;
      const color = roleColor(entry.role);
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = entry.kind === 'air' ? 0.95 : 0.8;
      ctx.fillRect(x + 14, rowY - 10, 3, 14);
      ctx.restore();
      label(ctx, entry.callsign ?? 'UNIT', x + 23, rowY, {
        size: 12,
        color: CREAM,
        spacing: '0.7px',
        weight: 800,
      });
      label(ctx, entry.role ?? 'PURSUIT', x + 83, rowY, {
        size: 11,
        color,
        spacing: '0.6px',
        weight: 800,
      });
      label(ctx, `${entry.distance ?? 0} m`, x + width - 14, rowY, {
        size: 11.5,
        color: GOLD,
        spacing: '0.5px',
        align: 'right',
        font: MONO,
        weight: 700,
      });
    });
    if (roster.length === 0) {
      label(ctx, 'NO UNITS IN THE AREA', x + 14, y + 45, {
        size: 10.5,
        color: 'rgba(247,232,210,0.5)',
        spacing: '0.8px',
        weight: 700,
      });
    }
    if (police.extra) {
      label(
        ctx,
        `+${police.extra.count} more unit${police.extra.count === 1 ? '' : 's'} · ${police.extra.hint}`,
        x + 14,
        y + height - 16,
        { size: 10, color: 'rgba(247,232,210,0.55)', spacing: '0.4px', weight: 700 },
      );
    } else if (wanted === 0) {
      label(ctx, 'PATROL SWEEP · NO ACTIVE BOLO', x + 14, y + height - 16, {
        size: 10,
        color: 'rgba(63,224,207,0.6)',
        spacing: '0.4px',
        weight: 700,
      });
    }
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
    ctx.font = `700 11px ${UI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2.4px';
    ctx.fillStyle = 'rgba(63,224,207,0.85)';
    ctx.fillText((reward.label || 'REWARD').toUpperCase(), cx, y + 19);
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
    label(ctx, 'MISSION FAILED', x + 22, y + 24, { size: 11, color: CORAL, spacing: '3px', weight: 800 });
    label(ctx, fail.title.toUpperCase(), x + 22, y + 51, { size: 23, color: CREAM, spacing: '1px', font: DISPLAY, weight: 900 });
    label(ctx, fail.reason, x + 22, y + 70, { size: 11, color: CREAM_DIM, spacing: '0.2px', weight: 500 });
    label(ctx, 'ENTER · RETRY      OR WALK INTO THE MARKER', x + width - 22, y + 91, {
      size: 10.5,
      color: GOLD,
      spacing: '1.2px',
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
    const radio = state.radio ?? {};
    const enabled = radio.enabled !== false;
    const offAir = radio.offAir === true;
    const fallback = radio.fallback === true;
    const status = !enabled ? 'RADIO OFF' : offAir ? 'OFF AIR' : fallback ? 'SYNTH' : 'ON AIR';
    const statusColor = !enabled ? 'rgba(247,232,210,0.4)' : offAir ? CORAL : fallback ? GOLD : TEAL;
    const right = this.width - 44;
    const y = this.height - 155;
    drawPanel(ctx, this.width - 28 - 228, y - 32, 228, 58, {
      cut: 8,
      fill: 'rgba(9,6,16,0.65)',
      stroke: 'rgba(247,232,210,0.13)',
      accent: statusColor,
    });
    label(ctx, (enabled ? (radio.station || 'Vega 105.1') : 'RADIO OFF').toUpperCase(), this.width - 252, y - 10, {
      size: 10,
      color: enabled ? TEAL : 'rgba(247,232,210,0.4)',
      spacing: '1.4px',
      weight: 700,
    });
    label(ctx, `${status} · ${radio.trackNumber ?? 1}/${radio.trackCount ?? 3}`, right, y - 10, {
      size: 10,
      color: statusColor,
      spacing: '0.8px',
      align: 'right',
      weight: 800,
    });
    label(
      ctx,
      enabled ? `${radio.artist ?? ''} — ${radio.track ?? ''}` : 'PRESS T TO TUNE IN',
      right,
      y + 6,
      { size: 10.5, color: 'rgba(247,232,210,0.5)', spacing: '0.3px', align: 'right', weight: 600 },
    );
  }

  drawWeaponStrip(ctx, state) {
    const weapons = state.weapons;
    if (!weapons || weapons.dead) return;
    const column = this.rightColumn(state);
    const { x, width } = column;
    const y = column.weaponsY;
    const height = column.weaponsHeight;
    drawPanel(ctx, x, y, width, height, {
      cut: 10,
      fill: 'rgba(9,6,16,0.84)',
      stroke: 'rgba(247,232,210,0.18)',
      accent: 'rgba(255,201,92,0.8)',
    });
    label(ctx, 'WEAPONS', x + 14, y + 19, { size: 10.5, color: GOLD, spacing: '1.5px', weight: 800 });
    label(ctx, '5 SLOTS', x + width - 14, y + 19, {
      size: 10.5,
      color: 'rgba(247,232,210,0.46)',
      spacing: '1px',
      align: 'right',
      weight: 700,
    });
    const loadout = weapons.loadout ?? [];
    loadout.slice(0, 5).forEach((slot, index) => {
      const rowY = y + 32 + index * 20;
      const centerY = rowY + 8;
      const active = (slot.key === weapons.key) && !slot.locked;
      if (active) {
        ctx.fillStyle = 'rgba(255,201,92,0.13)';
        ctx.fillRect(x + 8, rowY, width - 16, 18);
        ctx.fillStyle = GOLD;
        ctx.fillRect(x + 8, rowY, 3, 18);
      }
      const tone = active ? GOLD : slot.locked ? 'rgba(247,232,210,0.28)' : CREAM;
      drawWeaponIcon(ctx, slot.icon, x + 24, centerY, tone);
      const name = slot.locked ? `${slot.short ?? 'WEAPON'} · LOCKED` : slot.name.toUpperCase();
      label(ctx, name, x + 40, centerY + 4, {
        size: 11.5,
        color: slot.locked ? 'rgba(247,232,210,0.42)' : active ? CREAM : 'rgba(247,232,210,0.8)',
        spacing: '0.4px',
        weight: active ? 800 : 700,
      });
      let ammoText = '—';
      if (slot.melee) ammoText = '--';
      else if (!slot.locked) ammoText = `${slot.ammo ?? 0}/${slot.reserve ?? 0}`;
      label(ctx, ammoText, x + width - 14, centerY + 4, {
        size: slot.melee ? 13 : 11,
        color: slot.locked ? 'rgba(247,232,210,0.34)' : active ? GOLD : 'rgba(247,232,210,0.64)',
        spacing: '0.4px',
        align: 'right',
        font: MONO,
        weight: 700,
      });
    });
    if (weapons.reloading) {
      label(ctx, 'RELOADING', x + 14, y + height - 7, {
        size: 10,
        color: TEAL,
        spacing: '1.2px',
        weight: 800,
      });
    } else if (weapons.melee) {
      label(ctx, 'STREET KNIFE · CQC', x + width - 14, y + height - 7, {
        size: 10.5,
        color: GOLD,
        spacing: '0.8px',
        align: 'right',
        weight: 800,
      });
    } else {
      label(ctx, weapons.ownedSmg ? '1 / 2 SELECT · R RELOAD' : '1 SELECT · R RELOAD', x + width - 14, y + height - 7, {
        size: 10.5,
        color: 'rgba(247,232,210,0.4)',
        spacing: '0.6px',
        align: 'right',
        weight: 700,
      });
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

  drawVehicleCard(ctx, state) {
    const player = state.player;
    const car = state.vehicle;
    const column = this.rightColumn(state);
    const { x, width } = column;
    const y = column.vehicleY;
    const height = column.vehicleHeight;
    drawPanel(ctx, x, y, width, height, { cut: 11, accent: TEAL });
    const speed = car ? car.speedKmh : player.speedKmh;
    const gear = car ? car.gear : '—';
    const condition = car ? Math.max(0, Math.min(1, car.condition ?? 1)) : 0;
    const conditionPct = Math.round(condition * 100);
    const damagePct = Math.max(0, 100 - conditionPct);
    const conditionColor = condition >= 0.6 ? TEAL : condition >= 0.3 ? GOLD : CORAL;
    label(ctx, car ? 'VEHICLE' : 'ON FOOT', x + 14, y + 18, {
      size: 10.5,
      color: car ? TEAL : 'rgba(247,232,210,0.55)',
      spacing: '1.5px',
      weight: 800,
    });
    label(ctx, car ? `${conditionPct}% CONDITION` : 'NO VEHICLE', x + width - 14, y + 18, {
      size: 10,
      color: car ? conditionColor : 'rgba(247,232,210,0.46)',
      spacing: '0.7px',
      align: 'right',
      weight: 800,
    });

    label(ctx, car ? car.name.toUpperCase() : 'RAE SOLANO', x + 14, y + 38, {
      size: 15,
      color: CREAM,
      spacing: '0.9px',
      weight: 800,
      font: DISPLAY,
    });
    label(ctx, car ? `${car.className} · ${car.tune}` : 'HARBOR COURIER · ON FOOT', x + 14, y + 53, {
      size: 11,
      color: 'rgba(63,224,207,0.8)',
      spacing: '0.6px',
      weight: 700,
    });

    chamferPath(ctx, x + 14, y + 63, 38, 32, 6);
    ctx.fillStyle = 'rgba(247,232,210,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(63,224,207,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.font = `900 19px ${DISPLAY}`;
    ctx.fillStyle = GOLD;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gear, x + 33, y + 79);
    ctx.restore();
    label(ctx, 'GEAR', x + 33, y + 104, { size: 10, color: 'rgba(247,232,210,0.44)', spacing: '0.8px', align: 'center', weight: 700 });

    if (car) {
      const fuel = Math.max(0, Math.min(1, car.fuel ?? 1));
      const fuelColor = fuel >= 0.3 ? TEAL : fuel >= LOW_FUEL ? GOLD : CORAL;
      label(ctx, `${fuelPct(fuel)}% FUEL`, x + 66, y + 70, {
        size: 9.5, color: fuelColor, spacing: '0.6px', weight: 800,
      });
      ctx.fillStyle = 'rgba(247,232,210,0.1)';
      ctx.fillRect(x + 66, y + 76, 84, 5);
      ctx.fillStyle = fuelColor;
      ctx.fillRect(x + 66, y + 76, 84 * fuel, 5);
    }

    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = `900 38px ${DISPLAY}`;
    ctx.fillStyle = CREAM;
    ctx.fillText(String(Math.round(speed)), x + width - 14, y + 90);
    ctx.restore();
    label(ctx, 'KM/H', x + width - 14, y + 102, { size: 10, color: 'rgba(247,232,210,0.5)', spacing: '1.2px', align: 'right', weight: 700 });

    const barX = x + 14;
    const barY = y + 110;
    const barWidth = width - 28;
    const level = car ? condition : Math.min(1, Math.abs(player.speedKmh) / 32);
    ctx.fillStyle = 'rgba(247,232,210,0.1)';
    ctx.fillRect(barX, barY, barWidth, 6);
    ctx.fillStyle = car ? conditionColor : TEAL;
    ctx.fillRect(barX, barY, barWidth * Math.max(0, Math.min(1, level)), 6);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(barX, barY, barWidth * Math.max(0, Math.min(1, level)), 1);

    label(ctx, car ? `${damagePct}% DMG · ${conditionPct}% BODY` : (player.nearVehicle ? 'VEHICLE IN REACH' : 'STREETS OPEN'), x + 14, y + 127, {
      size: 10.5,
      color: car ? 'rgba(247,232,210,0.58)' : player.nearVehicle ? GOLD : 'rgba(247,232,210,0.44)',
      spacing: '0.4px',
      weight: 700,
    });
    label(ctx, car ? `GEAR ${gear} · ENGINE ${Math.min(99, Math.round((car.engineRpm / 6400) * 100))}%` : 'FOOT MOBILITY', x + width - 14, y + 127, {
      size: 10,
      color: 'rgba(247,232,210,0.45)',
      spacing: '0.4px',
      align: 'right',
      weight: 700,
    });

    ctx.strokeStyle = 'rgba(247,232,210,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 132);
    ctx.lineTo(x + width - 14, y + 132);
    ctx.stroke();

    const radio = state.radio ?? {};
    const enabled = radio.enabled !== false;
    const offAir = radio.offAir === true;
    const fallback = radio.fallback === true;
    const status = !enabled ? 'RADIO OFF' : offAir ? 'OFF AIR' : fallback ? 'SYNTH' : 'ON AIR';
    const statusColor = !enabled ? 'rgba(247,232,210,0.44)' : offAir ? CORAL : fallback ? GOLD : TEAL;
    const count = `${radio.trackNumber ?? 1}/${radio.trackCount ?? 3}`;
    const stationText = truncateText(ctx, enabled ? String(radio.station ?? 'Vega 105.1').toUpperCase() : 'RADIO OFF', width - 106, `800 11px ${UI}`);
    label(ctx, stationText, x + 14, y + 145, {
      size: 11,
      color: enabled ? GOLD : 'rgba(247,232,210,0.44)',
      spacing: '1px',
      weight: 800,
    });
    label(ctx, `${status} · ${count}`, x + width - 14, y + 145, {
      size: 10,
      color: statusColor,
      spacing: '0.6px',
      align: 'right',
      weight: 800,
    });
    const line = enabled
      ? `${radio.artist ?? ''} — ${radio.track ?? ''}`.replace(/^ — /, '')
      : 'PRESS T TO TUNE IN · HOLD TAB';
    label(ctx, truncateText(ctx, line, width - 28, `600 10.5px ${UI}`), x + 14, y + 157, {
      size: 10.5,
      color: enabled ? 'rgba(247,232,210,0.66)' : 'rgba(63,224,207,0.6)',
      spacing: '0.3px',
      weight: 600,
    });
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
    ctx.font = `600 11px ${UI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2.2px';
    ctx.fillStyle = 'rgba(63,224,207,0.8)';
    ctx.fillText(toast.sub, cx, y + 19);
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
