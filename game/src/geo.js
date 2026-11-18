// Geometry and texture tools shared by the whole game. MeshBuilder packs many little boxes and
// quads into one buffer so the city costs a handful of draw calls; the texture factory paints
// every surface procedurally on a canvas (facades, neon signs, billboards, asphalt, glow sprites)
// because the entry ships no image files.
import * as THREE from '../vendor/three.module.js';

const tmpColor = new THREE.Color();

/** Packs quads and boxes into a single non-indexed BufferGeometry with vertex colours and UVs. */
export class MeshBuilder {
  constructor() {
    this.position = [];
    this.normal = [];
    this.color = [];
    this.uv = [];
  }

  /** One quad, corners a,b,c,d counter-clockwise seen from the front. */
  quad(a, b, c, d, color, uvs) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - b[0], vy = c[1] - b[1], vz = c[2] - b[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    tmpColor.set(color);
    const corners = [a, b, c, a, c, d];
    const quadUv = uvs ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
    const uv = quadUv.length === 4
      ? [quadUv[0], quadUv[1], quadUv[2], quadUv[0], quadUv[2], quadUv[3]]
      : quadUv;
    for (let i = 0; i < 6; i += 1) {
      this.position.push(corners[i][0], corners[i][1], corners[i][2]);
      this.normal.push(nx, ny, nz);
      this.color.push(tmpColor.r, tmpColor.g, tmpColor.b);
      this.uv.push(uv[i][0], uv[i][1]);
    }
  }

  /** An axis-aligned box; `tile` is the metres one texture repeat covers. */
  box(cx, cy, cz, w, h, d, color, tile = 1, topColor = color, uOffset = 0) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const u = w / tile, v = h / tile, ud = d / tile;
    const o = uOffset;
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, [[o + ud, 0], [o, 0], [o, v], [o + ud, v]]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, [[o + ud, 0], [o, 0], [o, v], [o + ud, v]]);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], topColor, [[0, 0], [u, 0], [u, ud], [0, ud]]);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, [[0, ud], [u, ud], [u, 0], [0, 0]]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, [[o, 0], [o + u, 0], [o + u, v], [o, v]]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, [[o, 0], [o + u, 0], [o + u, v], [o, v]]);
  }

  /** A box whose four sides share a window-grid texture scaled to windows of `tile` metres. */
  facade(cx, cy, cz, w, h, d, color, tile = 8, uOffset = 0) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const v = h / tile;
    const ux = w / tile, uz = d / tile;
    const o = uOffset;
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, [[o + uz, 0], [o, 0], [o, v], [o + uz, v]]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, [[o + uz, 0], [o, 0], [o, v], [o + uz, v]]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, [[o, 0], [o + ux, 0], [o + ux, v], [o, v]]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, [[o, 0], [o + ux, 0], [o + ux, v], [o, v]]);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], '#2a2630', [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }

  /** A capped cylinder around the Y axis, radius easing from `rBottom` to `rTop`. */
  cylinder(cx, cy, cz, rBottom, rTop, height, segments, color) {
    const y0 = cy - height / 2, y1 = cy + height / 2;
    for (let s = 0; s < segments; s += 1) {
      const a0 = (s / segments) * Math.PI * 2, a1 = ((s + 1) / segments) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * rBottom, z0 = cz + Math.sin(a0) * rBottom;
      const x1 = cx + Math.cos(a0) * rTop, z1 = cz + Math.sin(a0) * rTop;
      const x2 = cx + Math.cos(a1) * rTop, z2 = cz + Math.sin(a1) * rTop;
      const x3 = cx + Math.cos(a1) * rBottom, z3 = cz + Math.sin(a1) * rBottom;
      this.quad([x0, y0, z0], [x1, y1, z1], [x2, y1, z2], [x3, y0, z3], color, [[s / segments, 0], [s / segments, 1], [(s + 1) / segments, 1], [(s + 1) / segments, 0]]);
    }
    this.quad([cx - rTop, y1, cz + rTop], [cx + rTop, y1, cz + rTop], [cx + rTop, y1, cz - rTop], [cx - rTop, y1, cz - rTop], color);
    this.quad([cx - rBottom, y0, cz - rBottom], [cx + rBottom, y0, cz - rBottom], [cx + rBottom, y0, cz + rBottom], [cx - rBottom, y0, cz + rBottom], color);
  }

  /** A flat, ground-facing quad (two triangles), used for road paint and shadows. */
  ground(x, y, z, w, d, color) {
    this.quad([x - w / 2, y, z + d / 2], [x + w / 2, y, z + d / 2], [x + w / 2, y, z - d / 2], [x - w / 2, y, z - d / 2], color);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function canvasTexture(canvas, { repeat = 1, srgb = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speckle(ctx, width, height, amount, alpha) {
  for (let i = 0; i < amount; i += 1) {
    const shade = Math.random() * 60 - 30;
    ctx.fillStyle = `rgba(${128 + shade},${128 + shade},${128 + shade},${alpha})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}

/**
 * The city's window surfaces: a tileable wall with a grid of windows, and the matching emissive
 * map where some windows are lit. `style` picks the facade family (glass tower, older block).
 */
export function makeFacadeTextures(random, style = 'tower') {
  const size = 512;
  const columns = 4, rows = 4;
  const { canvas, ctx } = makeCanvas(size, size);
  const glow = makeCanvas(size, size);
  const tower = style === 'tower';
  ctx.fillStyle = tower ? '#9aa0b4' : '#b3a294';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 320; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${0.02 + random() * 0.05})`;
    ctx.fillRect(random() * size, random() * size, 2 + random() * 40, 2 + random() * 90);
  }
  // Floor lines every cell.
  ctx.strokeStyle = 'rgba(30,28,40,0.35)';
  ctx.lineWidth = 5;
  for (let r = 0; r < rows; r += 1) {
    ctx.beginPath();
    ctx.moveTo(0, r * (size / rows) + 6);
    ctx.lineTo(size, r * (size / rows) + 6);
    ctx.stroke();
  }
  glow.ctx.fillStyle = '#000';
  glow.ctx.fillRect(0, 0, size, size);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      const cellW = size / columns, cellH = size / rows;
      const padX = cellW * (tower ? 0.17 : 0.22), padY = cellH * (tower ? 0.2 : 0.26);
      const x = c * cellW + padX, y = r * cellH + padY;
      const w = cellW - padX * 2, h = cellH - padY * 2;
      const glass = ctx.createLinearGradient(x, y, x + w, y + h);
      glass.addColorStop(0, tower ? '#2b3a52' : '#2a3140');
      glass.addColorStop(0.55, tower ? '#4d6c86' : '#465261');
      glass.addColorStop(1, tower ? '#1d2738' : '#232b36');
      ctx.fillStyle = glass;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fillRect(x, y, w, 3);
      ctx.strokeStyle = 'rgba(18,18,26,0.9)';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);
      if (random() < 0.36) {
        const warm = random() < 0.78;
        const color = warm ? `rgba(255,${150 + random() * 60 | 0},${70 + random() * 50 | 0},` : 'rgba(130,220,255,';
        glow.ctx.fillStyle = color + '0.95)';
        glow.ctx.fillRect(x, y, w, h);
        const bloom = glow.ctx.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, w);
        bloom.addColorStop(0, color + '0.5)');
        bloom.addColorStop(1, color + '0)');
        glow.ctx.fillStyle = bloom;
        glow.ctx.fillRect(x - w * 0.4, y - h * 0.4, w * 1.8, h * 1.8);
      }
    }
  }
  return { map: canvasTexture(canvas), emissiveMap: canvasTexture(glow.canvas) };
}

