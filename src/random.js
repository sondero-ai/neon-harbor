// Small seeded RNG. Every procedural decision in the city comes from one of
// these so a seed rebuilds exactly the same harbor, shot after shot.

export function makeRng(seed = 1) {
  let state = seed >>> 0;
  const rng = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (min, max) => min + (max - min) * rng();
  rng.int = (min, max) => Math.floor(min + (max - min + 1) * rng());
  rng.pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  rng.chance = (probability) => rng() < probability;
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  rng.fork = (salt) => makeRng((state ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0);
  return rng;
}

export function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
