import {
  TILE_SIZE, PALETTE, hashValue, noise, normalizeSeason, getTerrainSprite,
  getTreeSprite, getPropSprite, getBuildingSprite, getFarmSprite,
  getAgentSprite, getAnimalSprite, getLifeStage, drawSprite, recoverTerrainSprites,
} from './sprites.js';

const WATER = new Set(['water', 'deepwater']);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const LAND_COLORS = {
  deepwater: '#2b5a70', water: '#397f8c', sand: '#c6b789', grass: '#849b59',
  forest: '#537749', hill: '#949d7a', mountain: '#8d9d92', snow: '#d0dac7',
};

function makeLayer(width, height) {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  canvas.getContext('2d').imageSmoothingEnabled = false;
  return canvas;
}

function fill(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function hexAlpha(color, alpha) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return `${color}${Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, '0')}`;
  return color;
}

function marker(ctx, x, y, size, color = PALETTE.gold, corners = true) {
  const half = size / 2;
  if (!corners) {
    fill(ctx, color, x - half, y - half, size, 1);
    fill(ctx, color, x - half, y + half, size, 1);
    fill(ctx, color, x - half, y - half, 1, size);
    fill(ctx, color, x + half, y - half, 1, size);
    return;
  }
  const length = Math.max(3, size * 0.27);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const px = x + sx * half, py = y + sy * half;
    fill(ctx, color, sx < 0 ? px : px - length + 1, py, length, 1);
    fill(ctx, color, px, sy < 0 ? py : py - length + 1, 1, length);
  }
}

function getTile(world, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  return x >= 0 && y >= 0 && x < world.width && y < world.height ? world.tiles[y * world.width + x] : null;
}

function getSelected(world, selection) {
  if (!selection) return null;
  if (selection.type === 'agent') return world.agents.find(agent => agent.id === selection.id) || null;
  if (selection.type === 'building') return world.buildings.find(building => building.id === selection.id) || null;
  if (selection.type === 'settlement') return world.settlements.find(settlement => settlement.id === selection.id) || null;
  return getTile(world, selection.x, selection.y);
}

/**
 * Read-only renderer and camera. Pixel world coordinates are independent of DPR.
 * Simulation RNG is never used here; decorative variations use a local hash.
 */
