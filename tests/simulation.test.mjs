import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, getStats, applyIntervention, getTile, restoreWorld } from '../src/sim/engine.js';
import { isWalkable } from '../src/sim/worldgen.js';
import { emptyResources } from '../src/sim/model.js';
import { validateWorld, encodeSave, decodeSave } from '../src/persistence.js';

const advance = (world, days) => { for (let i = 0; i < Math.round(days * 10); i++) stepWorld(world, 0.1); };
const make = (options = {}) => createWorld({ seed: 'causal-world', width: 64, height: 48, population: 48, ...options });

test('empty worlds do not receive scripted humans, villages or farms as time passes', () => {
  const world = make({ population: 0 });
  advance(world, 100);
  assert.equal(world.agents.length, 0);
  assert.equal(world.settlements.length, 0);
  assert.equal(world.buildings.length, 0);
  assert.equal(world.farms.length, 0);
  assert.equal(world.metrics.births, 0);
  assert.ok(world.history.length > 1, 'the ecosystem clock still advances');
});

test('fixed steps cross all seasons and years on the exact calendar boundaries', () => {
  const world = make({ population: 0 });
  for (const [day, season, year] of [[24, 'summer', 1], [48, 'autumn', 1], [72, 'winter', 1], [96, 'spring', 2]]) {
    advance(world, 24);
    assert.equal(world.day, day);
    assert.equal(world.lastDailyDay, day);
    assert.equal(world.season, season);
    assert.equal(world.year, year);
  }
  for (const bad of [0, -0.1, 1.1, NaN, Infinity]) assert.throws(() => stepWorld(world, bad));
});

test('initial family links have biologically possible age gaps and reciprocal records', () => {
  for (const seed of ['Söğüt Vadisi', 'berkopan', 'bereket']) {
    const world = make({ seed, population: 192 });
    const people = new Map(world.agents.map(person => [person.id, person]));
    for (const child of world.agents) for (const id of child.parents) {
      const parent = people.get(id);
      assert.ok(parent.age - child.age >= 18, `${seed}: ${parent.name} / ${child.name}`);
      assert.ok(parent.childrenIds.includes(child.id));
    }
  }
});

test('observer interventions alter real terrain and respect population and resource limits', () => {
  const world = make({ population: 0, maxPopulation: 10 });
  world.animals = [];
  const tile = world.tiles.find(tile => isWalkable(tile) && tile.biome === 'grass');
  const { x, y } = tile;
  assert.equal(applyIntervention(world, 'food', -1, -1).ok, false);
  assert.equal(applyIntervention(world, 'unknown', x, y).ok, false);
  const foodBefore = tile.food;
  assert.ok(applyIntervention(world, 'food', x, y).ok);
  assert.ok(tile.food > foodBefore);
  applyIntervention(world, 'food', x, y);
  const giftedFood = tile.food;
  applyIntervention(world, 'trees', x, y);
  assert.ok(tile.trees >= 3);
  applyIntervention(world, 'fire', x, y);
  assert.ok(tile.fire > 0.8);
  applyIntervention(world, 'rain', x, y);
  assert.ok(tile.fire < 0.2, 'rain actually extinguishes fire');
  assert.ok(tile.food >= giftedFood, 'rain must not delete a food gift above natural capacity');
  const temperature = world.weather.temperature;
  for (let i = 0; i < 40; i++) applyIntervention(world, 'rain', x, y);
  assert.equal(world.weather.temperature, temperature, 'repeated rain is not unbounded refrigeration');
  advance(world, 1);
  assert.ok(tile.food > giftedFood * 0.9, 'excess food decays gradually');
  assert.equal(applyIntervention(world, 'settlers', x, y, { count: 30 }).changed, 10);
  assert.equal(world.agents.length, 10);
  assert.equal(applyIntervention(world, 'settlers', x, y).ok, false);
  assert.ok(world.agents.every(person => isWalkable(getTile(world, person.x, person.y))));
  assert.equal(make({ population: 200, maxPopulation: 40 }).agents.length, 40);
});

