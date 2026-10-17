import { hashSeed, clamp } from './random.js';

function hash(x, y, seed) {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1274126177, 2246822519) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

export function isWalkable(tile) {
  return Boolean(tile && tile.biome !== 'water' && tile.biome !== 'deepwater' && tile.biome !== 'mountain');
}

export function getTile(world, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const ix = Math.floor(x), iy = Math.floor(y);
  return ix >= 0 && iy >= 0 && ix < world.width && iy < world.height ? world.tiles[iy * world.width + ix] : null;
}

export function generateTiles(seedText, width, height, climate) {
  const seed = hashSeed(seedText);
  const tiles = [];
  const wetness = climate === 'lush' ? 0.16 : climate === 'dry' ? -0.2 : 0;
  const riverPhase = (seed % 300) / 37;
  for (let y = 0; y < height; y++) {
    const ny = y / height;
    const riverX = width * (0.48 + Math.sin(y * 0.085 + riverPhase) * 0.07 + Math.sin(y * 0.23) * 0.025);
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const edge = Math.min(nx, 1 - nx, ny, 1 - ny);
      const broad = noise(x / 19, y / 17, seed);
      const detail = noise(x / 6.5, y / 6.5, seed ^ 0x55219);
      let elevation = 0.28 + broad * 0.46 + detail * 0.2 - Math.max(0, 0.12 - edge) * 3.8;
      const riverDistance = Math.abs(x - riverX);
      const riverWidth = 0.7 + noise(y / 13, 0, seed ^ 777) * 0.8;
      // Shallow fords connect both banks. They are geography, never timed story events.
      const ford = Math.abs(y - height * 0.28) < 1.3 || Math.abs(y - height * 0.68) < 1.3;
      if (riverDistance < riverWidth) elevation = ford ? 0.285 : 0.18;
      else if (riverDistance < riverWidth + 1.2) elevation = Math.min(elevation, 0.32);
      const moisture = clamp(noise(x / 12, y / 11, seed ^ 0x99289) * 0.65 + 0.18 + wetness + Math.max(0, 1 - riverDistance / 7) * 0.26, 0, 1);
      const fertility = clamp(0.22 + moisture * 0.7 + (detail - 0.5) * 0.24 - Math.max(0, elevation - 0.68) * 1.5, 0.05, 1);
      let biome;
      if (elevation < 0.11) biome = 'deepwater';
      else if (elevation < 0.25) biome = 'water';
      else if (elevation < 0.31) biome = 'sand';
      else if (elevation > 0.86) biome = 'mountain';
      else if (elevation > 0.79 && ny < 0.35) biome = 'snow';
      else if (elevation > 0.71) biome = 'hill';
      else if (moisture > 0.58 && detail > 0.38) biome = 'forest';
      else biome = 'grass';
      const water = biome === 'water' || biome === 'deepwater';
      const rocky = biome === 'hill' || biome === 'mountain' || biome === 'snow';
      const variation = hash(x, y, seed ^ 827);
      const trees = biome === 'forest' ? 3 + variation * 5 : biome === 'grass' && variation > 0.72 ? 1 + variation * 2 : 0;
      tiles.push({
        x, y, biome, elevation, moisture, fertility, trees,
        food: water || rocky ? 0 : (0.9 + variation * 3.5) * fertility,
        stone: rocky ? 7 + variation * 14 : variation > 0.91 && !water ? variation * 5 : 0,
        ore: rocky && variation > 0.3 ? 2 + variation * 9 : 0,
        fish: water ? 4 + variation * 10 : 0,
        herbs: !water && moisture > 0.48 ? variation * 2 : 0,
        road: 0, fire: 0, burn: 0, region: -1, waterDistance: riverDistance,
      });
    }
  }
  assignRegions(tiles, width, height);
  return tiles;
}

function assignRegions(tiles, width, height) {
  let region = 0;
  const queue = new Int32Array(tiles.length);
  for (let start = 0; start < tiles.length; start++) {
    if (!isWalkable(tiles[start]) || tiles[start].region >= 0) continue;
    let head = 0, tail = 1;
    queue[0] = start;
    tiles[start].region = region;
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width);
      for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1]) {
        if (next < 0 || tiles[next].region >= 0 || !isWalkable(tiles[next])) continue;
        tiles[next].region = region;
        queue[tail++] = next;
      }
    }
    region++;
  }
}

export function findHabitableSites(world, count = 4) {
  const candidates = world.tiles.filter(tile => isWalkable(tile) && tile.biome !== 'sand' && tile.biome !== 'snow' && tile.fertility > 0.42 && tile.x > 7 && tile.y > 7 && tile.x < world.width - 8 && tile.y < world.height - 8);
  const sites = [];
  const quadrants = [[0.23, 0.3], [0.74, 0.28], [0.24, 0.72], [0.73, 0.73]];
  for (let i = 0; i < count; i++) {
    const desired = quadrants[i % quadrants.length];
    let best = null, bestScore = -Infinity;
    for (const tile of candidates) {
      if (sites.some(site => Math.hypot(site.x - tile.x, site.y - tile.y) < Math.min(world.width, world.height) * 0.2)) continue;
      const distance = Math.hypot(tile.x - desired[0] * world.width, tile.y - desired[1] * world.height);
      const score = tile.fertility * 10 + Math.min(tile.trees, 3) - distance * 0.6 - Math.max(0, tile.elevation - 0.6) * 6;
      if (score > bestScore) { best = tile; bestScore = score; }
    }
    if (best) sites.push(best);
  }
  if (!sites.length) {
    const fallback = world.tiles.find(tile => isWalkable(tile));
    if (fallback) sites.push(fallback);
  }
  return sites;
}
