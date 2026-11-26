import { PALETTE } from '../config.js';

export const DISPLAY = '"Bahnschrift SemiCondensed", "Bahnschrift", "Arial Narrow", sans-serif';
export const UI = '"Bahnschrift", "Segoe UI", sans-serif';
export const MONO = '"Consolas", "Courier New", monospace';

export const CREAM = PALETTE.cream;
export const CREAM_DIM = 'rgba(247, 232, 210, 0.55)';
export const CORAL = PALETTE.coral;
export const TEAL = PALETTE.teal;
export const GOLD = PALETTE.gold;
export const INK = 'rgba(10, 7, 18, 0.72)';
export const INK_DEEP = 'rgba(10, 7, 18, 0.88)';
export const LINE = 'rgba(247, 232, 210, 0.17)';

export function chamferPath(ctx, x, y, width, height, cut = 12) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + height - cut);
  ctx.lineTo(x + width - cut, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

export function drawPanel(ctx, x, y, width, height, { cut = 12, fill = INK, stroke = LINE, accent = null } = {}) {
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

export function starPath(ctx, cx, cy, radius) {
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

export function label(ctx, text, x, y, { size = 10, color = CREAM_DIM, spacing = '2px', align = 'left', font = UI, weight = 600 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function cashString(value) {
  return `$ ${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;
}

export function timerString(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

export function speakerColor(speaker) {
  const name = String(speaker ?? '').toUpperCase();
  if (name.includes('VALE')) return '#7fa8ff';
  if (name.startsWith('TOMAS') || name.startsWith('AURELIO')) return CORAL;
  if (name.startsWith('MIRA')) return GOLD;
  if (name.startsWith('RAE')) return TEAL;
  return TEAL;
}

export function speakerDisplayName(speaker) {
  const name = String(speaker ?? 'RAE').toUpperCase();
  if (name === 'MIRA') return 'MIRA SOL';
  if (name.includes('VALE')) return 'SGT. VALE';
  return name;
}

export function speakerRole(speaker) {
  const name = String(speaker ?? '').toUpperCase();
  if (name.includes('VALE')) return 'HPD DISPATCH';
  if (name === 'MIRA') return 'FIXER · VEGA STRIP';
  if (name.startsWith('RAE')) return 'COURIER · SOLANO CREW';
  if (name.startsWith('TOMAS')) return 'SOLANO CREW · LUNA PLAZA';
  if (name.startsWith('AURELIO')) return 'SOLANO PATRIARCH';
  return 'NEON HARBOR';
}

export function truncateText(ctx, text, maxWidth, font) {
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

export function wrapText(ctx, text, maxWidth, font, maxLines = 2) {
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

export function roleColor(role) {
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

export function drawPortrait(ctx, x, y, size, speaker) {
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

export function drawWeaponIcon(ctx, kind, x, y, tone) {
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

export function drawRotorIcon(ctx, cx, cy, radius, color) {
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

export function drawBar(ctx, x, y, width, height, value, color, highlight) {
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
