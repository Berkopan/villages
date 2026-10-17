import { between, integer, pick, clamp } from './random.js';

export const DAYS_PER_YEAR = 96;
export const DAYS_PER_SEASON = 24;
export const RESOURCES = ['food', 'wood', 'stone', 'ore', 'tools', 'medicine'];
export const ROLES = ['gatherer', 'farmer', 'lumberjack', 'miner', 'fisher', 'hunter', 'builder', 'smith', 'healer', 'trader', 'warrior', 'scholar'];
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const COLORS = ['#e3ab54', '#74b8a8', '#a799d8', '#da8599', '#83b66d', '#74a4d3', '#d68a54', '#b7b566'];
export const KNOWLEDGE = ['agriculture', 'masonry', 'metallurgy', 'medicine', 'trade', 'civics'];
export const BUILDING_COSTS = {
  campfire: { wood: 4, stone: 2 }, hut: { wood: 10, stone: 2 }, house: { wood: 16, stone: 12 },
  granary: { wood: 18, stone: 8 }, well: { wood: 6, stone: 14 }, lumberyard: { wood: 12, stone: 4 },
  mine: { wood: 14, stone: 6 }, workshop: { wood: 20, stone: 14 }, market: { wood: 24, stone: 10 },
  barracks: { wood: 22, stone: 20 }, watchtower: { wood: 18, stone: 14 }, hall: { wood: 35, stone: 35 },
  shrine: { wood: 16, stone: 22 },
};

const FEMALE_NAMES = ['Ada', 'Alin', 'Asya', 'Ayla', 'Beliz', 'Ceren', 'Defne', 'Duru', 'Ece', 'Ela', 'Elif', 'Esin', 'Güneş', 'Hazal', 'İdil', 'İlay', 'İnci', 'Işıl', 'Lale', 'Lara', 'Lina', 'Maya', 'Mira', 'Nehir', 'Nil', 'Nisan', 'Öykü', 'Rüya', 'Selin', 'Sena', 'Sıla', 'Su', 'Talia', 'Tomris', 'Umay', 'Yağmur', 'Yaren', 'Zeynep'];
const MALE_NAMES = ['Alp', 'Aras', 'Arda', 'Aren', 'Atlas', 'Ateş', 'Ayaz', 'Baran', 'Barış', 'Batu', 'Berk', 'Bora', 'Can', 'Cem', 'Demir', 'Deniz', 'Doruk', 'Efe', 'Ege', 'Emir', 'Eren', 'Evren', 'Ilgaz', 'Kaan', 'Kayra', 'Kuzey', 'Mert', 'Ozan', 'Pars', 'Poyraz', 'Rüzgâr', 'Sarp', 'Taylan', 'Toprak', 'Tunç', 'Umut', 'Uras', 'Yaman'];
const LINEAGE_NAMES = ['Söğüt', 'Çınar', 'Göktaş', 'Yalın', 'Akarsu', 'Güney', 'Yel', 'Ayışığı', 'Kaya', 'Orman', 'Sazlık', 'Gümüş', 'Mercan', 'Çayır', 'Demirtaş', 'Gölgeli'];
const PLACE_START = ['Söğüt', 'Pınar', 'Kızıl', 'Gök', 'Ak', 'Yeşil', 'Yel', 'Gümüş', 'Koru', 'Ay', 'Eski', 'Gün', 'Sarı', 'Taş', 'Mavi', 'Kestane'];
const PLACE_END = ['ova', 'yurt', 'dere', 'pınar', 'tepe', 'yaka', 'hisar', 'vadi', 'bahçe', 'kıyı', 'bel', 'köy'];

export function emptyResources() {
  return { food: 0, wood: 0, stone: 0, ore: 0, tools: 0, medicine: 0 };
}

export function lifeStage(age) {
  return age < 3 ? 'baby' : age < 12 ? 'child' : age < 18 ? 'teen' : age < 58 ? 'adult' : 'elder';
}

