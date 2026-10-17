/*
 * Villages' pixel workshop. Every mark is an integer rectangle or a stepped
 * polygon; there are no external images, font glyphs, or smoothed vector sprites.
 * Appearance is stable across actions and inherited palette indices remain
 * visible throughout a villager's life. Small atlases are built lazily.
 */

export const TILE_SIZE = 16;

export const PALETTE = Object.freeze({
  ink: '#263b39', deep: '#254657', water: '#397f8c', waterLight: '#5da0a6',
  foam: '#acd0bc', sand: '#c6b687', grass: '#839a58', darkGrass: '#637d48',
  tree: '#365f46', leaf: '#619052', bark: '#69523d', rock: '#86958c',
  cream: '#e8dbad', roof: '#b97253', roofLight: '#d39064', gold: '#efce7b',
  snow: '#c9d6c7', outline: '#303e35', shadow: '#253d3660',
});

const SKINS = ['#ecc49b', '#d8ac80', '#c38e68', '#aa7355', '#875a46', '#654435', '#e0b7a6', '#b88670'];
const HAIRS = ['#332b29', '#55402f', '#785437', '#a87840', '#cca562', '#a35736', '#503735', '#7c7770', '#d0c8ae', '#382f3b'];
const OUTFITS = ['#b6664e', '#67878a', '#81925c', '#bd9c61', '#877191', '#58756b', '#a9757a', '#b2ab84', '#7e91a9', '#aa6c3f', '#62808b', '#967955'];
const ACCENTS = ['#e8cf87', '#d2a880', '#a9c6a1', '#b7d2cd', '#d9acaa', '#bfadd1', '#b8bd7e', '#decfaf'];
const TERRAIN_COLORS = {
  spring: { grass: ['#849b59', '#93a765', '#768e50'], forest: ['#718d51', '#81995a', '#638149'], hill: ['#89956a', '#9aa27c', '#7b885c'], sand: ['#c6b789', '#d0c195', '#b9aa7d'] },
  summer: { grass: ['#899b52', '#9aaa5e', '#7c8f49'], forest: ['#70854a', '#829757', '#637941'], hill: ['#93996a', '#a3a878', '#83895a'], sand: ['#c9b887', '#d3c496', '#bbaa79'] },
  autumn: { grass: ['#a3a168', '#b0ac77', '#928f5b'], forest: ['#90905c', '#a29a65', '#807f51'], hill: ['#a6a17a', '#b2ac87', '#95906b'], sand: ['#c8b790', '#d1c09b', '#b9a882'] },
  winter: { grass: ['#a9b9a0', '#beccb3', '#94a68d'], forest: ['#91a58c', '#a2b69b', '#83977f'], hill: ['#b7c3ae', '#ccd4c0', '#a0b29b'], sand: ['#c7c5ac', '#d1d0ba', '#b6b59c'] },
};

// A long-running simulation creates many character animation variants. Keeping
// thousands of independent Canvas bitmaps alive can exhaust browser canvas/GPU
// backing stores; when that happens the cached terrain sprites may turn fully
// transparent, leaving only shorelines and actors visible on the main map.
// Keep the opaque ground textures separate from trees, buildings, and people:
// a burst of settlement construction must never evict every ground variant.
const terrainAtlas = new Map();
const environmentAtlas = new Map();
const peopleAtlas = new Map();
const MAX_TERRAIN_SPRITES = 128;
const MAX_ENVIRONMENT_SPRITES = 384;
const MAX_PERSON_SPRITES = 1024;
const MAX_ATLAS = MAX_TERRAIN_SPRITES + MAX_ENVIRONMENT_SPRITES + MAX_PERSON_SPRITES;

