// Deterministic randomness for Coral Bay Heat.
//
// Every random choice in the game flows through one seeded stream, so a
// given seed always grows the same city and replays the same staged
// screenshot scenes. The generator below is a counter-based hash mixer:
// the state is a single 32-bit counter, each draw hashes the counter with
// a splitmix-style finaliser, and the top bits become a float in [0, 1).
// Nothing in the simulation is allowed to touch Math.random.

/** Build a generator function from a numeric seed. Each call yields [0, 1). */
export function createRandom(seed) {
  let counter = (seed | 0) ^ 0x85ebca6b;
  const nextFloat = () => {
    counter = (counter + 0x9e3779b9) | 0;
    let z = counter;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z = z ^ (z >>> 15);
    return (z >>> 0) / 4294967296;
  };
  return nextFloat;
}

/** Whole number in [0, n), drawn from the supplied stream. */
export function randInt(random, n) {
  return (random() * n) | 0;
}

/** One element of a list, chosen by the supplied stream. */
export function pick(random, list) {
  return list[(random() * list.length) | 0];
}

/** Float somewhere in [min, max). */
export function range(random, min, max) {
  return min + (max - min) * random();
}

/** Weighted coin flip: true roughly p of the time. */
export function chance(random, p) {
  return random() < p;
}