export function createAgent(world, options = {}) {
  const id = world.nextId++;
  const sex = options.sex ?? (between(world, 0, 1) < 0.5 ? 'female' : 'male');
  const age = options.age ?? between(world, 16, 48);
  const mother = options.mother, father = options.father;
  const traits = {};
  for (const trait of ['diligence', 'sociability', 'courage', 'curiosity', 'resilience', 'fertility', 'aggression']) {
    traits[trait] = mother && father
      ? clamp((mother.traits[trait] + father.traits[trait]) / 2 + between(world, -0.12, 0.12), 0.05, 0.95)
      : between(world, 0.15, 0.9);
  }
  const appearance = {
    skin: mother && father ? pick(world, [mother.appearance.skin, father.appearance.skin]) : integer(world, 0, 7),
    hair: mother && father ? pick(world, [mother.appearance.hair, father.appearance.hair]) : integer(world, 0, 9),
    hairStyle: integer(world, 0, 7), outfit: integer(world, 0, 11), accent: integer(world, 0, 7),
    beard: integer(world, 0, 3), hat: integer(world, 0, 4), variant: integer(world, 0, 15),
  };
  const familyName = options.familyName ?? mother?.familyName ?? pick(world, LINEAGE_NAMES);
  const skills = Object.fromEntries(ROLES.map(role => [role, role === 'gatherer' && age >= 12 ? between(world, 0.3, 1) : 0]));
  return {
    id, name: `${pick(world, sex === 'female' ? FEMALE_NAMES : MALE_NAMES)} ${familyName}`, familyName,
    sex, age, lifeStage: lifeStage(age), x: options.x ?? 0, y: options.y ?? 0, vx: 0, vy: 0, direction: 2,
    appearance, role: 'gatherer', level: 1, xp: 0, skills, action: { type: 'idle', targetX: options.x ?? 0, targetY: options.y ?? 0, progress: 0, duration: 1 },
    health: between(world, 85, 100), hunger: between(world, 8, 32), energy: between(world, 60, 95), morale: between(world, 55, 80),
    traits, inventory: { ...emptyResources(), food: age < 3 ? 0 : 2, wood: age >= 16 ? 0.5 : 0 },
    settlementId: options.settlementId ?? null, homeId: null,
    parents: mother && father ? [mother.id, father.id] : [], partnerId: null, childrenIds: [],
    generation: mother ? Math.max(mother.generation, father?.generation ?? 0) + 1 : 1,
    pregnant: null, birthCooldown: 0, path: [], pathIndex: 0, decisionIn: between(world, 0, 1.5),
    originX: options.x ?? 0, originY: options.y ?? 0, destination: null, migrationDays: 0,
    sickness: 0, immunity: 0, exposure: 0, toolDurability: 0, workCount: 0, kills: 0,
    social: between(world, 35, 80), lastMeal: world.day, lastDamageCause: '', lastHomeVisit: world.day,
  };
}

export function createAnimal(world, tile, species) {
  return { id: world.nextId++, species, x: tile.x + 0.5, y: tile.y + 0.5, direction: integer(world, 0, 3), health: species === 'boar' ? 30 : species === 'wolf' ? 24 : 18, age: between(world, 0.5, 6), hunger: 0, decisionIn: between(world, 0, 3), targetX: tile.x + 0.5, targetY: tile.y + 0.5 };
}

export function newSettlementName(world) {
  const base = `${pick(world, PLACE_START)}${pick(world, PLACE_END)}`;
  return world.settlements.some(settlement => settlement.name === base) ? `${base} ${world.settlements.length + 1}` : base;
}

export function addEvent(world, type, title, description, at = {}) {
  world.events.push({ id: world.nextId++, day: world.day, type, title, description, x: at.x ?? null, y: at.y ?? null, agentId: at.agentId ?? at.id ?? null, settlementId: at.settlementId ?? null });
  if (world.events.length > 180) world.events.splice(0, world.events.length - 180);
}

export function addEffect(world, type, x, y, text = '') {
  world.effects.push({ id: world.nextId++, type, x, y, age: 0, duration: 1.8, text });
  if (world.effects.length > 100) world.effects.splice(0, world.effects.length - 100);
}

export function grantExperience(world, agent, role, amount = 1) {
  agent.xp += amount;
  agent.skills[role] = Math.min(100, (agent.skills[role] ?? 0) + amount * 0.22);
  agent.workCount++;
  if (role !== 'warrior' || agent.skills.warrior > 2) agent.role = role;
  const newLevel = Math.min(20, 1 + Math.floor(Math.sqrt(agent.xp / 12)));
  if (newLevel > agent.level) {
    agent.level = newLevel;
    addEffect(world, 'level', agent.x, agent.y, `↑ ${newLevel}`);
    if (newLevel === 5 || newLevel === 10 || newLevel === 15) addEvent(world, 'growth', `${agent.name} ustalaştı`, `${newLevel}. seviyeye ulaştı; deneyimi iş verimini ve hayatta kalma şansını artırıyor.`, { ...agent, agentId: agent.id });
  }
}
