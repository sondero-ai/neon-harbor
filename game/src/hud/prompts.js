import { RADIO } from '../config.js';
import {
  CREAM, CREAM_DIM, CORAL, TEAL, GOLD,
  DISPLAY, UI, MONO,
  chamferPath, drawPanel, label, truncateText,
} from './draw-utils.js';

export function drawCrosshair(hud, ctx, state) {
  const weapons = state.weapons;
  if (!weapons || weapons.dead || state.player.driving) return;
  const cx = hud.width / 2;
  const cy = hud.height / 2;
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

export function drawDamage(hud, ctx, state) {
  const hurt = state.effects?.hurt ?? 0;
  const health = state.player.health;
  const low = health < 32 && !state.player.driving ? 0.16 + Math.sin(hud.time * 5.4) * 0.07 : 0;
  const flash = Math.max(hurt, low, hud.healthFlash * 0.32, (state.effects?.flash ?? 0) * 0.22);
  if (flash < 0.015) return;
  const cx = hud.width / 2;
  const cy = hud.height / 2;
  const inner = Math.min(hud.width, hud.height) * 0.28;
  const outer = Math.max(hud.width, hud.height) * 0.68;
  const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  gradient.addColorStop(0, 'rgba(170,18,32,0)');
  gradient.addColorStop(0.72, `rgba(170,18,32,${Math.min(0.26, flash * 0.32)})`);
  gradient.addColorStop(1, `rgba(120,8,22,${Math.min(0.72, flash * 0.8)})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, hud.width, hud.height);
  ctx.strokeStyle = `rgba(255,80,64,${Math.min(0.5, flash * 0.45)})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, hud.width - 2, hud.height - 2);
  ctx.restore();
}

export function drawDown(hud, ctx, down) {
  const elapsed = down.duration - down.timer;
  const alpha = Math.min(1, Math.max(0, elapsed * 5), Math.max(0.25, down.timer * 1.4));
  if (alpha <= 0) return;
  const busted = down.type === 'busted';
  ctx.save();
  ctx.globalAlpha = alpha;
  const gradient = ctx.createRadialGradient(
    hud.width / 2, hud.height / 2, 40,
    hud.width / 2, hud.height / 2, hud.width * 0.72,
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
  ctx.fillRect(0, 0, hud.width, hud.height);

  ctx.fillStyle = busted ? 'rgba(86,120,255,0.16)' : 'rgba(255,72,58,0.14)';
  for (let i = -hud.height; i < hud.width; i += 46) {
    ctx.save();
    ctx.translate(i, 0);
    ctx.rotate(-0.36);
    ctx.fillRect(0, -hud.height, 3, hud.height * 3);
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.min(138, hud.width * 0.115)}px ${DISPLAY}`;
  ctx.fillStyle = busted ? '#dae4ff' : '#ffe3d8';
  ctx.shadowColor = busted ? 'rgba(76,118,255,0.85)' : 'rgba(255,72,48,0.8)';
  ctx.shadowBlur = 34;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
  ctx.fillText(busted ? 'BUSTED' : 'WASTED', hud.width / 2, hud.height / 2 - 18);
  ctx.shadowBlur = 0;
  ctx.font = `600 12px ${UI}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.fillStyle = busted ? 'rgba(200,216,255,0.78)' : 'rgba(255,190,175,0.75)';
  ctx.fillText(
    busted ? 'HARBOR PD HAS YOU · THE CITY KEEPS ITS CUT' : 'THE HARBOR CLAIMS ANOTHER · YOU WAKE ON THE STRIP',
    hud.width / 2,
    hud.height / 2 + 74,
  );
  ctx.strokeStyle = busted ? 'rgba(120,150,255,0.5)' : 'rgba(255,110,90,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hud.width / 2 - 190, hud.height / 2 + 46);
  ctx.lineTo(hud.width / 2 - 70, hud.height / 2 + 46);
  ctx.moveTo(hud.width / 2 + 70, hud.height / 2 + 46);
  ctx.lineTo(hud.width / 2 + 190, hud.height / 2 + 46);
  ctx.stroke();
  ctx.restore();
}

export function drawRadioWheel(hud, ctx, state) {
  const radio = state.radio;
  const wheel = radio.wheel;
  const stations = RADIO.stations;
  const panelWidth = Math.min(hud.width - 96, 1120);
  const panelHeight = Math.min(hud.height - 120, 420);
  const panelX = (hud.width - panelWidth) / 2;
  const panelY = (hud.height - panelHeight) / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(6,4,12,0.76)';
  ctx.fillRect(0, 0, hud.width, hud.height);
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
  hud.wheelHits = [];
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
    hud.wheelHits.push({ x: columnX, y: top, width: columnWidth, height: 64, station: index, track: 0 });
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
      hud.wheelHits.push({ x: columnX + 6, y: rowY, width: columnWidth - 12, height: 46, station: index, track: trackIndex });
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

export function drawPrompt(hud, ctx, state) {
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
  const x = (hud.width - width) / 2;
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