/** A neon sign: dark board, bright tube letters with a hot core and coloured spill. */
export function makeSignTexture(text, color, { width = 512, height = 128, sub = '' } = {}) {
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = '#120d18';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.85;
  ctx.strokeRect(8, 8, width - 16, height - 16);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${height * (sub ? 0.34 : 0.42)}px Arial, sans-serif`;
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, sub ? height * 0.42 : height / 2);
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#fff8ee';
  ctx.globalAlpha = 0.9;
  ctx.fillText(text, width / 2, sub ? height * 0.42 : height / 2);
  if (sub) {
    ctx.globalAlpha = 1;
    ctx.font = `600 ${height * 0.19}px Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.shadowBlur = 14;
    ctx.fillText(sub, width / 2, height * 0.78);
  }
  return canvasTexture(canvas);
}

/** A lit billboard poster: sunset art, a slogan and a cheap brand mark. */
export function makeBillboardTexture(random, title, sub) {
  const { canvas, ctx } = makeCanvas(512, 256);
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#2a1a4a');
  sky.addColorStop(0.55, '#c84b77');
  sky.addColorStop(1, '#ffb46b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(255,220,150,0.9)';
  ctx.beginPath();
  ctx.arc(390, 92, 46, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 9; i += 1) {
    ctx.fillStyle = `rgba(20,10,30,${0.35 + i * 0.05})`;
    const w = 30 + random() * 50;
    ctx.fillRect(i * 58 - 10, 120 + random() * 30, w, 200);
  }
  ctx.fillStyle = 'rgba(10,6,18,0.55)';
  ctx.fillRect(0, 150, 512, 106);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffe6c2';
  ctx.font = 'bold 52px Arial, sans-serif';
  ctx.shadowColor = '#ff4a6e';
  ctx.shadowBlur = 18;
  ctx.fillText(title, 24, 205);
  ctx.shadowBlur = 0;
  ctx.font = '600 22px Arial, sans-serif';
  ctx.fillStyle = '#9ff2ea';
  ctx.fillText(sub, 26, 240);
  return canvasTexture(canvas);
}

/** A soft white disc used by every particle and light bloom sprite. */
export function makeGlowTexture() {
  const { canvas, ctx } = makeCanvas(128, 128);
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.65)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(canvas, { srgb: false });
}

/** Grainy asphalt, sand and concrete: one noise texture reused with different tints. */
export function makeNoiseTexture(seed = 1) {
  const random = (() => {
    let a = seed;
    return () => {
      a = (a * 1664525 + 1013904223) % 4294967296;
      return a / 4294967296;
    };
  })();
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#d2d2d2';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i += 1) {
    const shade = 150 + Math.floor(random() * 90);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(Math.floor(random() * 256), Math.floor(random() * 256), 1 + Math.floor(random() * 2), 1 + Math.floor(random() * 2));
  }
  return canvasTexture(canvas, { srgb: false });
}

/** A paint stripe texture for the HUD's minimap edges (unused by the world, kept tiny). */
export function disposeGroup(group) {
  group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
  });
}
