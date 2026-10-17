import { hashSeed, random, between, integer, pick, chance, clamp, weighted } from './random.js';
import { generateTiles, findHabitableSites, getTile, isWalkable } from './worldgen.js';
import { findPath, findResource, nearbyTile, distance } from './navigation.js';
import { DAYS_PER_YEAR, DAYS_PER_SEASON, RESOURCES, ROLES, KNOWLEDGE, COLORS, BUILDING_COSTS, emptyResources, lifeStage, createAgent, createAnimal, newSettlementName, addEvent, addEffect, grantExperience } from './model.js';
import { dailyEcosystem, stepAnimals, dailyAnimals } from './ecosystem.js';

export { getTile, DAYS_PER_YEAR, DAYS_PER_SEASON };
const caches = new WeakMap();
const JOB_ACTIONS = { gatherer: 'gather', farmer: 'farm', lumberjack: 'chop', miner: 'mine', fisher: 'fish', hunter: 'hunt', builder: 'build', smith: 'craft', healer: 'heal', trader: 'trade', warrior: 'fight', scholar: 'study' };
const STAGE_NAMES = { camp: 'Oba', hamlet: 'Mezra', village: 'Köy', town: 'Kasaba', city: 'Kent' };
const DEATH_NAMES = { starvation: 'açlık', age: 'yaşlılık', disease: 'hastalık', violence: 'çatışma', fire: 'yangın' };

