// Every stochastic decision advances serialized state, including appearance and names.
// Rendering never touches this generator: a save resumes the same causal history.
export function hashSeed(value) {
  const text = String(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function random(world) {
  world.rngState = (world.rngState + 0x6d2b79f5) >>> 0;
  let t = world.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const between = (world, min, max) => min + random(world) * (max - min);
export const integer = (world, min, max) => Math.floor(between(world, min, max + 1));
export const pick = (world, values) => values[Math.floor(random(world) * values.length)];
export const chance = (world, probability) => random(world) < probability;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function weighted(world, choices) {
  let sum = 0;
  for (const item of choices) sum += Math.max(0, item.weight);
  if (sum <= 0) return null;
  let target = random(world) * sum;
  for (const item of choices) {
    target -= Math.max(0, item.weight);
    if (target <= 0) return item;
  }
  return choices.at(-1);
}
