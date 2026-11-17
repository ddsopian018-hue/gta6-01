// A small seeded random number generator (mulberry32). The same seed always builds the same
// city and the same staged scenes, which is what makes the screenshots repeatable and the
// simulation deterministic: the simulation itself never calls Math.random.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random integer in [0, n). */
export function randInt(random, n) {
  return Math.floor(random() * n);
}

/** A random pick from a list. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** A random number in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}
