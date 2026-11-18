// The whole interface, painted on a 2D canvas over the 3D view: health and armour, rolling cash,
// wanted stars, weapon and ammo, a rotating-arrow minimap with the road grid and blips, mission
// title and objective, speedometer, radio, subtitles and dialogue portraits, toasts, the damage
// vignette, the title screen, pause and controls, busted/wasted and the epilogue card.
// Everything is drawn at 720 units of height and scaled to the window, so the layout holds at any
// size (the screenshots are 1280x480).
import { CITY } from './config.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function star(ctx, cx, cy, radius, filled, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? radius : radius * 0.44;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

function formatMoney(value) {
  return Math.floor(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function createHud(canvasElement, world) {
  const surface = canvasElement ?? document.createElement('canvas');
  const ctx = surface.getContext('2d');
  let view = { scale: 1, width: 1280, height: 720 };
  let cashShown = 0;
  let initialized = false;
  let toastList = [];
  let clock = 0;

  function resize() {
    if (fixed) { applySize(fixed.width, fixed.height); return; }
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    applySize(Math.max(1, Math.round(window.innerWidth * ratio)), Math.max(1, Math.round(window.innerHeight * ratio)));
  }
  let fixed = null;
  function applySize(width, height) {
    if (surface.width === width && surface.height === height) return;
    surface.width = width;
    surface.height = height;
    const scale = height / 720;
    view = { scale, width: width / scale, height: 720 };
  }
  resize();
  window.addEventListener('resize', resize);

  function setSize(width, height) {
    fixed = { width, height };
    applySize(width, height);
  }

  function text(value, x, y, size, color, align = 'left', weight = 700) {
    // A few call sites pass the weight where the alignment goes; take that gracefully.
    if (typeof align === 'number') { weight = align; align = 'left'; }
    ctx.font = `${weight} ${size}px "Arial Narrow", Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function neon(value, x, y, size, color, blur = 18) {
    ctx.save();
    ctx.font = `800 ${size}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
    ctx.shadowBlur = blur * 0.35;
    ctx.fillStyle = '#fff8f0';
    ctx.globalAlpha = 0.92;
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function bar(x, y, width, height, value, color, back = 'rgba(10,8,14,0.55)') {
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = back;
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, y, width, height, height / 2);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * clamp(value, 0, 1), height);
    ctx.restore();
    roundRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, height / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawPortrait(cast, x, y, size, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    roundRect(ctx, x, y, size, size, 10);
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, '#2a2136');
    gradient.addColorStop(1, '#161020');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = cast.accent ?? '#ff5f9e';
    ctx.lineWidth = 2;
    ctx.stroke();
    const cx = x + size / 2;
    const headR = size * 0.19;
    // Shoulders.
    ctx.beginPath();
    ctx.ellipse(cx, y + size * 0.95, size * 0.34, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = cast.jacket;
    ctx.fill();
    // Neck and head.
    ctx.fillStyle = cast.skin;
    ctx.fillRect(cx - size * 0.07, y + size * 0.58, size * 0.14, size * 0.14);
    ctx.beginPath();
    ctx.ellipse(cx, y + size * 0.46, headR * 0.88, headR, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hair.
    ctx.beginPath();
    ctx.ellipse(cx, y + size * 0.36, headR * 0.95, headR * 0.7, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = cast.hair;
    ctx.fill();
    ctx.fillRect(cx - headR * 0.95, y + size * 0.34, headR * 1.9, size * 0.05);
    // Eyes and mouth.
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(cx - headR * 0.55, y + size * 0.47, headR * 0.34, size * 0.012);
    ctx.fillRect(cx + headR * 0.2, y + size * 0.47, headR * 0.34, size * 0.012);
    ctx.fillStyle = 'rgba(160,70,80,0.9)';
    ctx.fillRect(cx - headR * 0.22, y + size * 0.55, headR * 0.44, size * 0.014);
    // Collar accent.
    ctx.strokeStyle = cast.accent ?? '#ff5f9e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.2, y + size * 0.86);
    ctx.lineTo(cx, y + size * 0.98);
    ctx.lineTo(cx + size * 0.2, y + size * 0.86);
    ctx.stroke();
    ctx.restore();
  }

  function drawWanted(stars, x, y, size) {
    for (let i = 0; i < 5; i += 1) {
      star(ctx, x + i * size * 1.15, y, size * 0.5, i < stars, i < stars ? '#ffd45e' : null);
    }
  }

  function drawMinimap(state, cx, cy, radius) {
    const player = state.player;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#171320';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    const scale = radius / 190;
    const toX = (x) => cx + (x - player.pos.x) * scale;
    const toY = (z) => cy + (z - player.pos.z) * scale;
    // Beach and water.
    ctx.fillStyle = '#1c3a44';
    ctx.fillRect(toX(CITY.waterEdge), cy - radius, radius * 3, radius * 2);
    ctx.fillStyle = '#a0805a';
    ctx.fillRect(toX(CITY.beachEdge), cy - radius, (CITY.waterEdge - CITY.beachEdge) * scale, radius * 2);
    // Streets.
    ctx.strokeStyle = '#5a5266';
    ctx.lineWidth = Math.max(3, CITY.roadWidth * scale);
    for (const line of CITY.lines) {
      ctx.beginPath();
      ctx.moveTo(toX(line), cy - radius);
      ctx.lineTo(toX(line), cy + radius);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - radius, toY(line));
      ctx.lineTo(cx + radius, toY(line));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (const line of CITY.lines) {
      ctx.beginPath();
      ctx.moveTo(toX(line), cy - radius);
      ctx.lineTo(toX(line), cy + radius);
      ctx.stroke();
    }
    // Mission route.
    if (state.missionMarker && state.missionMarker.visible) {
      const mx = toX(state.missionMarker.x), my = toY(state.missionMarker.z);
      ctx.strokeStyle = 'rgba(94,242,214,0.7)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#5ef2d6';
      ctx.fill();
    }
    // Traffic and police blips.
    for (const car of state.cars ?? []) {
      if (Math.abs(car.pos.x - player.pos.x) * scale > radius) continue;
      if (car.police) {
        ctx.fillStyle = Math.floor(clock * 6) % 2 ? '#5a8cff' : '#ff3b48';
        ctx.beginPath();
        ctx.arc(toX(car.pos.x), toY(car.pos.z), 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (Math.abs(car.speed) > 1 && !car.isPlayer) {
        ctx.fillStyle = 'rgba(230,225,210,0.45)';
        ctx.fillRect(toX(car.pos.x) - 1.5, toY(car.pos.z) - 1.5, 3, 3);
      }
    }
    // Player arrow.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-player.heading);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Ring, north marker and zone label.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(9,7,14,0.55)';
    ctx.lineWidth = 5;
    ctx.stroke();
    text('N', cx, cy - radius - 8, 15, '#ffd45e', 'center', 800);
    text('NEON HARBOR', cx, cy + radius + 22, 13, 'rgba(255,255,255,0.55)', 'center', 700);
  }

  function drawSpeedometer(state) {
    const car = state.player.car;
    if (!car) return;
    const w = view.width;
    const x = w - 150;
    const y = 560;
    const speed = Math.abs(car.speed) * 3.6;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 74, Math.PI * 0.75, Math.PI * 2.25);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 10;
    ctx.stroke();
    const maxSpeed = car.spec.top * 3.6;
    const fraction = clamp(speed / maxSpeed, 0, 1);
    ctx.beginPath();
    ctx.arc(x, y, 74, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * fraction));
    const gradient = ctx.createLinearGradient(x - 70, y, x + 70, y);
    gradient.addColorStop(0, '#5ef2d6');
    gradient.addColorStop(0.7, '#ffd45e');
    gradient.addColorStop(1, '#ff3d5e');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 10;
    ctx.stroke();
    text(String(Math.round(speed)), x, y + 14, 44, '#ffffff', 'center', 800);
    text('KM/H', x, y + 34, 12, 'rgba(255,255,255,0.6)', 'center', 700);
    text(car.spec.name.toUpperCase(), x, y + 56, 12, 'rgba(255,255,255,0.55)', 'center', 700);
    const health = clamp(car.health / car.maxHealth, 0, 1);
    bar(x - 66, y + 66, 132, 5, health, health > 0.5 ? '#5ef2d6' : health > 0.22 ? '#ffd45e' : '#ff3d5e');
    ctx.restore();
  }

  function drawVignette(state) {
    const player = state.player;
    const hurt = clamp(player.hurtFlash ?? 0, 0, 1);
    const low = player.health < 30 ? (Math.sin(clock * 5) * 0.5 + 0.5) * 0.25 : 0;
    const strength = Math.max(hurt * 0.55, low);
    if (strength <= 0.01) return;
    const gradient = ctx.createRadialGradient(view.width / 2, 360, 160, view.width / 2, 360, 760);
    gradient.addColorStop(0, 'rgba(120,0,10,0)');
    gradient.addColorStop(0.65, `rgba(140,0,16,${strength * 0.5})`);
    gradient.addColorStop(1, `rgba(90,0,8,${strength})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, view.width, 720);
  }

  function drawPlay(state) {
    const player = state.player;
    const w = view.width;
    // Top-left identity and vitals.
    ctx.save();
    roundRect(ctx, 20, 18, 300, 88, 6);
    ctx.fillStyle = 'rgba(9,7,14,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(56, 62, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#1f6f6a';
    ctx.fill();
    ctx.strokeStyle = '#ff5f9e';
    ctx.lineWidth = 2;
    ctx.stroke();
    text('R', 56, 70, 24, '#ffffff', 'center', 800);
    text('RAE SOLANO', 92, 46, 15, '#ffffff', 700);
    text(state.clockText ?? '19:42', 92, 64, 12, 'rgba(255,255,255,0.5)', 600);
    bar(92, 72, 150, 8, player.health / player.maxHealth, '#5ef2d6');
    bar(92, 86, 110, 5, player.armor / player.maxArmor, '#5bb8ff');
    bar(206, 86, 36, 5, clamp(player.weapons[player.weapon].clip === Infinity ? 1 : player.weapons[player.weapon].clip / (player.weapon === 'smg' ? 30 : 12), 0, 1), '#ffd45e');
    ctx.restore();

    // Cash, wanted stars and weapon.
    const cash = player.cash;
    if (!initialized) { cashShown = cash; initialized = true; }
    cashShown += (cash - cashShown) * 0.12;
    if (Math.abs(cash - cashShown) < 0.5) cashShown = cash;
    text(`$${formatMoney(cashShown)}`, w - 24, 48, 34, '#7dffb0', 'right', 800);
    drawWanted(state.wanted ?? 0, w - 24 - 4 * 27 - 11, 70, 22);
    // Weapon card.
    ctx.save();
    roundRect(ctx, w - 168, 86, 144, 54, 6);
    ctx.fillStyle = 'rgba(9,7,14,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.stroke();
    ctx.fillStyle = '#d8d3c8';
    if (player.weapon === 'fists') {
      ctx.fillRect(w - 148, 104, 14, 20);
      ctx.fillRect(w - 132, 104, 14, 20);
    } else {
      ctx.fillRect(w - 150, 104, 42, 7);
      ctx.fillRect(w - 142, 111, 8, 16);
      if (player.weapon === 'smg') { ctx.fillRect(w - 118, 108, 10, 21); ctx.fillRect(w - 126, 118, 26, 6); }
    }
    const weaponDef = player.weapons[player.weapon];
    const label = player.weapon === 'fists' ? 'FISTS' : `${player.weapon.toUpperCase()}  ${weaponDef.clip} / ${weaponDef.reserve}`;
    text(label, w - 36, 124, 14, '#ffffff', 'right', 700);
    if (player.reloadTimer > 0) text('RELOADING', w - 36, 140, 10, '#ffd45e', 'right', 700);
    ctx.restore();

    // Minimap and mission panel.
    drawMinimap(state, 128, 596, 100);
    const mission = state.mission;
    if (mission && mission.active && mission.objective) {
      ctx.save();
      roundRect(ctx, 246, 546, 420, 78, 6);
      const panel = ctx.createLinearGradient(246, 0, 666, 0);
      panel.addColorStop(0, 'rgba(9,7,14,0.72)');
      panel.addColorStop(1, 'rgba(9,7,14,0.1)');
      ctx.fillStyle = panel;
      ctx.fill();
      ctx.fillStyle = '#5ef2d6';
      ctx.fillRect(246, 546, 4, 78);
      text(mission.title ?? 'MISSION', 262, 572, 17, '#5ef2d6', 800);
      const objective = mission.objective;
      const clipped = objective.length > 58 ? `${objective.slice(0, 57)}…` : objective;
      text(clipped, 262, 597, 15, '#ffffff', 600);
      if (mission.timeLeft !== undefined && mission.timeLeft > 0) {
        text(`${Math.ceil(mission.timeLeft)}s`, 650, 597, 15, '#ffd45e', 'right', 800);
      }
      ctx.restore();
    }
    // Prompt.
    if (state.prompt) {
      ctx.save();
      const width = Math.min(520, ctx.measureText(state.prompt).width + 120);
      roundRect(ctx, w / 2 - width / 2, 560, width, 34, 6);
      ctx.fillStyle = 'rgba(9,7,14,0.7)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(94,242,214,0.4)';
      ctx.stroke();
      text(state.prompt, w / 2, 583, 15, '#ffffff', 'center', 700);
      ctx.restore();
    }
    drawSpeedometer(state);
    // Radio.
    text(state.radioName ?? '', w - 24, 690, 13, 'rgba(255,255,255,0.55)', 'right', 700);
    // Crosshair.
    if (player.aiming) {
      const cx = w / 2, cy = 360;
      ctx.save();
      ctx.strokeStyle = 'rgba(10,8,14,0.85)';
      ctx.lineWidth = 4;
      for (const [dx, dy] of [[0, -14], [0, 14], [-14, 0], [14, 0]]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * 0.45, cy + dy * 0.45);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 2;
      for (const [dx, dy] of [[0, -14], [0, 14], [-14, 0], [14, 0]]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * 0.45, cy + dy * 0.45);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5f9e';
      ctx.fill();
      ctx.restore();
    }
    drawVignette(state);
    drawToasts(state);
    drawSubtitles(state);
  }

  function drawToasts(state) {
    let index = 0;
    for (const toast of (state.toasts ?? []).slice(-4)) {
      const alpha = clamp(toast.time, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '700 15px "Arial Narrow", Arial, sans-serif';
      const width = ctx.measureText(toast.text).width + 48;
      roundRect(ctx, view.width - 24 - width, 150 + index * 38, width, 30, 5);
      ctx.fillStyle = 'rgba(9,7,14,0.78)';
      ctx.fill();
      ctx.fillStyle = 'rgba(94,242,214,0.55)';
      ctx.fillRect(view.width - 24 - width, 150 + index * 38, 3, 30);
      text(toast.text, view.width - 24 - width + 18, 170 + index * 38, 15, '#ffffff', 'left', 700);
      ctx.restore();
      index += 1;
    }
  }

  function drawSubtitles(state) {
    const dialogue = state.dialogue;
    if (dialogue) {
      const line = dialogue.lines[dialogue.index];
      if (!line) return;
      const w = view.width;
      const boxW = Math.min(760, w - 260);
      const x = w / 2 - boxW / 2;
      const y = 470;
      ctx.save();
      roundRect(ctx, x, y, boxW, 108, 8);
      ctx.fillStyle = 'rgba(8,6,12,0.86)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,95,158,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawPortrait(line.who, x + 12, y + 12, 84);
      text(line.who.name.toUpperCase(), x + 110, y + 32, 14, line.who.accent ?? '#ff5f9e', 800);
      // Word-wrapped line.
      ctx.font = '600 17px "Arial Narrow", Arial, sans-serif';
      ctx.fillStyle = '#f4efe6';
      const words = line.text.split(' ');
      let row = '';
      let rowY = y + 58;
      for (const word of words) {
        const test = row ? `${row} ${word}` : word;
        if (ctx.measureText(test).width > boxW - 140) {
          ctx.fillText(row, x + 110, rowY);
          row = word;
          rowY += 22;
        } else row = test;
      }
      ctx.fillText(row, x + 110, rowY);
      text('SPACE / CLICK', x + boxW - 16, y + 32, 11, 'rgba(255,255,255,0.4)', 'right', 700);
      ctx.restore();
    }
    // Police alert band.
    if (state.alert) {
      ctx.save();
      const alpha = clamp(state.alert.time, 0, 1);
      ctx.globalAlpha = alpha;
      const width = 460;
      roundRect(ctx, view.width / 2 - width / 2, 122, width, 34, 5);
      ctx.fillStyle = 'rgba(70,8,16,0.8)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,90,0.7)';
      ctx.stroke();
      text(state.alert.text, view.width / 2, 145, 15, '#ffdfe0', 'center', 800);
      ctx.restore();
    }
  }

  function drawTitle(state) {
    const w = view.width;
    // Left-to-right dark gradient so the logo reads over the city.
    const shade = ctx.createLinearGradient(0, 0, w * 0.78, 0);
    shade.addColorStop(0, 'rgba(5,3,9,0.94)');
    shade.addColorStop(0.42, 'rgba(6,4,11,0.72)');
    shade.addColorStop(0.62, 'rgba(7,5,12,0.3)');
    shade.addColorStop(1, 'rgba(7,5,12,0.02)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, 720);
    // Horizon wash.
    const glow = ctx.createLinearGradient(0, 300, 0, 720);
    glow.addColorStop(0, 'rgba(255,110,80,0)');
    glow.addColorStop(1, 'rgba(255,90,60,0.14)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 300, w, 420);
    // A smoked panel behind the logo and menu keeps both readable over lit windows.
    ctx.save();
    const panel = ctx.createLinearGradient(40, 0, 610, 0);
    panel.addColorStop(0, 'rgba(6,4,10,0.86)');
    panel.addColorStop(0.7, 'rgba(6,4,10,0.66)');
    panel.addColorStop(1, 'rgba(6,4,10,0)');
    ctx.fillStyle = panel;
    ctx.fillRect(40, 120, 580, 570);
    ctx.restore();
    neon('NEON', 92, 258, 128, '#ff3d8b', 26);
    neon('HARBOR', 86, 372, 128, '#28e0d0', 26);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(92, 400, 380, 2);
    text('A CITY ON THE TAKE', 94, 430, 15, 'rgba(255,255,255,0.72)', 700);
    ctx.restore();
    const menu = state.menu ?? [];
    menu.forEach((item, index) => {
      const y = 492 + index * 44;
      const selected = index === state.menuIndex;
      if (selected) {
        ctx.save();
        roundRect(ctx, 88, y - 24, 372, 36, 4);
        ctx.fillStyle = 'rgba(94,242,214,0.12)';
        ctx.fill();
        ctx.fillStyle = '#5ef2d6';
        ctx.fillRect(88, y - 24, 4, 36);
        ctx.restore();
      }
      text(item.label, 108, y, 22, item.disabled ? 'rgba(255,255,255,0.25)' : selected ? '#ffffff' : 'rgba(255,255,255,0.72)', 800);
      if (item.value) text(item.value, 424, y, 16, selected ? '#5ef2d6' : 'rgba(255,255,255,0.5)', 'left', 700);
    });
    text('ENTER / CLICK  SELECT        UP / DOWN  MOVE        ESC  BACK', 94, 690, 13, 'rgba(255,255,255,0.45)', 'left', 600);
    // Credits corner.
    text('SOLANO IMPORTS · PIER 9 · VEGA HEIGHTS', w - 24, 690, 12, 'rgba(255,255,255,0.35)', 'right', 600);
    text('© NEON HARBOR', w - 24, 44, 12, 'rgba(255,255,255,0.3)', 'right', 600);
  }

  function drawPaused(state) {
    ctx.fillStyle = 'rgba(6,4,10,0.72)';
    ctx.fillRect(0, 0, view.width, 720);
    neon('PAUSED', 92, 200, 72, '#28e0d0', 20);
    text('NEON HARBOR', 96, 236, 15, 'rgba(255,255,255,0.5)', 700);
    (state.menu ?? []).forEach((item, index) => {
      const y = 320 + index * 46;
      const selected = index === state.menuIndex;
      if (selected) {
        roundRect(ctx, 88, y - 26, 320, 38, 4);
        ctx.fillStyle = 'rgba(94,242,214,0.12)';
        ctx.fill();
        ctx.fillStyle = '#5ef2d6';
        ctx.fillRect(88, y - 26, 4, 38);
      }
      text(item.label, 108, y, 22, selected ? '#ffffff' : 'rgba(255,255,255,0.55)', 800);
      if (item.value) text(item.value, 410, y, 16, selected ? '#5ef2d6' : 'rgba(255,255,255,0.4)', 'left', 700);
    });
    text('ESC  RESUME        ENTER  SELECT', 92, 690, 13, 'rgba(255,255,255,0.45)', 'left', 600);
  }

  function drawControls() {
    ctx.fillStyle = 'rgba(6,4,10,0.88)';
    ctx.fillRect(0, 0, view.width, 720);
    neon('CONTROLS', 92, 130, 54, '#ff3d8b', 16);
    const rows = [
      ['W A S D', 'Walk / drive / steer'],
      ['SHIFT', 'Sprint'],
      ['SPACE', 'Jump · handbrake in a car'],
      ['MOUSE', 'Look · right button aims'],
      ['LEFT CLICK', 'Shoot · punch'],
      ['R', 'Reload'],
      ['Q / 1 / 2', 'Switch weapon'],
      ['F / E', 'Enter or exit a car · carjack'],
      ['H', 'Horn'],
      ['P / ESC', 'Pause · save'],
      ['ENTER', 'Confirm · skip dialogue'],
    ];
    rows.forEach(([key, label], index) => {
      const y = 190 + index * 38;
      text(key, 100, y, 18, '#5ef2d6', 800);
      text(label, 340, y, 18, 'rgba(255,255,255,0.75)', 600);
    });
    text('ESC  BACK', 100, 690, 13, 'rgba(255,255,255,0.45)', 600);
  }

  function drawEndCard(state) {
    const dark = ctx.createRadialGradient(view.width / 2, 320, 80, view.width / 2, 320, 900);
    dark.addColorStop(0, 'rgba(8,4,10,0.6)');
    dark.addColorStop(1, 'rgba(4,2,6,0.94)');
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, view.width, 720);
    const busted = state.mode === 'busted';
    neon(busted ? 'BUSTED' : 'WASTED', view.width / 2 - 180, 300, 96, busted ? '#5a8cff' : '#ff3d48', 26);
    text(busted ? 'Rourke read you your rights. The harbor forgets nobody.' : 'The harbor takes another courier.', view.width / 2, 350, 18, 'rgba(255,255,255,0.72)', 'center', 600);
    text(`CASH  $${formatMoney(state.player.cash)}`, view.width / 2, 420, 20, '#7dffb0', 'center', 800);
    if (state.respawn > 0) text(`GETTING UP IN ${Math.ceil(state.respawn)}…`, view.width / 2, 480, 16, 'rgba(255,255,255,0.6)', 'center', 700);
  }

  function drawFailed(state) {
    ctx.fillStyle = 'rgba(8,4,10,0.8)';
    ctx.fillRect(0, 0, view.width, 720);
    neon('MISSION FAILED', 92, 260, 62, '#ff6a4a', 20);
    text(state.mission.failed.reason, 96, 310, 20, '#ffffff', 600);
    text('ENTER  RETRY', 96, 400, 22, '#5ef2d6', 800);
    text('ESC  QUIT TO TITLE', 96, 440, 16, 'rgba(255,255,255,0.5)', 600);
  }

  function drawEpilogue(state) {
    ctx.fillStyle = 'rgba(5,3,8,0.9)';
    ctx.fillRect(0, 0, view.width, 720);
    neon('THE HARBOR REMEMBERS', 92, 220, 56, '#28e0d0', 22);
    text('Rae Solano put the ledger in the bilge and the Solano name back on the waterfront.', 96, 280, 18, 'rgba(255,255,255,0.8)', 600);
    text('Inspector Rourke is swimming. The pier is quiet. For now.', 96, 310, 18, 'rgba(255,255,255,0.6)', 600);
    text(`JOBS DONE  4 / 4        CASH  $${formatMoney(state.player.cash)}`, 96, 380, 22, '#7dffb0', 800);
    text('THANKS FOR PLAYING NEON HARBOR', 96, 440, 16, 'rgba(255,255,255,0.5)', 700);
    text('ENTER  BACK TO TITLE', 96, 640, 18, '#5ef2d6', 800);
  }

  function drawLoading(state) {
    ctx.fillStyle = '#0b0713';
    ctx.fillRect(0, 0, view.width, 720);
    const cx = view.width / 2;
    neon('NEON HARBOR', cx - 260, 320, 72, '#ff3d8b', 22);
    text('BUILDING THE CITY', cx, 380, 15, 'rgba(255,255,255,0.55)', 'center', 700);
    const progress = clamp(state.loading ?? 0, 0, 1);
    roundRect(ctx, cx - 220, 410, 440, 6, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    roundRect(ctx, cx - 220, 410, 440 * progress, 6, 3);
    ctx.fillStyle = '#5ef2d6';
    ctx.fill();
    const steps = ['paving the avenues', 'raising the towers', 'lighting the neon', 'waking the traffic', 'warming the engine'];
    text(steps[Math.min(steps.length - 1, Math.floor(progress * steps.length))], cx, 450, 13, 'rgba(255,255,255,0.4)', 'center', 600);
  }

  function draw(state) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, surface.width, surface.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    clock = state.time ?? clock + 1 / 60;
    const mode = state.mode;
    if (mode === 'loading') { drawLoading(state); return; }
    if (mode === 'title') { drawTitle(state); return; }
    if (mode === 'controls') { drawControls(); return; }
    if (mode === 'paused') { drawPaused(state); return; }
    if (mode === 'busted' || mode === 'wasted') { drawEndCard(state); return; }
    if (mode === 'epilogue') { drawEpilogue(state); return; }
    drawPlay(state);
    if (mode === 'failed') drawFailed(state);
  }

  return { draw, resize, setSize, surface, get view() { return view; }, cashShown: () => cashShown };
}
