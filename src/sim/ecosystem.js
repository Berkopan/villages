import { between, chance, pick, clamp } from './random.js';
import { getTile, isWalkable } from './worldgen.js';
import { addEvent, addEffect, createAnimal, DAYS_PER_YEAR, SEASONS } from './model.js';
import { distance } from './navigation.js';

export function updateClimate(world) {
  const seasonIndex = Math.floor(world.day / 24) % 4;
  world.season = SEASONS[seasonIndex];
  world.year = Math.floor(world.day / DAYS_PER_YEAR) + 1;
  if (world.day < world.weather.until) return;
  const climate = world.config.climate;
  const rainChance = climate === 'lush' ? 0.48 : climate === 'dry' ? 0.13 : 0.29;
  let type = 'clear';
  if (chance(world, rainChance)) type = world.season === 'winter' ? 'snow' : chance(world, 0.12) ? 'storm' : 'rain';
  else if (world.season === 'summer' && chance(world, climate === 'dry' ? 0.48 : 0.13)) type = 'drought';
  const temperature = [14, 26, 12, 0][seasonIndex] + between(world, -4, 4) + (climate === 'dry' ? 3 : 0);
  world.weather = { type, temperature, rainfall: type === 'storm' ? 1 : type === 'rain' ? 0.7 : type === 'snow' ? 0.4 : 0, until: world.day + between(world, 5, 12) };
  if (type === 'drought') addEvent(world, 'info', 'Kurak rüzgârlar', 'Yağış azalıyor. Tarlalar kuruyor, yabani yiyecek ve su ürünleri daha yavaş yenileniyor.');
  if (type === 'storm') addEvent(world, 'info', 'Fırtına yaklaşıyor', 'Yağmur toprağı besliyor; açıkta çalışanlar daha çabuk yoruluyor.');
}

export function dailyEcosystem(world) {
  updateClimate(world);
  const growth = world.season === 'winter' ? 0.17 : world.season === 'spring' ? 1.35 : world.season === 'autumn' ? 1.08 : 0.9;
  const rain = world.weather.rainfall;
  const drought = world.weather.type === 'drought';
  const newFires = [];
  for (const tile of world.tiles) {
    tile.moisture = clamp(tile.moisture + rain * 0.018 - (drought ? 0.012 : world.season === 'summer' ? 0.0025 : 0.0005), 0.06, 1);
    tile.road = Math.max(0, tile.road - 0.0005);
    if (tile.fire > 0) {
      const fuel = tile.trees + tile.food * 0.4;
      tile.trees = Math.max(0, tile.trees - tile.fire * 0.6);
      tile.food = Math.max(0, tile.food - tile.fire * 0.8);
      tile.burn = Math.min(1, tile.burn + tile.fire * 0.14);
      tile.fire = Math.max(0, tile.fire - 0.11 - rain * 0.45 - (fuel < 0.4 ? 0.2 : 0));
      if (tile.fire > 0.15 && rain < 0.5) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = getTile(world, tile.x + dx, tile.y + dy);
        if (next && next.fire === 0 && next.trees > 0.5 && chance(world, 0.055 * tile.fire * (1 - next.moisture))) newFires.push(next);
      }
      continue;
    }
    tile.burn = Math.max(0, tile.burn - 0.001);
    if (!isWalkable(tile)) {
      if (tile.biome === 'water' || tile.biome === 'deepwater') tile.fish = Math.min(15, tile.fish + 0.1 * (world.season === 'winter' ? 0.35 : 1) * (drought ? 0.5 : 1));
      continue;
    }
    const waterFactor = clamp(tile.moisture * 1.8, 0.08, 1.3) * (drought ? 0.35 : 1);
    const maxFood = tile.fertility * (tile.biome === 'forest' ? 4.2 : tile.biome === 'grass' ? 5.2 : 1.2);
    tile.food = Math.min(maxFood, tile.food + tile.fertility * 0.075 * growth * waterFactor);
    if (tile.biome === 'forest') tile.trees = Math.min(8, tile.trees + 0.018 * growth * waterFactor);
    else if (tile.biome === 'grass' && tile.trees > 0.15) tile.trees = Math.min(3, tile.trees + 0.006 * growth * waterFactor);
    tile.herbs = Math.min(3, (tile.herbs ?? 0) + tile.moisture * 0.015 * growth);
    if (drought && tile.trees > 5 && tile.moisture < 0.25 && chance(world, 0.000008)) {
      tile.fire = 0.8;
      addEvent(world, 'fire', 'Orman yangını', 'Sıcaklık ve kuru örtü küçük bir yangını besledi.', tile);
    }
  }
  for (const tile of newFires) tile.fire = Math.max(tile.fire, 0.65);

  for (const farm of world.farms) {
    const tile = getTile(world, farm.x, farm.y);
    if (!tile) continue;
    const settlement = world.settlements.find(item => item.id === farm.settlementId);
    const irrigation = world.buildings.some(building => building.settlementId === farm.settlementId && building.type === 'well' && building.progress >= 1);
    farm.water = clamp(farm.water + rain * 0.12 + (irrigation ? 0.026 : 0) - (drought ? 0.065 : world.season === 'summer' ? 0.033 : 0.017), 0, 1);
    farm.health = clamp((farm.health ?? 1) + (farm.water > 0.2 ? 0.012 : -0.06) - tile.fire * 0.5, 0, 1);
    if (tile.fire > 0.1) { farm.growth = Math.max(0, farm.growth - tile.fire * 0.2); farm.ripe = false; }
    if (!farm.ripe) {
      const knowledge = Math.min(0.5, (settlement?.knowledge.agriculture ?? 0) / 800);
      farm.growth = Math.min(1, farm.growth + (0.029 + knowledge * 0.018) * tile.fertility * clamp(farm.water * 2, 0.1, 1.2) * growth * (0.5 + farm.health * 0.5));
      farm.ripe = farm.growth >= 1;
      if (farm.ripe) farm.ripeDay = world.day;
    } else if (world.day - farm.ripeDay > 14) {
      farm.health = Math.max(0.1, farm.health - 0.035);
    }
  }
}

