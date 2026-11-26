import {
  CREAM, CREAM_DIM, CORAL, TEAL, GOLD, LINE,
  DISPLAY, UI, MONO,
  cashString, chamferPath, drawBar, drawPanel, drawPortrait, drawRotorIcon,
  label, roleColor, speakerColor, speakerDisplayName, speakerRole, starPath,
  timerString, truncateText, wrapText,
} from './draw-utils.js';

export function drawMissionCard(hud, ctx, state) {
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

export function drawVitals(hud, ctx, player) {
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
  drawBar(ctx, x + 40, y + 26, width - 98, 8, player.health / 100, CORAL, '#ff9c8b');
  label(ctx, String(Math.round(player.health)), x + width - 14, y + 35, { size: 13, color: CREAM, align: 'right', font: MONO, weight: 700 });

  label(ctx, 'AR', x + 14, y + 46, { size: 10.5, color: 'rgba(247,232,210,0.5)', spacing: '1px', weight: 700 });
  drawBar(ctx, x + 40, y + 40, width - 98, 5, player.armor / 100, TEAL, '#9af8eb');
  label(ctx, String(Math.round(player.armor)), x + width - 14, y + 48, { size: 11.5, color: CREAM_DIM, align: 'right', font: MONO, weight: 700 });

  if (hud.healthFlash > 0.02) {
    ctx.save();
    chamferPath(ctx, x, y, width, height, 10);
    ctx.strokeStyle = `rgba(255,84,70,${0.25 + hud.healthFlash * 0.65})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = CORAL;
    ctx.shadowBlur = 16 * hud.healthFlash;
    ctx.stroke();
    ctx.restore();
    label(ctx, 'HIT', x + width - 14, y + 17, { size: 10, color: CORAL, spacing: '1.2px', align: 'right', weight: 800 });
  } else if (hud.armorFlash > 0.02 && player.armor < 100) {
    ctx.save();
    chamferPath(ctx, x, y, width, height, 10);
    ctx.strokeStyle = `rgba(63,224,207,${0.2 + hud.armorFlash * 0.4})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawStateCard(hud, ctx, player, police = null, state = {}) {
  const width = 252;
  const x = hud.width - width - 28;
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
      ctx.fillStyle = flash > 0.45 && Math.sin(hud.time * 28) > 0 ? '#fff3c9' : GOLD;
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
  const blink = Math.sin(hud.time * 7.5) > 0;
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

export function drawDistrict(hud, ctx, state) {
  const cx = hud.width / 2;
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

export function drawAirBanner(hud, ctx, air) {
  if (!air) return;
  const width = 318;
  const height = 40;
  const x = (hud.width - width) / 2;
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
  ctx.fillStyle = spotlight && Math.sin(hud.time * 8) > 0 ? CORAL : 'rgba(255,111,97,0.35)';
  ctx.beginPath();
  ctx.arc(x + width - 14, y + 10, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawObjective(hud, ctx, state) {
  const objective = state.objective;
  if (!objective) return;
  const width = 480;
  const height = 68;
  const x = (hud.width - width) / 2;
  const y = hud.height - height - 24;
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

export function drawChallenge(hud, ctx, state) {
  const challenge = state.challenge;
  if (!challenge) return;
  const width = 340;
  const height = 52;
  const x = (hud.width - width) / 2;
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

export function drawDialogue(hud, ctx, state) {
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

export function drawCrewPanel(hud, ctx, state) {
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

export function drawPoliceRoster(hud, ctx, state) {
  const police = state.police;
  if (!police) return;
  const column = hud.rightColumn(state);
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