export function hashValue(value) {
  const text = String(value ?? 0);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function noise(seed, offset = 0) {
  let h = (Number(seed) + Math.imul(offset + 1, 374761393)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function normalizeSeason(value) {
  if (typeof value === 'number') return ['spring', 'summer', 'autumn', 'winter'][((value % 4) + 4) % 4];
  return ['spring', 'summer', 'autumn', 'winter'].includes(value) ? value : 'spring';
}

function makeCanvas(width, height) {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function cached(key, width, height, anchorX, anchorY, paint) {
  const person = key.startsWith('person:');
  const ground = key.startsWith('ground:');
  const bucket = ground ? terrainAtlas : person ? peopleAtlas : environmentAtlas;
  const cachedSprite = bucket.get(key);
  if (cachedSprite) {
    // LRU eviction avoids retaining long-dead generations at the expense of
    // the sprites the current world is using.
    bucket.delete(key);
    bucket.set(key, cachedSprite);
    return cachedSprite;
  }
  const { canvas, ctx } = makeCanvas(width, height);
  paint(ctx);
  const sprite = { canvas, width, height, anchorX, anchorY };
  const limit = ground ? MAX_TERRAIN_SPRITES : person ? MAX_PERSON_SPRITES : MAX_ENVIRONMENT_SPRITES;
  if (bucket.size >= limit) bucket.delete(bucket.keys().next().value);
  bucket.set(key, sprite);
  return sprite;
}

/**
 * Recover cached terrain bitmaps after the browser discards their backing
 * storage. Opaque terrain textures must have alpha 255 at their top-left pixel.
 * Probe just a handful of variants at ground-rebuild time rather than doing
 * costly synchronous GPU readbacks for every tile on every frame.
 *
 * Returns true if stale environment sprites were discarded and must be
 * recreated. Person sprites and simulation state are deliberately untouched.
 */
export function recoverTerrainSprites(season = 'spring') {
  const suffix = ':' + normalizeSeason(season);
  const candidates = [];
  for (const [key, sprite] of terrainAtlas) {
    if (key.endsWith(suffix)) candidates.push(sprite);
  }
  if (!candidates.length) return false;
  const step = Math.max(1, Math.floor(candidates.length / 8));
  for (let i = 0; i < candidates.length; i += step) {
    try {
      const ctx = candidates[i].canvas.getContext('2d');
      if (ctx?.getImageData(0, 0, 1, 1).data[3] === 255) continue;
    } catch {
      // A lost or unavailable bitmap must not be reused for the next ground.
    }
    terrainAtlas.clear();
    environmentAtlas.clear();
    return true;
  }
  return false;
}

const rect = (ctx, color, x, y, w, h) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};

function polygon(ctx, color, points) {
  // Scan-line rasterization keeps diagonal rocks and tree boughs pixel sharp.
  const top = Math.floor(Math.min(...points.map(point => point[1])));
  const bottom = Math.ceil(Math.max(...points.map(point => point[1])));
  ctx.fillStyle = color;
  for (let y = top; y < bottom; y++) {
    const intersections = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], scan = y + 0.5;
      if ((a[1] <= scan && b[1] > scan) || (b[1] <= scan && a[1] > scan)) intersections.push(a[0] + (scan - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) ctx.fillRect(Math.round(intersections[i]), y, Math.round(intersections[i + 1]) - Math.round(intersections[i]), 1);
  }
}

function pixelLine(ctx, color, x0, y0, x1, y1, thickness = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (let limit = 0; limit < 100; limit++) {
    rect(ctx, color, x0, y0, thickness, thickness);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * error;
    if (e2 >= dy) { error += dy; x0 += sx; }
    if (e2 <= dx) { error += dx; y0 += sy; }
  }
}

function shade(hex, amount) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v + amount))).toString(16).padStart(2, '0')).join('')}`;
}

function pick(palette, index, fallback = 0) {
  if (typeof index === 'string' && /^#[0-9a-f]{3,8}$/i.test(index)) return index;
  return palette[Math.abs(Math.floor(Number(index ?? fallback))) % palette.length];
}

export function getTerrainSprite(biome, variation = 0, season = 'spring') {
  season = normalizeSeason(season);
  const variant = variation % 12;
  return cached(`ground:${biome}:${variant}:${season}`, 16, 16, 0, 0, ctx => {
    const terrain = TERRAIN_COLORS[season];
    let colors = terrain[biome] || terrain.grass;
    if (biome === 'water') colors = ['#397f8c', '#418994', '#367886'];
    if (biome === 'deepwater') colors = ['#2b5a70', '#306579', '#28586d'];
    if (biome === 'mountain') colors = ['#89968a', '#9aa499', '#78867e'];
    if (biome === 'snow') colors = ['#ccd6c3', '#dce3d2', '#b8c8b3'];
    rect(ctx, colors[0], 0, 0, 16, 16);
    const seed = hashValue(`${biome}:${variant}`);
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(noise(seed, i * 3) * 15);
      const y = Math.floor(noise(seed, i * 3 + 1) * 15);
      const w = noise(seed, i * 3 + 2) > 0.8 ? 3 : 1;
      rect(ctx, colors[1 + (i % 2)], x, y, w, 1);
    }
    if (biome === 'water' || biome === 'deepwater') {
      // Wide horizontal motifs retain the calm, readable water surface at zoom.
      if (variant % 3 === 0) rect(ctx, colors[1], 3, 8, 6, 1);
    } else if ((biome === 'grass' || biome === 'forest') && variant % 4 === 1 && season !== 'winter') {
      rect(ctx, colors[2], 10, 7, 1, 3);
      rect(ctx, colors[2], 8, 8, 1, 2);
      rect(ctx, colors[1], 9, 9, 2, 1);
    }
  });
}

export function getTreeSprite(kind = 0, variant = 0, season = 'spring', small = false) {
  season = normalizeSeason(season);
  kind %= 4; variant %= 6;
  return cached(`tree:${kind}:${variant}:${season}:${small}`, 36, 48, 18, 42, ctx => {
    const seed = variant * 171 + kind * 53;
    // The small version is downsampled with nearest-neighbor after painting.
    rect(ctx, '#334d383b', 7, 39, 23, 4);
    rect(ctx, '#334d3825', 10, 43, 16, 1);
    rect(ctx, '#574532', 16, 22, 5, 19);
    rect(ctx, '#846247', 17, 23, 2, 17);
    rect(ctx, '#a27c50', 17, 32, 1, 6);
    rect(ctx, '#5c4b33', 13, 39, 12, 2);
    let dark = '#30583f', mid = '#4e7848', light = '#77954f';
    if (kind === 0) { dark = '#254f42'; mid = '#3f6b4b'; light = '#658650'; }
    if (kind === 2) { dark = '#4a6644'; mid = '#759153'; light = '#9bac62'; }
    if (kind === 3) { dark = '#365c47'; mid = '#57835b'; light = '#84a064'; }
    if (season === 'autumn' && kind !== 0) {
      dark = ['#805b3f', '#805141', '#6e683b'][variant % 3];
      mid = ['#bb874b', '#ad6850', '#a6944c'][variant % 3];
      light = ['#dcab62', '#d39164', '#c6b864'][variant % 3];
    }
    if (season === 'winter') { dark = '#507066'; mid = '#78938a'; light = '#c2d0b9'; }
    if (kind === 0) {
      // Spruce: layered stepped boughs, a trunk gap, and a narrow spear silhouette.
      polygon(ctx, dark, [[17, 3], [20, 3], [20, 7], [23, 7], [23, 11], [26, 11], [26, 15], [24, 15], [24, 18], [28, 18], [28, 22], [31, 22], [31, 28], [28, 28], [30, 32], [6, 32], [8, 28], [5, 28], [5, 24], [9, 24], [9, 19], [12, 19], [11, 15], [14, 15], [14, 9], [17, 9]]);
      polygon(ctx, mid, [[17, 5], [19, 5], [19, 12], [23, 12], [23, 15], [14, 15], [15, 11], [17, 11]]);
      polygon(ctx, mid, [[16, 16], [20, 16], [20, 20], [25, 20], [25, 24], [10, 24], [10, 22], [14, 22], [14, 19], [16, 19]]);
      rect(ctx, mid, 10, 27, 14, 4);
      rect(ctx, light, 16, 11, 3, 2);
      rect(ctx, light, 13, 21, 6, 2);
      rect(ctx, light, 9, 29, 8, 2);
      if (season === 'winter') { rect(ctx, light, 14, 16, 8, 2); rect(ctx, light, 9, 25, 17, 2); }
    } else {
      const crownY = 9 + (variant % 3);
      rect(ctx, dark, 8, crownY + 1, 20, 22);
      rect(ctx, dark, 4, crownY + 6, 28, 13);
      rect(ctx, dark, 11, crownY - 3, 12, 28);
      rect(ctx, mid, 7, crownY + 4, 22, 14);
      rect(ctx, mid, 10, crownY, 16, 18);
      rect(ctx, mid, 6, crownY + 9, 7, 10);
      rect(ctx, light, 10, crownY + 3, 9, 4);
      rect(ctx, light, 8, crownY + 8, 6, 3);
      rect(ctx, light, 17, crownY + 1, 6, 2);
      rect(ctx, shade(mid, -9), 21, crownY + 11, 6, 7);
      for (let i = 0; i < 9; i++) {
        const x = 8 + Math.floor(noise(seed, i) * 19);
        const y = crownY + 5 + Math.floor(noise(seed, i + 25) * 15);
        rect(ctx, i % 2 ? light : dark, x, y, 2, 1);
      }
      if (kind === 3 && season !== 'winter') {
        for (const [x, y] of [[10, 22], [23, 17], [19, 29], [8, 15]]) {
          rect(ctx, '#ad664d', x, y, 2, 2);
          rect(ctx, '#e7ae69', x, y, 1, 1);
        }
      }
      if (season === 'winter') {
        rect(ctx, '#dce3cf', 10, crownY, 14, 3);
        rect(ctx, '#dce3cf', 6, crownY + 7, 9, 2);
        rect(ctx, '#c8d6c0', 21, crownY + 4, 7, 3);
      }
    }
    if (small) {
      const copy = makeCanvas(36, 48);
      copy.ctx.drawImage(ctx.canvas, 0, 0);
      ctx.clearRect(0, 0, 36, 48);
      ctx.drawImage(copy.canvas, 6, 14, 24, 32);
    }
  });
}

export function getPropSprite(type, variant = 0, season = 'spring') {
  variant %= 6;
  return cached(`prop:${type}:${variant}:${season}`, 28, 30, 14, 25, ctx => {
    const x = 14, y = 25;
    if (type === 'rock' || type === 'ore' || type === 'mountain') {
      const size = type === 'mountain' ? 10 : 5 + (variant % 3);
      polygon(ctx, '#35483d40', [[x - size, y - 1], [x + size + 3, y - 1], [x + size + 3, y + 2], [x - size, y + 2]]);
      polygon(ctx, '#687c75', [[x - size, y], [x - size, y - size], [x - 3, y - size * 1.6], [x + 3, y - size * 1.6], [x + size, y - size], [x + size + 1, y]]);
      polygon(ctx, '#a9b2a2', [[x - size, y - size], [x - 3, y - size * 1.6], [x + 3, y - size * 1.6], [x + 1, y - 4], [x - 5, y - 3]]);
      rect(ctx, '#c0c7b4', x - 4, y - size - 2, 5, 2);
      rect(ctx, '#819489', x + 4, y - size + 2, 2, size - 2);
      if (type === 'ore') {
        rect(ctx, '#cfb37b', x - 5, y - 5, 3, 2);
        rect(ctx, '#a77557', x, y - 9, 2, 3);
        rect(ctx, '#dbc68f', x + 4, y - 3, 2, 1);
      }
      if (season === 'winter' || type === 'mountain') rect(ctx, '#d5deca', x - 3, y - size * 1.6, 7, 2);
    } else if (type === 'bush') {
      rect(ctx, '#55734b', 7, 19, 15, 6);
      rect(ctx, '#698747', 9, 15, 10, 9);
      rect(ctx, '#91a456', 10, 16, 5, 3);
      for (const [bx, by] of [[9, 20], [15, 18], [18, 23]]) {
        rect(ctx, '#a35751', bx, by, 2, 2);
        rect(ctx, '#d4896a', bx, by, 1, 1);
      }
    } else if (type === 'reeds') {
      for (let i = 0; i < 5; i++) {
        const sx = 9 + i * 2, sy = 17 + ((i + variant) % 3) * 2;
        rect(ctx, '#778450', sx, sy, 1, 25 - sy);
        rect(ctx, '#9c8960', sx, sy - 2, 1, 3);
      }
    } else if (type === 'flowers') {
      const colors = ['#eee0a2', '#d4ab9a', '#b6bbd1'];
      for (let i = 0; i < 5; i++) {
        const fx = 8 + ((i * 5 + variant) % 13), fy = 20 + ((i * 3) % 6);
        rect(ctx, '#66854b', fx, fy, 1, 3);
        rect(ctx, colors[variant % 3], fx - 1, fy - 1, 3, 1);
        rect(ctx, '#d9bb69', fx, fy - 1, 1, 1);
      }
    } else if (type === 'stump') {
      rect(ctx, '#69523b', 10, 21, 9, 5);
      rect(ctx, '#b18a57', 9, 20, 11, 3);
      rect(ctx, '#d0af72', 11, 20, 7, 2);
      rect(ctx, '#967042', 14, 20, 2, 2);
    } else if (type === 'grave') {
      rect(ctx, '#52675350', 7, 24, 14, 3);
      rect(ctx, '#8d9b88', 10, 17, 8, 8);
      rect(ctx, '#a8b3a0', 11, 15, 6, 9);
      rect(ctx, '#687d6c', 12, 18, 4, 1);
      rect(ctx, '#d2bc86', 19, 24, 2, 1);
    } else if (type === 'lily') {
      rect(ctx, '#649273', 8, 22, 9, 3);
      rect(ctx, '#79a17d', 10, 21, 7, 1);
      rect(ctx, '#d9b1ac', 13, 20, 3, 2);
      rect(ctx, '#efdab6', 14, 19, 1, 2);
    }
  });
}

function buildingRoof(ctx, x, y, width, height, roof, level = 1) {
  // A stepped hipped roof has a consistent quarter-view perspective.
  const dark = shade(roof, -35), light = shade(roof, 28);
  for (let row = 0; row < height; row++) {
    const inset = Math.max(0, Math.floor((height - row - 1) * 0.8));
    rect(ctx, row === height - 1 ? dark : roof, x + inset, y + row, width - inset * 2, 1);
  }
  rect(ctx, dark, x - 1, y + height - 1, width + 2, 2);
  for (let row = 3; row < height - 1; row += 3) {
    const inset = Math.floor((height - row) * 0.8);
    rect(ctx, light, x + inset + 1, y + row, width - inset * 2 - 2, 1);
    for (let col = x + inset + 3 + ((row % 2) * 2); col < x + width - inset - 2; col += 7) rect(ctx, dark, col, y + row - 2, 1, 2);
  }
  if (level > 1) rect(ctx, '#ead193', x + width / 2 - 5, y, 10, 1);
}

function windowPixel(ctx, x, y, lit = false) {
  rect(ctx, '#574a36', x, y, 6, 6);
  rect(ctx, lit ? '#e6bd6d' : '#8db5aa', x + 1, y + 1, 4, 4);
  rect(ctx, '#715a3c', x + 3, y + 1, 1, 4);
  rect(ctx, '#bba06b', x, y + 6, 7, 1);
}

export function getBuildingSprite(building, color = '#cbaa70', season = 'spring', night = false) {
  const type = building.type || 'hut';
  const level = Math.min(4, Math.max(1, building.level || 1));
  const progress = Math.min(4, Math.floor((building.progress ?? 1) * 4));
  return cached(`building:${type}:${level}:${progress}:${color}:${season}:${night}`, 72, 80, 36, 67, ctx => {
    const roof = type === 'hall' || type === 'shrine' ? shade(color, -20) : '#b87353';
    const snow = season === 'winter';
    rect(ctx, '#2f433440', 14, 61, 47, 8);
    rect(ctx, '#2f433422', 19, 69, 37, 2);
    if (type === 'campfire') {
      for (const [x, y] of [[26, 65], [30, 60], [39, 60], [43, 65], [36, 69]]) rect(ctx, '#a4a78a', x, y, 5, 3);
      pixelLine(ctx, '#664a31', 29, 67, 42, 63, 2);
      pixelLine(ctx, '#9a7347', 30, 62, 41, 68, 2);
      rect(ctx, '#c87342', 31, 59, 10, 7);
      rect(ctx, '#e8a457', 33, 54, 6, 10);
      rect(ctx, '#f3d18a', 34, 59, 4, 6);
      rect(ctx, '#f5deb0', 35, 62, 2, 3);
      return;
    }
    if (type === 'well') {
      rect(ctx, '#64786c', 24, 59, 24, 8);
      rect(ctx, '#a4ac91', 22, 55, 28, 6);
      rect(ctx, '#416a70', 27, 56, 18, 3);
      rect(ctx, '#785b3a', 24, 38, 3, 20);
      rect(ctx, '#a47e4e', 45, 38, 3, 20);
      buildingRoof(ctx, 18, 29, 36, 14, roof);
      rect(ctx, '#bcaf84', 36, 42, 1, 13);
      rect(ctx, '#92734b', 33, 52, 6, 5);
      return;
    }
    if (type === 'mine') {
      polygon(ctx, '#65766c', [[10, 65], [14, 44], [25, 31], [47, 30], [58, 45], [62, 65]]);
      polygon(ctx, '#93a18f', [[14, 44], [25, 31], [43, 31], [37, 43], [23, 48], [18, 64], [11, 64]]);
      rect(ctx, '#303e36', 26, 44, 23, 23);
      rect(ctx, '#a78453', 23, 41, 4, 27);
      rect(ctx, '#826442', 47, 41, 4, 27);
      rect(ctx, '#ba9560', 23, 41, 28, 4);
      rect(ctx, '#575c46', 31, 59, 14, 7);
      rect(ctx, '#baa882', 33, 61, 10, 4);
      rect(ctx, '#5a4e38', 32, 66, 3, 3);
      rect(ctx, '#5a4e38', 42, 66, 3, 3);
      rect(ctx, '#d7b879', 51, 51, 3, 3);
      return;
    }
    if (type === 'watchtower') {
      rect(ctx, '#755a3a', 22, 33, 5, 34);
      rect(ctx, '#9b7949', 46, 33, 5, 34);
      pixelLine(ctx, '#87693e', 26, 63, 46, 40, 2);
      pixelLine(ctx, '#624e35', 46, 63, 26, 41, 2);
      rect(ctx, '#9d8050', 17, 31, 39, 5);
      rect(ctx, '#b0955f', 20, 22, 32, 11);
      for (let x = 20; x < 53; x += 7) rect(ctx, '#715a3c', x, 21, 2, 12);
      buildingRoof(ctx, 15, 8, 43, 15, roof, level);
      rect(ctx, '#4b4734', 36, 1, 1, 9);
      rect(ctx, color, 37, 2, 10, 5);
      return;
    }
    if (type === 'shrine') {
      rect(ctx, '#87968a', 19, 62, 36, 5);
      rect(ctx, '#b8bea4', 23, 58, 28, 5);
      rect(ctx, '#c4c3a3', 27, 40, 5, 19);
      rect(ctx, '#929c85', 43, 40, 5, 19);
      buildingRoof(ctx, 18, 25, 38, 17, roof, level);
      rect(ctx, '#d6cb9b', 33, 49, 8, 9);
      rect(ctx, '#a88b55', 35, 43, 4, 7);
      rect(ctx, '#e6d294', 34, 44, 6, 2);
      rect(ctx, color, 24, 44, 2, 8);
      return;
    }
    if (type === 'market') {
      rect(ctx, '#7b5b39', 17, 39, 3, 28);
      rect(ctx, '#9d7749', 54, 39, 3, 28);
      rect(ctx, '#ab8251', 19, 56, 36, 11);
      rect(ctx, '#d2aa70', 17, 55, 39, 3);
      buildingRoof(ctx, 13, 29, 48, 15, '#d3c39b');
      for (let x = 18; x < 59; x += 12) {
        rect(ctx, color, x, 36, 6, 8);
        rect(ctx, shade(color, -20), x, 44, 6, 2);
      }
      for (const [x, c] of [[22, '#b48a4b'], [31, '#839b59'], [42, '#c07b50']]) {
        rect(ctx, '#7f633e', x, 51, 8, 5);
        rect(ctx, c, x + 1, 48, 6, 4);
        rect(ctx, shade(c, 25), x + 2, 48, 2, 2);
      }
      return;
    }
    const large = ['hall', 'barracks'].includes(type);
    const wallX = large ? 12 : 20, wallW = large ? 49 : 33;
    const wallY = large ? 36 : 43, wallH = 66 - wallY;
    rect(ctx, '#6c573a', wallX, wallY, wallW, wallH);
    rect(ctx, type === 'barracks' ? '#9fa68e' : '#c7b589', wallX + 1, wallY, wallW - 8, wallH - 2);
    rect(ctx, type === 'barracks' ? '#808d7b' : '#a68b60', wallX + wallW - 8, wallY, 8, wallH - 1);
    rect(ctx, '#8c744d', wallX, 62, wallW, 4);
    rect(ctx, '#735939', wallX + 3, wallY + 2, 2, wallH - 4);
    rect(ctx, '#8b7046', wallX + wallW - 11, wallY + 2, 2, wallH - 4);
    if (type === 'hut') {
      buildingRoof(ctx, wallX - 4, 29, wallW + 8, 17, '#b7a061', level);
      for (let x = wallX; x < wallX + wallW; x += 4) pixelLine(ctx, '#d4bd79', x + 7, 32, x, 43, 1);
    } else {
      buildingRoof(ctx, wallX - 4, large ? 16 : 26, wallW + 8, large ? 23 : 20, roof, level);
      if (type !== 'granary') {
        rect(ctx, '#787d6a', wallX + wallW - 14, large ? 14 : 22, 6, 12);
        rect(ctx, '#adb299', wallX + wallW - 15, large ? 13 : 21, 8, 3);
      }
    }
    rect(ctx, '#624d35', wallX + Math.floor(wallW / 2) - 4, 51, 9, 15);
    rect(ctx, '#8a673d', wallX + Math.floor(wallW / 2) - 3, 53, 7, 12);
    rect(ctx, '#dcc18a', wallX + Math.floor(wallW / 2) + 2, 59, 1, 1);
    windowPixel(ctx, wallX + 7, large ? 43 : 48, night);
    if (large) windowPixel(ctx, wallX + 34, 43, night);
    if (type === 'house' || type === 'hall') {
      rect(ctx, '#6d7e46', wallX + 5, 56, 10, 2);
      rect(ctx, '#bd7861', wallX + 7, 55, 2, 1);
      rect(ctx, '#e5c98c', wallX + 11, 55, 1, 1);
    }
    if (type === 'granary') {
      rect(ctx, '#a88e54', 12, 55, 10, 11);
      rect(ctx, '#d5bb78', 13, 53, 8, 11);
      rect(ctx, '#8c7649', 13, 58, 8, 1);
      rect(ctx, '#b19862', 53, 57, 8, 9);
      rect(ctx, '#d9c386', 54, 55, 6, 3);
    }
    if (type === 'lumberyard') {
      for (let i = 0; i < 4; i++) {
        rect(ctx, '#82613b', 9 + i * 3, 59 + (i % 2) * 3, 16, 3);
        rect(ctx, '#c7a371', 9 + i * 3, 59 + (i % 2) * 3, 3, 3);
      }
      pixelLine(ctx, '#a88c60', 55, 58, 58, 48, 2);
      rect(ctx, '#aeb8a6', 54, 47, 7, 4);
    }
    if (type === 'workshop') {
      rect(ctx, '#596a62', 49, 59, 16, 3);
      rect(ctx, '#8e9d90', 47, 56, 17, 3);
      rect(ctx, '#475a51', 53, 61, 7, 5);
      rect(ctx, '#cf8b51', 25, 54, 5, 5);
      rect(ctx, '#edc777', 26, 56, 3, 3);
    }
    if (type === 'hall' || type === 'barracks') {
      rect(ctx, '#635338', 61, 28, 2, 39);
      rect(ctx, color, 63, 29, 8, 12);
      rect(ctx, shade(color, 35), 63, 29, 2, 12);
      rect(ctx, '#efd59a', 64, 34, 4, 2);
      if (type === 'barracks') {
        for (let x = 7; x < 65; x += 7) { rect(ctx, '#796d4e', x, 63, 3, 7); rect(ctx, '#a89769', x, 61, 3, 2); }
        rect(ctx, '#826d48', 7, 65, 57, 2);
      }
    }
    if (snow) {
      rect(ctx, '#d8e0cb', wallX - 2, large ? 37 : 44, wallW + 5, 2);
      rect(ctx, '#cbd8c0', wallX + 10, large ? 17 : 27, wallW - 20, 2);
    }
    if (progress < 4) {
      // Construction is visibly incomplete and bounded to actual building progress.
      ctx.globalCompositeOperation = 'destination-in';
      rect(ctx, '#ffffff', 0, 65 - (progress + 1) * 11, 72, 80);
      ctx.globalCompositeOperation = 'source-over';
      rect(ctx, '#8d7148', wallX - 4, 33, 2, 36);
      rect(ctx, '#b5965e', wallX + wallW + 3, 33, 2, 36);
      rect(ctx, '#a78a58', wallX - 6, 41, wallW + 13, 2);
      rect(ctx, '#a78a58', wallX - 6, 55, wallW + 13, 2);
      pixelLine(ctx, '#9a7f50', wallX - 3, 66, wallX + wallW + 3, 42, 1);
    }
  });
}

export function getFarmSprite(farm, season = 'spring') {
  const growth = Math.min(4, Math.floor((farm.growth || 0) * 4));
  const wet = farm.water > 0.4;
  const vegetables = farm.crop === 'vegetables';
  return cached(`farm:${growth}:${farm.ripe ? 1 : 0}:${wet}:${season}:${vegetables}`, 20, 21, 10, 15, ctx => {
    rect(ctx, '#81734d', 1, 8, 18, 12);
    rect(ctx, wet ? '#6c6144' : '#938055', 2, 9, 16, 10);
    for (let row = 0; row < 3; row++) {
      rect(ctx, '#b0965f', 2, 10 + row * 3, 16, 1);
      if (!growth) continue;
      for (let col = 0; col < 4; col++) {
        const x = 3 + col * 4, y = 11 + row * 3;
        const crop = vegetables ? '#91aa5b' : farm.ripe || growth > 2 ? '#d8bd68' : '#7d9d51';
        rect(ctx, '#5d753d', x, y - growth, 1, growth + 1);
        rect(ctx, crop, x - 1, y - growth, 3, 1);
        if (growth > 2 && !vegetables) { rect(ctx, crop, x - 1, y - growth - 2, 1, 2); rect(ctx, '#e9d38a', x, y - growth - 3, 1, 2); }
        else if (growth > 1 && vegetables) { rect(ctx, '#afbc70', x - 1, y - growth - 1, 3, 2); rect(ctx, '#658849', x, y - growth, 1, 2); }
      }
    }
    rect(ctx, '#bdab78', 0, 8, 1, 12);
    rect(ctx, '#63563c', 19, 8, 1, 12);
  });
}

export function normalizeDirection(agent) {
  const d = agent.direction;
  if (typeof d === 'string') return ({ north: 0, up: 0, east: 1, right: 1, south: 2, down: 2, west: 3, left: 3 })[d] ?? 2;
  if (Number.isFinite(d)) return ((d % 4) + 4) % 4;
  if (Math.abs(agent.vx || 0) > Math.abs(agent.vy || 0)) return agent.vx > 0 ? 1 : 3;
  return agent.vy < 0 ? 0 : 2;
}

export function getLifeStage(agent) {
  if (['baby', 'child', 'teen', 'adult', 'elder'].includes(agent.lifeStage)) return agent.lifeStage;
  const age = Number(agent.age ?? 24);
  return age < 3 ? 'baby' : age < 12 ? 'child' : age < 18 ? 'teen' : age < 58 ? 'adult' : 'elder';
}

function appearanceOf(agent) {
  const seed = hashValue(agent.id ?? agent.name ?? 'villager');
  const a = agent.appearance || {};
  return {
    skin: pick(SKINS, a.skin, seed % 8),
    hair: pick(HAIRS, a.hair, (seed >>> 3) % 10),
    shirt: pick(OUTFITS, a.outfit, (seed >>> 6) % 12),
    accent: pick(ACCENTS, a.accent, (seed >>> 10) % 8),
    hairStyle: Math.abs(a.hairStyle ?? ((seed >>> 13) % 10)) % 10,
    body: Math.abs(a.variant ?? ((seed >>> 18) % 16)) % 16,
    beard: Math.abs(a.beard ?? ((seed >>> 22) % 4)) % 4,
    hat: Math.abs(a.hat ?? ((seed >>> 24) % 5)) % 5,
    seed,
  };
}

export function getAgentSprite(agent, time = 0, options = {}) {
  const a = appearanceOf(agent), stage = getLifeStage(agent), rawDir = normalizeDirection(agent);
  const dir = rawDir === 3 ? 1 : rawDir;
  const level = Math.min(20, Math.max(1, Math.floor(Number(agent.level) || 1)));
  const tier = level >= 10 ? 4 : level >= 7 ? 3 : level >= 4 ? 2 : level >= 2 ? 1 : 0;
  let action = typeof agent.action === 'string' ? agent.action : agent.action?.type || 'idle';
  if (options.action) action = options.action;
  const hasMotion = Math.abs(agent.vx || 0) + Math.abs(agent.vy || 0) > 0.025;
  const moving = !options.still && (['walk', 'migrate', 'flee', 'hunt'].includes(action) || (hasMotion && !['rest', 'eat', 'study'].includes(action)));
  if (hasMotion && !options.still && !['migrate', 'flee', 'hunt'].includes(action)) action = 'walk';
  const animated = moving || ['farm', 'chop', 'mine', 'build', 'craft', 'fight', 'gather', 'heal', 'fish', 'trade'].includes(action);
  const phase = options.still ? 0 : animated ? Math.floor(time * (action === 'flee' || action === 'fight' ? 9 : 6) + (a.seed % 7)) % 4 : Math.floor(time * 1.2 + (a.seed % 3)) % 2;
  const role = agent.role || 'gatherer';
  const isMale = !['female', 'f', 'woman', 'kadın'].includes(String(agent.sex).toLowerCase());
  const key = `person:${a.skin}:${a.hair}:${a.shirt}:${a.accent}:${a.hairStyle}:${a.body}:${a.beard}:${a.hat}:${isMale}:${stage}:${level}:${role}:${action}:${rawDir}:${phase}:${moving}`;
  return cached(key, 34, 38, 17, 34, ctx => {
    if (rawDir === 3) { ctx.translate(34, 0); ctx.scale(-1, 1); }
    const child = stage === 'child', baby = stage === 'baby', teen = stage === 'teen', elder = stage === 'elder';
    const short = a.body % 4 === 0;
    const height = baby ? 10 : child ? 15 : teen ? 19 : elder ? 20 : short ? 21 : 23;
    const wide = !baby && !child && a.body % 4 === 2;
    const bodyW = baby ? 5 : child ? 5 : wide ? 8 : 6;
    const cx = 17, footY = 34;
    let bob = moving ? [0, -1, 0, -1][phase] : 0;
    if (['farm', 'gather', 'mine'].includes(action) && phase > 1) bob += 2;
    const resting = action === 'rest';
    const top = footY - height + bob + (resting ? 4 : 0);
    const headH = baby ? 5 : child ? 6 : 6;
    const headW = baby ? 5 : wide ? 7 : 6;
    const headX = cx - Math.floor(headW / 2) + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
    const torsoY = top + headH + 1, legH = baby ? 2 : child ? 4 : teen ? 6 : 7;
    const torsoH = Math.max(3, footY - legH - torsoY);
    const torsoX = cx - Math.floor(bodyW / 2);
    const shirt = a.shirt, shirtDark = shade(shirt, -33), shirtLight = shade(shirt, 19);
    const skinDark = shade(a.skin, -27), hair = elder ? pick(['#c2bda6', '#a8aaa0', '#d2cdba'], a.body) : a.hair;
    const shoe = '#4d4435', pants = shade(shirt, -51);
    // Cloaks are deliberately behind the head and limbs, and show rank from afar.
    if (tier >= 3 && !baby && !child) {
      rect(ctx, shade(a.accent, -35), torsoX - 2, torsoY + 1, bodyW + 4, torsoH + 5);
      rect(ctx, a.accent, torsoX - 2, torsoY + 1, 2, torsoH + 4);
      if (moving && phase % 2) rect(ctx, shade(a.accent, -35), torsoX + bodyW + 1, torsoY + torsoH + 2, 2, 3);
    }
    const stride = moving ? [0, 2, 0, -2][phase] : 0;
    if (!resting) {
      rect(ctx, pants, cx - 3, footY - legH + bob, 2, legH + Math.max(0, stride));
      rect(ctx, pants, cx + 1, footY - legH + bob, 2, legH - Math.min(0, stride));
      rect(ctx, shoe, cx - 3 + (dir === 3 ? -1 : 0), footY - 1 + (stride > 0 ? -1 : 0), 3, 1);
      rect(ctx, shoe, cx + 1, footY - 1 + (stride < 0 ? -1 : 0), 3, 1);
    } else {
      rect(ctx, pants, cx - 5, footY - 3, 11, 2);
      rect(ctx, shoe, cx - 6, footY - 2, 3, 1);
      rect(ctx, shoe, cx + 4, footY - 2, 3, 1);
    }
    rect(ctx, shirtDark, torsoX - 1, torsoY, bodyW + 2, torsoH + 1);
    rect(ctx, shirt, torsoX, torsoY, bodyW, torsoH);
    rect(ctx, shirtLight, torsoX, torsoY + 1, 2, Math.max(1, torsoH - 2));
    if (a.body % 3 === 0 && !baby) {
      rect(ctx, a.accent, cx - 1, torsoY, 2, torsoH);
      rect(ctx, a.accent, torsoX, torsoY + torsoH - 1, bodyW, 1);
    }
    if (a.body % 5 === 1 && !baby) {
      // A longer split tunic is shared across genders rather than a single female body.
      rect(ctx, shirtDark, torsoX - 1, torsoY + torsoH - 1, bodyW + 2, 3);
      rect(ctx, shirt, torsoX, torsoY + torsoH - 1, bodyW, 2);
    }
    if (tier >= 1 && !baby) rect(ctx, '#68533b', torsoX, torsoY + torsoH - 2, bodyW, 1);
    if (tier >= 2 && !baby && !child) {
      pixelLine(ctx, a.accent, torsoX + bodyW - 1, torsoY, torsoX + 1, torsoY + torsoH - 1, 1);
      rect(ctx, '#83633e', torsoX - 2, torsoY + torsoH - 3, 3, 4);
      rect(ctx, '#c3a36b', torsoX - 2, torsoY + torsoH - 3, 3, 1);
    }
    if (tier >= 4 && !baby && !child) {
      rect(ctx, '#eacb7c', torsoX - 1, torsoY, 3, 2);
      rect(ctx, '#eacb7c', torsoX + bodyW - 2, torsoY, 3, 2);
    }
    let leftY = torsoY + 1 + (moving ? Math.sign(stride) : 0), rightY = torsoY + 1 - (moving ? Math.sign(stride) : 0);
    const activeHand = ['farm', 'chop', 'mine', 'build', 'craft', 'fight', 'gather', 'heal', 'fish', 'eat', 'study', 'trade'].includes(action);
    if (activeHand) rightY -= phase < 2 ? 2 : -1;
    rect(ctx, shirtDark, torsoX - 2, leftY, 2, 3);
    rect(ctx, a.skin, torsoX - 2, leftY + 3, 2, 2);
    rect(ctx, shirt, torsoX + bodyW, rightY, 2, 3);
    rect(ctx, a.skin, torsoX + bodyW, rightY + 3, 2, 2);
    // The head stays deliberately large enough for hair and direction to be legible.
    rect(ctx, skinDark, headX, top + 1, headW, headH);
    rect(ctx, a.skin, headX, top + 1, headW - 1, headH - 1);
    rect(ctx, shade(a.skin, 13), headX + 1, top + 2, 2, 2);
    rect(ctx, skinDark, cx - 1, torsoY - 1, 2, 1);
    if (dir !== 0) {
      if (dir !== 3) rect(ctx, '#3b3b30', headX + headW - 2, top + 3, 1, 1);
      if (dir !== 1) rect(ctx, '#3b3b30', headX + 1, top + 3, 1, 1);
      if (dir === 1) rect(ctx, a.skin, headX + headW, top + 4, 1, 1);
      if (dir === 3) rect(ctx, a.skin, headX - 1, top + 4, 1, 1);
    }
    const hs = a.hairStyle;
    if (!baby || a.body % 2) {
      if (hs !== 8) rect(ctx, hair, headX, top, headW, 2);
      if (hs === 0) { rect(ctx, hair, headX - 1, top + 1, 2, 3); rect(ctx, shade(hair, 22), headX + 1, top, 3, 1); }
      if (hs === 1) { rect(ctx, hair, headX - 1, top, headW + 2, 3); rect(ctx, hair, headX, top - 1, headW - 1, 1); }
      if (hs === 2) { rect(ctx, hair, headX - 1, top + 1, 2, 8); rect(ctx, hair, headX + headW - 1, top + 1, 2, 8); }
      if (hs === 3) { rect(ctx, hair, headX + (dir === 3 ? headW - 1 : -2), top + 2, 3, 4); rect(ctx, hair, headX + (dir === 3 ? headW : -1), top + 6, 2, 4); }
      if (hs === 4) { rect(ctx, hair, headX - 2, top + 1, 3, 3); rect(ctx, hair, headX + headW - 1, top + 1, 3, 3); }
      if (hs === 5) { rect(ctx, hair, headX - 1, top - 1, headW + 2, 4); rect(ctx, hair, headX - 2, top + 1, 2, 3); rect(ctx, shade(hair, 19), headX + 1, top - 1, 3, 1); }
      if (hs === 6) { rect(ctx, hair, headX + 2, top - 2, 2, 3); rect(ctx, hair, headX + 1, top - 1, 1, 2); }
      if (hs === 7) { rect(ctx, hair, headX - 1, top + 1, 2, 5); rect(ctx, hair, headX + headW - 1, top + 1, 2, 5); rect(ctx, a.accent, headX - 1, top + 2, headW + 2, 1); }
      if (hs === 8) { rect(ctx, hair, headX - 1, top + 2, 1, 3); rect(ctx, hair, headX + headW - 1, top + 2, 1, 3); }
      if (hs === 9) { rect(ctx, hair, headX - 1, top, headW + 2, 2); rect(ctx, hair, headX + 1, top - 1, headW - 2, 1); rect(ctx, hair, headX - 1, top + 1, 1, 5); }
      if (dir === 0) rect(ctx, hair, headX, top + 2, headW, headH - 2);
    }
    if (isMale && !baby && !child && !teen && a.beard > 0 && dir !== 0) {
      rect(ctx, hair, headX + 1, top + headH - 1, headW - 2, a.beard === 3 ? 3 : 1);
      if (a.beard > 1) { rect(ctx, hair, headX, top + headH - 2, 1, 2); rect(ctx, hair, headX + headW - 1, top + headH - 2, 1, 2); }
    }
    if (!baby && !child) {
      if (role === 'farmer' || (a.hat === 1 && ['gatherer', 'fisher', 'trader'].includes(role))) {
        rect(ctx, '#94733f', headX - 3, top, headW + 6, 2);
        rect(ctx, '#d5b775', headX - 2, top - 1, headW + 4, 1);
        rect(ctx, '#c4a565', headX, top - 3, headW, 3);
        rect(ctx, a.accent, headX, top - 1, headW, 1);
      } else if (role === 'warrior' || (a.hat === 3 && role === 'miner')) {
        rect(ctx, '#6f8780', headX - 1, top - 1, headW + 2, 3);
        rect(ctx, '#afc0ab', headX, top - 2, headW - 1, 2);
        rect(ctx, '#546e69', headX - 1, top + 1, 1, 3);
        rect(ctx, '#546e69', headX + headW, top + 1, 1, 3);
        if (tier > 1) rect(ctx, a.accent, cx, top - 4, 2, 3);
      } else if (role === 'scholar' || role === 'healer') {
        rect(ctx, a.accent, headX - 1, top - 1, headW + 2, 2);
        rect(ctx, shade(a.accent, -24), headX - 1, top, 1, 5);
      } else if (a.hat === 4) {
        rect(ctx, a.accent, headX - 1, top - 1, headW + 1, 2);
        rect(ctx, a.accent, headX + 1, top - 2, headW - 2, 1);
      }
    }
    const handX = torsoX + bodyW + 1, handY = rightY + 4;
    const raised = phase < 2;
    if (action === 'chop' || action === 'mine' || action === 'build' || action === 'craft') {
      const toolX = raised ? handX - 3 : handX + 6, toolY = raised ? handY - 9 : handY + 2;
      pixelLine(ctx, '#b49663', handX, handY, toolX, toolY, 1);
      if (action === 'chop') { rect(ctx, '#aebca9', toolX - 1, toolY - 1, 5, 4); rect(ctx, '#d0d7c0', toolX + 3, toolY, 1, 3); }
      else if (action === 'mine') { pixelLine(ctx, '#c2c6ae', toolX - 3, toolY + 1, toolX + 4, toolY - 2, 1); }
      else { rect(ctx, '#85968a', toolX - 2, toolY - 1, 5, 3); rect(ctx, '#b9c1a9', toolX - 2, toolY - 1, 5, 1); }
    } else if (action === 'farm') {
      pixelLine(ctx, '#c5a36a', handX - 1, handY - 4, handX + 6, handY + 5, 1);
      rect(ctx, '#a4b1a0', handX + 4, handY + 5, 5, 1);
      rect(ctx, '#879784', handX + 4, handY + 5, 1, 3);
    } else if (action === 'fish') {
      pixelLine(ctx, '#ae925f', handX - 1, handY + 1, 31, top + (raised ? 0 : 2), 1);
      pixelLine(ctx, '#d1ceb0', 31, top + (raised ? 0 : 2), 32, 32, 1);
    } else if (action === 'fight' || role === 'warrior' || action === 'hunt') {
      const weaponY = action === 'fight' && !raised ? handY : handY - 8;
      pixelLine(ctx, '#a7b7ae', handX, handY, action === 'fight' && !raised ? handX + 6 : handX + 2, weaponY, 1);
      rect(ctx, '#d8d4b5', handX - 1, handY - 1, 4, 1);
      rect(ctx, '#6b6550', torsoX - 4, torsoY + 3, 4, 7);
      rect(ctx, a.accent, torsoX - 3, torsoY + 4, 2, 4);
    } else if (['gather', 'trade', 'migrate'].includes(action) || role === 'trader') {
      rect(ctx, '#997448', torsoX - 4, torsoY + torsoH - 1, 5, 5);
      rect(ctx, '#c6a16a', torsoX - 4, torsoY + torsoH - 1, 5, 1);
      if (action === 'gather') rect(ctx, '#899b58', torsoX - 3, torsoY + torsoH - 3, 3, 2);
    } else if (action === 'study' || action === 'heal') {
      rect(ctx, '#eee0b9', handX - 5, handY - 1, 7, 4);
      rect(ctx, action === 'heal' ? '#769b77' : '#927c60', handX - 2, handY, 1, 3);
    } else if (action === 'eat') {
      rect(ctx, '#d4a966', handX - 2, handY - (raised ? 4 : 0), 3, 2);
    } else if (elder && !resting) {
      pixelLine(ctx, '#a08559', handX + 1, handY, handX + 2, 34, 1);
    }
    // Each of the twenty levels has its own hem embroidery, even between the
    // larger equipment milestones. Five stitches progress bronze→silver→gold→ivory.
    const thread = ['#c59762', '#c6d3bf', '#ebc872', '#efe1bf'][Math.floor((level - 1) / 5)];
    const stitches = (level - 1) % 5 + 1;
    for (let stitch = 0; stitch < 5; stitch++) rect(ctx, stitch < stitches ? thread : shirtDark, cx - 2 + stitch, torsoY + torsoH - 1, 1, 1);
  });
}

export function getAnimalSprite(animal, time = 0) {
  const species = animal.species || 'deer', variant = hashValue(animal.id) % 4;
  const dir = normalizeDirection(animal), frame = Math.floor(time * 5 + variant) % 4;
  return cached(`animal:${species}:${variant}:${dir}:${frame}`, 32, 30, 16, 27, ctx => {
    if (dir === 3) { ctx.translate(32, 0); ctx.scale(-1, 1); }
    const boar = species === 'boar', wolf = species === 'wolf';
    const body = boar ? '#77614b' : wolf ? '#899a8e' : '#b59666';
    const dark = shade(body, -30), light = shade(body, 30);
    const bodyY = boar ? 18 : wolf ? 18 : 15, bodyW = boar ? 15 : 13;
    rect(ctx, dark, 7, bodyY, bodyW, boar ? 7 : 6);
    rect(ctx, body, 8, bodyY - 1, bodyW - 1, boar ? 7 : 6);
    rect(ctx, light, 9, bodyY, 7, 1);
    for (let i = 0; i < 4; i++) {
      const offset = ((frame + i) % 4) < 2 ? 1 : 0;
      rect(ctx, i % 2 ? dark : body, 9 + i * 3, bodyY + 5, 1, 6 - offset);
      rect(ctx, '#4c4c3a', 9 + i * 3, bodyY + 10 - offset, 2, 1);
    }
    const headY = boar ? 17 : wolf ? 15 : 10;
    rect(ctx, body, 19, headY + 3, 4, bodyY - headY + 2);
    rect(ctx, body, 20, headY, boar ? 7 : 6, 6);
    rect(ctx, dark, boar ? 25 : 24, headY + 3, 4, 3);
    rect(ctx, light, 21, headY + 1, 4, 2);
    rect(ctx, '#303d33', 24, headY + 2, 1, 1);
    rect(ctx, dark, 21, headY - 2, 2, 3);
    if (boar) rect(ctx, '#e8d6ae', 27, headY + 4, 1, 2);
    else if (wolf) {
      rect(ctx, dark, 24, headY - 1, 2, 3);
      pixelLine(ctx, dark, 7, bodyY + 2, 2, bodyY + (frame % 2 ? 0 : 4), 2);
    } else {
      rect(ctx, '#d6c5a0', 6, bodyY + 1, 2, 3);
      if (variant % 2 === 0) {
        pixelLine(ctx, '#735e43', 22, headY, 21, headY - 7, 1);
        pixelLine(ctx, '#735e43', 21, headY - 4, 18, headY - 6, 1);
        pixelLine(ctx, '#735e43', 24, headY, 25, headY - 6, 1);
        rect(ctx, '#735e43', 26, headY - 6, 1, 2);
      }
      if (variant === 1) for (const [x, y] of [[10, 17], [14, 16], [16, 19]]) rect(ctx, '#dac9a1', x, y, 1, 1);
    }
  });
}

export function drawSprite(ctx, sprite, x, y, scale = 1) {
  ctx.drawImage(sprite.canvas, Math.round(x - sprite.anchorX * scale), Math.round(y - sprite.anchorY * scale), sprite.width * scale, sprite.height * scale);
}

export function drawPortrait(ctx, agent, size = 64, time = 0) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  rect(ctx, '#1e3536', 0, 0, size, size);
  rect(ctx, '#263f3d', size * 0.13, size * 0.12, size * 0.74, size * 0.72);
  rect(ctx, '#29483f', size * 0.22, size * 0.08, size * 0.56, size * 0.8);
  rect(ctx, '#63866345', size * 0.17, size * 0.81, size * 0.66, 4);
  rect(ctx, '#63866325', size * 0.27, size * 0.87, size * 0.46, 2);
  const scale = Math.max(1, Math.floor(size / 32));
  const sprite = getAgentSprite({ ...agent, direction: 2 }, time, { action: 'idle', still: true });
  drawSprite(ctx, sprite, size / 2, Math.floor(size * 0.88), scale);
  ctx.restore();
}

export function getAtlasStats() {
  return { sprites: terrainAtlas.size + environmentAtlas.size + peopleAtlas.size, people: peopleAtlas.size, max: MAX_ATLAS };
}