test('starvation, fire, disease and old age cause real deaths and matching chronicle entries', () => {
  const cases = [
    ['starvation', person => { person.health = 0.1; person.hunger = 100; person.inventory.food = 0; }, 0.1],
    ['fire', (person, world) => { person.health = 0.1; getTile(world, person.x, person.y).fire = 1; }, 0.1],
    ['disease', person => { person.health = 0.1; person.sickness = 80; }, 1],
    ['age', person => { person.age = 97; }, 1],
  ];
  for (const [cause, setup, dt] of cases) {
    const world = make({ population: 1 });
    world.animals = [];
    const person = world.agents[0];
    person.age = 30; person.hunger = 40; person.health = 100; person.sickness = 0;
    setup(person, world);
    stepWorld(world, dt);
    assert.equal(world.agents.length, 0, cause);
    assert.equal(world.metrics.deaths, 1, cause);
    assert.equal(world.metrics.deathCauses[cause], 1, cause);
    assert.equal(world.graves[0].id, person.id);
    assert.ok(world.events.some(event => event.type === 'death' && event.agentId === person.id));
  }
});

test('combat applies physical damage and inactive settlements stop counting as active wars', () => {
  const world = make({ population: 2 });
  world.animals = [];
  const [attacker, defender] = world.agents;
  defender.x = attacker.x; defender.y = attacker.y;
  for (const person of world.agents) { person.age = 30; person.hunger = 30; person.sickness = 0; }
  const relation = { status: 'war', affinity: -50, tension: 90, tradeCount: 0, weariness: 0, lastConflict: 0, lastTrade: 0, warStarted: 0, truceUntil: 0 };
  world.settlements = [attacker, defender].map((person, index) => ({
    id: 900 + index, x: person.x, y: person.y, population: 1,
    stockpile: emptyResources(), production: emptyResources(), knowledge: {}, relations: { [901 - index]: { ...relation } },
  }));
  attacker.settlementId = 900; defender.settlementId = 901;
  attacker.action = { type: 'fight', targetX: defender.x, targetY: defender.y, duration: 1, progress: 0.99, enemyId: defender.id };
  attacker.path = []; attacker.pathIndex = 0;
  defender.health = 1;
  assert.equal(getStats(world).wars, 1);
  stepWorld(world, 0.1);
  assert.equal(world.metrics.deathCauses.violence, 1);
  assert.equal(attacker.kills, 1);
  world.settlements[1].population = 0;
  assert.equal(getStats(world).wars, 0);
});

test('generations and settlements emerge during a long autonomous world without numeric corruption', { timeout: 180000 }, () => {
  const world = createWorld({ seed: 'ilk-ışık', population: 96, aggression: 0, maxPopulation: 500 });
  const actions = new Set();
  for (let checkpoint = 0; checkpoint < 30; checkpoint++) {
    advance(world, 100);
    validateWorld(world);
    assert.equal(world.agents.length, 96 + world.metrics.births - world.metrics.deaths);
    assert.ok(world.agents.length <= 500);
    assert.ok(world.agents.every(person => isWalkable(getTile(world, person.x, person.y))));
    world.agents.forEach(person => actions.add(person.action.type));
    assert.equal(world.metrics.deaths, Object.values(world.metrics.deathCauses).reduce((a, b) => a + b, 0));
  }
  assert.ok(world.metrics.births > 5, 'new generations must actually be born');
  assert.ok(world.metrics.deaths > 5, 'lives are finite');
  assert.ok(world.settlements.length >= 2, 'independent communities emerge');
  assert.ok(world.buildings.filter(building => building.progress === 1).length > 15);
  assert.ok(world.farms.some(farm => farm.harvests > 0), 'farms produce actual harvests');
  assert.ok(world.metrics.trades > 0, 'a caravan must finish a real exchange');
  assert.ok(world.metrics.migrations > 0, 'people must relocate');
  assert.ok(actions.size >= 10, 'many different actions occur');
  assert.equal(world.metrics.wars, 0, 'peaceful configuration forbids wars');
  assert.ok(world.agents.some(person => person.generation >= 3));
  assert.ok(world.history.length <= 720 && world.events.length <= 180 && world.graves.length <= 180);
  const resumed = restoreWorld(decodeSave(encodeSave(world)).world);
  advance(world, 4); advance(resumed, 4);
  assert.deepEqual(resumed, world, 'mature families, queues and trading routes survive reload exactly');
});
