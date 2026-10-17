import test from 'node:test';
import assert from 'node:assert/strict';
import { findPath, findResource } from '../src/sim/navigation.js';
import { getTile, isWalkable } from '../src/sim/worldgen.js';

function grid(width = 16, height = 12) {
  return { width, height, tiles: Array.from({ length: width * height }, (_, index) => ({ x: index % width, y: Math.floor(index / width), biome: 'grass', region: 0, fire: 0, road: 0, trees: 0, food: 0, fish: 0, fertility: 0.5 })) };
}

test('routes cross a river through its physical ford, never through water', () => {
  const world = grid();
  for (let y = 0; y < 10; y++) world.tiles[y * world.width + 8].biome = 'water';
  const route = findPath(world, 3.5, 3.5, 12.5, 3.5);
  assert.ok(route.length > 1);
  let previous = { x: 3.5, y: 3.5 };
  for (const point of route) {
    const length = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) * 10));
    for (let step = 0; step <= length; step++) {
      assert.ok(isWalkable(getTile(world, previous.x + (point.x - previous.x) * step / length, previous.y + (point.y - previous.y) * step / length)), 'each movement segment stays on walkable land');
    }
    previous = point;
  }
  assert.deepEqual(route.at(-1), { x: 12.5, y: 3.5 });
});

test('disconnected regions do not produce impossible migration paths', () => {
  const world = grid();
  world.tiles[4 * world.width + 12].region = 7;
  assert.deepEqual(findPath(world, 2.5, 4.5, 12.5, 4.5), []);
});

test('a diagonal squeeze through two impassable corners is forbidden', () => {
  const world = grid(4, 4);
  world.tiles[1].biome = 'water';
  world.tiles[4].biome = 'mountain';
  assert.deepEqual(findPath(world, 0.5, 0.5, 1.5, 1.5), []);
});

test('fishing chooses dry adjacent shore while targeting fish in water', () => {
  const world = grid();
  const lake = world.tiles[5 * world.width + 8];
  lake.biome = 'water'; lake.fish = 10;
  const found = findResource(world, { x: 3.5, y: 5.5 }, 'fish', 12, 0.2);
  assert.ok(found);
  assert.equal(found.tile, lake);
  assert.ok(isWalkable(found.target));
  assert.ok(Math.hypot(found.target.x - lake.x, found.target.y - lake.y) <= 1.5);
});