function cacheFor(world) {
  let cache = caches.get(world);
  if (cache?.tick === world.tick && cache.agentCount === world.agents.length && cache.settlementCount === world.settlements.length) return cache;
  const buckets = new Map();
  for (const agent of world.agents) {
    const key = `${Math.floor(agent.x / 6)},${Math.floor(agent.y / 6)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(agent);
  }
  cache = { tick: world.tick, agentCount: world.agents.length, settlementCount: world.settlements.length, agents: new Map(world.agents.map(agent => [agent.id, agent])), settlements: new Map(world.settlements.map(settlement => [settlement.id, settlement])), buckets };
  caches.set(world, cache);
  return cache;
}

function nearbyAgents(world, x, y, radius) {
  const result = [], cache = cacheFor(world);
  for (let by = Math.floor((y - radius) / 6); by <= Math.floor((y + radius) / 6); by++) {
    for (let bx = Math.floor((x - radius) / 6); bx <= Math.floor((x + radius) / 6); bx++) {
      for (const agent of cache.buckets.get(`${bx},${by}`) ?? []) if (agent.health > 0 && Math.hypot(agent.x - x, agent.y - y) <= radius) result.push(agent);
    }
  }
  return result;
}

function settlementOf(world, agent) { return cacheFor(world).settlements.get(agent.settlementId) ?? null; }
function personById(world, id) { return cacheFor(world).agents.get(id); }
function buildingsOf(world, settlement, completed = false) { return world.buildings.filter(building => building.settlementId === settlement.id && (!completed || building.progress >= 1)); }
function hasBuilding(world, settlement, type) { return world.buildings.some(building => building.settlementId === settlement.id && building.type === type && building.progress >= 1); }
function residentsOf(world, settlement) { return world.agents.filter(agent => agent.settlementId === settlement.id); }
function inventorySize(agent) { return RESOURCES.reduce((sum, key) => sum + agent.inventory[key], 0); }
function changeKnowledge(settlement, key, value) { if (settlement) settlement.knowledge[key] = Math.max(0, (settlement.knowledge[key] ?? 0) + value); }

export function createWorld(options = {}) {
  const width = clamp(Math.round(Number(options.width) || 88), 40, 160);
  const height = clamp(Math.round(Number(options.height) || 64), 32, 112);
  const maxPopulation = clamp(Math.round(Number(options.maxPopulation) || 500), 10, 500);
  const population = clamp(Math.round(Number.isFinite(Number(options.population)) && options.population !== undefined ? Number(options.population) : 96), 0, maxPopulation);
  const climate = ['balanced', 'dry', 'lush'].includes(options.climate) ? options.climate : 'balanced';
  const seed = String(options.seed ?? 'ilk-ışık').slice(0, 160);
  const world = {
    version: 1, seed, width, height, tick: 0, day: 0, year: 1, season: 'spring',
    weather: { type: 'clear', temperature: 16, rainfall: 0, until: 6 },
    config: { climate, aggression: clamp(Number.isFinite(Number(options.aggression)) ? Number(options.aggression) : 1, 0, 3), maxPopulation, initialPopulation: population },
    rngState: hashSeed(seed), nextId: 1, lastDailyDay: 0,
    agents: [], tiles: generateTiles(seed, width, height, climate), buildings: [], farms: [], settlements: [], events: [], history: [], effects: [], graves: [], animals: [],
    metrics: { births: 0, deaths: 0, migrations: 0, wars: 0, trades: 0, discoveries: 0, deathCauses: { starvation: 0, age: 0, disease: 0, violence: 0, fire: 0 } },
  };
  const sites = findHabitableSites(world, population < 40 ? 2 : 4);
  const groups = new Map();
  for (let index = 0; index < population; index++) {
    const siteIndex = Math.min(sites.length - 1, Math.floor(index * sites.length / Math.max(1, population)));
    const site = sites[siteIndex];
    if (!site) break;
    const tile = nearbyTile(world, site.x + between(world, -3.2, 3.2), site.y + between(world, -3.2, 3.2), 6, candidate => candidate.region === site.region) ?? site;
    const cohort = index % 8;
    const age = cohort === 2 ? between(world, 0.3, 8) : cohort === 3 ? between(world, 11, 17) : cohort === 6 ? between(world, 59, 73) : between(world, 20, 43);
    const sex = cohort === 0 ? 'male' : cohort === 1 ? 'female' : undefined;
    const groupId = Math.floor(index / 8);
    if (!groups.has(groupId)) groups.set(groupId, []);
    const family = groups.get(groupId);
    const agent = createAgent(world, { x: tile.x + between(world, 0.2, 0.8), y: tile.y + between(world, 0.2, 0.8), age, sex, familyName: family[0]?.familyName });
    agent.originX = site.x + 0.5; agent.originY = site.y + 0.5;
    if (cohort === 1 && family[0]) { agent.partnerId = family[0].id; family[0].partnerId = agent.id; agent.birthCooldown = 12; }
    if ((cohort === 2 || cohort === 3) && family[0] && family[1] && Math.min(family[0].age, family[1].age) - agent.age >= 18) {
      agent.parents = [family[1].id, family[0].id]; agent.generation = 2;
      family[0].childrenIds.push(agent.id); family[1].childrenIds.push(agent.id);
    }
    family.push(agent); world.agents.push(agent);
  }
  const wildTiles = world.tiles.filter(tile => isWalkable(tile) && tile.biome !== 'sand' && tile.biome !== 'snow');
  for (let i = 0; i < Math.min(46, Math.floor(width * height / 130)); i++) {
    const tile = pick(world, wildTiles);
    if (tile) world.animals.push(createAnimal(world, tile, i % 10 === 0 ? 'wolf' : i % 4 === 0 ? 'boar' : 'deer'));
  }
  addEvent(world, 'info', 'İlk ışık', `${world.agents.length} insan yeni bir coğrafyada. İhtiyaçları, yakınlıkları ve ürettikleri kaynaklar bu dünyanın tarihini yazacak.`);
  world.history.push({ day: 0, ...getStats(world) });
  return world;
}

function setAction(world, agent, type, x = agent.x, y = agent.y, duration = 1, extra = {}) {
  const d = Math.hypot(x - agent.x, y - agent.y);
  const path = d > 0.22 ? findPath(world, agent.x, agent.y, x, y) : [];
  if (d > 1.4 && path.length === 0) return false;
  agent.action = { type, targetX: x, targetY: y, progress: 0, duration: Math.max(0.15, duration), ...extra };
  agent.path = path; agent.pathIndex = 0; agent.decisionIn = 0;
  return true;
}

function stopAction(agent, delay = 0) {
  agent.action = { type: 'idle', targetX: agent.x, targetY: agent.y, progress: 0, duration: 1 };
  agent.path = []; agent.pathIndex = 0; agent.decisionIn = delay; agent.vx = 0; agent.vy = 0;
}

function findHomePoint(world, agent) {
  const home = world.buildings.find(building => building.id === agent.homeId && building.progress >= 1);
  if (home) return { x: home.x + 0.5, y: home.y + 0.5 };
  const settlement = settlementOf(world, agent);
  if (settlement) return { x: settlement.x + 0.5, y: settlement.y + 0.5 };
  const parent = agent.parents.map(id => personById(world, id)).find(Boolean);
  return parent ? { x: parent.x, y: parent.y } : { x: agent.originX, y: agent.originY };
}

function nearestEnemy(world, agent, radius = 5) {
  if (!agent.settlementId) return null;
  const settlement = settlementOf(world, agent);
  return nearbyAgents(world, agent.x, agent.y, radius).find(other => other.settlementId && other.settlementId !== agent.settlementId && settlement?.relations[other.settlementId]?.status === 'war' && other.age >= 16) ?? null;
}

function beginResourceWork(world, agent, type, resource, duration, radius = 11, minimum = 0.35) {
  const found = findResource(world, agent, resource, radius, minimum);
  return found ? setAction(world, agent, type, found.target.x + 0.5, found.target.y + 0.5, duration, { resource, tileIndex: found.tile.y * world.width + found.tile.x }) : false;
}

function foodAction(world, agent) {
  const settlement = settlementOf(world, agent);
  if (agent.inventory.food >= 0.5) return setAction(world, agent, 'eat', agent.x, agent.y, 0.32);
  if (settlement?.stockpile.food >= 0.5 && Math.hypot(agent.x - settlement.x - 0.5, agent.y - settlement.y - 0.5) < 18) return setAction(world, agent, 'eat', settlement.x + 0.5, settlement.y + 0.5, 0.4);
  const parent = agent.parents.map(id => personById(world, id)).find(person => person && (person.inventory.food > 0.5 || (agent.age < 3 && person.hunger < 70)));
  if (parent) return setAction(world, agent, 'eat', parent.x, parent.y, 0.5, { providerId: parent.id });
  if (agent.age < 5) {
    const caregiver = nearbyAgents(world, agent.x, agent.y, 5).find(other => other.age >= 18 && other.inventory.food > 1);
    if (caregiver) return setAction(world, agent, 'eat', caregiver.x, caregiver.y, 0.5, { providerId: caregiver.id });
    return false;
  }
  const ripe = world.farms.filter(farm => farm.ripe && (!agent.settlementId || farm.settlementId === agent.settlementId)).sort((a, b) => distance(a, agent) - distance(b, agent))[0];
  if (ripe && distance(ripe, agent) < 13) return setAction(world, agent, 'farm', ripe.x + 0.5, ripe.y + 0.5, 1.3, { farmId: ripe.id, operation: 'harvest' });
  if (beginResourceWork(world, agent, 'gather', 'food', 1.35, agent.hunger > 75 ? 19 : 11, 0.45)) return true;
  return beginResourceWork(world, agent, 'fish', 'fish', 2.1, 15, 0.6);
}

function freeBuildTile(world, settlement, radius = 7, fertile = false) {
  let best = null, score = -Infinity;
  for (let y = Math.max(1, settlement.y - radius); y <= Math.min(world.height - 2, settlement.y + radius); y++) {
    for (let x = Math.max(1, settlement.x - radius); x <= Math.min(world.width - 2, settlement.x + radius); x++) {
      const tile = getTile(world, x, y);
      if (!isWalkable(tile) || tile.fire > 0.1 || tile.biome === 'snow' || tile.biome === 'sand' || tile.region !== getTile(world, settlement.x, settlement.y)?.region) continue;
      if (world.buildings.some(building => Math.hypot(building.x - x, building.y - y) < (fertile ? 2.1 : 2.8)) || world.farms.some(farm => Math.hypot(farm.x - x, farm.y - y) < (fertile ? 0.5 : 1.8))) continue;
      if (!fertile && [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => !isWalkable(getTile(world, x + dx, y + dy))))) continue;
      const d = Math.hypot(x - settlement.x, y - settlement.y);
      if (d > radius || d < 1.5) continue;
      const candidate = (fertile ? tile.fertility * 10 - tile.trees * 0.3 : -tile.trees * 0.25) - Math.abs(d - (fertile ? 4 : 2.5)) + between(world, 0, 0.3);
      if (candidate > score) { best = tile; score = candidate; }
    }
  }
  return best;
}

function canPay(stockpile, cost) { return Object.entries(cost).every(([resource, amount]) => stockpile[resource] >= amount); }
function pay(stockpile, cost) { for (const [resource, amount] of Object.entries(cost)) stockpile[resource] -= amount; }

function requestBuilding(world, settlement, type) {
  const cost = BUILDING_COSTS[type];
  if (!cost || !canPay(settlement.stockpile, cost)) return null;
  const tile = freeBuildTile(world, settlement, Math.min(14, 7 + Math.floor(Math.sqrt(settlement.population) / 2)));
  if (!tile) return null;
  pay(settlement.stockpile, cost);
  const building = { id: world.nextId++, type, x: tile.x, y: tile.y, level: 1, progress: 0, health: 100, settlementId: settlement.id, occupants: [], createdDay: world.day };
  world.buildings.push(building);
  return building;
}

function housingCapacity(world, settlement) {
  return buildingsOf(world, settlement, true).reduce((capacity, building) => capacity + (building.type === 'house' ? 8 : building.type === 'hut' ? 5 : 0), 0);
}

function roleOptions(world, agent, settlement) {
  const stock = settlement?.stockpile ?? emptyResources();
  const population = settlement?.population ?? 8;
  const foodPressure = settlement ? clamp(3 - stock.food / Math.max(1, population * 2), 0.1, 3) : 1.2;
  const incomplete = settlement ? buildingsOf(world, settlement).filter(building => building.progress < 1).length : 0;
  const hasWar = settlement && Object.values(settlement.relations).some(relation => relation.status === 'war');
  const options = [
    { role: 'gatherer', weight: foodPressure * 2.8 },
    { role: 'farmer', weight: settlement ? foodPressure * 1.9 + 1 : 0 },
    { role: 'lumberjack', weight: settlement ? stock.wood < population * 1.4 ? 3 : 0.35 : agent.inventory.wood < 5 ? 1.25 : 0.1 },
    { role: 'miner', weight: settlement ? stock.stone < population ? 2.3 : stock.ore < 15 && hasBuilding(world, settlement, 'workshop') ? 1.7 : 0.2 : agent.inventory.stone < 2 ? 0.65 : 0.05 },
    { role: 'fisher', weight: foodPressure * 1.1 },
    { role: 'hunter', weight: foodPressure * 0.75 * agent.traits.courage },
    { role: 'builder', weight: incomplete ? 4 : 0 },
    { role: 'smith', weight: settlement && hasBuilding(world, settlement, 'workshop') && stock.tools < population * 0.3 ? 2.2 : 0 },
    { role: 'healer', weight: settlement && (stock.medicine < population * 0.1 || nearbyAgents(world, agent.x, agent.y, 8).some(other => other.sickness > 0 || other.health < 65)) ? 1.1 + agent.traits.sociability : 0.03 },
    { role: 'trader', weight: settlement && world.settlements.length > 1 && hasBuilding(world, settlement, 'market') && world.day >= (agent.tradeCooldown ?? 0) && agent.health > 65 && agent.age >= 18 && agent.age < 58 && !agent.pregnant ? 0.8 : 0 },
    { role: 'warrior', weight: hasWar ? 1 + agent.traits.courage * 6 : settlement && hasBuilding(world, settlement, 'barracks') ? agent.traits.courage * 0.7 : 0 },
    { role: 'scholar', weight: settlement && stock.food > population * 2 ? 0.3 + agent.traits.curiosity * 1.2 : 0 },
  ];
  for (const option of options) {
    const familiarity = 1 + Math.min(2.5, (agent.skills[option.role] ?? 0) / 15);
    option.weight *= familiarity * (option.role === agent.role ? 1.8 : 1);
    if (agent.age < 16 && !['gatherer', 'farmer', 'fisher', 'scholar'].includes(option.role)) option.weight *= 0.15;
    if (agent.age > 64 && ['warrior', 'miner', 'lumberjack', 'hunter'].includes(option.role)) option.weight *= 0.25;
  }
  return options;
}

function chooseWork(world, agent, role, settlement) {
  const skill = agent.skills[role] ?? 0;
  const duration = 1 / (1 + Math.min(0.65, skill / 60) + agent.level * 0.02);
  switch (role) {
    case 'gatherer': return beginResourceWork(world, agent, 'gather', 'food', 1.5 * duration);
    case 'lumberjack': return beginResourceWork(world, agent, 'chop', 'trees', 2.3 * duration, 13, 0.5);
    case 'miner': {
      const resource = settlement && settlement.stockpile.stone > 12 && settlement.stockpile.ore < 16 && hasBuilding(world, settlement, 'workshop') ? 'ore' : 'stone';
      return beginResourceWork(world, agent, 'mine', resource, 2.8 * duration, 16, 0.6);
    }
    case 'fisher': return beginResourceWork(world, agent, 'fish', 'fish', 2.2 * duration, 16, 0.6);
    case 'hunter': {
      const target = world.animals.filter(animal => animal.health > 0 && animal.species !== 'wolf' && distance(animal, agent) < 14 && getTile(world, animal.x, animal.y)?.region === getTile(world, agent.x, agent.y)?.region).sort((a, b) => distance(a, agent) - distance(b, agent))[0];
      return target ? setAction(world, agent, 'hunt', target.x, target.y, 1.8 * duration, { animalId: target.id }) : false;
    }
    case 'farmer': {
      if (!settlement) return false;
      const farms = world.farms.filter(farm => farm.settlementId === settlement.id);
      const farm = farms.sort((a, b) => (b.ripe ? 100 : 1 - b.water) - (a.ripe ? 100 : 1 - a.water) || distance(a, agent) - distance(b, agent))[0];
      if (farm && (farm.ripe || farm.water < 0.78 || farm.health < 0.95)) return setAction(world, agent, 'farm', farm.x + 0.5, farm.y + 0.5, (farm.ripe ? 1.6 : 1.2) * duration, { farmId: farm.id, operation: farm.ripe ? 'harvest' : 'tend' });
      if (farms.length < Math.max(2, Math.ceil(settlement.population / 4)) && settlement.stockpile.wood >= 2 && settlement.stockpile.food >= 1) {
        const tile = freeBuildTile(world, settlement, 8, true);
        if (tile) return setAction(world, agent, 'farm', tile.x + 0.5, tile.y + 0.5, 2.5 * duration, { operation: 'plant', tileIndex: tile.y * world.width + tile.x });
      }
      return farm ? setAction(world, agent, 'farm', farm.x + 0.5, farm.y + 0.5, 1.5 * duration, { farmId: farm.id, operation: 'tend' }) : false;
    }
    case 'builder': {
      const building = settlement && buildingsOf(world, settlement).filter(item => item.progress < 1).sort((a, b) => distance(a, agent) - distance(b, agent))[0];
      return building ? setAction(world, agent, 'build', building.x + 0.5, building.y + 0.5, 1.8 * duration, { buildingId: building.id }) : false;
    }
    case 'smith': {
      const workshop = settlement && buildingsOf(world, settlement, true).find(building => building.type === 'workshop');
      return workshop && settlement.stockpile.ore >= 1 && settlement.stockpile.wood >= 1 ? setAction(world, agent, 'craft', workshop.x + 0.5, workshop.y + 0.5, 2.4 * duration) : false;
    }
    case 'healer': {
      const patient = nearbyAgents(world, agent.x, agent.y, 10).filter(other => other.id !== agent.id && (!settlement || other.settlementId === settlement.id) && (other.health < 80 || other.sickness > 0)).sort((a, b) => a.health - b.health)[0];
      if (patient && (agent.inventory.medicine > 0.2 || settlement?.stockpile.medicine > 0.2)) return setAction(world, agent, 'heal', patient.x, patient.y, 1.5 * duration, { patientId: patient.id });
      return beginResourceWork(world, agent, 'heal', 'herbs', 1.8 * duration, 12, 0.4);
    }
    case 'trader': return chooseTrade(world, agent, settlement, duration);
    case 'warrior': return chooseWarriorAction(world, agent, settlement, duration);
    case 'scholar': return settlement ? setAction(world, agent, 'study', settlement.x + 0.5, settlement.y + 0.5, 2 * duration, { subject: pick(world, KNOWLEDGE) }) : false;
    default: return false;
  }
}

function decideAction(world, agent) {
  const settlement = settlementOf(world, agent);
  const tile = getTile(world, agent.x, agent.y);
  const enemy = nearestEnemy(world, agent, 3.5);
  if (tile?.fire > 0.15 || (enemy && (agent.health < 45 || agent.age < 16 || agent.traits.courage < 0.5))) {
    const awayX = enemy ? agent.x + Math.sign(agent.x - enemy.x) * 5 : agent.x + between(world, -5, 5);
    const awayY = enemy ? agent.y + Math.sign(agent.y - enemy.y) * 5 : agent.y + between(world, -5, 5);
    const refuge = nearbyTile(world, awayX, awayY, 4, candidate => candidate.region === tile?.region && candidate.fire < 0.05);
    if (refuge && setAction(world, agent, 'flee', refuge.x + 0.5, refuge.y + 0.5, 0.25)) return;
  }
  if (agent.hunger > 44 && foodAction(world, agent)) return;
  if (agent.energy < 22 || (agent.health < 55 && agent.hunger < 65)) {
    const home = agent.pendingAction || agent.destination ? { x: agent.x, y: agent.y } : findHomePoint(world, agent);
    if (setAction(world, agent, 'rest', home.x, home.y, 3.4)) return;
  }
  if (agent.pendingAction && agent.hunger < 60 && agent.energy > 22) {
    const pending = agent.pendingAction;
    agent.pendingAction = null;
    if (setAction(world, agent, pending.type, pending.targetX, pending.targetY, pending.duration, { ...pending, progress: 0 })) return;
  }
  if (agent.destination) {
    if (distance(agent, agent.destination) > 1.4) { if (setAction(world, agent, 'migrate', agent.destination.x, agent.destination.y, 0.4)) return; }
    else finishMigration(world, agent);
  }
  if (agent.age < 5) {
    const home = findHomePoint(world, agent);
    const nearby = nearbyTile(world, home.x + between(world, -1.3, 1.3), home.y + between(world, -1.3, 1.3), 2, candidate => candidate.region === tile?.region);
    if (nearby) setAction(world, agent, chance(world, 0.55) ? 'rest' : 'socialize', nearby.x + 0.5, nearby.y + 0.5, between(world, 1.5, 3));
    else stopAction(agent, 1);
    return;
  }
  if (settlement && (inventorySize(agent) > 6 || agent.inventory.food >= 4.5) && agent.action.type !== 'trade') {
    if (setAction(world, agent, 'walk', settlement.x + 0.5, settlement.y + 0.5, 0.15, { deposit: true })) return;
  }
  if (agent.social < 30 || chance(world, 0.045 + agent.traits.sociability * 0.07)) {
    const neighbors = nearbyAgents(world, agent.x, agent.y, 7).filter(other => other.id !== agent.id && (!agent.settlementId || other.settlementId === agent.settlementId));
    const potentialPartners = !agent.partnerId && agent.age >= 18 ? neighbors.filter(other => !other.partnerId && other.sex !== agent.sex && other.age >= 18 && Math.abs(other.age - agent.age) < 19 && !agent.parents.includes(other.id) && !other.parents.includes(agent.id) && !agent.parents.some(id => other.parents.includes(id))) : [];
    const friend = potentialPartners.length && chance(world, 0.72) ? pick(world, potentialPartners) : pick(world, neighbors);
    if (friend && setAction(world, agent, 'socialize', friend.x, friend.y, between(world, 0.8, 1.8), { friendId: friend.id })) return;
  }
  if (enemy && agent.age >= 16 && setAction(world, agent, 'fight', enemy.x, enemy.y, 0.7, { enemyId: enemy.id })) return;
  const options = roleOptions(world, agent, settlement);
  for (let attempt = 0; attempt < 5; attempt++) {
    const selected = weighted(world, options);
    if (!selected) break;
    if (chooseWork(world, agent, selected.role, settlement)) return;
    selected.weight = 0;
  }
  if (foodAction(world, agent)) return;
  const point = nearbyTile(world, agent.x + between(world, -4, 4), agent.y + between(world, -4, 4), 3, candidate => candidate.region === tile?.region);
  if (point) setAction(world, agent, 'walk', point.x + 0.5, point.y + 0.5, 0.5);
  else stopAction(agent, 1.5);
}

function depositInventory(world, agent, settlement) {
  if (!settlement) return;
  for (const resource of RESOURCES) {
    const keep = Math.max(resource === 'food' ? 1.5 : resource === 'medicine' ? 0.2 : 0, agent.pendingAction?.offered === resource ? agent.pendingAction.cargo : 0);
    const amount = Math.max(0, agent.inventory[resource] - keep);
    agent.inventory[resource] -= amount; settlement.stockpile[resource] += amount;
    if (amount > 0.1) settlement.production[resource] += amount;
  }
  agent.lastHomeVisit = world.day;
  if (agent.toolDurability < 1 && settlement.stockpile.tools >= 1 && agent.age >= 16) {
    settlement.stockpile.tools -= 1; agent.toolDurability = 22 + (settlement.knowledge.metallurgy ?? 0) * 0.02;
  }
}

function completeAction(world, agent) {
  const action = agent.action;
  const settlement = settlementOf(world, agent);
  const toolBonus = agent.toolDurability > 0 ? 1.4 : 1;
  const skillRole = Object.keys(JOB_ACTIONS).find(role => JOB_ACTIONS[role] === action.type) ?? 'gatherer';
  const ability = (0.8 + agent.traits.diligence * 0.35 + Math.min(0.5, (agent.skills[skillRole] ?? 0) / 80)) * toolBonus;
  const juvenile = agent.age < 12 ? 0.55 : 1;
  let worked = false;
  if (action.type === 'eat') {
    let food = Math.min(1, agent.inventory.food);
    agent.inventory.food -= food;
    if (food < 0.8 && settlement && distance(agent, { x: settlement.x + 0.5, y: settlement.y + 0.5 }) < 2) {
      const shared = Math.min(1 - food, settlement.stockpile.food); settlement.stockpile.food -= shared; food += shared;
    }
    if (food < 0.8 && action.providerId) {
      const parent = personById(world, action.providerId);
      if (parent && distance(agent, parent) < 4) {
        const shared = Math.min(1 - food, parent.inventory.food); parent.inventory.food -= shared; food += shared;
        if (agent.age < 3 && food < 0.4 && parent.hunger < 72) { food += 0.6; parent.hunger = Math.min(100, parent.hunger + 8); parent.energy = Math.max(0, parent.energy - 3); }
      }
    }
    agent.hunger = Math.max(0, agent.hunger - food * 43);
    agent.energy = Math.min(100, agent.energy + food * 6);
    if (food > 0) { agent.lastMeal = world.day; addEffect(world, 'food', agent.x, agent.y, ''); }
  } else if (action.type === 'rest') {
    agent.energy = Math.min(100, agent.energy + 53);
    if (agent.hunger < 65) agent.health = Math.min(100, agent.health + (agent.homeId ? 4 : 1.5));
    agent.morale = Math.min(100, agent.morale + 1.5);
  } else if (action.type === 'walk') {
    if (action.deposit) depositInventory(world, agent, settlement);
    if (action.tradeReturn) { agent.pendingAction = null; agent.tradeCooldown = world.day + 24; }
  } else if (action.type === 'gather' || action.type === 'chop' || action.type === 'mine' || action.type === 'fish') {
    const tile = world.tiles[action.tileIndex];
    const source = action.resource;
    if (tile && source && distance(agent, tile) < 3.3) {
      const output = source === 'trees' ? 'wood' : source === 'fish' ? 'food' : source;
      const infrastructure = settlement && source === 'trees' && hasBuilding(world, settlement, 'lumberyard') ? 1.2 : settlement && (source === 'stone' || source === 'ore') && hasBuilding(world, settlement, 'mine') ? 1.2 : 1;
      const amount = Math.min(tile[source], (source === 'trees' ? 2.3 : source === 'stone' || source === 'ore' ? 2.4 : source === 'fish' ? 3.4 : 2.7) * ability * juvenile * infrastructure);
      tile[source] -= amount; agent.inventory[output] += amount; worked = amount > 0;
      if (worked) {
        addEffect(world, output === 'food' ? 'food' : output === 'wood' ? 'wood' : 'stone', agent.x, agent.y, `+${Math.max(1, Math.round(amount))}`);
        changeKnowledge(settlement, action.type === 'mine' ? action.resource === 'ore' ? 'metallurgy' : 'masonry' : 'agriculture', amount * 0.16);
      }
    }
  } else if (action.type === 'farm') {
    const farm = world.farms.find(item => item.id === action.farmId);
    if (action.operation === 'plant' && settlement && settlement.stockpile.wood >= 2 && settlement.stockpile.food >= 1) {
      const tile = world.tiles[action.tileIndex];
      if (tile && !world.farms.some(item => item.x === tile.x && item.y === tile.y) && !world.buildings.some(item => item.x === tile.x && item.y === tile.y)) {
        settlement.stockpile.wood -= 2; settlement.stockpile.food -= 1; agent.inventory.wood += tile.trees * 0.5; tile.trees = 0;
        world.farms.push({ id: world.nextId++, x: tile.x, y: tile.y, settlementId: settlement.id, crop: chance(world, 0.65) ? 'wheat' : 'vegetables', growth: 0.08, water: Math.max(0.55, tile.moisture), health: 1, ripe: false, ripeDay: null, harvests: 0 });
        worked = true; changeKnowledge(settlement, 'agriculture', 2);
      }
    } else if (farm) {
      if (action.operation === 'harvest' && farm.ripe) {
        const tile = getTile(world, farm.x, farm.y);
        const amount = (7 + tile.fertility * 8) * farm.health * (0.85 + ability * 0.15);
        agent.inventory.food += amount; farm.growth = 0.03; farm.ripe = false; farm.health = 1; farm.harvests++;
        addEffect(world, 'food', agent.x, agent.y, `+${Math.round(amount)}`);
        changeKnowledge(settlement, 'agriculture', 3); worked = true;
      } else if (action.operation === 'tend') {
        farm.water = Math.min(1, farm.water + 0.19 * ability); farm.health = Math.min(1, farm.health + 0.1); farm.growth = Math.min(1, farm.growth + 0.018 * ability);
        if (farm.growth >= 1) { farm.ripe = true; farm.ripeDay = world.day; }
        changeKnowledge(settlement, 'agriculture', 0.5); worked = true;
      }
    }
  } else if (action.type === 'build') {
    const building = world.buildings.find(item => item.id === action.buildingId);
    if (building && building.progress < 1) {
      if (building.ruined && !building.repairCostPaid) {
        const cost = Object.fromEntries(Object.entries(BUILDING_COSTS[building.type]).map(([resource, amount]) => [resource, amount * 0.5]));
        if (!settlement || !canPay(settlement.stockpile, cost)) { stopAction(agent, 0.3); return; }
        pay(settlement.stockpile, cost); building.repairCostPaid = true;
      }
      const wasIncomplete = building.progress < 1;
      let cleared = 0;
      // Building footprint preparation is actual labour and produces actual timber.
      // Trees cannot merely disappear under a decorative roof.
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const tile = getTile(world, building.x + dx, building.y + dy);
        if (!tile || cleared >= 6 * ability) continue;
        const amount = Math.min(tile.trees, 6 * ability - cleared);
        tile.trees -= amount; cleared += amount;
      }
      agent.inventory.wood += cleared * 0.7;
      if (cleared < 0.2) building.progress = Math.min(1, building.progress + 0.2 * ability);
      changeKnowledge(settlement, 'masonry', 1.2); worked = true;
      if (wasIncomplete && building.progress >= 1) {
        addEffect(world, 'spark', agent.x, agent.y, '✓');
        if (['hall', 'market', 'workshop', 'barracks'].includes(building.type)) addEvent(world, 'growth', `${settlement?.name ?? 'Yerleşim'} büyüyor`, `${({ hall: 'Yönetim evi', market: 'Pazar', workshop: 'Atölye', barracks: 'Kışla' })[building.type]} tamamlandı; yeni iş olanakları oluştu.`, { ...building, agentId: agent.id });
      }
    }
  } else if (action.type === 'craft' && settlement) {
    if (settlement.stockpile.ore >= 1 && settlement.stockpile.wood >= 1) {
      settlement.stockpile.ore -= 1; settlement.stockpile.wood -= 1; settlement.stockpile.tools += 1.5 * ability;
      settlement.production.tools += 1.5 * ability; changeKnowledge(settlement, 'metallurgy', 2.8); worked = true;
      addEffect(world, 'spark', agent.x, agent.y, '+');
    }
  } else if (action.type === 'heal') {
    const patient = personById(world, action.patientId);
    if (patient && distance(agent, patient) < 4) {
      const source = agent.inventory.medicine >= 0.3 ? agent.inventory : settlement?.stockpile;
      if (source?.medicine >= 0.3) {
        source.medicine -= 0.3; patient.health = Math.min(100, patient.health + 12 * ability); patient.sickness = Math.max(0, patient.sickness - 18 * ability); patient.immunity = Math.min(100, patient.immunity + 5);
        changeKnowledge(settlement, 'medicine', 1.7); addEffect(world, 'heal', patient.x, patient.y, '+'); worked = true;
      }
    } else if (action.resource === 'herbs') {
      const tile = world.tiles[action.tileIndex];
      if (tile) { const amount = Math.min(tile.herbs, 1.2 * ability); tile.herbs -= amount; agent.inventory.medicine += amount; worked = amount > 0; changeKnowledge(settlement, 'medicine', amount * 0.5); }
    }
  } else if (action.type === 'hunt') {
    const animal = world.animals.find(item => item.id === action.animalId);
    if (animal && animal.health > 0 && distance(agent, animal) < 3.2) {
      animal.health -= 10 * ability + agent.level;
      if (animal.species === 'boar' && chance(world, 0.25)) { agent.health -= 4; agent.lastDamageCause = 'violence'; }
      if (animal.health <= 0) { const meat = animal.species === 'boar' ? 12 : 8; agent.inventory.food += meat; addEffect(world, 'food', agent.x, agent.y, `+${meat}`); }
      worked = true;
    }
  } else if (action.type === 'socialize') {
    agent.social = Math.min(100, agent.social + 32); agent.morale = Math.min(100, agent.morale + 5);
    const friend = personById(world, action.friendId);
    if (friend && distance(agent, friend) < 4) {
      friend.social = Math.min(100, friend.social + 16); friend.morale = Math.min(100, friend.morale + 2);
      tryPair(world, agent, friend);
      const mentor = agent.age < 18 && friend.age >= 18 ? friend : friend.age < 18 && agent.age >= 18 ? agent : null;
      if (mentor) { const student = mentor === agent ? friend : agent; student.skills[mentor.role] = Math.min(100, student.skills[mentor.role] + 0.25); student.xp += 0.5; }
      changeKnowledge(settlement, 'civics', 0.6);
    }
  } else if (action.type === 'study' && settlement) {
    changeKnowledge(settlement, action.subject, (2.5 + agent.traits.curiosity * 3) * (hasBuilding(world, settlement, 'hall') ? 1.25 : 1)); agent.social = Math.min(100, agent.social + 5); worked = true;
  } else if (action.type === 'trade') worked = finishTrade(world, agent, settlement);
  else if (action.type === 'fight') worked = finishFight(world, agent, settlement);
  else if (action.type === 'migrate') finishMigration(world, agent);
  if (worked) {
    grantExperience(world, agent, skillRole, 2 + agent.traits.curiosity * 0.7);
    agent.energy = Math.max(0, agent.energy - 1.4);
    if (agent.toolDurability > 0 && ['chop', 'mine', 'farm', 'build', 'hunt'].includes(action.type)) agent.toolDurability = Math.max(0, agent.toolDurability - 0.7);
    agent.morale = Math.min(100, agent.morale + 0.25);
  }
  if (settlement && distance(agent, { x: settlement.x + 0.5, y: settlement.y + 0.5 }) < 2.3 && action.type !== 'trade') depositInventory(world, agent, settlement);
  stopAction(agent, between(world, 0.05, 0.25));
}

function stepAgent(world, agent, dt) {
  agent.age += dt / DAYS_PER_YEAR; agent.lifeStage = lifeStage(agent.age);
  const active = !['idle', 'rest', 'eat', 'socialize', 'study'].includes(agent.action.type);
  const consumption = agent.age < 3 ? 3.2 : agent.age < 12 ? 4.3 : 5.5;
  agent.hunger = Math.min(100, agent.hunger + dt * consumption * (active ? 1.08 : 1) * (world.season === 'winter' ? 1.08 : 1));
  agent.energy = clamp(agent.energy - dt * (active ? 0.75 : 0.17), 0, 100);
  agent.social = Math.max(0, agent.social - dt * 0.55);
  if (agent.hunger > 82) { agent.health -= dt * (agent.hunger - 80) * 0.19; agent.lastDamageCause = 'starvation'; }
  else if (agent.hunger < 55 && agent.sickness < 5) agent.health = Math.min(100, agent.health + dt * (0.15 + agent.traits.resilience * 0.12));
  if (agent.energy < 4) agent.health -= dt * 0.2;
  const tile = getTile(world, agent.x, agent.y);
  if (tile?.fire > 0) { agent.health -= tile.fire * dt * 9; agent.lastDamageCause = 'fire'; if (agent.action.type !== 'flee') stopAction(agent); }
  if (agent.pregnant) agent.pregnant.remaining = Math.max(0, agent.pregnant.remaining - dt);
  agent.birthCooldown = Math.max(0, agent.birthCooldown - dt);
  agent.decisionIn -= dt;
  if (agent.health <= 0) return;
  // Emergency needs interrupt work; a route to food itself is allowed to finish.
  if ((agent.hunger > 85 && !['eat', 'gather', 'fish', 'farm', 'flee'].includes(agent.action.type)) || (agent.energy < 10 && agent.action.type === 'trade')) {
    if (agent.action.type === 'trade' || agent.action.tradeReturn) agent.pendingAction = { ...agent.action, progress: 0 };
    stopAction(agent);
  }
  if (agent.action.type === 'idle') { if (agent.decisionIn <= 0) decideAction(world, agent); return; }
  if (agent.pathIndex < agent.path.length) {
    const next = agent.path[agent.pathIndex], dx = next.x - agent.x, dy = next.y - agent.y, d = Math.hypot(dx, dy);
    const speed = (agent.age < 3 ? 0.52 : agent.age < 12 ? 0.9 : agent.age >= 66 ? 0.9 : 1.3) * (agent.action.type === 'flee' ? 1.65 : agent.action.type === 'fight' ? 1.25 : 1) * (agent.energy < 15 ? 0.7 : 1) * (1 + Math.min(tile?.road ?? 0, 1) * 0.15);
    const move = Math.min(d, dt * speed);
    const vx = d > 0 ? dx / d * move / dt : 0, vy = d > 0 ? dy / d * move / dt : 0;
    const nx = agent.x + vx * dt, ny = agent.y + vy * dt;
    if (!isWalkable(getTile(world, nx, ny))) { stopAction(agent, 0.4); return; }
    agent.x = nx; agent.y = ny; agent.vx = vx; agent.vy = vy;
    agent.direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 1 : 3 : dy > 0 ? 2 : 0;
    if (tile) tile.road = Math.min(1, tile.road + dt * 0.004);
    if (move >= d - 0.001) agent.pathIndex++;
    return;
  }
  agent.vx = 0; agent.vy = 0;
  // Pursuit updates its target only at the end of a route, avoiding A* every tick.
  if (agent.action.type === 'fight' || agent.action.type === 'hunt') {
    const target = agent.action.type === 'fight' ? personById(world, agent.action.enemyId) : world.animals.find(animal => animal.id === agent.action.animalId);
    if (target && target.health > 0 && distance(agent, target) > 2.5) {
      if (distance(agent, target) > 18 || !setAction(world, agent, agent.action.type, target.x, target.y, agent.action.duration, agent.action.type === 'fight' ? { enemyId: target.id } : { animalId: target.id })) stopAction(agent, 0.3);
      return;
    }
  }
  agent.action.progress = Math.min(1, agent.action.progress + dt / agent.action.duration);
  if (agent.action.progress >= 1) completeAction(world, agent);
}

export function stepWorld(world, dt = 0.1) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 1) throw new RangeError('Simulation dt must be within (0, 1] days.');
  world.tick++; world.day = Math.round((world.day + dt) * 1e9) / 1e9;
  cacheFor(world);
  stepAnimals(world, dt);
  for (const effect of world.effects) effect.age += dt;
  world.effects = world.effects.filter(effect => effect.age < effect.duration);
  for (const agent of world.agents) stepAgent(world, agent, dt);
  removeDead(world);
  while (world.lastDailyDay < Math.floor(world.day + 1e-8)) {
    world.lastDailyDay++;
    dailyWorld(world);
  }
  return world;
}

export function getStats(world) {
  const population = world.agents.length;
  const sum = property => world.agents.reduce((value, agent) => value + agent[property], 0);
  const resource = key => world.settlements.reduce((value, settlement) => value + settlement.stockpile[key], 0) + world.agents.reduce((value, agent) => value + agent.inventory[key], 0);
  const activeIds = new Set(world.settlements.filter(settlement => settlement.population > 0).map(settlement => settlement.id));
  const wars = world.settlements.reduce((count, settlement) => count + (activeIds.has(settlement.id) ? Object.entries(settlement.relations).filter(([otherId, relation]) => relation.status === 'war' && activeIds.has(Number(otherId))).length : 0), 0) / 2;
  return { population, settlements: world.settlements.filter(settlement => settlement.population > 0).length, food: resource('food'), wood: resource('wood'), stone: resource('stone'), ore: resource('ore'), tools: resource('tools'), medicine: resource('medicine'), births: world.metrics.births, deaths: world.metrics.deaths, wars, totalWars: world.metrics.wars, migrations: world.metrics.migrations, trades: world.metrics.trades, avgAge: population ? sum('age') / population : 0, avgLevel: population ? sum('level') / population : 0, happiness: population ? sum('morale') / population : 0, health: population ? sum('health') / population : 0, children: world.agents.filter(agent => agent.age < 18).length, buildings: world.buildings.filter(building => building.progress >= 1).length, farms: world.farms.length, animals: world.animals.length, year: world.year, day: world.day };
}

function tryPair(world, first, second) {
  if (first.sex === second.sex || first.age < 18 || second.age < 18 || first.age > 58 || second.age > 58 || first.partnerId || second.partnerId) return false;
  if (first.parents.includes(second.id) || second.parents.includes(first.id) || first.parents.some(id => second.parents.includes(id))) return false;
  if (Math.abs(first.age - second.age) > 21 || (first.settlementId && second.settlementId && first.settlementId !== second.settlementId)) return false;
  if (!chance(world, 0.18 + (first.traits.sociability + second.traits.sociability) * 0.2)) return false;
  first.partnerId = second.id; second.partnerId = first.id;
  first.morale = Math.min(100, first.morale + 8); second.morale = Math.min(100, second.morale + 8);
  addEvent(world, 'info', 'Yeni bir aile bağı', `${first.name} ile ${second.name} birlikte yaşamaya başladı.`, { x: first.x, y: first.y, agentId: first.id, settlementId: first.settlementId });
  return true;
}

function dailyPopulation(world) {
  const newborns = [];
  for (const agent of world.agents) {
    const settlement = settlementOf(world, agent);
    const hungerPenalty = agent.hunger > 65 ? 1.1 : agent.hunger > 45 ? 0.3 : -0.28;
    const targetMorale = clamp(70 - hungerPenalty * 20 + (agent.homeId ? 8 : -5) + agent.social * 0.08 - agent.sickness * 0.3 - (settlement?.famineDays > 3 ? 15 : 0) + (settlement && hasBuilding(world, settlement, 'shrine') ? 4 : 0), 5, 96);
    agent.morale = clamp(agent.morale + (targetMorale - agent.morale) * 0.055, 0, 100);
    agent.immunity = Math.max(0, agent.immunity - 0.08);
    if (world.season === 'winter' && !agent.homeId && !(settlement && distance(agent, settlement) < 3)) {
      agent.exposure = Math.min(100, agent.exposure + 1.1);
      if (agent.exposure > 45) { agent.health -= 0.3 * (1 - agent.traits.resilience); agent.energy = Math.max(0, agent.energy - 1); }
    } else agent.exposure = Math.max(0, agent.exposure - 3);
    if (agent.sickness > 0) {
      agent.sickness = Math.max(0, agent.sickness - 0.3 - agent.traits.resilience * 0.3);
      agent.health -= agent.sickness * 0.012; agent.lastDamageCause = 'disease';
      if (agent.sickness <= 0.5) agent.immunity = 90;
      if (chance(world, 0.08)) {
        const contact = pick(world, nearbyAgents(world, agent.x, agent.y, 2.5).filter(other => other.id !== agent.id && other.immunity < 20 && other.sickness === 0));
        if (contact) contact.sickness = between(world, 20, 50);
      }
    } else if (agent.immunity < 20 && chance(world, (agent.hunger > 75 ? 0.0012 : 0.0001) + (settlement && settlement.population > 45 && !hasBuilding(world, settlement, 'well') ? 0.0009 : 0))) {
      agent.sickness = between(world, 25, 55);
      addEvent(world, 'info', 'Hastalık belirtisi', `${agent.name} hastalandı. Yakın temas bulaşmaya, temiz su ve şifacılık iyileşmeye etki ediyor.`, { ...agent, agentId: agent.id });
    }
    if (agent.age > 63 && chance(world, 0.018 * Math.exp((agent.age - 63) / 9) / DAYS_PER_YEAR) || agent.age > 96) {
      agent.health = 0; agent.lastDamageCause = 'age'; continue;
    }
    if (agent.pregnant && agent.pregnant.remaining <= 0 && agent.health > 25 && world.agents.length + newborns.length < world.config.maxPopulation) {
      const father = personById(world, agent.pregnant.fatherId) ?? agent.pregnant.father;
      const baby = createAgent(world, { x: agent.x, y: agent.y, age: 0, mother: agent, father, settlementId: agent.settlementId });
      baby.health = 95; baby.hunger = 10; baby.energy = 80; baby.homeId = agent.homeId;
      agent.childrenIds.push(baby.id);
      const livingFather = personById(world, agent.pregnant.fatherId);
      if (livingFather) livingFather.childrenIds.push(baby.id);
      newborns.push(baby); world.metrics.births++;
      agent.pregnant = null; agent.birthCooldown = 110; agent.health = Math.max(20, agent.health - 5); agent.hunger = Math.min(100, agent.hunger + 12);
      addEvent(world, 'birth', `${baby.name} doğdu`, `${agent.name} ailesine ${baby.generation}. kuşaktan bir çocuk katıldı. Görünümü ve mizacı ebeveynlerinden izler taşıyor.`, { x: baby.x, y: baby.y, agentId: baby.id, settlementId: baby.settlementId });
      addEffect(world, 'birth', baby.x, baby.y, '+1');
    }
    if (agent.sex !== 'female' || agent.age < 18 || agent.age > 44 || agent.pregnant || agent.birthCooldown > 0 || agent.hunger > 55 || agent.health < 65 || agent.morale < 48) continue;
    const partner = personById(world, agent.partnerId);
    if (!partner || partner.age < 18 || partner.health < 55 || partner.hunger > 65 || distance(agent, partner) > 9) continue;
    const housing = settlement ? housingCapacity(world, settlement) : 0;
    const food = settlement ? settlement.stockpile.food / Math.max(1, settlement.population) : 0;
    const capacity = settlement ? clamp((housing + 5 - settlement.population) / 10, 0, 1) : 0.12;
    const supply = settlement ? clamp(food / 3, 0, 1) : agent.inventory.food >= 2 && partner.inventory.food >= 2 ? 0.25 : 0;
    const ageFactor = agent.age < 34 ? 1 : (45 - agent.age) / 11;
    if (capacity > 0 && supply > 0 && chance(world, 0.018 * agent.traits.fertility * capacity * supply * ageFactor)) {
      agent.pregnant = { fatherId: partner.id, remaining: 66 + between(world, -3, 3), father: { id: partner.id, traits: { ...partner.traits }, appearance: { ...partner.appearance }, generation: partner.generation, familyName: partner.familyName } };
      agent.birthCooldown = 160;
    }
  }
  world.agents.push(...newborns);
  if (newborns.length) caches.delete(world);
}

function removeDead(world) {
  const dead = world.agents.filter(agent => agent.health <= 0);
  if (!dead.length) return;
  for (const agent of dead) {
    const cause = agent.lastDamageCause || (agent.hunger > 85 ? 'starvation' : agent.sickness > 0 ? 'disease' : 'age');
    world.metrics.deaths++;
    world.metrics.deathCauses[cause] = (world.metrics.deathCauses[cause] ?? 0) + 1;
    world.graves.push({ id: agent.id, name: agent.name, age: agent.age, day: world.day, x: agent.x, y: agent.y, cause, settlementId: agent.settlementId, generation: agent.generation, level: agent.level });
    const settlement = settlementOf(world, agent);
    if (settlement && distance(agent, settlement) < 12) for (const resource of RESOURCES) settlement.stockpile[resource] += agent.inventory[resource] * 0.6;
    const partner = personById(world, agent.partnerId);
    if (partner) { partner.partnerId = null; partner.morale = Math.max(0, partner.morale - 18); }
    for (const childId of agent.childrenIds) { const child = personById(world, childId); if (child) child.morale = Math.max(0, child.morale - 10); }
    addEvent(world, 'death', `${agent.name} yaşamını yitirdi`, `${Math.floor(agent.age)} yaşında; neden: ${DEATH_NAMES[cause] ?? cause}. ${agent.level}. seviye deneyimi ardında ${agent.childrenIds.length} çocuk bıraktı.`, { x: agent.x, y: agent.y, agentId: agent.id, settlementId: agent.settlementId });
    for (const building of world.buildings) building.occupants = (building.occupants ?? []).filter(id => id !== agent.id);
  }
  world.agents = world.agents.filter(agent => agent.health > 0);
  if (world.graves.length > 180) world.graves.splice(0, world.graves.length - 180);
  caches.delete(world);
}

function foundSettlement(world, candidates, tile) {
  const settlement = {
    id: world.nextId++, name: newSettlementName(world), color: COLORS[world.settlements.length % COLORS.length],
    x: tile.x, y: tile.y, stage: 'camp', population: candidates.length, stockpile: emptyResources(),
    knowledge: Object.fromEntries(KNOWLEDGE.map(key => [key, 0])), prosperity: 40, relations: {},
    foundedDay: world.day, leaderId: [...candidates].sort((a, b) => (b.age * 0.2 + b.traits.sociability * 10 + b.level) - (a.age * 0.2 + a.traits.sociability * 10 + a.level))[0]?.id ?? null,
    production: emptyResources(), famineDays: 0, unrest: 0, cohesion: 60, lastGrowth: world.day,
    discovered: [], culture: { aggression: candidates.reduce((sum, agent) => sum + agent.traits.aggression, 0) / candidates.length, openness: candidates.reduce((sum, agent) => sum + agent.traits.sociability, 0) / candidates.length },
    territory: 7, abandonedDay: null,
  };
  for (const agent of candidates) {
    agent.settlementId = settlement.id; agent.destination = null; agent.originX = tile.x + 0.5; agent.originY = tile.y + 0.5;
    for (const resource of RESOURCES) {
      const amount = Math.max(0, agent.inventory[resource] - (resource === 'food' ? 1 : 0));
      settlement.stockpile[resource] += amount; agent.inventory[resource] -= amount;
    }
    settlement.knowledge.agriculture += agent.skills.gatherer * 0.15;
    settlement.knowledge.masonry += agent.skills.miner * 0.1;
  }
  world.settlements.push(settlement); caches.delete(world);
  const campCost = BUILDING_COSTS.campfire;
  if (canPay(settlement.stockpile, campCost)) pay(settlement.stockpile, campCost);
  world.buildings.push({ id: world.nextId++, type: 'campfire', x: tile.x, y: tile.y, level: 1, progress: 1, health: 100, settlementId: settlement.id, occupants: [], createdDay: world.day });
  settlement.stockpile.wood += tile.trees * 0.7; tile.trees = 0;
  addEvent(world, 'founding', `${settlement.name} kuruldu`, `${candidates.length} insan yiyecek, odun ve emeğini birleştirerek ortak bir ocak kurdu. Yakınlık ve üretim fazlası kalıcı yerleşime dönüştü.`, { x: tile.x, y: tile.y, settlementId: settlement.id });
  return settlement;
}

function dailyFounding(world) {
  const unattached = world.agents.filter(agent => !agent.settlementId && !agent.destination && agent.age >= 18 && agent.health > 50);
  // Multiple independent nucleation sites can emerge; no population gets a scripted village.
  for (const leader of unattached) {
    if (leader.settlementId || leader.workCount < 4 || !chance(world, 0.06)) continue;
    const tile = getTile(world, leader.originX, leader.originY) ?? getTile(world, leader.x, leader.y);
    if (!isWalkable(tile) || tile.fertility < 0.35 || world.settlements.some(settlement => distance(settlement, tile) < 11 && settlement.population > 0)) continue;
    const candidates = world.agents.filter(agent => !agent.settlementId && !agent.destination && (Math.hypot(agent.originX - tile.x, agent.originY - tile.y) < 6 || distance(agent, tile) < 7) && getTile(world, agent.x, agent.y)?.region === tile.region);
    const adults = candidates.filter(agent => agent.age >= 18);
    if (adults.length < 7 || candidates.length < 10) continue;
    const food = candidates.reduce((sum, agent) => sum + agent.inventory.food, 0);
    const wood = candidates.reduce((sum, agent) => sum + agent.inventory.wood, 0);
    const stone = candidates.reduce((sum, agent) => sum + agent.inventory.stone, 0);
    const work = adults.reduce((sum, agent) => sum + agent.workCount, 0) / adults.length;
    if (food < candidates.length * 0.6 || wood < 19 || stone < 5 || work < 4.5) continue;
    foundSettlement(world, candidates, tile);
  }
  // Nearby unaffiliated families can join an existing community when its stores can support them.
  for (const agent of world.agents) {
    if (agent.settlementId || agent.destination || !chance(world, 0.035)) continue;
    const settlement = world.settlements.filter(item => item.population > 0 && item.stockpile.food > item.population * 0.5 && distance(item, agent) < 7 && getTile(world, item.x, item.y)?.region === getTile(world, agent.x, agent.y)?.region).sort((a, b) => distance(a, agent) - distance(b, agent))[0];
    if (settlement) { agent.settlementId = settlement.id; agent.originX = settlement.x + 0.5; agent.originY = settlement.y + 0.5; }
  }
}

function assignHousing(world, settlement, residents) {
  const homes = buildingsOf(world, settlement, true).filter(building => building.type === 'hut' || building.type === 'house');
  const current = new Map(residents.map(agent => [agent.id, agent]));
  for (const home of homes) home.occupants = (home.occupants ?? []).filter(id => current.has(id) && current.get(id).homeId === home.id);
  for (const agent of residents) {
    if (homes.some(home => home.id === agent.homeId)) continue;
    agent.homeId = null;
    const partner = personById(world, agent.partnerId);
    const familyHome = homes.find(home => home.id === partner?.homeId || agent.parents.some(id => home.occupants.includes(id)));
    const home = familyHome && familyHome.occupants.length < (familyHome.type === 'house' ? 8 : 5) ? familyHome : homes.find(item => item.occupants.length < (item.type === 'house' ? 8 : 5));
    if (home) { home.occupants.push(agent.id); agent.homeId = home.id; }
  }
}

function dailyBuildingPlans(world, settlement) {
  const buildings = buildingsOf(world, settlement);
  if (buildings.filter(building => building.progress < 1).length >= 3) return;
  const capacity = housingCapacity(world, settlement) + buildings.filter(building => building.progress < 1).reduce((sum, building) => sum + (building.type === 'house' ? 8 : building.type === 'hut' ? 5 : 0), 0);
  const has = type => buildings.some(building => building.type === type);
  const stock = settlement.stockpile;
  let wanted = null;
  if (capacity < settlement.population + 5) wanted = settlement.knowledge.masonry >= 55 && stock.stone >= 20 ? 'house' : 'hut';
  else if (!has('granary') && settlement.population >= 12) wanted = 'granary';
  else if (!has('well') && (world.farms.some(farm => farm.settlementId === settlement.id) || settlement.population >= 18)) wanted = 'well';
  else if (!has('lumberyard') && settlement.population >= 18) wanted = 'lumberyard';
  else if (!has('workshop') && settlement.knowledge.masonry >= 30 && settlement.population >= 15) wanted = 'workshop';
  else if (!has('mine') && has('workshop')) wanted = 'mine';
  else if (!has('market') && settlement.knowledge.civics >= 14 && world.settlements.length >= 2) wanted = 'market';
  else if (!has('shrine') && settlement.population >= 22 && settlement.knowledge.civics >= 30) wanted = 'shrine';
  else if (!has('watchtower') && Object.values(settlement.relations).some(relation => relation.tension > 25)) wanted = 'watchtower';
  else if (!has('barracks') && settlement.population >= 20 && Object.values(settlement.relations).some(relation => relation.tension > 32)) wanted = 'barracks';
  else if (!has('hall') && settlement.knowledge.civics >= 65 && settlement.population >= 30) wanted = 'hall';
  if (wanted) requestBuilding(world, settlement, wanted);
}

function dailySettlements(world) {
  for (const settlement of world.settlements) {
    const residents = residentsOf(world, settlement);
    settlement.population = residents.length;
    if (residents.length === 0) {
      if (settlement.abandonedDay === null) { settlement.abandonedDay = world.day; addEvent(world, 'migration', `${settlement.name} sessizleşti`, 'Son sakin ayrıldı; yapılar ve kaynaklar coğrafyanın hafızasında kaldı.', { ...settlement, settlementId: settlement.id }); }
      settlement.stockpile.food *= 0.985;
      continue;
    }
    settlement.abandonedDay = null;
    const averageHunger = residents.reduce((sum, agent) => sum + agent.hunger, 0) / residents.length;
    settlement.famineDays = settlement.stockpile.food < residents.length * 0.25 && averageHunger > 58 ? settlement.famineDays + 1 : Math.max(0, settlement.famineDays - 1);
    if (settlement.famineDays === 6) addEvent(world, 'info', `${settlement.name} erzak arıyor`, 'Ortak ambar azaldı. Açlık çalışma önceliklerini değiştiriyor; uzun sürerse aileler göç edebilir.', { ...settlement, settlementId: settlement.id });
    const spoilage = hasBuilding(world, settlement, 'granary') ? 0.0018 : 0.006;
    settlement.stockpile.food = Math.max(0, settlement.stockpile.food * (1 - spoilage));
    for (const key of RESOURCES) settlement.production[key] *= 0.93;
    const housing = housingCapacity(world, settlement);
    const averageMorale = residents.reduce((sum, agent) => sum + agent.morale, 0) / residents.length;
    const safety = Object.values(settlement.relations).some(relation => relation.status === 'war') ? -15 : 5;
    settlement.prosperity = clamp(averageMorale * 0.45 + Math.min(25, settlement.stockpile.food / residents.length * 3) + Math.min(20, housing / residents.length * 15) + safety - settlement.famineDays * 0.4, 0, 100);
    settlement.unrest = clamp(60 - averageMorale + settlement.famineDays * 1.2 + Math.max(0, residents.length - housing) * 0.2, 0, 100);
    settlement.cohesion = clamp(averageMorale * 0.8 + Math.min(20, settlement.knowledge.civics / 20), 0, 100);
    assignHousing(world, settlement, residents);
    dailyBuildingPlans(world, settlement);
    if (!residents.some(agent => agent.id === settlement.leaderId)) {
      settlement.leaderId = [...residents].filter(agent => agent.age >= 18).sort((a, b) => (b.level + b.traits.sociability * 5 + b.age * 0.08) - (a.level + a.traits.sociability * 5 + a.age * 0.08))[0]?.id ?? residents[0].id;
    }
    let stage = 'camp';
    const completed = buildingsOf(world, settlement, true);
    // A smith helping with the harvest does not erase metallurgy from a civilization.
    const specialized = ROLES.filter(role => residents.some(agent => (agent.skills[role] ?? 0) >= 2)).length;
    if (residents.length >= 10 && housing >= 8 && completed.length >= 3) stage = 'hamlet';
    if (residents.length >= 18 && housing >= 15 && hasBuilding(world, settlement, 'granary') && world.farms.filter(farm => farm.settlementId === settlement.id).length >= 2 && specialized >= 4) stage = 'village';
    if (residents.length >= 32 && housing >= 30 && hasBuilding(world, settlement, 'market') && hasBuilding(world, settlement, 'workshop') && settlement.knowledge.civics >= 65 && specialized >= 6) stage = 'town';
    if (residents.length >= 64 && housing >= 60 && hasBuilding(world, settlement, 'hall') && settlement.knowledge.metallurgy >= 150 && settlement.knowledge.trade >= 100 && settlement.prosperity > 55 && specialized >= 8) stage = 'city';
    if (stage !== settlement.stage) {
      const upward = ['camp', 'hamlet', 'village', 'town', 'city'].indexOf(stage) > ['camp', 'hamlet', 'village', 'town', 'city'].indexOf(settlement.stage);
      settlement.stage = stage; settlement.lastGrowth = world.day;
      addEvent(world, 'growth', `${settlement.name}: ${STAGE_NAMES[stage]}`, upward ? 'Nüfus, konut, üretim ve uzmanlık birlikte yeni bir toplumsal ölçeğe ulaştı.' : 'Nüfus ve barınma koşulları değişince yerleşimin ölçeği küçüldü.', { ...settlement, settlementId: settlement.id });
    }
    settlement.territory = clamp(5 + Math.sqrt(residents.length) * 0.65 + (stage === 'town' ? 2 : stage === 'city' ? 4 : 0), 5, 16);
    const thresholds = { agriculture: 35, masonry: 40, metallurgy: 45, medicine: 35, trade: 35, civics: 40 };
    const names = { agriculture: 'Dönüşümlü ekim', masonry: 'Taş ustalığı', metallurgy: 'Demir işçiliği', medicine: 'Şifalı bitki bilgisi', trade: 'Düzenli takas', civics: 'Ortak yönetim' };
    for (const [subject, threshold] of Object.entries(thresholds)) if (settlement.knowledge[subject] >= threshold && !settlement.discovered.includes(subject)) {
      settlement.discovered.push(subject); world.metrics.discoveries++;
      addEvent(world, 'discovery', `${settlement.name}: ${names[subject]}`, 'Tekrarlanan emek ve paylaşılan deneyim kalıcı bilgiye dönüştü.', { ...settlement, settlementId: settlement.id });
    }
  }
  // Fire damages real structures and leaves rebuildable ruins rather than free replacement.
  for (const building of world.buildings) {
    const tile = getTile(world, building.x, building.y);
    if (tile?.fire > 0) building.health = Math.max(0, building.health - tile.fire * 15);
    if (building.health <= 0 && !building.ruined) {
      building.ruined = true; building.progress = 0; building.health = 20; building.repairCostPaid = false;
      for (const agent of world.agents) if (agent.homeId === building.id) agent.homeId = null;
      building.occupants = [];
      addEvent(world, 'fire', 'Bir yapı zarar gördü', 'Yangın binayı kullanılamaz hale getirdi; yeniden emek harcanması gerekiyor.', { ...building, settlementId: building.settlementId });
    }
    if (building.progress >= 1 && building.ruined) { building.ruined = false; building.health = 100; }
  }
}

function chooseMigrationDestination(world, agent, settlement) {
  const originTile = getTile(world, agent.x, agent.y);
  const suitable = world.settlements.filter(other => other.id !== settlement?.id && other.population > 0 && other.prosperity > (settlement?.prosperity ?? 0) + 10 && other.stockpile.food > other.population && other.relations[settlement?.id]?.status !== 'war' && getTile(world, other.x, other.y)?.region === originTile?.region);
  if (suitable.length && chance(world, 0.6)) {
    const destination = suitable.sort((a, b) => distance(a, agent) - distance(b, agent))[0];
    return { x: destination.x + 0.5, y: destination.y + 0.5, settlementId: destination.id };
  }
  let best = null, bestScore = -Infinity;
  // Deterministic sampled frontier search caps work without ignoring distant fertile valleys.
  for (let attempt = 0; attempt < 80; attempt++) {
    const tile = world.tiles[integer(world, 0, world.tiles.length - 1)];
    if (!isWalkable(tile) || tile.region !== originTile?.region || tile.fire > 0 || tile.biome === 'sand' || tile.biome === 'snow') continue;
    const d = distance(agent, tile);
    if (d < 11 || d > 42 || world.settlements.some(other => other.population > 0 && distance(other, tile) < 10)) continue;
    const score = tile.fertility * 13 + tile.food * 0.8 + Math.min(tile.trees, 4) * 0.5 - d * 0.09;
    if (score > bestScore) { best = tile; bestScore = score; }
  }
  return best ? { x: best.x + 0.5, y: best.y + 0.5, settlementId: null } : null;
}

function beginMigration(world, leader, destination, reason) {
  const oldSettlement = settlementOf(world, leader);
  const family = world.agents.filter(agent => agent.id === leader.id || (agent.settlementId === leader.settlementId && distance(agent, leader) < 8 && (agent.id === leader.partnerId || leader.childrenIds.includes(agent.id) && agent.age < 18)));
  // Neighbours facing the same conditions may travel together, forming a future nucleation site.
  if (oldSettlement && oldSettlement.famineDays > 10) for (const agent of residentsOf(world, oldSettlement)) {
    if (family.length >= 12 || family.includes(agent) || agent.destination || agent.age < 18 || distance(agent, leader) > 8) continue;
    if (chance(world, 0.35)) family.push(agent);
  }
  for (const agent of family) {
    if (oldSettlement) {
      const travelFood = Math.min(3 - agent.inventory.food, oldSettlement.stockpile.food);
      if (travelFood > 0) { oldSettlement.stockpile.food -= travelFood; agent.inventory.food += travelFood; }
    }
    agent.settlementId = null; agent.homeId = null; agent.destination = { ...destination }; agent.migrationDays = 0; agent.pendingAction = null;
    agent.originX = destination.x; agent.originY = destination.y; agent.morale = Math.max(15, agent.morale - 4);
    stopAction(agent);
  }
  world.metrics.migrations += family.length;
  addEvent(world, 'migration', `${family.length} kişi yola çıktı`, `${oldSettlement?.name ?? 'Gezgin topluluk'} çevresinde ${reason}; aileler daha yaşanabilir bir yer arıyor.`, { x: leader.x, y: leader.y, agentId: leader.id, settlementId: oldSettlement?.id ?? null });
}

function finishMigration(world, agent) {
  if (!agent.destination) return;
  if (distance(agent, agent.destination) > 2) return;
  const target = cacheFor(world).settlements.get(agent.destination.settlementId);
  if (target && target.population > 0) agent.settlementId = target.id;
  agent.originX = agent.destination.x; agent.originY = agent.destination.y;
  agent.destination = null; agent.migrationDays = 0; agent.morale = Math.min(100, agent.morale + 7);
}

function dailyMigration(world) {
  for (const agent of world.agents) {
    if (agent.destination) {
      agent.migrationDays++;
      if (agent.migrationDays > 100) { agent.destination = null; agent.originX = agent.x; agent.originY = agent.y; }
      continue;
    }
    if (agent.age < 18 || agent.age > 60 || agent.health < 30 || !chance(world, 0.018)) continue;
    const settlement = settlementOf(world, agent);
    const war = settlement && Object.values(settlement.relations).some(relation => relation.status === 'war');
    const hunger = agent.hunger > 70 && (settlement ? settlement.famineDays > 7 : world.day - agent.lastMeal > 8);
    const crowded = settlement && settlement.population > housingCapacity(world, settlement) + 14 && settlement.unrest > 24;
    const adventurous = settlement && settlement.population > 42 && settlement.prosperity > 55 && agent.traits.curiosity > 0.72 && chance(world, 0.012);
    if (!hunger && !(war && agent.traits.courage < 0.5) && !crowded && !adventurous) continue;
    const destination = chooseMigrationDestination(world, agent, settlement);
    if (destination) beginMigration(world, agent, destination, hunger ? 'uzayan yiyecek kıtlığı' : war ? 'savaş tehlikesi' : crowded ? 'barınma sıkışıklığı' : 'yeni topraklara duyulan merak');
  }
}

function relationPair(world, first, second) {
  if (!first.relations[second.id]) {
    const affinity = clamp(12 + (first.culture.openness + second.culture.openness - 1) * 20 + between(world, -15, 15), -100, 100);
    first.relations[second.id] = { affinity, status: 'neutral', tension: 0, tradeCount: 0, lastConflict: -1, lastTrade: -1, warStarted: -1, weariness: 0, truceUntil: -1 };
    second.relations[first.id] = { ...first.relations[second.id] };
  }
  return [first.relations[second.id], second.relations[first.id]];
}

function dailyDiplomacy(world) {
  const active = world.settlements.filter(settlement => settlement.population > 0);
  const activeIds = new Set(active.map(settlement => settlement.id));
  for (const settlement of world.settlements) for (const [otherId, relation] of Object.entries(settlement.relations)) {
    if (relation.status === 'war' && (!activeIds.has(settlement.id) || !activeIds.has(Number(otherId)))) {
      relation.status = 'peace'; relation.tension = 0; relation.weariness = 0; relation.truceUntil = world.day + 80;
    }
  }
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const first = active[i], second = active[j], d = distance(first, second);
    if (d > 49 || getTile(world, first.x, first.y)?.region !== getTile(world, second.x, second.y)?.region) continue;
    const [a, b] = relationPair(world, first, second);
    if (a.status === 'war') {
      a.weariness += 0.65 + (first.famineDays + second.famineDays) * 0.03;
      const warAge = world.day - a.warStarted;
      if (first.population < 8 || second.population < 8 || a.weariness > 65 || warAge > 95) {
        a.status = 'peace'; a.tension = Math.min(30, a.tension * 0.35); a.affinity = Math.max(-20, a.affinity + 25); a.truceUntil = world.day + 80;
        addEvent(world, 'peace', `${first.name} ve ${second.name}: ateşkes`, 'Kayıplar, yorgunluk ve erzak maliyeti çatışmayı durdurdu. İki topluluk toparlanmak için zaman kazanıyor.', { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, settlementId: first.id });
      }
    } else {
      const overlap = Math.max(0, first.territory + second.territory + 8 - d) / 10;
      const foodA = first.stockpile.food / Math.max(1, first.population), foodB = second.stockpile.food / Math.max(1, second.population);
      const scarcity = Math.max(0, 1.5 - Math.min(foodA, foodB)) / 1.5 + Math.max(first.famineDays, second.famineDays) * 0.04;
      const inequality = Math.abs(foodA - foodB) / Math.max(2, foodA + foodB);
      const aggression = world.config.aggression * (first.culture.aggression + second.culture.aggression);
      const trading = world.day - a.lastTrade < 12 && a.lastTrade >= 0;
      const competition = (overlap * 0.22 + scarcity * 0.18 + inequality * scarcity * 0.13) * aggression;
      a.tension = clamp(a.tension + competition - 0.09 - (trading ? 0.28 : 0), 0, 100);
      a.affinity = clamp(a.affinity + (trading ? 0.35 : 0.014) - a.tension * 0.0022, -100, 100);
      if (trading && a.affinity > 8) a.status = 'trade';
      else if (a.status === 'trade' && world.day - a.lastTrade > 40) a.status = 'peace';
      if (world.config.aggression > 0 && first.population >= 10 && second.population >= 10 && a.tension > 62 && (a.affinity < 0 || world.config.aggression > 1.5) && world.day > a.truceUntil) {
        a.status = 'war'; a.warStarted = world.day; a.lastConflict = world.day; a.weariness = 0; a.affinity = Math.min(-35, a.affinity);
        world.metrics.wars++;
        addEvent(world, 'war', `${first.name} ile ${second.name} çatışıyor`, 'Ortak kaynak baskısı, sınırların yakınlaşması ve güvensizlik savaşa dönüştü. Savaşçılar toplanıyor; savunmasız aileler kaçabilir.', { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, settlementId: first.id });
      }
    }
    Object.assign(b, a);
  }
}

function chooseTrade(world, agent, settlement, duration) {
  if (!settlement || agent.age < 18 || agent.age >= 58 || agent.health < 65 || agent.energy < 45 || agent.pregnant || world.day < (agent.tradeCooldown ?? 0)) return false;
  const onMission = world.agents.filter(other => other.settlementId === settlement.id && (other.action.type === 'trade' || other.action.tradeReturn || other.pendingAction?.type === 'trade' || other.pendingAction?.tradeReturn)).length;
  if (onMission >= Math.max(1, Math.floor(settlement.population / 12))) return false;
  const offers = [];
  for (const other of world.settlements) {
    if (other.id === settlement.id || other.population === 0 || distance(other, settlement) > 45 || other.relations[settlement.id]?.status === 'war' || getTile(world, other.x, other.y)?.region !== getTile(world, agent.x, agent.y)?.region) continue;
    for (const resource of ['food', 'wood', 'stone', 'ore', 'tools', 'medicine']) {
      const reserve = resource === 'food' ? settlement.population * 2 : resource === 'wood' || resource === 'stone' ? 16 : 3;
      if (settlement.stockpile[resource] < reserve + 5) continue;
      const domestic = settlement.stockpile[resource] / Math.max(1, settlement.population);
      const abroad = other.stockpile[resource] / Math.max(1, other.population);
      if (domestic <= abroad * 1.4 + 0.15) continue;
      const wanted = RESOURCES.filter(key => key !== resource && other.stockpile[key] > (key === 'food' ? other.population * 1.3 : 5)).sort((a, b) => settlement.stockpile[a] / Math.max(1, other.stockpile[a]) - settlement.stockpile[b] / Math.max(1, other.stockpile[b]))[0];
      if (wanted) offers.push({ other, resource, wanted, score: (domestic - abroad) / (distance(other, settlement) + 5) });
    }
  }
  const offer = offers.sort((a, b) => b.score - a.score)[0];
  if (!offer) return false;
  // Goods are reserved and physically carried. Death can destroy a caravan's cargo.
  if (distance(agent, { x: settlement.x + 0.5, y: settlement.y + 0.5 }) > 2.5) return setAction(world, agent, 'walk', settlement.x + 0.5, settlement.y + 0.5, 0.15, { deposit: true });
  const amount = Math.min(7, settlement.stockpile[offer.resource] * 0.15);
  if (!setAction(world, agent, 'trade', offer.other.x + 0.5, offer.other.y + 0.5, 1.2 * duration, { destinationId: offer.other.id, offered: offer.resource, wanted: offer.wanted, cargo: amount })) return false;
  settlement.stockpile[offer.resource] -= amount; agent.inventory[offer.resource] += amount;
  agent.role = 'trader';
  return true;
}

function finishTrade(world, agent, settlement) {
  const action = agent.action, other = cacheFor(world).settlements.get(action.destinationId);
  if (!settlement || !other || other.id === settlement.id || other.population === 0 || other.relations[settlement.id]?.status === 'war' || !RESOURCES.includes(action.offered) || !RESOURCES.includes(action.wanted)) return false;
  const amount = Math.min(action.cargo, agent.inventory[action.offered]);
  const exchange = Math.min(amount * (action.offered === 'tools' ? 2 : action.wanted === 'tools' ? 0.5 : 0.85), other.stockpile[action.wanted]);
  if (amount < 0.5 || exchange < 0.3) return false;
  agent.inventory[action.offered] -= amount; other.stockpile[action.offered] += amount;
  other.stockpile[action.wanted] -= exchange; agent.inventory[action.wanted] += exchange;
  world.metrics.trades++;
  const [a, b] = relationPair(world, settlement, other);
  a.tradeCount++; a.lastTrade = world.day; a.affinity = Math.min(100, a.affinity + 2.5); a.tension = Math.max(0, a.tension - 3); a.status = 'trade'; Object.assign(b, a);
  changeKnowledge(settlement, 'trade', 4); changeKnowledge(other, 'trade', 2);
  // Successful contact shares a small amount of already learned knowledge.
  for (const subject of KNOWLEDGE) {
    const transfer = (other.knowledge[subject] - settlement.knowledge[subject]) * 0.012;
    settlement.knowledge[subject] += Math.max(0, transfer); other.knowledge[subject] += Math.max(0, -transfer);
  }
  addEffect(world, 'spark', agent.x, agent.y, '↔');
  if (a.tradeCount === 1 || a.tradeCount % 8 === 0) addEvent(world, 'trade', `${settlement.name} ↔ ${other.name}`, `${agent.name}, ${Math.round(amount)} ${({ food: 'yiyecek', wood: 'odun', stone: 'taş', ore: 'cevher', tools: 'alet', medicine: 'ilaç' })[action.offered]} karşılığında ${Math.round(exchange)} ${({ food: 'yiyecek', wood: 'odun', stone: 'taş', ore: 'cevher', tools: 'alet', medicine: 'ilaç' })[action.wanted]} takas etti. Bilgi ve güven de yayıldı.`, { x: agent.x, y: agent.y, agentId: agent.id, settlementId: settlement.id });
  agent.pendingAction = { type: 'walk', targetX: settlement.x + 0.5, targetY: settlement.y + 0.5, duration: 0.2, progress: 0, deposit: true, tradeReturn: true };
  return true;
}

function chooseWarriorAction(world, agent, settlement, duration) {
  if (!settlement || agent.age < 16) return false;
  const enemy = nearestEnemy(world, agent, 12);
  if (enemy) return setAction(world, agent, 'fight', enemy.x, enemy.y, 0.8 * duration, { enemyId: enemy.id });
  const rival = world.settlements.find(other => settlement.relations[other.id]?.status === 'war' && other.population > 0);
  if (rival && agent.hunger < 65 && agent.health > 60) {
    const target = world.agents.filter(other => other.settlementId === rival.id && other.age >= 16).sort((a, b) => distance(a, agent) - distance(b, agent))[0];
    if (target) return setAction(world, agent, 'fight', target.x, target.y, 0.85 * duration, { enemyId: target.id });
  }
  const barracks = buildingsOf(world, settlement, true).find(building => building.type === 'barracks');
  if (barracks) return setAction(world, agent, 'fight', barracks.x + 0.5, barracks.y + 0.5, 2.2 * duration, { training: true });
  return false;
}

function finishFight(world, agent, settlement) {
  if (agent.action.training) {
    agent.skills.warrior = Math.min(100, agent.skills.warrior + 0.3);
    changeKnowledge(settlement, 'civics', 0.2); return true;
  }
  const enemy = personById(world, agent.action.enemyId);
  if (!enemy || enemy.health <= 0 || enemy.age < 16 || distance(agent, enemy) > 2.8 || !settlement || settlement.relations[enemy.settlementId]?.status !== 'war') return false;
  const defenderSettlement = settlementOf(world, enemy);
  const protectedByTower = defenderSettlement && hasBuilding(world, defenderSettlement, 'watchtower') && distance(enemy, defenderSettlement) < 7;
  const attack = (4 + agent.level * 0.7 + agent.skills.warrior * 0.15) * (0.7 + agent.traits.courage * 0.7) * (agent.toolDurability > 0 ? 1.25 : 1) * between(world, 0.7, 1.3);
  const armor = 1 + enemy.level * 0.035 + enemy.skills.warrior * 0.008 + (protectedByTower ? 0.4 : 0);
  enemy.health -= attack / armor; enemy.energy = Math.max(0, enemy.energy - 2); enemy.morale = Math.max(0, enemy.morale - 1.5); enemy.lastDamageCause = 'violence';
  addEffect(world, 'hit', enemy.x, enemy.y, `−${Math.round(attack / armor)}`);
  const relation = settlement.relations[enemy.settlementId]; relation.lastConflict = world.day; relation.weariness += 0.25;
  if (defenderSettlement?.relations[settlement.id]) Object.assign(defenderSettlement.relations[settlement.id], relation);
  if (enemy.health <= 0) {
    agent.kills++; agent.inventory.food += enemy.inventory.food * 0.35; enemy.inventory.food *= 0.65;
    relation.weariness += 3;
  } else if (enemy.action.type !== 'fight' && enemy.action.type !== 'flee') stopAction(enemy);
  return true;
}

function dailyWorld(world) {
  dailyEcosystem(world);
  dailyAnimals(world);
  dailyFounding(world);
  dailySettlements(world);
  dailyPopulation(world);
  removeDead(world);
  dailyDiplomacy(world);
  dailyMigration(world);
  // Refresh population after demographic changes; histories are measured, never synthesized.
  for (const settlement of world.settlements) settlement.population = world.agents.reduce((count, agent) => count + (agent.settlementId === settlement.id ? 1 : 0), 0);
  const stats = getStats(world);
  world.history.push({ day: world.day, ...stats, season: world.season });
  if (world.history.length > 720) world.history.splice(0, world.history.length - 720);
}

export function applyIntervention(world, type, x, y, options = {}) {
  if (type === 'inspect') return getTile(world, x, y);
  const tile = getTile(world, x, y);
  if (!tile || !['rain', 'food', 'trees', 'settlers', 'fire'].includes(type)) return { ok: false, message: 'Geçerli bir dünya karesi seç.' };
  const radius = type === 'rain' ? 5 : type === 'fire' ? 1.5 : 3;
  let changed = 0;
  if (type === 'settlers') {
    const location = nearbyTile(world, x, y, 6);
    if (!location) return { ok: false, message: 'Yerleşimciler için yürünebilir kıyı ya da kara seç.' };
    const count = Math.min(clamp(Math.round(Number(options.count) || 8), 1, 30), world.config.maxPopulation - world.agents.length);
    for (let index = 0; index < count; index++) {
      const agent = createAgent(world, { x: location.x + between(world, 0.15, 0.85), y: location.y + between(world, 0.15, 0.85), age: between(world, 18, 40), sex: index % 2 ? 'female' : 'male' });
      agent.inventory.food = 4; agent.inventory.wood = 2; agent.inventory.stone = 1;
      agent.originX = location.x + 0.5; agent.originY = location.y + 0.5;
      if (index % 2 && world.agents.length) { const partner = world.agents.at(-1); agent.partnerId = partner.id; partner.partnerId = agent.id; }
      world.agents.push(agent); changed++;
    }
    caches.delete(world);
    if (changed) addEvent(world, 'migration', 'Yeni gezginler', `${changed} insan dünyaya katıldı. Ortak kaynaklar yeterliyse bir topluluğa katılabilir veya yeni bir yerleşim kurabilir.`, location);
    return { ok: changed > 0, changed, message: changed ? `${changed} gezgin eklendi.` : 'Nüfus gözlem sınırına ulaştı.' };
  }
  for (let yy = Math.max(0, tile.y - Math.ceil(radius)); yy <= Math.min(world.height - 1, tile.y + Math.ceil(radius)); yy++) for (let xx = Math.max(0, tile.x - Math.ceil(radius)); xx <= Math.min(world.width - 1, tile.x + Math.ceil(radius)); xx++) {
    const target = getTile(world, xx, yy);
    if (Math.hypot(xx - tile.x, yy - tile.y) > radius) continue;
    if (type === 'rain') {
      target.moisture = Math.min(1, target.moisture + 0.35); target.fire = Math.max(0, target.fire - 0.8);
      if (isWalkable(target) && target.food < 7) target.food = Math.min(7, target.food + target.fertility * 0.5);
      for (const farm of world.farms) if (farm.x === xx && farm.y === yy) { farm.water = Math.min(1, farm.water + 0.6); farm.health = Math.min(1, farm.health + 0.15); }
      changed++;
    } else if (type === 'food' && isWalkable(target)) { target.food = Math.min(18, target.food + 6); changed++; }
    else if (type === 'trees' && isWalkable(target) && target.biome !== 'snow' && !world.buildings.some(building => Math.max(Math.abs(building.x - xx), Math.abs(building.y - yy)) <= 1) && !world.farms.some(farm => farm.x === xx && farm.y === yy)) { target.trees = Math.min(8, target.trees + 3); changed++; }
    else if (type === 'fire' && isWalkable(target) && (target.trees + target.food > 0.2 || world.buildings.some(building => building.x === xx && building.y === yy))) { target.fire = 0.95; changed++; }
  }
  if (type === 'rain') { world.weather = { type: world.season === 'winter' ? 'snow' : 'rain', temperature: clamp(world.weather.temperature - (world.weather.rainfall > 0 ? 0 : 2), -15, 45), rainfall: 0.7, until: world.day + 3 }; }
  if (type === 'fire' && changed) addEvent(world, 'fire', 'Kıvılcım düştü', 'Bir kıvılcım çevredeki örtüyü tutuşturdu. Yağış, nem ve yakıt miktarı yayılımı belirleyecek.', tile);
  if (type === 'food' && changed) addEvent(world, 'info', 'Bereketli bir alan', 'Yiyecek bolluğu yerel toplayıcıların tercihlerini ve yaşama şanslarını değiştiriyor.', tile);
  return { ok: changed > 0, changed, message: ({ rain: 'Yağmur toprağa can verdi.', food: 'Yabani yiyecekler çoğaldı.', trees: 'Yeni ağaçlar kök saldı.', fire: 'Yangın başladı.' })[type] };
}

export function restoreWorld(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.agents) || !Array.isArray(data.tiles) || !Array.isArray(data.settlements)) throw new TypeError('Geçersiz simülasyon kaydı.');
  if (!Number.isInteger(data.width) || !Number.isInteger(data.height) || data.width < 40 || data.width > 160 || data.height < 32 || data.height > 112 || data.tiles.length !== data.width * data.height) throw new TypeError('Kayıt haritasının boyutları geçersiz.');
  if (!Number.isInteger(data.rngState) || data.rngState < 0 || data.rngState > 0xffffffff || !Number.isInteger(data.nextId) || data.nextId < 1 || !Number.isFinite(data.day) || data.day < 0 || !data.config || !data.metrics) throw new TypeError('Simülasyon durumu eksik.');
  if (data.agents.length > 500) throw new TypeError('Kayıttaki nüfus sınırı aşıyor.');
  for (const agent of data.agents) {
    if (!Number.isFinite(agent.x) || !Number.isFinite(agent.y) || !isWalkable(getTile(data, agent.x, agent.y)) || !agent.inventory || !agent.traits || !agent.skills || !agent.action || !Array.isArray(agent.path)) throw new TypeError('Kayıtta geçersiz karakter durumu var.');
    for (const resource of RESOURCES) if (!Number.isFinite(agent.inventory[resource]) || agent.inventory[resource] < 0) throw new TypeError('Geçersiz karakter envanteri.');
  }
  for (const settlement of data.settlements) if (!settlement.stockpile || !settlement.knowledge || !settlement.relations || !settlement.production || !settlement.culture || !Array.isArray(settlement.discovered)) throw new TypeError('Kayıtta yerleşim bilgisi eksik.');
  for (const required of ['buildings', 'farms', 'events', 'history', 'effects', 'graves', 'animals']) if (!Array.isArray(data[required])) throw new TypeError(`Kayıtta ${required} dizisi eksik.`);
  caches.delete(data);
  return data;
}
