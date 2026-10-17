import { getTile, isWalkable } from './worldgen.js';

export function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function tileDistance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

export function nearbyTile(world, x, y, radius = 5, predicate = () => true) {
  let best = null, bestDistance = Infinity;
  for (let yy = Math.max(0, Math.floor(y - radius)); yy <= Math.min(world.height - 1, Math.ceil(y + radius)); yy++) {
    for (let xx = Math.max(0, Math.floor(x - radius)); xx <= Math.min(world.width - 1, Math.ceil(x + radius)); xx++) {
      const tile = world.tiles[yy * world.width + xx];
      if (!isWalkable(tile) || tile.fire > 0.2 || !predicate(tile)) continue;
      const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
      if (d < bestDistance) { best = tile; bestDistance = d; }
    }
  }
  return best;
}

function straightPath(world, sx, sy, tx, ty) {
  const length = Math.ceil(Math.hypot(tx - sx, ty - sy) * 2);
  let previous = getTile(world, sx, sy);
  for (let i = 1; i <= length; i++) {
    const tile = getTile(world, sx + (tx - sx) * i / length, sy + (ty - sy) * i / length);
    if (!isWalkable(tile) || tile.fire > 0.5) return null;
    if (previous && tile.x !== previous.x && tile.y !== previous.y && (!isWalkable(getTile(world, previous.x, tile.y)) || !isWalkable(getTile(world, tile.x, previous.y)))) return null;
    previous = tile;
  }
  return [{ x: tx, y: ty }];
}

class Heap {
  constructor() { this.items = []; }
  push(item) {
    let index = this.items.length;
    this.items.push(item);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].f <= item.f) break;
      this.items[index] = this.items[parent]; index = parent;
    }
    this.items[index] = item;
  }
  pop() {
    const root = this.items[0], end = this.items.pop();
    if (this.items.length) {
      let index = 0;
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1].f < this.items[child].f) child++;
        if (this.items[child].f >= end.f) break;
        this.items[index] = this.items[child]; index = child;
      }
      this.items[index] = end;
    }
    return root;
  }
}

// Bounded A*, usually skipped by the unobstructed straight path fast path.
// Costs and parents are local scratch arrays; the persisted route is plain JSON.
export function findPath(world, sx, sy, tx, ty) {
  const startTile = getTile(world, sx, sy), endTile = getTile(world, tx, ty);
  if (!isWalkable(startTile) || !isWalkable(endTile) || startTile.region !== endTile.region) return [];
  const direct = straightPath(world, sx, sy, tx, ty);
  if (direct) return direct;
  const start = startTile.y * world.width + startTile.x, end = endTile.y * world.width + endTile.x;
  const costs = new Float64Array(world.tiles.length); costs.fill(Infinity);
  const parents = new Int32Array(world.tiles.length); parents.fill(-1);
  const closed = new Uint8Array(world.tiles.length);
  const heap = new Heap();
  costs[start] = 0; heap.push({ index: start, f: 0 });
  let visits = 0;
  while (heap.items.length && visits++ < 2400) {
    const current = heap.pop().index;
    if (closed[current]) continue;
    if (current === end) {
      const route = [];
      for (let index = end; index !== start && index >= 0; index = parents[index]) route.push({ x: world.tiles[index].x + 0.5, y: world.tiles[index].y + 0.5 });
      route.reverse();
      route.push({ x: tx, y: ty });
      return route;
    }
    closed[current] = 1;
    const currentTile = world.tiles[current];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tile = getTile(world, currentTile.x + dx, currentTile.y + dy);
      if (!isWalkable(tile) || tile.fire > 0.8) continue;
      if (dx && dy && (!isWalkable(getTile(world, currentTile.x + dx, currentTile.y)) || !isWalkable(getTile(world, currentTile.x, currentTile.y + dy)))) continue;
      const next = tile.y * world.width + tile.x;
      if (closed[next]) continue;
      const cost = costs[current] + (dx && dy ? 1.414 : 1) * (1 + tile.trees * 0.015 + tile.fire * 8 - Math.min(tile.road, 1) * 0.2);
      if (cost >= costs[next]) continue;
      parents[next] = current; costs[next] = cost;
      heap.push({ index: next, f: cost + Math.hypot(tile.x - endTile.x, tile.y - endTile.y) });
    }
  }
  return [];
}

export function findResource(world, agent, resource, radius = 12, minimum = 0.2) {
  const origin = getTile(world, agent.x, agent.y);
  let best = null, bestScore = -Infinity;
  for (let y = Math.max(0, Math.floor(agent.y - radius)); y <= Math.min(world.height - 1, Math.floor(agent.y + radius)); y++) {
    for (let x = Math.max(0, Math.floor(agent.x - radius)); x <= Math.min(world.width - 1, Math.floor(agent.x + radius)); x++) {
      const tile = world.tiles[y * world.width + x];
      if ((tile[resource] ?? 0) < minimum || tile.fire > 0.2) continue;
      let target = tile;
      if (!isWalkable(tile)) {
        // Fishing and cliff mining take place on a reachable adjacent shore.
        target = nearbyTile(world, x + 0.5, y + 0.5, 1.5, candidate => candidate.region === origin?.region);
      }
      if (!target || target.region !== origin?.region) continue;
      const d = Math.hypot(target.x + 0.5 - agent.x, target.y + 0.5 - agent.y);
      const score = Math.min(tile[resource], 6) * 0.45 - d * 0.9 + (resource === 'food' ? tile.fertility : 0);
      if (score > bestScore) { bestScore = score; best = { tile, target }; }
    }
  }
  return best;
}
