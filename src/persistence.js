/** Save envelopes keep simulation state and PRNG state together. No timers are replayed on load. */
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'villages.world.v1';
export const AUTOSAVE_KEY = 'villages.autosave.v1';
export const MAX_SAVE_BYTES = 16 * 1024 * 1024;

const fail = message => { throw new Error(`Geçersiz dünya kaydı: ${message}`); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const count = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const id = value => count(value, 1, 1e10);
const RESOURCES = ['food', 'wood', 'stone', 'ore', 'tools', 'medicine'];
const ROLES = ['gatherer', 'farmer', 'lumberjack', 'miner', 'fisher', 'hunter', 'builder', 'smith', 'healer', 'trader', 'warrior', 'scholar'];
const KNOWLEDGE = ['agriculture', 'masonry', 'metallurgy', 'medicine', 'trade', 'civics'];
const TRAITS = ['diligence', 'sociability', 'courage', 'curiosity', 'resilience', 'fertility', 'aggression'];
const ACTIONS = ['idle', 'walk', 'gather', 'farm', 'chop', 'mine', 'fish', 'hunt', 'build', 'craft', 'heal', 'trade', 'fight', 'flee', 'migrate', 'eat', 'rest', 'socialize', 'study'];
const numbers = (value, keys, min = 0, max = 1e12) => object(value) && keys.every(key => finite(value[key], min, max));

function inspectStructure(value, depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 2000000 || depth > 40) fail('veri yapısı çok büyük.');
  if (typeof value === 'number' && !Number.isFinite(value)) fail('sonlu olmayan sayı.');
  if (typeof value === 'string' && value.length > 12000) fail('metin sınırı aşıldı.');
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail('desteklenmeyen veri anahtarı.');
    inspectStructure(value[key], depth + 1, budget);
  }
}

