/** Save envelopes keep simulation state and PRNG state together. No timers are replayed on load. */
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'villages.world.v1';
export const AUTOSAVE_KEY = 'villages.autosave.v1';
export const MAX_SAVE_BYTES = 16 * 1024 * 1024;

const fail = message => { throw new Error(`Geçersiz dünya kaydı: ${message}`); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const count = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const id = value => (typeof value === 'string' && value.length > 0 && value.length <= 120) || count(value, 0, 1e9);

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
  if (!Array.isArray(world.tiles) || world.tiles.length !== world.width * world.height) fail('arazi eksik.');
  for (const key of ['agents', 'settlements', 'buildings', 'farms', 'events', 'history', 'effects', 'animals', 'graves']) {
    if (!Array.isArray(world[key])) fail(`${key} listesi eksik.`);
  }
  if (world.agents.length > 2000 || world.settlements.length > 300 || world.buildings.length > 12000 || world.farms.length > 16000 || world.events.length > 5000 || world.history.length > 10000 || world.effects.length > 5000) fail('nesne sınırı aşıldı.');
  const point = item => finite(item.x, 0, world.width) && finite(item.y, 0, world.height);
  const ids = new Set();
  for (const agent of world.agents) {
    if (!object(agent) || !id(agent.id) || ids.has(agent.id) || !point(agent)) fail('karakter konumu veya kimliği hatalı.');
    ids.add(agent.id);
    if (typeof agent.name !== 'string' || !finite(agent.age, 0, 200) || !finite(agent.health, 0, 100) || !finite(agent.hunger, 0, 100) || !finite(agent.energy, 0, 100)) fail('karakter yaşam bilgisi hatalı.');
    if (!object(agent.appearance) || !object(agent.action) || !object(agent.inventory) || !object(agent.skills) || !object(agent.traits)) fail('karakter özellikleri eksik.');
    if (typeof agent.role !== 'string' || !count(agent.level, 1, 1000)) fail('karakter mesleği veya seviyesi hatalı.');
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
  }
  for (const building of world.buildings) {
    if (!object(building) || !id(building.id) || !point(building) || typeof building.type !== 'string' || !finite(building.progress, 0, 1)) fail('yapı bilgisi hatalı.');
  }
  for (const farm of world.farms) {
    if (!object(farm) || !point(farm) || !finite(farm.growth, 0, 1)) fail('tarla bilgisi hatalı.');
  }
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
