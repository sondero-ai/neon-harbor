// Geometry and texture factory for Neon Harbor. No city decisions live here:
// this file knows how to draw a window grid, bake a neon sign, build a palm or
// merge a pile of small parts into one draw call. world.js arranges them.

import * as THREE from '../vendor/three.module.js';
import { makeRng } from './random.js';

const anisotropy = 4;

export function canvasTexture(width, height, draw, { repeat = null, srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  texture.needsUpdate = true;
  return texture;
}

let glowTexture = null;
export function makeGlowTexture() {
  if (glowTexture) return glowTexture;
  glowTexture = canvasTexture(128, 128, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 2, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.18, 'rgba(255,255,255,0.82)');
    gradient.addColorStop(0.42, 'rgba(255,255,255,0.28)');
    gradient.addColorStop(0.72, 'rgba(255,255,255,0.07)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
  return glowTexture;
}

let cloudTexture = null;
export function makeCloudTexture() {
  if (cloudTexture) return cloudTexture;
  cloudTexture = canvasTexture(256, 128, (ctx, width, height) => {
    const rng = makeRng(0xc10d);
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < 14; i += 1) {
      const x = rng.range(30, width - 30);
      const y = rng.range(44, 84);
      const radius = rng.range(18, 48);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(255,236,214,0.45)');
      gradient.addColorStop(0.55, 'rgba(255,205,180,0.2)');
      gradient.addColorStop(1, 'rgba(255,180,160,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });
  return cloudTexture;
}

// One tile is four bays wide by four floors tall. Buildings scale UVs to keep
// the windows close to 3 m per bay whatever the tower's proportions. The wall
// carries its own floor bands, piers and sill shadows; lit rooms vary in warmth,
// curtains and blinds so a street wall does not read as a checkerboard.
const FACADE_PALETTES = [
  { wall: '#c9a57c', frame: '#87654b', trims: '#e7c79c', dark: '#2a2f40', lit: ['#f2c17a', '#e8a45c', '#f7d49a', '#efb471'], pattern: 'punched' },
  { wall: '#2f6068', frame: '#1d3c43', trims: '#4d858b', dark: '#173640', lit: ['#45d8c6', '#f0bf6e', '#8fe8dc', '#5cd8c6'], pattern: 'glass' },
  { wall: '#a96770', frame: '#6f3f49', trims: '#d58e88', dark: '#332337', lit: ['#f4c38a', '#e89070', '#f6d3a8', '#eaa47d'], pattern: 'ribbon' },
  { wall: '#7b7896', frame: '#504d68', trims: '#9b97b7', dark: '#25243a', lit: ['#f0b26b', '#58cdc2', '#e88190', '#f3cf94'], pattern: 'punched' },
  { wall: '#c2aa8e', frame: '#897257', trims: '#e4ccac', dark: '#292640', lit: ['#f3c98e', '#eaaa60', '#78d3c6', '#f5d3a8'], pattern: 'ribbon' },
  { wall: '#3b4259', frame: '#25293c', trims: '#5c6684', dark: '#191d2c', lit: ['#efb873', '#49d5c2', '#e87a8b', '#f0c785'], pattern: 'glass' },
  { wall: '#98604f', frame: '#653b31', trims: '#bf7f64', dark: '#281d2b', lit: ['#f1bf7c', '#e99a58', '#f4d0a2', '#eda968'], pattern: 'punched' },
  { wall: '#4f6f67', frame: '#304a44', trims: '#79a093', dark: '#1c2e30', lit: ['#efc37f', '#6fd6c4', '#f0c593', '#78dccb'], pattern: 'ribbon' },
];

function shiftHex(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((value >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (value & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawFacade(palette, seed) {
  const size = 256;
  const bay = size / 4;
  const mapCanvas = document.createElement('canvas');
  const glowCanvas = document.createElement('canvas');
  mapCanvas.width = mapCanvas.height = size;
  glowCanvas.width = glowCanvas.height = size;
  const map = mapCanvas.getContext('2d');
  const glow = glowCanvas.getContext('2d');
  const rng = makeRng(seed);

  const wall = map.createLinearGradient(0, 0, 0, size);
  wall.addColorStop(0, shiftHex(palette.wall, 12));
  wall.addColorStop(0.58, palette.wall);
  wall.addColorStop(1, shiftHex(palette.wall, -22));
  map.fillStyle = wall;
  map.fillRect(0, 0, size, size);

  // Piers, floor bands and a little masonry grain give the repeats a pulse.
  for (let col = 0; col <= 4; col += 1) {
    const x = col * bay;
    map.fillStyle = 'rgba(255,244,226,0.045)';
    map.fillRect(x + 1, 0, 1.5, size);
    map.fillStyle = 'rgba(0,0,0,0.12)';
    map.fillRect(x - 1, 0, 2, size);
  }
  for (let row = 0; row < 4; row += 1) {
    const y = row * bay;
    map.fillStyle = 'rgba(0,0,0,0.16)';
    map.fillRect(0, y + bay - 4, size, 4);
    map.fillStyle = 'rgba(255,242,220,0.055)';
    map.fillRect(0, y + bay - 5, size, 1);
  }
  for (let i = 0; i < 520; i += 1) {
    const shade = rng.range(60, 190);
    map.fillStyle = `rgba(${shade},${shade - 8},${shade + 2},${rng.range(0.015, 0.05)})`;
    map.fillRect(rng.range(0, size), rng.range(0, size), rng.range(0.6, 2.4), rng.range(0.6, 2));
  }

  glow.fillStyle = '#000';
  glow.fillRect(0, 0, size, size);

  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = rng.chance(palette.pattern === 'glass' ? 0.36 : 0.42);
      const litColor = palette.lit[rng.int(0, palette.lit.length - 1)];
      let x;
      let y;
      let w;
      let h;
      if (palette.pattern === 'glass') {
        x = col * bay + 6;
        y = row * bay + 7;
        w = bay - 12;
        h = bay - 18;
      } else if (palette.pattern === 'ribbon') {
        x = col * bay + 2;
        y = row * bay + 21;
        w = bay - 4;
        h = bay - 34;
      } else {
        x = col * bay + 16;
        y = row * bay + 17;
        w = bay - 32;
        h = bay - 36;
      }

      if (lit) {
        const room = map.createLinearGradient(x, y, x, y + h);
        room.addColorStop(0, shiftHex(litColor, 8));
        room.addColorStop(0.6, litColor);
        room.addColorStop(1, shiftHex(litColor, -62));
        map.fillStyle = room;
        map.fillRect(x, y, w, h);
        map.fillStyle = 'rgba(18,11,20,0.2)';
        map.fillRect(x, y + h * 0.72, w, h * 0.28);
        if (rng.chance(0.34)) {
          map.fillStyle = 'rgba(26,16,25,0.42)';
          const slats = rng.int(2, 4);
          for (let s = 0; s < slats; s += 1) {
            map.fillRect(x + 2, y + h * 0.16 + s * (h * 0.16), w - 4, 2);
          }
        }
        if (rng.chance(0.24)) {
          map.fillStyle = 'rgba(31,19,29,0.36)';
          map.fillRect(x + w * rng.range(0.18, 0.5), y + h * 0.42, w * 0.18, h * 0.44);
        }
      } else {
        map.fillStyle = palette.dark;
        map.fillRect(x, y, w, h);
        const reflection = map.createLinearGradient(x, y, x + w, y + h);
        reflection.addColorStop(0, 'rgba(174,214,232,0.19)');
        reflection.addColorStop(0.45, 'rgba(120,158,182,0.05)');
        reflection.addColorStop(1, 'rgba(0,0,0,0.2)');
        map.fillStyle = reflection;
        map.fillRect(x, y, w, h);
        if (rng.chance(0.3)) {
          map.fillStyle = 'rgba(255,188,116,0.075)';
          map.fillRect(x + w * 0.16, y + h * 0.4, w * 0.3, h * 0.5);
        }
      }

      map.strokeStyle = palette.frame;
      map.lineWidth = palette.pattern === 'glass' ? 1.5 : 2.5;
      map.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (palette.pattern === 'glass') {
        map.fillStyle = palette.frame;
        map.fillRect(x + w / 2 - 0.75, y, 1.5, h);
        map.fillRect(x, y + h * 0.48, w, 1.5);
        map.fillStyle = shiftHex(palette.frame, 14);
        map.fillRect(0, row * bay + bay - 8, size, 5);
        map.fillStyle = 'rgba(255,238,214,0.08)';
        map.fillRect(0, row * bay + bay - 9, size, 1);
      } else if (palette.pattern === 'ribbon') {
        map.fillStyle = palette.frame;
        map.fillRect(x + w / 2 - 0.75, y, 1.5, h);
        map.fillRect(0, row * bay + bay - 9, size, 2);
      } else {
        map.fillStyle = 'rgba(0,0,0,0.24)';
        map.fillRect(x - 4, y + h + 1, w + 8, 4);
        map.fillStyle = 'rgba(255,236,211,0.13)';
        map.fillRect(x - 4, y + h + 1, w + 8, 1.5);
        map.fillStyle = palette.frame;
        map.fillRect(x - 3, y + h - 2, 3, 3);
        map.fillRect(x + w, y + h - 2, 3, 3);
      }

      if (lit) {
        glow.save();
        glow.shadowColor = litColor;
        glow.shadowBlur = palette.pattern === 'glass' ? 13 : 9;
        glow.fillStyle = litColor;
        glow.globalAlpha = rng.range(0.45, 0.8);
        glow.fillRect(x, y, w, h);
        glow.globalAlpha = 0.3;
        glow.fillStyle = '#fff4dc';
        glow.fillRect(x + w * 0.18, y + h * 0.16, w * 0.46, h * 0.24);
        glow.restore();
      } else if (rng.chance(0.12)) {
        glow.globalAlpha = 0.12;
        glow.fillStyle = litColor;
        glow.fillRect(x, y, w, h);
        glow.globalAlpha = 1;
      }
    }
  }

  const mapTexture = new THREE.CanvasTexture(mapCanvas);
  mapTexture.colorSpace = THREE.SRGBColorSpace;
  mapTexture.wrapS = THREE.RepeatWrapping;
  mapTexture.wrapT = THREE.RepeatWrapping;
  mapTexture.anisotropy = anisotropy;

  const glowTextureMap = new THREE.CanvasTexture(glowCanvas);
  glowTextureMap.colorSpace = THREE.SRGBColorSpace;
  glowTextureMap.wrapS = THREE.RepeatWrapping;
  glowTextureMap.wrapT = THREE.RepeatWrapping;
  glowTextureMap.anisotropy = anisotropy;
  return { mapTexture, glowTextureMap };
}

let facadeStyles = null;
export function makeFacadeStyles() {
  if (facadeStyles) return facadeStyles;
  const roof = new THREE.MeshStandardMaterial({ color: 0x2a2430, roughness: 0.94, metalness: 0.05 });
  facadeStyles = FACADE_PALETTES.map((palette, index) => {
    const { mapTexture, glowTextureMap } = drawFacade(palette, 0x51a7 + index * 733);
    const material = new THREE.MeshStandardMaterial({
      map: mapTexture,
      emissiveMap: glowTextureMap,
      emissive: 0xffffff,
      emissiveIntensity: palette.pattern === 'glass' ? 0.7 : 0.58,
      roughness: palette.pattern === 'glass' ? 0.48 : 0.82,
      metalness: palette.pattern === 'glass' ? 0.22 : 0.04,
    });
    return { material, roof, palette };
  });
  return facadeStyles;
}

export function makeBuildingMesh(width, height, depth, style) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  scaleFacadeUvs(geometry, width, height, depth);
  const mesh = new THREE.Mesh(geometry, style.material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function scaleFacadeUvs(geometry, width, height, depth) {
  const uv = geometry.attributes.uv;
  const scaleU = [depth / 12, depth / 12, 1, 1, width / 12, width / 12];
  const scaleV = height / 12;
  for (const group of geometry.groups) {
    if (group.materialIndex === 2 || group.materialIndex === 3) continue;
    const seen = new Set();
    for (let i = group.start; i < group.start + group.count; i += 1) {
      const vertex = geometry.index.getX(i);
      if (seen.has(vertex)) continue;
      seen.add(vertex);
      uv.setXY(vertex, uv.getX(vertex) * Math.max(1, scaleU[group.materialIndex]), uv.getY(vertex) * Math.max(1, scaleV));
    }
  }
  uv.needsUpdate = true;
}

function fitFont(context, text, maxWidth, startSize, family) {
  let size = startSize;
  do {
    context.font = `900 ${size}px ${family}`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 3;
  } while (size > 24);
  return size;
}

export function makeSignTexture({
  title,
  sub = '',
  color = '#ff6f61',
  bg = '#120b1a',
  vertical = false,
  width = 0,
  height = 0,
  accent = '#3fe0cf',
}) {
  const family = '"Bahnschrift", "Arial Narrow", "Segoe UI", sans-serif';
  const w = width || (vertical ? 176 : 512);
  const h = height || (vertical ? 512 : 176);
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const grime = ctx.createLinearGradient(0, 0, 0, h);
    grime.addColorStop(0, 'rgba(255,255,255,0.07)');
    grime.addColorStop(0.5, 'rgba(255,255,255,0)');
    grime.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = grime;
    ctx.fillRect(0, 0, w, h);
    if (vertical) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.shadowBlur = 0;
      ctx.fillStyle = accent;
      ctx.fillRect(w / 2 - 22, 20, 44, 4);
      ctx.fillRect(w / 2 - 22, h - 24, 44, 4);

      const letters = [...title.toUpperCase().replace(/\s+/g, ' ')];
      const room = h - 96;
      const step = room / Math.max(1, letters.length);
      const fontSize = Math.min(74, step * 0.82);
      ctx.font = `900 ${fontSize}px ${family}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      letters.forEach((letter, index) => {
        ctx.fillText(letter, w / 2, 56 + step * (index + 0.5));
      });
      ctx.shadowBlur = 0;
      if (sub) {
        ctx.save();
        ctx.translate(w / 2, h - 42);
        ctx.fillStyle = accent;
        ctx.font = `600 16px ${family}`;
        ctx.letterSpacing = '2px';
        ctx.textAlign = 'center';
        ctx.fillText(sub.toUpperCase(), 0, 0);
        ctx.restore();
      }
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.shadowBlur = 0;
      ctx.fillStyle = accent;
      ctx.fillRect(24, 24, 56, 5);
      ctx.fillRect(w - 80, h - 29, 56, 5);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      const size = fitFont(ctx, title.toUpperCase(), w - 78, h * 0.48, family);
      ctx.font = `900 ${size}px ${family}`;
      ctx.fillText(title.toUpperCase(), w / 2, h / 2 - (sub ? h * 0.06 : 0));
      ctx.shadowBlur = 0;
      if (sub) {
        ctx.fillStyle = accent;
        ctx.font = `600 ${Math.max(15, h * 0.105)}px ${family}`;
        ctx.letterSpacing = '3px';
        ctx.fillText(sub.toUpperCase(), w / 2, h * 0.78);
      }
    }
  });
}

export function makeBillboardTexture({ title, sub, accent = '#ff6f61', second = '#3fe0cf' }) {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    const background = ctx.createLinearGradient(0, 0, w, h);
    background.addColorStop(0, '#241535');
    background.addColorStop(0.55, '#4d1e43');
    background.addColorStop(1, '#a33e51');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,232,210,0.16)';
    ctx.lineWidth = 2;
    for (let x = -h; x < w; x += 52) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,111,97,0.22)';
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.3, 116, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.3, 82, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,10,28,0.78)';
    ctx.fillRect(w * 0.78 - 82, h * 0.3, 164, h * 0.3);
    for (let i = 0; i < 6; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? second : '#ffcf88';
      ctx.fillRect(w * 0.78 - 66 + i * 24, h * 0.3 + 18, 11, h * 0.3 - 36);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffeed6';
    ctx.font = '900 128px "Bahnschrift", "Arial Narrow", sans-serif';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 26;
    ctx.fillText(title.toUpperCase(), 54, 236);
    ctx.shadowBlur = 0;
    ctx.fillStyle = second;
    ctx.font = '600 44px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.fillText(sub.toUpperCase(), 58, 308);
    ctx.fillStyle = 'rgba(255,238,214,0.58)';
    ctx.font = '500 24px "Segoe UI", sans-serif';
    ctx.fillText('NEON HARBOR · ALWAYS ON · 88.3', 58, 430);
    ctx.fillStyle = accent;
    ctx.fillRect(58, 366, 264, 5);
  });
}

export function makeGlowSprite(color = 0xffcf8a, scale = 3, opacity = 0.6) {
  const material = new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  if (Array.isArray(scale)) sprite.scale.set(scale[0], scale[1], 1);
  else sprite.scale.setScalar(scale);
  return sprite;
}

/** Merge geometries into one non-indexed BufferGeometry, baking matrices and optional vertex colors. */
export function mergeGeometries(parts) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const useColor = parts.some((part) => part.color !== undefined);
  const color = new THREE.Color(0xffffff);

  for (const part of parts) {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    if (part.matrix) {
      geometry.applyMatrix4(part.matrix);
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const vertexColor = geometry.attributes.color;
    if (useColor && !vertexColor) color.set(part.color ?? 0xffffff);
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      if (useColor) {
        if (vertexColor) colors.push(vertexColor.getX(i), vertexColor.getY(i), vertexColor.getZ(i));
        else colors.push(color.r, color.g, color.b);
      }
    }
    geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (useColor) merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

function bladeGeometry(length, width, droop, color) {
  const segments = 4;
  const positions = [];
  const colors = [];
  const tint = new THREE.Color(color);
  const tips = new THREE.Color(color).multiplyScalar(0.74);
  for (let i = 0; i < segments; i += 1) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const x0 = t0 * length;
    const x1 = t1 * length;
    const w0 = width * (1 - t0 * 0.82);
    const w1 = width * (1 - t1 * 0.92);
    const y0 = -droop * t0 * t0;
    const y1 = -droop * t1 * t1;
    const c0 = tint.clone().lerp(tips, t0);
    const c1 = tint.clone().lerp(tips, t1);
    // two triangles, double sided by the material
    positions.push(x0, y0, -w0, x1, y1, -w1, x1, y1, w1);
    positions.push(x0, y0, -w0, x1, y1, w1, x0, y0, w0);
    colors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c1.r, c1.g, c1.b);
    colors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c0.r, c0.g, c0.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function makePalmGeometry(variant = 0) {
  const rng = makeRng(0x9a11 + variant * 419);
  const parts = [];
  const lean = 0.34 + variant * 0.18;
  const height = 5.4 + variant * 0.5;
  const segments = 5;

  for (let i = 0; i < segments; i += 1) {
    const t = i / segments;
    const radiusBottom = 0.24 - t * 0.08;
    const radiusTop = 0.22 - t * 0.08;
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height / segments + 0.14, 6, 1);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -lean * (0.04 + t * 0.06)));
    matrix.compose(
      new THREE.Vector3(lean * t * t * 1.1, height / segments * i + height / segments / 2, 0),
      quaternion,
      new THREE.Vector3(1, 1, 1),
    );
    parts.push({ geometry, matrix, color: i % 2 === 0 ? 0x6b4c36 : 0x7c5a3e });
  }

  const crownX = lean * 1.1;
  const crownY = height + 0.08;
  const blades = 10;
  for (let i = 0; i < blades; i += 1) {
    const angle = (i / blades) * Math.PI * 2 + rng.range(-0.16, 0.16);
    const length = rng.range(3.1, 4.5);
    const width = rng.range(0.22, 0.36);
    const geometry = bladeGeometry(length, width, rng.range(0.8, 1.7), i % 2 === 0 ? 0x2f6e4e : 0x387b55);
    const pivot = new THREE.Matrix4().makeTranslation(crownX, crownY, 0);
    const spin = new THREE.Matrix4().makeRotationY(angle);
    const tilt = new THREE.Matrix4().makeRotationZ(rng.range(-0.06, 0.1));
    parts.push({ geometry, matrix: pivot.multiply(spin).multiply(tilt) });
  }

  const coconutGeometry = new THREE.SphereGeometry(0.2, 6, 4);
  for (let i = 0; i < 3; i += 1) {
    const matrix = new THREE.Matrix4().makeTranslation(crownX + Math.cos(i * 2.1) * 0.3, crownY - 0.2, Math.sin(i * 2.1) * 0.3);
    parts.push({ geometry: coconutGeometry, matrix, color: 0x4a3224 });
  }

  return mergeGeometries(parts);
}

export function makePalmMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

export function makeStreetlightGeometry() {
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.085, 0.13, 6.2, 6);
  parts.push({ geometry: pole, matrix: new THREE.Matrix4().makeTranslation(0, 3.1, 0), color: 0x2b2a35 });
  const base = new THREE.CylinderGeometry(0.2, 0.26, 0.5, 6);
  parts.push({ geometry: base, matrix: new THREE.Matrix4().makeTranslation(0, 0.25, 0), color: 0x24212c });
  const arm = new THREE.BoxGeometry(1.7, 0.1, 0.11);
  parts.push({ geometry: arm, matrix: new THREE.Matrix4().makeTranslation(0.8, 6.08, 0), color: 0x2b2a35 });
  const lampHousing = new THREE.BoxGeometry(0.62, 0.16, 0.34);
  parts.push({ geometry: lampHousing, matrix: new THREE.Matrix4().makeTranslation(1.56, 6.04, 0), color: 0x1e1b26 });
  return mergeGeometries(parts);
}

export function makeLampGeometry() {
  return new THREE.BoxGeometry(0.46, 0.07, 0.25).translate(1.56, 5.94, 0);
}
