// A small seeded random number generator (mulberry32): the same seed rebuilds the same city,
// which is what lets the screenshot scenes repeat exactly.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** A random element of a list. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}
