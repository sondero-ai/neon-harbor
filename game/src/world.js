// The harbor itself: a procedural neon coastal city built from one seed. The
// class lays out the roads, sidewalks, towers, storefronts, signs, palms, lamps,
// the beach, the pier, the lighthouse and the water, then answers the three
// questions the rest of the game asks of a world: how high is the ground here,
// can something stand here, and where can the camera sit without entering a
// wall. The builders live under world/; this file orchestrates them and keeps
// the public World surface.

import * as THREE from '../vendor/three.module.js';
import {
  BLOCK_CENTERS_X,
  BLOCK_CENTERS_Z,
  PALETTE,
  QUALITY_PRESETS,
  SEED,
} from './config.js';
import { makeGlowSprite, mergeGeometries } from './geo.js';
import { GlowField } from './glow-field.js';
import { makeRng } from './random.js';
import { basicMaterial, material } from './world-kit.js';
import {
  addBeacon,
  addRoofProps,
  addStorefront,
  buildCity,
} from './world/city.js';
import { buildBeach, buildGround, buildOcean, buildRoadMarkings } from './world/ground.js';
import {
  buildCasaLuna,
  buildHotel,
  buildMotorRow,
  buildPlaza,
  buildRadioBlock,
} from './world/landmarks.js';
import { buildBoats, buildLighthouse, buildPier } from './world/pier.js';
import {
  buildBeachProps,
  buildPylonSign,
  buildSigns,
  buildStreetlights,
  buildVegetation,
} from './world/props.js';
import {
  applyEnvironment,
  buildClouds,
  buildLights,
  buildSky,
  focusAt,
  setSky,
} from './world/sky.js';
import {
  beachHeight,
  clipCamera,
  collides,
  groundHeightAt,
  lineBlocked,
  onBlock,
  onPierDeck,
  onRamp,
  raycast,
  resolveCircle,
  vehicleBlocked,
} from './world/query.js';

export class World {
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.scene.fog = new THREE.Fog(PALETTE.fog, 72, 680);
    this.root = new THREE.Group();
    this.root.name = 'harbor';
    scene.add(this.root);
    this.skyRoot = new THREE.Group();
    this.skyRoot.name = 'sky';
    scene.add(this.skyRoot);

    this.colliders = [];
    // Sittable anchors shared by the plaza, the beach, the pier and (later)
    // the mall. Each seat is { x, z, y, yaw, kind, occupant }; occupant is
    // 'player' or a crowd pedestrian, and a free seat has occupant null.
    this.seats = [];
    this.mall = null;
    this.buildings = [];
    this.neonSigns = [];
    this.beacons = [];
    this.clouds = [];
    this.boats = [];
    this.landmarks = {};
    this.rng = makeRng(SEED ^ 0x4a17);
    this.blocks = BLOCK_CENTERS_X.length * BLOCK_CENTERS_Z.length;
    this.glowField = new GlowField(scene);
    this.streetGlowIndices = [];
    this.pierGlowIndices = [];

