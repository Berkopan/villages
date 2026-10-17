import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTiles, getTile, isWalkable } from '../src/sim/worldgen.js';
import { hashSeed, random } from '../src/sim/random.js';
import { lifeStage, createAgent } from '../src/sim/model.js';

test('world generation is reproducible and seeds change the geography', () => {
  const a = generateTiles('Söğüt Vadisi', 88, 64, 'balanced');
  const b = generateTiles('Söğüt Vadisi', 88, 64, 'balanced');
  const c = generateTiles('Pınar Vadisi', 88, 64, 'balanced');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('generated terrain has accessible living space and finite nonnegative resources', () => {
  for (const seed of ['Söğüt Vadisi', 'sand-and-stone', 'winter', '101', '家', 'islands']) {
    for (const climate of ['balanced', 'dry', 'lush']) {
      const tiles = generateTiles(seed, 64, 48, climate);
      const walkable = tiles.filter(isWalkable);
      assert.ok(walkable.length > tiles.length * 0.25, `${seed}/${climate}: enough habitat`);
      assert.ok(tiles.some(tile => tile.biome === 'water'), `${seed}: water exists`);
      assert.ok(tiles.some(tile => tile.trees > 0), `${seed}: timber exists`);
      assert.ok(tiles.some(tile => tile.stone > 0), `${seed}: building material exists`);
      tiles.forEach((tile, index) => {
        assert.equal(tile.x, index % 64);
        assert.equal(tile.y, Math.floor(index / 64));
        assert.ok(Number.isFinite(tile.elevation) && tile.elevation >= -2 && tile.elevation <= 2);
        for (const key of ['fertility', 'moisture', 'food', 'trees', 'stone', 'ore', 'fish']) {
          assert.ok(Number.isFinite(tile[key]) && tile[key] >= 0, `${seed}: ${key}`);
        }
        if (isWalkable(tile)) assert.ok(tile.region >= 0);
      });
    }
  }
});

test('tile lookup rejects outside, NaN and infinite positions', () => {
  const world = { width: 64, height: 48, tiles: generateTiles('edges', 64, 48, 'balanced') };
  for (const [x, y] of [[-1, 0], [0, -1], [64, 0], [0, 48], [NaN, 3], [3, Infinity]]) assert.equal(getTile(world, x, y), null);
  assert.equal(getTile(world, 10.8, 12.3), world.tiles[12 * 64 + 10]);
});

test('random sequence resumes from the exact serialized state', () => {
  const a = { rngState: hashSeed('family-tree') };
  for (let i = 0; i < 73; i++) random(a);
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 1000; i++) assert.equal(random(a), random(b));
});

test('age stages include growth and elder silhouettes', () => {
  assert.deepEqual([0, 2, 3, 11, 12, 17, 18, 57, 58, 85].map(lifeStage), ['baby', 'baby', 'child', 'child', 'teen', 'teen', 'adult', 'adult', 'elder', 'elder']);
});

test('population appearance and personality have substantial variation; children inherit parent data', () => {
  const world = { nextId: 1, rngState: hashSeed('people'), day: 0 };
  const people = Array.from({ length: 160 }, () => createAgent(world, { x: 10, y: 10 }));
  assert.ok(new Set(people.map(p => JSON.stringify(p.appearance))).size > 145);
  assert.ok(new Set(people.map(p => p.appearance.skin)).size >= 6);
  assert.ok(new Set(people.map(p => p.appearance.hairStyle)).size >= 6);
  const mother = people[0], father = people[1];
  const child = createAgent(world, { age: 0, mother, father, x: 10, y: 10 });
  assert.deepEqual(child.parents, [mother.id, father.id]);
  assert.equal(child.familyName, mother.familyName);
  assert.equal(child.generation, mother.generation + 1);
  assert.ok([mother.appearance.skin, father.appearance.skin].includes(child.appearance.skin));
  for (const value of Object.values(child.traits)) assert.ok(value >= 0 && value <= 1);
});