export function stepAnimals(world, dt) {
  for (const animal of world.animals) {
    if (animal.health <= 0) continue;
    animal.age += dt / DAYS_PER_YEAR;
    animal.decisionIn -= dt;
    animal.hunger += dt * (animal.species === 'wolf' ? 0.75 : 0.5);
    const tile = getTile(world, animal.x, animal.y);
    if (tile?.fire > 0) animal.health -= tile.fire * 5 * dt;
    if (animal.species !== 'wolf' && tile?.food > 0.2 && animal.hunger > 12) {
      tile.food = Math.max(0, tile.food - 0.015 * dt);
      animal.hunger = Math.max(0, animal.hunger - dt * 4);
    }
    if (animal.hunger > 80) animal.health -= dt * 0.15;
    if (animal.decisionIn <= 0) {
      animal.decisionIn = between(world, 1.5, 5);
      let target = null;
      const humans = world.agents.filter(agent => distance(animal, agent) < 4);
      if (animal.species === 'wolf' && animal.hunger > 25) {
        const vulnerable = humans.find(agent => (agent.health < 50 || agent.age < 10) && !humans.some(other => other.age >= 18 && distance(agent, other) < 2));
        if (vulnerable) {
          animal.targetX = vulnerable.x; animal.targetY = vulnerable.y;
          if (distance(animal, vulnerable) < 1) {
            vulnerable.health -= between(world, 2, 5);
            vulnerable.lastDamageCause = 'violence';
            animal.hunger = Math.max(0, animal.hunger - 12);
            addEffect(world, 'hit', vulnerable.x, vulnerable.y, '−');
          }
          continue;
        }
      }
      for (let attempt = 0; attempt < 6; attempt++) {
        const dx = humans.length && animal.species !== 'wolf' ? Math.sign(animal.x - humans[0].x) * 2 : Math.round(between(world, -2, 2));
        const dy = humans.length && animal.species !== 'wolf' ? Math.sign(animal.y - humans[0].y) * 2 : Math.round(between(world, -2, 2));
        const candidate = getTile(world, animal.x + dx, animal.y + dy);
        if (isWalkable(candidate) && candidate.fire < 0.2 && candidate.region === tile?.region) { target = candidate; break; }
      }
      if (target) { animal.targetX = target.x + 0.5; animal.targetY = target.y + 0.5; }
    }
    const dx = animal.targetX - animal.x, dy = animal.targetY - animal.y, d = Math.hypot(dx, dy);
    if (d > 0.05) {
      const move = Math.min(d, dt * (animal.species === 'deer' ? 0.85 : 0.6));
      const nx = animal.x + dx / d * move, ny = animal.y + dy / d * move;
      if (isWalkable(getTile(world, nx, ny))) { animal.x = nx; animal.y = ny; }
      animal.direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 1 : 3 : dy > 0 ? 2 : 0;
    }
  }
  world.animals = world.animals.filter(animal => animal.health > 0 && animal.age < 18);
}

export function dailyAnimals(world) {
  const capacity = Math.min(110, Math.floor(world.width * world.height / 70));
  const additions = [];
  for (const animal of world.animals) {
    if (animal.age < 2 || animal.hunger > 45 || world.animals.length + additions.length >= capacity || !chance(world, 0.0018)) continue;
    const tile = getTile(world, animal.x, animal.y);
    if (tile && isWalkable(tile)) additions.push({ ...createAnimal(world, tile, animal.species), age: 0 });
  }
  world.animals.push(...additions);
}