/** Validate before replacing a live world. Kept independent of the engine for tests and tooling. */
export function validateWorld(world) {
  if (!object(world)) fail('dünya bulunamadı.');
  inspectStructure(world);
  if (!count(world.width, 24, 192) || !count(world.height, 24, 144) || world.width * world.height > 24576) fail('harita boyutu desteklenmiyor.');
  if (typeof world.seed !== 'string' || world.seed.length > 200) fail('tohum bulunamadı.');
  if (!count(world.rngState, 0, 0xffffffff) || !count(world.nextId, 1, 1e10)) fail('rastgelelik veya kimlik durumu eksik.');
  if (!object(world.config) || !count(world.config.maxPopulation, 1, 2000) || !finite(world.config.aggression, 0, 10)) fail('simülasyon ayarları hatalı.');
  if (!object(world.metrics) || !object(world.metrics.deathCauses)) fail('dünya sayaçları eksik.');
  if (!finite(world.day, 0, 1e8) || !count(world.tick, 0, 1e10)) fail('zaman bilgisi hatalı.');
  if (!count(world.lastDailyDay, 0, Math.floor(world.day + 1e-7)) || world.lastDailyDay < Math.floor(world.day) - 1) fail('günlük işlem durumu hatalı.');
  if (!object(world.weather) || !['clear', 'rain', 'storm', 'snow', 'drought'].includes(world.weather.type) || !numbers(world.weather, ['rainfall'], 0, 1) || !finite(world.weather.temperature, -100, 100) || !finite(world.weather.until, 0, 1e8)) fail('hava durumu hatalı.');
  if (!numbers(world.metrics, ['births', 'deaths', 'migrations', 'wars', 'trades', 'discoveries']) || !numbers(world.metrics.deathCauses, ['starvation', 'age', 'disease', 'violence', 'fire'])) fail('dünya sayaçları hatalı.');
  if (!Array.isArray(world.tiles) || world.tiles.length !== world.width * world.height) fail('arazi eksik.');
  for (const key of ['agents', 'settlements', 'buildings', 'farms', 'events', 'history', 'effects', 'animals', 'graves']) {
    if (!Array.isArray(world[key])) fail(`${key} listesi eksik.`);
  }
  if (world.agents.length > 2000 || world.settlements.length > 300 || world.buildings.length > 12000 || world.farms.length > 16000 || world.events.length > 5000 || world.history.length > 10000 || world.effects.length > 5000) fail('nesne sınırı aşıldı.');
  const point = item => object(item) && finite(item.x, 0, world.width) && item.x < world.width && finite(item.y, 0, world.height) && item.y < world.height;
  const actionValid = action => object(action) && ACTIONS.includes(action.type) && finite(action.progress, 0, 1) && finite(action.duration, 0.01, 1000) && point({ x: action.targetX, y: action.targetY });
  const ids = new Set();
  for (const agent of world.agents) {
    if (!object(agent) || !id(agent.id) || ids.has(agent.id) || !point(agent)) fail('karakter konumu veya kimliği hatalı.');
    ids.add(agent.id);
    if (typeof agent.name !== 'string' || !finite(agent.age, 0, 200) || !finite(agent.health, 0, 100) || !finite(agent.hunger, 0, 100) || !finite(agent.energy, 0, 100)) fail('karakter yaşam bilgisi hatalı.');
    if (!object(agent.appearance) || !object(agent.action) || !object(agent.inventory) || !object(agent.skills) || !object(agent.traits)) fail('karakter özellikleri eksik.');
    if (!ROLES.includes(agent.role) || !count(agent.level, 1, 20)) fail('karakter mesleği veya seviyesi hatalı.');
    if (!numbers(agent.inventory, RESOURCES) || !numbers(agent.traits, TRAITS, 0, 1) || !numbers(agent.skills, ROLES, 0, 100)) fail('envanter, kişilik veya yetenek bilgisi hatalı.');
    if (!numbers(agent, ['morale', 'social', 'sickness', 'immunity', 'exposure'], 0, 100) || !numbers(agent, ['xp', 'birthCooldown', 'toolDurability', 'workCount', 'kills', 'migrationDays'])) fail('karakterin devam eden yaşam durumu hatalı.');
    // A decision timer may remain negative while a long physical journey finishes.
    if (!finite(agent.decisionIn, -1e8, 10000) || !finite(agent.vx, -100, 100) || !finite(agent.vy, -100, 100) || !count(agent.direction, 0, 3)) fail('karakter hareket durumu hatalı.');
    if (!actionValid(agent.action) || !Array.isArray(agent.path) || agent.path.length > 3000 || !agent.path.every(point) || !count(agent.pathIndex, 0, agent.path.length)) fail('karakter eylemi veya rotası hatalı.');
    if (agent.pendingAction != null && !actionValid(agent.pendingAction)) fail('bekleyen yolculuk hatalı.');
    if (!Array.isArray(agent.parents) || agent.parents.length > 2 || !agent.parents.every(id) || !Array.isArray(agent.childrenIds) || agent.childrenIds.length > 2000 || !agent.childrenIds.every(id)) fail('aile bağları hatalı.');
    if (agent.destination != null && !point(agent.destination)) fail('göç hedefi hatalı.');
    if (agent.pregnant != null && (!object(agent.pregnant) || !finite(agent.pregnant.remaining, -1e8, 1000) || !id(agent.pregnant.fatherId) || !numbers(agent.pregnant.father?.traits, TRAITS, 0, 1) || !object(agent.pregnant.father?.appearance))) fail('gebelik durumu hatalı.');
  }
  const biomes = new Set(['deepwater', 'water', 'sand', 'grass', 'forest', 'hill', 'mountain', 'snow']);
  for (let i = 0; i < world.tiles.length; i++) {
    const tile = world.tiles[i];
    if (!object(tile) || tile.x !== i % world.width || tile.y !== Math.floor(i / world.width) || !biomes.has(tile.biome)) fail('arazi hücresi hatalı.');
    // Elevation is signed: the generator includes sea floor below the zero datum.
    if (!finite(tile.elevation, -2, 2)) fail('arazi yüksekliği hatalı.');
    for (const key of ['fertility', 'moisture', 'trees', 'food', 'stone', 'ore', 'fish']) {
      if (!finite(tile[key], 0, 1e6)) fail(`arazi ${key} değeri hatalı.`);
    }
  }
  for (const settlement of world.settlements) {
    if (!object(settlement) || !id(settlement.id) || !point(settlement) || typeof settlement.name !== 'string' || !object(settlement.stockpile) || !object(settlement.knowledge) || !object(settlement.relations)) fail('yerleşim bilgisi hatalı.');
    if (!numbers(settlement.stockpile, RESOURCES) || !numbers(settlement.production, RESOURCES) || !numbers(settlement.knowledge, KNOWLEDGE) || !numbers(settlement.culture, ['aggression', 'openness'], 0, 1) || !Array.isArray(settlement.discovered)) fail('yerleşim ekonomisi hatalı.');
    if (!['camp', 'hamlet', 'village', 'town', 'city'].includes(settlement.stage) || !numbers(settlement, ['prosperity', 'unrest', 'cohesion'], 0, 100) || !finite(settlement.territory, 0, 100) || !finite(settlement.famineDays, 0, 1e8)) fail('yerleşim gelişimi hatalı.');
    for (const relation of Object.values(settlement.relations)) {
      if (!object(relation) || !['neutral', 'peace', 'trade', 'war'].includes(relation.status) || !finite(relation.affinity, -100, 100) || !finite(relation.tension, 0, 100) || !numbers(relation, ['tradeCount', 'weariness']) || !numbers(relation, ['lastConflict', 'lastTrade', 'warStarted', 'truceUntil'], -1, 1e8)) fail('diplomasi kaydı hatalı.');
    }
  }
  for (const building of world.buildings) {
    if (!object(building) || !id(building.id) || !point(building) || typeof building.type !== 'string' || !finite(building.progress, 0, 1)) fail('yapı bilgisi hatalı.');
    if (!finite(building.health, 0, 100) || !count(building.level, 1, 20) || !Array.isArray(building.occupants) || !building.occupants.every(id)) fail('yapı durumu hatalı.');
  }
  for (const farm of world.farms) {
    if (!object(farm) || !id(farm.id) || !point(farm) || !numbers(farm, ['growth', 'water', 'health'], 0, 1) || typeof farm.ripe !== 'boolean') fail('tarla bilgisi hatalı.');
  }
  for (const animal of world.animals) {
    if (!object(animal) || !id(animal.id) || !point(animal) || !['deer', 'boar', 'wolf'].includes(animal.species) || !numbers(animal, ['health', 'age', 'hunger'], -100, 1e6) || !finite(animal.decisionIn, -10, 10000) || !point({ x: animal.targetX, y: animal.targetY })) fail('yaban hayatı kaydı hatalı.');
  }
  for (const effect of world.effects) {
    if (!object(effect) || !id(effect.id) || !point(effect) || typeof effect.type !== 'string' || typeof effect.text !== 'string' || !finite(effect.age, 0, 1000) || !finite(effect.duration, 0.01, 1000)) fail('görsel etki kaydı hatalı.');
  }
  for (const event of world.events) {
    if (!object(event) || !id(event.id) || !finite(event.day, 0, world.day) || typeof event.type !== 'string' || typeof event.title !== 'string' || typeof event.description !== 'string') fail('olay kaydı hatalı.');
    if ((event.x != null || event.y != null) && !point(event)) fail('olay konumu hatalı.');
  }
  for (const sample of world.history) {
    if (!object(sample) || !finite(sample.day, 0, world.day) || !count(sample.population, 0, 2000) || !numbers(sample, ['births', 'deaths', 'food', 'wars'])) fail('tarih örneği hatalı.');
  }
  for (const grave of world.graves) {
    if (!object(grave) || !id(grave.id) || !point(grave) || typeof grave.name !== 'string' || typeof grave.cause !== 'string' || !finite(grave.age, 0, 200) || !finite(grave.day, 0, world.day) || !count(grave.level, 1, 20)) fail('yaşam anısı hatalı.');
  }
  // IDs share one sequence. Historical family references may outlive their people.
  // Graves carry the deceased person's ID, so they are references, not new entities.
  const entityIds = new Set();
  let highestId = 0;
  const reference = value => {
    if (value == null) return;
    if (!id(value)) fail('nesne bağlantısı hatalı.');
    highestId = Math.max(highestId, value);
  };
  for (const key of ['agents', 'settlements', 'buildings', 'farms', 'animals', 'events', 'effects']) for (const item of world[key]) {
    reference(item.id);
    if (entityIds.has(item.id)) fail('yinelenen nesne kimliği.');
    entityIds.add(item.id);
    for (const field of ['settlementId', 'homeId', 'partnerId', 'leaderId', 'agentId']) reference(item[field]);
    for (const field of ['parents', 'childrenIds', 'occupants']) for (const value of item[field] || []) reference(value);
    if (item.pregnant) reference(item.pregnant.fatherId);
  }
  for (const grave of world.graves) { reference(grave.id); reference(grave.settlementId); }
  if (world.nextId <= highestId) fail('kimlik sayacı mevcut kayıtların gerisinde.');
  return world;
}