export class WorldRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.options = options;
    this.world = null;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.camera = { x: 44, y: 32, zoom: 1 };
    this.ground = null;
    this.overview = null;
    this.overviewDirty = true;
    this.groundSeason = null;
    this.groundDay = -100;
    this.groundTime = -100;
    this.lastTick = -1;
    this.positions = new Map();
    this.pointerPositions = new Map();
    this.listeners = [];
    this.hover = null;
    this.view = { tool: 'inspect', overlay: 'natural' };
    this.lastTime = 0;
    this.animationTime = 0;
    this.lightLevel = 0;
    this.seed = 0;
    this.selectedObject = null;
    this.canvas.style.touchAction = 'none';
    this.canvas.style.imageRendering = 'pixelated';
    this.attachInteractions();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
    this.resize();
  }

  setWorld(world) {
    this.world = world;
    this.seed = hashValue(world.seed);
    this.ground = null;
    this.overview = null;
    this.overviewDirty = true;
    this.groundSeason = null;
    this.groundDay = -100;
    this.groundTime = -100;
    this.positions.clear();
    this.lastTick = -1;
    this.selectedObject = null;
    this.camera.x = world.width / 2;
    this.camera.y = world.height / 2;
    this.hover = null;
  }

  resize() {
    const box = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, box.width || this.canvas.parentElement?.clientWidth || 800);
    this.height = Math.max(1, box.height || this.canvas.parentElement?.clientHeight || 600);
    this.dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    const width = Math.round(this.width * this.dpr), height = Math.round(this.height * this.dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.imageSmoothingEnabled = false;
    this.limitCamera();
  }

  focus(x, y, zoom) {
    if (typeof x === 'object') { zoom = x.zoom; y = x.y; x = x.x; }
    if (Number.isFinite(x)) this.camera.x = x;
    if (Number.isFinite(y)) this.camera.y = y;
    if (Number.isFinite(zoom)) this.camera.zoom = clamp(zoom, 0.3, 5.5);
    this.limitCamera();
    this.notifyCamera(false);
  }

  fitWorld() {
    if (!this.world) return;
    this.resize();
    this.camera.x = this.world.width / 2;
    this.camera.y = this.world.height / 2;
    this.camera.zoom = clamp(Math.min(this.width / (this.world.width * TILE_SIZE + 48), this.height / (this.world.height * TILE_SIZE + 48)), 0.3, 3);
    this.notifyCamera(false);
  }

  zoomBy(factor) {
    this.zoomAt(factor, this.width / 2, this.height / 2, true);
  }

  zoomAt(factor, sx, sy, userInput = true) {
    const before = this.screenToWorld(sx, sy);
    this.camera.zoom = clamp(this.camera.zoom * factor, 0.3, 5.5);
    const after = this.screenToWorld(sx, sy);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
    this.limitCamera();
    this.notifyCamera(userInput);
  }

  screenToWorld(sx, sy) {
    return {
      x: this.camera.x + (sx - this.width / 2) / this.camera.zoom / TILE_SIZE,
      y: this.camera.y + (sy - this.height / 2) / this.camera.zoom / TILE_SIZE,
    };
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.camera.x) * TILE_SIZE * this.camera.zoom + this.width / 2,
      y: (y - this.camera.y) * TILE_SIZE * this.camera.zoom + this.height / 2,
    };
  }

  notifyCamera(userInput) {
    this.options.onCameraChange?.({ ...this.camera, userInput });
  }

  limitCamera() {
    if (!this.world) return;
    const halfX = this.width / TILE_SIZE / this.camera.zoom / 2;
    const halfY = this.height / TILE_SIZE / this.camera.zoom / 2;
    if (halfX > this.world.width / 2 + 1) this.camera.x = this.world.width / 2;
    else this.camera.x = clamp(this.camera.x, Math.max(0, halfX - 3), this.world.width - Math.max(0, halfX - 3));
    if (halfY > this.world.height / 2 + 1) this.camera.y = this.world.height / 2;
    else this.camera.y = clamp(this.camera.y, Math.max(0, halfY - 3), this.world.height - Math.max(0, halfY - 3));
  }

  attachInteractions() {
    const listen = (type, callback, options) => {
      this.canvas.addEventListener(type, callback, options);
      this.listeners.push([type, callback, options]);
    };
    const point = event => {
      const box = this.canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };
    listen('contextmenu', event => event.preventDefault());
    listen('wheel', event => {
      event.preventDefault();
      const p = point(event);
      this.zoomAt(Math.exp(-clamp(event.deltaY, -100, 100) * 0.003), p.x, p.y, true);
    }, { passive: false });
    listen('pointerdown', event => {
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
      event.preventDefault();
      this.canvas.focus({ preventScroll: true });
      this.canvas.setPointerCapture?.(event.pointerId);
      const p = point(event);
      this.pointerPositions.set(event.pointerId, p);
      this.pointer = { id: event.pointerId, start: p, last: p, moved: false, button: event.button };
      if (this.pointerPositions.size === 2) {
        const [a, b] = [...this.pointerPositions.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.camera.zoom, at: this.screenToWorld(mid.x, mid.y) };
        this.pointer.moved = true;
      } else if (this.view.tool !== 'inspect' && this.view.tool && event.button === 0) {
        this.paintAt(p);
      }
    });
    listen('pointermove', event => {
      const p = point(event);
      const worldPoint = this.screenToWorld(p.x, p.y);
      const tile = this.world && getTile(this.world, worldPoint.x, worldPoint.y);
      this.hover = tile ? { x: tile.x, y: tile.y } : null;
      this.options.onHover?.(tile ? { x: tile.x, y: tile.y, tile } : null);
      if (this.pointerPositions.has(event.pointerId)) this.pointerPositions.set(event.pointerId, p);
      if (this.pinch && this.pointerPositions.size >= 2) {
        const [a, b] = [...this.pointerPositions.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        this.camera.zoom = clamp(this.pinch.zoom * distance / Math.max(1, this.pinch.distance), 0.3, 5.5);
        this.camera.x = this.pinch.at.x - (mid.x - this.width / 2) / this.camera.zoom / TILE_SIZE;
        this.camera.y = this.pinch.at.y - (mid.y - this.height / 2) / this.camera.zoom / TILE_SIZE;
        this.limitCamera();
        this.notifyCamera(true);
        return;
      }
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      if (Math.hypot(p.x - this.pointer.start.x, p.y - this.pointer.start.y) > 4) this.pointer.moved = true;
      if (this.view.tool && this.view.tool !== 'inspect' && this.pointer.button === 0) {
        if (this.pointer.moved) this.paintAt(p);
      } else if (this.pointer.moved) {
        this.camera.x -= (p.x - this.pointer.last.x) / this.camera.zoom / TILE_SIZE;
        this.camera.y -= (p.y - this.pointer.last.y) / this.camera.zoom / TILE_SIZE;
        this.limitCamera();
        this.notifyCamera(true);
        this.canvas.style.cursor = 'grabbing';
      }
      this.pointer.last = p;
    });
    const finish = event => {
      const wasPinch = Boolean(this.pinch);
      this.pointerPositions.delete(event.pointerId);
      if (this.pointerPositions.size < 2) this.pinch = null;
      if (this.pointer?.id === event.pointerId) {
        if (!this.pointer.moved && !wasPinch && event.type !== 'pointercancel' && this.pointer.button === 0 && (!this.view.tool || this.view.tool === 'inspect')) {
          const p = point(event);
          this.options.onSelect?.(this.hitTest(this.screenToWorld(p.x, p.y)));
        }
        this.pointer = null;
      }
      this.canvas.style.cursor = this.view.tool && this.view.tool !== 'inspect' ? 'crosshair' : 'grab';
      if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };
    listen('pointerup', finish);
    listen('pointercancel', finish);
    listen('pointerleave', () => {
      if (!this.pointer) { this.hover = null; this.options.onHover?.(null); }
    });
  }

  paintAt(p) {
    if (!this.world) return;
    const at = this.screenToWorld(p.x, p.y);
    const tile = getTile(this.world, at.x, at.y);
    if (tile) this.options.onPaint?.({ type: this.view.tool, x: tile.x, y: tile.y });
  }

  hitTest(at) {
    if (!this.world) return null;
    let best = null, distance = Infinity;
    for (const agent of this.world.agents) {
      if (agent.alive === false) continue;
      const d = Math.hypot(agent.x - at.x, (agent.y - at.y - (getLifeStage(agent) === 'baby' ? 0.3 : 0.55)) * 0.8);
      if (d < Math.max(0.55, 0.58 / this.camera.zoom) && d < distance) { best = agent; distance = d; }
    }
    if (best) return { type: 'agent', id: best.id };
    for (const building of [...this.world.buildings].reverse()) {
      const dx = at.x - (building.x + 0.5), dy = at.y - (building.y + 0.5);
      const radius = building.type === 'campfire' || building.type === 'well' ? 0.7 : 1.45;
      if (Math.abs(dx) < radius && dy < 0.5 && dy > (building.type === 'watchtower' ? -3.8 : -2.6)) return { type: 'building', id: building.id };
    }
    for (const settlement of this.world.settlements) {
      if (Math.hypot(settlement.x + 0.5 - at.x, settlement.y + 0.5 - at.y) < 1.7) return { type: 'settlement', id: settlement.id };
    }
    const tile = getTile(this.world, at.x, at.y);
    return tile ? { type: 'tile', x: tile.x, y: tile.y } : null;
  }

  buildGround(world, season) {
    // An aging world may exhaust canvas backing stores as character animation
    // variants accumulate. Discard invalid terrain sprites BEFORE rebuilding,
    // otherwise drawImage silently copies transparent pixels to the map.
    recoverTerrainSprites(season);
    const width = world.width * TILE_SIZE, height = world.height * TILE_SIZE;
    if (!this.ground || this.ground.width !== width || this.ground.height !== height) this.ground = makeLayer(width, height);
    const ctx = this.ground.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    const at = (x, y) => x >= 0 && y >= 0 && x < world.width && y < world.height ? world.tiles[y * world.width + x] : null;
    for (const tile of world.tiles) {
      const seed = hashValue(`${this.seed}:${tile.x}:${tile.y}`);
      ctx.drawImage(getTerrainSprite(tile.biome, seed % 12, season).canvas, tile.x * TILE_SIZE, tile.y * TILE_SIZE);
    }
    for (const tile of world.tiles) {
      const x = tile.x * TILE_SIZE, y = tile.y * TILE_SIZE;
      const seed = hashValue(`${tile.x}:${tile.y}:${this.seed}`);
      const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const isWater = WATER.has(tile.biome);
      for (let i = 0; i < directions.length; i++) {
        const neighbor = at(tile.x + directions[i][0], tile.y + directions[i][1]);
        if (!neighbor || isWater === WATER.has(neighbor.biome)) continue;
        const shore = isWater ? '#699e9b' : (season === 'winter' ? '#b8c5ab' : '#c9b98a');
        const edge = isWater ? '#adc5af' : '#dbcca1';
        if (i === 0) { fill(ctx, shore, x, y, 16, 3); fill(ctx, edge, x + (seed % 3), y, 11, 1); }
        if (i === 1) { fill(ctx, shore, x + 13, y, 3, 16); fill(ctx, edge, x + 15, y + (seed % 3), 1, 11); }
        if (i === 2) { fill(ctx, shore, x, y + 13, 16, 3); fill(ctx, edge, x + (seed % 3), y + 15, 11, 1); }
        if (i === 3) { fill(ctx, shore, x, y, 3, 16); fill(ctx, edge, x, y + (seed % 3), 1, 11); }
      }
      if (tile.biome === 'hill' || tile.biome === 'mountain') {
        const south = at(tile.x, tile.y + 1);
        if (south && tile.elevation - south.elevation > 0.06) {
          fill(ctx, '#6b7d66', x + 1, y + 13, 14, 2);
          fill(ctx, '#b2b99a', x + 2, y + 12, 12, 1);
        }
      }
      if (tile.burn > 0.1) {
        ctx.globalAlpha = clamp(tile.burn * 0.65, 0, 0.7);
        fill(ctx, '#58573c', x, y, 16, 16);
        ctx.globalAlpha = 1;
      }
      if (tile.road > 0.12 && !isWater) {
        const road = season === 'winter' ? '#a5aa8c' : '#b8a475';
        const width = tile.road > 0.7 ? 7 : 5, offset = Math.floor((16 - width) / 2);
        fill(ctx, road, x + offset, y + offset, width, width);
        if ((at(tile.x - 1, tile.y)?.road || 0) > 0.12) fill(ctx, road, x, y + offset, 8, width);
        if ((at(tile.x + 1, tile.y)?.road || 0) > 0.12) fill(ctx, road, x + 8, y + offset, 8, width);
        if ((at(tile.x, tile.y - 1)?.road || 0) > 0.12) fill(ctx, road, x + offset, y, width, 8);
        if ((at(tile.x, tile.y + 1)?.road || 0) > 0.12) fill(ctx, road, x + offset, y + 8, width, 8);
        fill(ctx, '#bba879', x + 6, y + 6, 3, 1);
        fill(ctx, '#93865e', x + 10, y + 10, 1, 1);
      }
    }
    this.groundSeason = season;
    this.groundDay = world.day;
    this.overviewDirty = true;
  }

  environmentObjects(world, bounds, season, occupied = null, clearings = null) {
    const objects = [];
    for (let y = bounds.y0; y <= bounds.y1; y++) for (let x = bounds.x0; x <= bounds.x1; x++) {
      const tile = world.tiles[y * world.width + x];
      if (!tile) continue;
      const seed = hashValue(`${this.seed}:${x}:${y}`), variant = seed % 6;
      const px = x + 0.3 + noise(seed, 1) * 0.4, py = y + 0.4 + noise(seed, 2) * 0.4;
      if (tile.trees > 0.4) {
        const kind = tile.biome === 'snow' || tile.elevation > 0.69 ? 0 : ((seed >>> 5) % 4);
        const opacity = clearings?.has(`${x}:${y}`) ? 0.3 : occupied?.has(`${x}:${y}`) ? 0.62 : 1;
        objects.push({ type: 'tree', x: px, y: py, kind, variant, opacity });
        if (tile.trees > 6 && seed % 3 === 0) objects.push({ type: 'tree', x: px + 0.45, y: py + 0.35, kind, variant: (variant + 2) % 6, small: true, opacity });
      } else if (tile.burn > 0.35 && seed % 3 === 0) objects.push({ type: 'prop', x: px, y: py, prop: 'stump', variant });
      else if (tile.stone > 1.5 && (seed % 3 !== 0 || tile.biome === 'mountain')) objects.push({ type: 'prop', x: px, y: py, prop: tile.biome === 'mountain' ? 'mountain' : tile.ore > 2 ? 'ore' : 'rock', variant });
      else if (tile.food > 2.7 && seed % 5 === 0) objects.push({ type: 'prop', x: px, y: py, prop: 'bush', variant });
      else if (tile.biome === 'grass' && tile.moisture > 0.35 && seed % 17 === 0 && season !== 'winter') objects.push({ type: 'prop', x: px, y: py, prop: 'flowers', variant });
      else if (tile.biome === 'sand' && seed % 9 === 0) objects.push({ type: 'prop', x: px, y: py, prop: 'reeds', variant });
      else if (tile.biome === 'water' && tile.fish > 8 && seed % 29 === 0) objects.push({ type: 'prop', x: px, y: py, prop: 'lily', variant });
    }
    return objects;
  }

  overviewLayer(world, season) {
    if (!this.overview || this.overview.width !== world.width * TILE_SIZE + 96 || this.overview.height !== world.height * TILE_SIZE + 96) {
      this.overview = makeLayer(world.width * TILE_SIZE + 96, world.height * TILE_SIZE + 96);
      this.overviewDirty = true;
    }
    if (this.overviewDirty) {
      const ctx = this.overview.getContext('2d');
      ctx.clearRect(0, 0, this.overview.width, this.overview.height);
      const objects = this.environmentObjects(world, { x0: 0, y0: 0, x1: world.width - 1, y1: world.height - 1 }, season);
      objects.sort((a, b) => a.y - b.y);
      for (const object of objects) {
        const sprite = object.type === 'tree' ? getTreeSprite(object.kind, object.variant, season, object.small) : getPropSprite(object.prop, object.variant, season);
        drawSprite(ctx, sprite, object.x * TILE_SIZE + 48, object.y * TILE_SIZE + 48);
      }
      this.overviewDirty = false;
    }
    return this.overview;
  }

  updatePositions(world) {
    if (this.lastTick === world.tick) return;
    for (const agent of world.agents) {
      const old = this.positions.get(agent.id);
      this.positions.set(agent.id, { fromX: old?.toX ?? agent.x, fromY: old?.toY ?? agent.y, toX: agent.x, toY: agent.y });
    }
    if (this.positions.size > world.agents.length * 1.25 + 20) {
      const alive = new Set(world.agents.map(agent => agent.id));
      for (const id of this.positions.keys()) if (!alive.has(id)) this.positions.delete(id);
    }
    this.lastTick = world.tick;
  }

  render(world, view = {}) {
    if (!world) return;
    if (world !== this.world) this.setWorld(world);
    this.view = { ...this.view, ...view };
    const clock = Number(view.time) || 0;
    const elapsed = Math.min(0.1, Math.max(0, clock - this.lastTime));
    if (!view.paused) this.animationTime += elapsed;
    this.lastTime = clock;
    const time = this.animationTime;
    const season = normalizeSeason(world.season);
    const selected = getSelected(world, view.selected);
    this.selectedObject = selected;
    if (view.follow && view.selected?.type === 'agent' && selected) {
      const blend = 1 - Math.exp(-elapsed * 8);
      this.camera.x += (selected.x - this.camera.x) * blend;
      this.camera.y += (selected.y - this.camera.y) * blend;
      this.limitCamera();
    }
    if (!this.ground || this.groundSeason !== season || (Math.abs(world.day - this.groundDay) > 0.7 && clock - this.groundTime > 1.4)) {
      this.buildGround(world, season);
      this.groundTime = clock;
    }
    this.updatePositions(world);
    const ctx = this.ctx, zoom = this.camera.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    fill(ctx, '#243a39', 0, 0, this.width, this.height);
    // A quiet woven backdrop is visible only beyond the map, never a UI grid.
    ctx.fillStyle = '#2a4140';
    for (let y = 0; y < this.height; y += 16) for (let x = (y % 32 ? 8 : 0); x < this.width; x += 16) ctx.fillRect(x, y, 1, 1);
    ctx.setTransform(this.dpr * zoom, 0, 0, this.dpr * zoom,
      this.dpr * (this.width / 2 - this.camera.x * TILE_SIZE * zoom),
      this.dpr * (this.height / 2 - this.camera.y * TILE_SIZE * zoom));
    ctx.imageSmoothingEnabled = false;
    fill(ctx, '#102b2b45', -3, -3, world.width * TILE_SIZE + 6, world.height * TILE_SIZE + 6);
    ctx.drawImage(this.ground, 0, 0);
    const halfX = this.width / TILE_SIZE / zoom / 2, halfY = this.height / TILE_SIZE / zoom / 2;
    const bounds = {
      x0: Math.max(0, Math.floor(this.camera.x - halfX) - 3), x1: Math.min(world.width - 1, Math.ceil(this.camera.x + halfX) + 3),
      y0: Math.max(0, Math.floor(this.camera.y - halfY) - 3), y1: Math.min(world.height - 1, Math.ceil(this.camera.y + halfY) + 5),
    };
    const inBounds = object => object.x >= bounds.x0 - 2 && object.x <= bounds.x1 + 2 && object.y >= bounds.y0 - 2 && object.y <= bounds.y1 + 3;
    this.drawWater(ctx, world, bounds, time);
    if (this.view.overlay && this.view.overlay !== 'natural') this.drawOverlay(ctx, world, bounds, this.view.overlay);
    const overview = zoom < 1;
    // At map scale silhouettes are easier to read above the canopy; hundreds of
    // immutable trees share one cached image instead of thousands of draw calls.
    if (overview) ctx.drawImage(this.overviewLayer(world, season), -48, -48);
    for (const farm of world.farms || []) if (inBounds(farm)) drawSprite(ctx, getFarmSprite(farm, season), (farm.x + 0.5) * TILE_SIZE, (farm.y + 0.5) * TILE_SIZE);
    const objects = [], occupied = new Set();
    const visibleAgents = world.agents.filter(agent => agent.alive !== false && inBounds(agent));
    const alpha = view.paused ? 1 : clamp(view.alpha ?? 1, 0, 1);
    for (const agent of visibleAgents) {
      const position = this.positions.get(agent.id);
      const x = position ? position.fromX + (position.toX - position.fromX) * alpha : agent.x;
      const y = position ? position.fromY + (position.toY - position.fromY) * alpha : agent.y;
      objects.push({ type: 'agent', x, y, data: agent });
      for (let oy = 0; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) occupied.add(`${Math.floor(x) + ox}:${Math.floor(y) + oy}`);
    }
    const settlementColors = new Map((world.settlements || []).map(settlement => [settlement.id, settlement.color || '#c4aa6a']));
    if (!overview) {
      const clearings = new Set();
      for (const building of world.buildings || []) if (inBounds(building)) {
        for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) clearings.add(`${Math.floor(building.x) + dx}:${Math.floor(building.y) + dy}`);
      }
      for (const farm of world.farms || []) if (inBounds(farm)) {
        for (let dy = 0; dy <= 1; dy++) clearings.add(`${Math.floor(farm.x)}:${Math.floor(farm.y) + dy}`);
      }
      objects.push(...this.environmentObjects(world, bounds, season, occupied, clearings));
    }
    for (let y = bounds.y0; y <= bounds.y1; y++) for (let x = bounds.x0; x <= bounds.x1; x++) {
      const tile = world.tiles[y * world.width + x];
      if (tile?.fire > 0.01) objects.push({ type: 'fire', x: x + 0.5, y: y + 0.5, data: tile });
    }
    for (const building of world.buildings || []) if (inBounds(building)) objects.push({ type: 'building', x: building.x + 0.5, y: building.y + 0.5, data: building });
    for (const animal of world.animals || []) if (inBounds(animal)) objects.push({ type: 'animal', x: animal.x, y: animal.y, data: animal });
    for (const grave of (world.graves || []).slice(-120)) if (inBounds(grave)) objects.push({ type: 'prop', x: grave.x, y: grave.y, prop: 'grave', variant: 0 });
    objects.sort((a, b) => a.y - b.y || (a.type === 'agent' ? 1 : -1));
    // Smooth actual day light so accelerated simulation never produces flashes.
    const dayFraction = ((world.day % 1) + 1) % 1;
    const targetDarkness = Math.max(0, Math.cos((dayFraction + 0.08) * Math.PI * 2)) * 0.16;
    this.lightLevel += (targetDarkness - this.lightLevel) * (1 - Math.exp(-elapsed * 0.8));
    const darkness = this.lightLevel;
    for (const object of objects) {
      const x = object.x * TILE_SIZE, y = object.y * TILE_SIZE;
      if (object.type === 'tree') {
        ctx.globalAlpha = object.opacity ?? 1;
        drawSprite(ctx, getTreeSprite(object.kind, object.variant, season, object.small), x, y);
        ctx.globalAlpha = 1;
      } else if (object.type === 'prop') drawSprite(ctx, getPropSprite(object.prop, object.variant, season), x, y);
      else if (object.type === 'building') {
        const building = object.data;
        drawSprite(ctx, getBuildingSprite(building, settlementColors.get(building.settlementId) || '#c4aa6a', season, darkness > 0.09), x, y);
        this.drawBuildingDetails(ctx, building, x, y, time, darkness);
      } else if (object.type === 'agent') {
        this.drawAgent(ctx, object.data, x, y, time, view.selected?.type === 'agent' && view.selected.id === object.data.id, settlementColors);
      } else if (object.type === 'animal') {
        fill(ctx, '#30483435', x - 8, y - 1, 17, 3);
        drawSprite(ctx, getAnimalSprite(object.data, time), x, y);
      } else if (object.type === 'fire') this.drawFire(ctx, x, y, object.data.fire, time + object.x);
    }
    this.drawEffects(ctx, world.effects || [], bounds, time);
    this.drawAtmosphere(ctx, world, bounds, time, darkness);
    this.drawSelection(ctx, selected, view.selected, time);
    this.drawHover(ctx, world);
    this.drawSettlementLabels(ctx, world, bounds, view.selected, zoom);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    if (!this.pointer) this.canvas.style.cursor = this.view.tool && this.view.tool !== 'inspect' ? 'crosshair' : 'grab';
  }

  drawWater(ctx, world, bounds, time) {
    const frame = Math.floor(time * 2) % 4;
    for (let y = bounds.y0; y <= bounds.y1; y++) for (let x = bounds.x0; x <= bounds.x1; x++) {
      const tile = world.tiles[y * world.width + x];
      if (!WATER.has(tile?.biome)) continue;
      const seed = hashValue(`${x}:${y}:${this.seed}`);
      if (seed % 5 !== 0) continue;
      const offset = (frame + (seed % 4)) % 4;
      const color = tile.biome === 'deepwater' ? '#4d8090' : '#83b4ad';
      fill(ctx, color, x * 16 + 3 + offset, y * 16 + 5 + (seed % 7), 3 + (seed % 4), 1);
      if (seed % 13 === 0 && offset === 0) { fill(ctx, '#bfd3bd', x * 16 + 8, y * 16 + 4, 1, 3); fill(ctx, '#bfd3bd', x * 16 + 7, y * 16 + 5, 3, 1); }
    }
  }

  drawOverlay(ctx, world, bounds, overlay) {
    const settlements = world.settlements || [];
    for (let y = bounds.y0; y <= bounds.y1; y++) for (let x = bounds.x0; x <= bounds.x1; x++) {
      const tile = world.tiles[y * world.width + x];
      if (!tile || WATER.has(tile.biome)) continue;
      let color = null;
      if (overlay === 'fertility') {
        const f = clamp(tile.fertility || 0, 0, 1);
        color = `rgba(${Math.round(193 - f * 85)},${Math.round(107 + f * 70)},74,.44)`;
      } else if (overlay === 'resources') {
        const rich = (tile.food || 0) + (tile.trees || 0) * 0.6 + (tile.ore || 0) + (tile.stone || 0) * 0.3;
        if (rich > 0.5) color = `rgba(239,200,108,${clamp(rich / 35, 0.03, 0.52)})`;
      } else if (overlay === 'territory') {
        let nearest = null, nearestD = Infinity;
        for (const settlement of settlements) {
          const radius = 5 + ['camp', 'hamlet', 'village', 'town', 'city'].indexOf(settlement.stage) * 1.8 + Math.sqrt(settlement.population || 1) * 0.35;
          const d = Math.hypot(x - settlement.x, y - settlement.y);
          if (d < radius && d < nearestD) { nearest = settlement; nearestD = d; }
        }
        if (nearest) color = hexAlpha(nearest.color || '#d3bd7a', 0.3);
      } else if (overlay === 'danger') {
        if (tile.fire > 0) color = '#e8895966';
        else if ((tile.food || 0) < 0.2 && (tile.fertility || 0) < 0.3) color = '#c4734940';
      }
      if (color) fill(ctx, color, x * TILE_SIZE, y * TILE_SIZE, 16, 16);
    }
    if (overlay === 'danger') {
      for (const agent of world.agents) if (['fight', 'flee'].includes(agent.action?.type)) marker(ctx, agent.x * 16, agent.y * 16, 32, '#e7987566', false);
      for (const animal of world.animals || []) if (animal.species === 'wolf') marker(ctx, animal.x * 16, animal.y * 16, 24, '#d39c7555', false);
    }
  }

  drawAgent(ctx, agent, x, y, time, selected, colors) {
    const baby = getLifeStage(agent) === 'baby';
    fill(ctx, selected ? '#735c3d75' : '#34483548', x - (baby ? 3 : 5), y - 1, baby ? 7 : 11, 3);
    if (selected) marker(ctx, x, y, 17, '#ecd190', true);
    drawSprite(ctx, getAgentSprite(agent, time), x, y);
    const action = agent.action?.type || agent.action || 'idle';
    const seed = hashValue(agent.id), phase = (time * 2.7 + noise(seed, 1)) % 1;
    if (this.camera.zoom > 0.7 && Math.abs(agent.vx || 0) + Math.abs(agent.vy || 0) < 0.025) {
      if (['chop', 'mine', 'craft', 'build', 'farm'].includes(action) && phase < 0.65) {
        const colors = action === 'chop' ? ['#d9b27a', '#ac814b'] : action === 'farm' ? ['#dbc16f', '#99aa58'] : ['#d7d2ae', '#bba978'];
        for (let i = 0; i < 3; i++) {
          fill(ctx, colors[i % 2], x + 6 + i * 3 + phase * 4, y - 3 - Math.sin(phase * Math.PI) * (5 + i * 2), 1, 1);
        }
      } else if (action === 'fish' && phase < 0.2) {
        fill(ctx, '#b6d5c3', x + 14, y - 2, 3, 1);
        fill(ctx, '#b6d5c3', x + 17, y - 3, 1, 2);
      } else if (action === 'fight' && phase < 0.3) {
        fill(ctx, '#eed99d', x + 8, y - 12, 3, 1);
        fill(ctx, '#d1986a', x + 9, y - 13, 1, 3);
      } else if (action === 'rest' && phase < 0.5) {
        const rise = Math.floor(phase * 8);
        fill(ctx, '#d5d7b5a0', x + 5, y - 21 - rise, 3, 1);
        fill(ctx, '#d5d7b5a0', x + 6, y - 20 - rise, 1, 1);
        fill(ctx, '#d5d7b5a0', x + 5, y - 19 - rise, 3, 1);
      }
    }
    if ((selected || this.view.overlay === 'territory') && colors.has(agent.settlementId)) {
      fill(ctx, '#263e35', x - 2, y + 3, 5, 3);
      fill(ctx, colors.get(agent.settlementId), x - 1, y + 3, 3, 2);
    }
    if ((selected || agent.health < 24 || agent.hunger > 88) && this.camera.zoom > 0.8) {
      const top = y - (baby ? 15 : 30);
      fill(ctx, '#243e35b0', x - 6, top, 13, 3);
      fill(ctx, agent.health < 35 ? '#ce8467' : '#a4bc82', x - 5, top + 1, Math.round(clamp(agent.health ?? 100, 0, 100) / 100 * 11), 1);
    }
  }

  drawBuildingDetails(ctx, building, x, y, time, darkness) {
    if (building.progress < 1) return;
    if (building.type === 'campfire') {
      const phase = Math.floor(time * 8 + building.id) % 4;
      fill(ctx, '#efb25e', x - 2, y - 10 - phase, 3, 5 + phase);
      fill(ctx, '#f6dca1', x - 1, y - 6 - (phase % 2), 2, 4);
      if (darkness > 0.06) {
        fill(ctx, '#eec47c0c', x - 19, y - 15, 38, 27);
        fill(ctx, '#eec47c0c', x - 14, y - 21, 28, 39);
      }
    }
    if (['house', 'workshop', 'hall', 'campfire'].includes(building.type)) {
      const chimneyX = building.type === 'campfire' ? x : x + 7;
      const chimneyY = building.type === 'campfire' ? y - 15 : y - 44;
      for (let i = 0; i < 3; i++) {
        const phase = (time * 0.25 + i / 3 + noise(hashValue(building.id), 1)) % 1;
        ctx.globalAlpha = (1 - phase) * 0.35;
        fill(ctx, '#d1d2b9', chimneyX + Math.sin(phase * 5 + i) * 3 + phase * 5, chimneyY - phase * 14, 2 + phase * 3, 2 + phase * 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawFire(ctx, x, y, intensity, time) {
    const flames = Math.min(5, 1 + Math.ceil(intensity * 3));
    for (let i = 0; i < flames; i++) {
      const phase = (Math.floor(time * 7) + i * 2) % 4;
      const fx = x - 7 + i * 4, fy = y - 2;
      fill(ctx, '#b66b47', fx - 1, fy - 9, 5, 11);
      fill(ctx, '#e49a4f', fx, fy - 13 - phase, 3, 13 + phase);
      fill(ctx, '#f4cf78', fx + 1, fy - 6 - phase, 2, 7 + phase);
      fill(ctx, '#f3dc9d', fx + 1, fy - 2, 1, 3);
    }
    const phase = (time * 0.4) % 1;
    ctx.globalAlpha = (1 - phase) * 0.4;
    fill(ctx, '#7a7867', x + phase * 9 - 3, y - 18 - phase * 21, 5 + phase * 4, 5 + phase * 3);
    ctx.globalAlpha = 1;
  }

  drawEffects(ctx, effects, bounds) {
    const colors = { food: '#e6cb7c', wood: '#c8a575', stone: '#d2d3b8', birth: '#e7b0aa', heal: '#b6d397', hit: '#da9276', level: '#f0d697', spark: '#f0cc83' };
    for (const effect of effects.slice(-100)) {
      if (effect.x < bounds.x0 || effect.x > bounds.x1 || effect.y < bounds.y0 || effect.y > bounds.y1) continue;
      const progress = clamp((effect.age || 0) / (effect.duration || 1), 0, 1);
      if (progress >= 1) continue;
      const x = effect.x * TILE_SIZE, y = effect.y * TILE_SIZE - progress * 16 - 12;
      const color = colors[effect.type] || '#dfd1a5';
      ctx.globalAlpha = 1 - progress;
      if (effect.type === 'birth') {
        fill(ctx, color, x - 3, y, 2, 2); fill(ctx, color, x + 1, y, 2, 2);
        fill(ctx, color, x - 3, y + 2, 6, 1); fill(ctx, color, x - 2, y + 3, 4, 1); fill(ctx, color, x - 1, y + 4, 2, 1);
      } else if (effect.type === 'heal') {
        fill(ctx, color, x - 1, y - 2, 2, 6); fill(ctx, color, x - 3, y, 6, 2);
      } else if (effect.type === 'level') {
        fill(ctx, color, x - 1, y - 3, 2, 8); fill(ctx, color, x - 3, y - 1, 6, 4); fill(ctx, '#fff0b4', x - 1, y - 1, 2, 2);
      } else {
        fill(ctx, color, x - 1, y - 1, 3, 3);
        fill(ctx, color, x + 3 + progress * 5, y + progress * 5, 1, 1);
        fill(ctx, color, x - 4 - progress * 3, y + progress * 3, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawAtmosphere(ctx, world, bounds, time, darkness) {
    const w = world.width * TILE_SIZE, h = world.height * TILE_SIZE;
    if (darkness > 0.001) { ctx.globalAlpha = darkness; fill(ctx, '#203948', 0, 0, w, h); ctx.globalAlpha = 1; }
    const weather = typeof world.weather === 'string' ? world.weather : world.weather?.type || 'clear';
    if (weather === 'rain' || weather === 'storm') {
      ctx.globalAlpha = weather === 'storm' ? 0.14 : 0.07;
      fill(ctx, '#345965', 0, 0, w, h);
      ctx.globalAlpha = 1;
      const count = weather === 'storm' ? 150 : 85;
      const minX = bounds.x0 * 16, maxX = bounds.x1 * 16, minY = bounds.y0 * 16, maxY = bounds.y1 * 16;
      for (let i = 0; i < count; i++) {
        const seed = (this.seed + i * 433) >>> 0;
        const x = minX + (noise(seed, 1) * (maxX - minX) - time * 19 % (maxX - minX) + maxX - minX) % (maxX - minX || 1);
        const y = minY + (noise(seed, 2) * (maxY - minY) + time * 100) % (maxY - minY || 1);
        fill(ctx, '#c3d6c970', x, y, 1, 4);
        fill(ctx, '#c3d6c950', x - 1, y + 4, 1, 3);
      }
    } else if (weather === 'snow') {
      for (let i = 0; i < 90; i++) {
        const seed = (this.seed + i * 177) >>> 0;
        const x = bounds.x0 * 16 + (noise(seed, 1) * (bounds.x1 - bounds.x0) * 16 + Math.sin(time * 0.7 + i) * 10 + 25) % ((bounds.x1 - bounds.x0) * 16 || 1);
        const y = bounds.y0 * 16 + (noise(seed, 2) * (bounds.y1 - bounds.y0) * 16 + time * 10) % ((bounds.y1 - bounds.y0) * 16 || 1);
        fill(ctx, '#e2e8d1c0', x, y, i % 5 === 0 ? 2 : 1, 1);
      }
    }
    // Fireflies are decorative light, never simulated resources or actors.
    if (darkness > 0.09 && world.season !== 'winter') {
      for (let i = 0; i < 20; i++) {
        const seed = (this.seed + i * 779) >>> 0;
        const x = noise(seed, 1) * w, y = noise(seed, 2) * h;
        const tile = getTile(world, x / 16, y / 16);
        if (!tile || WATER.has(tile.biome)) continue;
        const alpha = Math.max(0, Math.sin(time * 1.5 + i));
        ctx.globalAlpha = alpha * 0.75;
        fill(ctx, '#e4e3a1', x + Math.sin(time * 0.4 + i) * 6, y + Math.cos(time * 0.5 + i) * 4, 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawSelection(ctx, object, selection, time) {
    if (!object || !selection) return;
    const offset = selection.type === 'agent' ? 0 : 0.5;
    const x = (object.x + offset) * 16;
    const y = (object.y + offset) * 16;
    if (selection.type === 'agent') {
      const top = y - (getLifeStage(object) === 'baby' ? 18 : 33) - Math.round(Math.sin(time * 3) * 1.5);
      fill(ctx, '#ffe6a2', x - 2, top, 5, 1);
      fill(ctx, '#ffe6a2', x - 1, top + 1, 3, 1);
      fill(ctx, '#ffe6a2', x, top + 2, 1, 1);
      // A destination trace appears only for the selected person at close zoom.
      const tx = object.action?.targetX, ty = object.action?.targetY;
      if (this.camera.zoom > 1.2 && Number.isFinite(tx) && Number.isFinite(ty) && Math.hypot(tx - object.x, ty - object.y) > 1) {
        const length = Math.hypot(tx - object.x, ty - object.y), steps = Math.min(28, Math.ceil(length * 2));
        for (let i = 1; i < steps; i++) {
          const p = i / steps;
          fill(ctx, '#efcf8050', x + (tx * 16 - x) * p, y + (ty * 16 - y) * p, 1, 1);
        }
        marker(ctx, tx * 16, ty * 16, 9, '#eacf8670', true);
      }
    } else if (selection.type === 'building') marker(ctx, x, y - 12, 44, '#edcc84', true);
    else if (selection.type === 'settlement') marker(ctx, x, y, 62, object.color || '#edcc84', true);
    else marker(ctx, x, y, 15, '#eed899', false);
  }

  drawHover(ctx) {
    if (!this.hover || this.pointer?.moved) return;
    const tool = this.view.tool || 'inspect';
    const x = this.hover.x * TILE_SIZE + 8, y = this.hover.y * TILE_SIZE + 8;
    if (tool === 'inspect') {
      if (this.camera.zoom > 1.1) marker(ctx, x, y, 15, '#f0e0ac50', true);
    } else {
      const colors = { rain: '#a9d2d4', food: '#edce8b', trees: '#aec995', settlers: '#e2c5a5', fire: '#e7a179' };
      const color = colors[tool] || '#e8d398';
      const radius = tool === 'rain' || tool === 'fire' ? 3 : tool === 'trees' ? 2 : 1;
      marker(ctx, x, y, (radius * 2 + 1) * 16, hexAlpha(color, 0.75), true);
      fill(ctx, hexAlpha(color, 0.12), x - 8, y - 8, 16, 16);
    }
  }

  drawSettlementLabels(ctx, world, bounds, selected, zoom) {
    const settlements = world.settlements || [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const settlement of settlements) {
      if (settlement.x < bounds.x0 || settlement.x > bounds.x1 || settlement.y < bounds.y0 || settlement.y > bounds.y1) continue;
      const isSelected = selected?.type === 'settlement' && selected.id === settlement.id;
      if (zoom < 0.6 && !isSelected && this.view.overlay !== 'territory') continue;
      const x = (settlement.x + 0.5) * 16, y = (settlement.y + 0.5) * 16 - 49;
      const fontSize = zoom < 1 ? 10 / zoom : 9;
      ctx.font = `600 ${fontSize}px "Trebuchet MS", system-ui, sans-serif`;
      const label = settlement.name;
      const width = ctx.measureText(label).width + 14;
      fill(ctx, '#203e36d0', x - width / 2, y - 7, width, 14);
      fill(ctx, settlement.color || '#c6b383', x - width / 2, y - 7, 2, 14);
      ctx.fillStyle = '#ebdfb9';
      ctx.fillText(label, Math.round(x + 1), Math.round(y));
      if (isSelected || this.view.overlay === 'territory') {
        ctx.font = `${Math.max(7, fontSize - 1)}px "Trebuchet MS", system-ui, sans-serif`;
        ctx.fillStyle = '#cdd2ac';
        ctx.fillText(`${settlement.population || 0}`, Math.round(x), Math.round(y + 13));
      }
    }
  }

  drawMinimap(canvas, world = this.world, selected) {
    if (!canvas || !world) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    if (!width || !height) return;
    ctx.imageSmoothingEnabled = false;
    fill(ctx, '#1f3635', 0, 0, width, height);
    const sx = width / world.width, sy = height / world.height;
    for (const tile of world.tiles) {
      ctx.fillStyle = tile.fire > 0 ? '#df9c64' : tile.trees > 0.4 ? '#4e7349' : LAND_COLORS[tile.biome] || '#819650';
      ctx.fillRect(Math.floor(tile.x * sx), Math.floor(tile.y * sy), Math.ceil(sx), Math.ceil(sy));
    }
    for (const agent of world.agents) {
      fill(ctx, '#eee0b3', agent.x * sx, agent.y * sy, 1.4, 1.4);
    }
    for (const settlement of world.settlements || []) {
      const x = (settlement.x + 0.5) * sx, y = (settlement.y + 0.5) * sy;
      fill(ctx, '#203d32', x - 3, y - 3, 7, 7);
      fill(ctx, settlement.color || '#dac27f', x - 2, y - 2, 5, 5);
      fill(ctx, '#eae0b5', x, y, 1, 1);
    }
    const topLeft = this.screenToWorld(0, 0), bottomRight = this.screenToWorld(this.width, this.height);
    ctx.strokeStyle = '#f1ddb8';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.max(0.5, topLeft.x * sx), Math.max(0.5, topLeft.y * sy), Math.min(width - 1, (bottomRight.x - topLeft.x) * sx), Math.min(height - 1, (bottomRight.y - topLeft.y) * sy));
    const object = getSelected(world, selected);
    if (object) marker(ctx, object.x * sx, object.y * sy, 7, '#fff0b6', true);
  }

  destroy() {
    this.resizeObserver?.disconnect();
    for (const [type, callback, options] of this.listeners) this.canvas.removeEventListener(type, callback, options);
    this.listeners.length = 0;
    this.positions.clear();
    this.pointerPositions.clear();
  }
}

