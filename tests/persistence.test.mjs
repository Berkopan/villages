import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, restoreWorld } from '../src/sim/engine.js';
import { encodeSave, decodeSave, validateWorld, readSave, writeSave, SAVE_KEY, AUTOSAVE_KEY } from '../src/persistence.js';

const make = () => createWorld({ seed: 'save-contract', width: 64, height: 48, population: 48, maxPopulation: 200 });

test('a saved world continues with identical decisions and causal history', () => {
  const original = make();
  for (let i = 0; i < 275; i++) stepWorld(original, 0.1);
  const saved = decodeSave(encodeSave(original, { speed: 5, overlay: 'territory' }));
  const resumed = restoreWorld(saved.world);
  assert.equal(saved.view.speed, 5);
  for (let i = 0; i < 300; i++) { stepWorld(original, 0.1); stepWorld(resumed, 0.1); }
  assert.deepEqual(resumed, original, 'saving must preserve all scheduling and RNG state');
});

test('manual and automatic saves are independent slots', () => {
  const data = new Map();
  const storage = { setItem: (key, value) => data.set(key, value), getItem: key => data.get(key) || null };
  const world = make();
  writeSave(storage, world, { speed: 2 });
  stepWorld(world, 0.1);
  writeSave(storage, world, { speed: 5 }, true);
  assert.ok(data.has(SAVE_KEY) && data.has(AUTOSAVE_KEY));
  assert.equal(readSave(storage).world.day, 0);
  assert.ok(readSave(storage, true).world.day > 0);
});

test('save validation rejects corrupted worlds before any replacement', () => {
  const good = make();
  assert.equal(validateWorld(good), good);
  const cases = [
    world => { world.width = 100000; },
    world => { world.tiles.pop(); },
    world => { world.agents[0].x = -100; },
    world => { world.agents[0].health = Infinity; },
    world => { world.agents[1].id = world.agents[0].id; },
    world => { world.tiles[0].food = -1; },
    world => { world.agents[0].action = null; },
    world => { world.agents[0].path = [{ x: -1, y: 0 }]; },
    world => { world.agents[0].traits.courage = 'unbounded'; },
    world => { world.agents[0].inventory.tools = -5; },
    world => { world.agents[0].pendingAction = { type: 'teleport' }; },
    world => { world.effects = [null]; },
    world => { world.events.push(null); },
    world => { world.history = [null]; },
    world => { world.graves = [null]; },
    world => { world.nextId = world.agents[0].id; },
    world => { world.agents[0].childrenIds.push(world.nextId + 10); },
    world => { world.animals[0].id = world.agents[0].id; },
    world => { world.events = 'broken'; },
  ];
  for (const corrupt of cases) {
    const world = structuredClone(good);
    corrupt(world);
    assert.throws(() => validateWorld(world));
  }
  assert.throws(() => decodeSave('{"format":"villages-world","version":999,"world":{}}'));
  assert.throws(() => decodeSave('{bad json'));
  assert.throws(() => decodeSave(encodeSave(good).replace('"world":{', '"world":{"__proto__":{"polluted":true},')));
  assert.equal({}.polluted, undefined);
});