    buildSky(this);
    buildLights(this);
    buildGround(this);
    buildRoadMarkings(this);
    buildBeach(this);
    buildOcean(this);
    buildCity(this);
    buildPlaza(this, 0, 0);
    buildBeachProps(this);
    buildPier(this);
    buildLighthouse(this);
    buildBoats(this);
    buildVegetation(this);
    buildStreetlights(this);
    buildSigns(this);
    buildClouds(this);
    this.finishMergedMeshes();
    this.glowField.build();
  }

  setObjectiveMarker(x, z) {
    if (!this.objectiveMarker) {
      const group = new THREE.Group();
      group.name = 'objective-marker';
      const diamondMaterial = new THREE.MeshBasicMaterial({
        color: 0xff7a68,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), diamondMaterial);
      diamond.scale.set(0.74, 1.28, 0.74);
      diamond.position.y = 3.4;
      group.add(diamond);
      const inner = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38, 0),
        new THREE.MeshBasicMaterial({ color: 0xfff1cf, toneMapped: false }),
      );
      inner.scale.set(0.7, 1.2, 0.7);
      inner.position.y = 3.4;
      group.add(inner);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6f61,
        transparent: true,
        opacity: 0.62,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 8, 32), ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      group.add(ring);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 1.35, 15, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xff7a68,
          transparent: true,
          opacity: 0.07,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
          fog: false,
        }),
      );
      beam.position.y = 8.2;
      group.add(beam);
      const glow = makeGlowSprite(0xff8a70, 7.5, 0.48);
      glow.position.y = 3.4;
      group.add(glow);
      this.root.add(group);
      this.objectiveMarker = { group, diamond, inner, ring, glow };
    }
    const ground = this.groundHeightAt(x, z);
    this.objectiveMarker.group.position.set(x, ground, z);
  }

  setQuality(quality) {
    this.quality = quality;
    const preset = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS.high;
    this.sun.castShadow = preset.shadows;
    this.sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  // ---------------------------------------------------------------- merged leftovers

  finishMergedMeshes() {
    if (this.roofParts.length > 0) {
      const roofMesh = new THREE.Mesh(
        mergeGeometries(this.roofParts),
        material(0xffffff, { vertexColors: true, roughness: 0.9, metalness: 0.02 }),
      );
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      this.root.add(roofMesh);
    }
    if (this.crownParts.length > 0) {
      const crownMaterial = basicMaterial(0xffffff, { vertexColors: true });
      this.crownMaterial = crownMaterial;
      const crownMesh = new THREE.Mesh(
        mergeGeometries(this.crownParts),
        crownMaterial,
      );
      this.root.add(crownMesh);
    }
    if (this.storefrontParts.length > 0) {
      const storefrontMaterial = material(0xffffff, {
        map: this.storefrontTexture,
        emissiveMap: this.storefrontTexture,
        emissive: 0xffffff,
        emissiveIntensity: 0.65,
        roughness: 0.66,
        metalness: 0.03,
        side: THREE.FrontSide,
      });
      this.storefrontMaterial = storefrontMaterial;
      this.storefrontBaseEmissive = 0.65;
      const storefrontMesh = new THREE.Mesh(
        mergeGeometries(this.storefrontParts),
        storefrontMaterial,
      );
      storefrontMesh.receiveShadow = true;
      this.root.add(storefrontMesh);
    }
  }

  // ---------------------------------------------------------------- queries

  onBlock(x, z) {
    return onBlock(this, x, z);
  }

  onPierDeck(x, z) {
    return onPierDeck(this, x, z);
  }

  onRamp(x, z) {
    return onRamp(this, x, z);
  }

  vehicleBlocked(x, z, isPlayer = false) {
    return vehicleBlocked(this, x, z, isPlayer);
  }

  groundHeightAt(x, z) {
    return groundHeightAt(this, x, z);
  }

  beachHeight(x, z = 0) {
    return beachHeight(this, x, z);
  }

  collides(x, z, radius = 0.45) {
    return collides(this, x, z, radius);
  }

  resolveCircle(x, z, radius = 0.4) {
    return resolveCircle(this, x, z, radius);
  }

  raycast(origin, direction, maxDistance = 120) {
    return raycast(this, origin, direction, maxDistance);
  }

  lineBlocked(fromX, fromY, fromZ, toX, toY, toZ, padding = 0.8) {
    return lineBlocked(this, fromX, fromY, fromZ, toX, toY, toZ, padding);
  }

  clipCamera(from, to, radius, out) {
    return clipCamera(this, from, to, radius, out);
  }

  focusAt(x, z) {
    return focusAt(this, x, z);
  }

  applyEnvironment(palette) {
    return applyEnvironment(this, palette);
  }

  setSky(fromKey, toKey, blend) {
    return setSky(this, fromKey, toKey, blend);
  }

  addBeacon(x, y, z, scale = 1) {
    return addBeacon(this, x, y, z, scale);
  }

  addStorefront(cx, cz, width, depth) {
    return addStorefront(this, cx, cz, width, depth);
  }

  addRoofProps(cx, cz, width, depth, topY, rng) {
    return addRoofProps(this, cx, cz, width, depth, topY, rng);
  }

  buildHotel(cx, cz) {
    return buildHotel(this, cx, cz);
  }

  buildCasaLuna(cx, cz) {
    return buildCasaLuna(this, cx, cz);
  }

  buildMotorRow(cx, cz) {
    return buildMotorRow(this, cx, cz);
  }

  buildRadioBlock(cx, cz) {
    return buildRadioBlock(this, cx, cz);
  }

  buildPylonSign(options) {
    return buildPylonSign(this, options);
  }

  // ---------------------------------------------------------------- animation

  update(dt, elapsed, camera) {
    if (camera) this.skyRoot.position.copy(camera.position);
    if (this.waterTexture) {
      this.waterTexture.offset.x = (elapsed * 0.011) % 1;
      this.waterTexture.offset.y = (elapsed * 0.0055) % 1;
    }
    if (this.foamTexture) this.foamTexture.offset.y = (elapsed * 0.02) % 1;
    if (this.foam) this.foam.material.opacity = 0.26 + Math.sin(elapsed * 0.9) * 0.06;
    if (this.fountainWater) this.fountainWater.material.emissiveIntensity = 0.32 + Math.sin(elapsed * 2.1) * 0.13;
    if (this.plazaRing) this.plazaRing.rotation.z = elapsed * 0.18;
    if (this.beam) this.beam.rotation.y = elapsed * 0.62;
    if (this.sparkles) this.sparkles.material.opacity = 0.44 + Math.sin(elapsed * 1.4) * 0.14;

    for (const sign of this.neonSigns) {
      if (sign.flicker <= 0) continue;
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * (2.4 + sign.flicker * 8) + sign.phase);
      const drop = sign.flicker > 0.28 && Math.sin(elapsed * 0.45 + sign.phase) > 0.985 ? 0.35 : 1;
      const brightness = 0.84 + pulse * 0.16 * (1 - sign.flicker) + drop * 0.15;
      const level = this.neonLevel ?? 1;
      sign.material.color.setScalar(brightness * level);
      if (sign.glowIndex !== undefined) {
        this.glowField.setBrightness(
          sign.glowIndex,
          sign.baseGlow * (0.72 + pulse * 0.28) * drop * (0.3 + 0.7 * level),
        );
      }
    }
    for (const beacon of this.beacons) {
      const pulse = Math.max(0, Math.sin(elapsed * beacon.speed + beacon.phase));
      this.glowField.setBrightness(beacon.glowIndex, 0.12 + pulse * 0.78);
    }
    for (const cloud of this.clouds) {
      cloud.sprite.position.x = cloud.baseX + Math.sin(elapsed * 0.018 * cloud.speed + cloud.phase) * 18;
    }
    for (const boat of this.boats) {
      boat.group.position.y = boat.baseY + Math.sin(elapsed * boat.speed + boat.phase) * 0.08;
      boat.group.rotation.z = Math.sin(elapsed * boat.speed * 0.8 + boat.phase) * 0.018;
    }
    if (this.objectiveMarker) {
      const marker = this.objectiveMarker;
      const bob = Math.sin(elapsed * 2.1) * 0.2;
      marker.diamond.position.y = 3.4 + bob;
      marker.inner.position.y = 3.4 + bob;
      marker.diamond.rotation.y = elapsed * 1.15;
      marker.inner.rotation.y = -elapsed * 1.6;
      marker.ring.rotation.z = elapsed * 0.55;
      marker.ring.material.opacity = 0.4 + Math.sin(elapsed * 2.1) * 0.2;
      marker.glow.material.opacity = 0.34 + Math.sin(elapsed * 2.1 + 1.1) * 0.14;
    }
    this.glowField.update(camera);
  }
}
