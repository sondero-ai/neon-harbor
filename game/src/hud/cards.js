import { LOW_FUEL, fuelPct } from '../fuel.js';
import {
  CREAM, CREAM_DIM, CORAL, TEAL, GOLD,
  DISPLAY, UI, MONO,
  cashString, chamferPath, drawPanel, drawWeaponIcon, label, truncateText,
} from './draw-utils.js';

export function drawReward(hud, ctx, reward, state) {
  const alpha = Math.min(1, reward.life * 1.4);
  const cx = hud.width / 2;
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

export function drawFailure(hud, ctx, fail) {
  const width = 560;
  const height = 104;
  const x = (hud.width - width) / 2;
  const y = 188;
  const pulse = 0.5 + Math.sin(hud.time * 4.4) * 0.5;
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

export function drawEnding(hud, ctx, ending) {
  const alpha = Math.min(1, ending.life * 0.7);
  ctx.save();
  ctx.globalAlpha = alpha;
  const gradient = ctx.createRadialGradient(
    hud.width / 2, hud.height * 0.46, 40,
    hud.width / 2, hud.height * 0.46, hud.width * 0.72,
  );
  gradient.addColorStop(0, 'rgba(36,24,16,0.78)');
  gradient.addColorStop(0.65, 'rgba(14,9,16,0.9)');
  gradient.addColorStop(1, 'rgba(5,4,12,0.97)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, hud.width, hud.height);
  const rule = ctx.createLinearGradient(hud.width / 2 - 280, 0, hud.width / 2 + 280, 0);
  rule.addColorStop(0, 'rgba(255,201,92,0)');
  rule.addColorStop(0.5, 'rgba(255,201,92,0.7)');
  rule.addColorStop(1, 'rgba(255,201,92,0)');
  ctx.fillStyle = rule;
  ctx.fillRect(hud.width / 2 - 280, hud.height / 2 - 62, 560, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.min(72, hud.width * 0.062)}px ${DISPLAY}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
  ctx.fillStyle = CREAM;
  ctx.shadowColor = 'rgba(255,201,92,0.55)';
  ctx.shadowBlur = 28;
  ctx.fillText('THE HARBOR IS YOURS', hud.width / 2, hud.height / 2 - 18);
  ctx.shadowBlur = 0;
  ctx.font = `600 11px ${UI}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.fillStyle = GOLD;
  ctx.fillText('THE SOLANO STORY · COMPLETE', hud.width / 2, hud.height / 2 + 42);
  ctx.font = `500 11px ${UI}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
  ctx.fillStyle = 'rgba(247,232,210,0.55)';
  ctx.fillText('Free roam is open. The streets still pay.', hud.width / 2, hud.height / 2 + 66);
  ctx.restore();
}

export function drawRadio(hud, ctx, state) {
  const radio = state.radio ?? {};
  const enabled = radio.enabled !== false;
  const offAir = radio.offAir === true;
  const fallback = radio.fallback === true;
  const status = !enabled ? 'RADIO OFF' : offAir ? 'OFF AIR' : fallback ? 'SYNTH' : 'ON AIR';
  const statusColor = !enabled ? 'rgba(247,232,210,0.4)' : offAir ? CORAL : fallback ? GOLD : TEAL;
  const right = hud.width - 44;
  const y = hud.height - 155;
  drawPanel(ctx, hud.width - 28 - 228, y - 32, 228, 58, {
    cut: 8,
    fill: 'rgba(9,6,16,0.65)',
    stroke: 'rgba(247,232,210,0.13)',
    accent: statusColor,
  });
  label(ctx, (enabled ? (radio.station || 'Vega 105.1') : 'RADIO OFF').toUpperCase(), hud.width - 252, y - 10, {
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

export function drawWeaponStrip(hud, ctx, state) {
  const weapons = state.weapons;
  if (!weapons || weapons.dead) return;
  const column = hud.rightColumn(state);
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

export function drawVehicleCard(hud, ctx, state) {
  const player = state.player;
  const car = state.vehicle;
  const column = hud.rightColumn(state);
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

export function drawToast(hud, ctx, toast) {
  const alpha = Math.min(1, toast.life * 0.8);
  const cx = hud.width / 2;
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