export function encodeSave(world, view = {}) {
  const envelope = { format: 'villages-world', version: SAVE_VERSION, savedAt: new Date().toISOString(), view: { overlay: view.overlay || 'natural', speed: view.speed || 1 }, world };
  const text = JSON.stringify(envelope);
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) throw new Error('Dünya kaydı 16 MB sınırını aşıyor.');
  return text;
}

export function decodeSave(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES) fail('dosya boyutu 16 MB sınırını aşıyor.');
  let data;
  try { data = JSON.parse(text); } catch { fail('JSON okunamadı.'); }
  if (!object(data) || data.format !== 'villages-world' || data.version !== SAVE_VERSION) fail('dosya biçimi veya sürümü desteklenmiyor.');
  validateWorld(data.world);
  return data;
}

export function writeSave(storage, world, view, auto = false) {
  const text = encodeSave(world, view);
  storage.setItem(auto ? AUTOSAVE_KEY : SAVE_KEY, text);
  return JSON.parse(text).savedAt;
}

export function readSave(storage, auto = false) {
  const raw = storage.getItem(auto ? AUTOSAVE_KEY : SAVE_KEY);
  if (!raw) throw new Error(auto ? 'Otomatik kayıt bulunamadı.' : 'Kayıt bulunamadı. Önce dünyanı kaydet.');
  return decodeSave(raw);
}
