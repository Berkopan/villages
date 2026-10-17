import { createWorld, stepWorld, getStats, applyIntervention, restoreWorld, getTile } from './sim/engine.js';
import { WorldRenderer } from './render/renderer.js';
import { createUI } from './ui/ui.js';
import { AUTOSAVE_KEY, SAVE_KEY, MAX_SAVE_BYTES, decodeSave, encodeSave, readSave, writeSave } from './persistence.js';
import { WorldAudio } from './audio.js';
import { t } from './ui/i18n.js';

const FIXED_SECONDS = 0.1;
const SPEEDS = [1, 2, 5, 10, 25];
const DEFAULTS = { seed: 'Söğüt Vadisi', width: 88, height: 64, population: 96, climate: 'balanced', aggression: 1, maxPopulation: 500 };
const url = new URL(location.href);
const requestedSeed = url.searchParams.get('seed');
if (requestedSeed) DEFAULTS.seed = requestedSeed.slice(0, 100);

let world = createWorld(DEFAULTS);
let speed = 1;
let paused = false;
let selected = null;
let overlay = 'natural';
let tool = 'inspect';
let follow = false;
let fps = 60;
let lastSaved = storedTime(SAVE_KEY);
let lastAutosaved = storedTime(AUTOSAVE_KEY);
let soundEnabled = false;
let accumulator = 0;
let lastFrame = 0;
let lastUI = 0;
let lastAutosave = performance.now();
let lastPaint = 0;
let lastToolNotice = 0;
let autosaveFailed = false;
let loadNote = '';
let running = true;
const audio = new WorldAudio();

function storedTime(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw && raw.length <= MAX_SAVE_BYTES ? JSON.parse(raw).savedAt || null : null;
  } catch { return null; }
}

// A copied seed link always starts that seed. Normal reloads recover the last autosave.
if (!requestedSeed) {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) {
      const saved = decodeSave(raw);
      world = restoreWorld(saved.world);
      speed = SPEEDS.includes(saved.view?.speed) ? saved.view.speed : 1;
      overlay = ['natural', 'territory', 'fertility', 'resources', 'danger'].includes(saved.view?.overlay) ? saved.view.overlay : 'natural';
      lastAutosaved = saved.savedAt;
      paused = true;
      loadNote = 'Dünyan son otomatik kayıttan döndü. Devam etmek için oynat.';
    }
  } catch {
    loadNote = 'Önceki otomatik kayıt okunamadı; yeni bir dünya açıldı.';
  }
}

const canvas = document.querySelector('#world-canvas');
const minimap = document.querySelector('#minimap');
const renderer = new WorldRenderer(canvas, {
  onSelect(selection) { selected = normalizeSelection(selection); follow = false; updateUI(); },
  onHover(point) { updateMapStatus(point); },
  onPaint({ type, x, y }) {
    if (performance.now() - lastPaint < 100) return;
    lastPaint = performance.now();
    const result = applyIntervention(world, type || tool, x, y);
    if (result?.ok === false && performance.now() - lastToolNotice > 1500) {
      ui.toast(result.message || 'Bu konumda etki oluşmadı.', 'info');
      lastToolNotice = performance.now();
    }
    updateUI();
  },
  onCameraChange(camera) { if (camera?.userInput) follow = false; },
});
renderer.setWorld(world);

function normalizeSelection(selection) {
  if (!selection) return null;
  if (selection.type === 'tile') return { type: 'tile', x: Math.floor(selection.x), y: Math.floor(selection.y) };
  const collection = selection.type === 'agent' ? world.agents : selection.type === 'settlement' ? world.settlements : world.buildings;
  const item = collection.find(item => String(item.id) === String(selection.id));
  return item ? { type: selection.type, id: item.id } : null;
}

function selectedItem(selection = selected) {
  if (!selection) return null;
  if (selection.type === 'tile' || selection.id === undefined) return selection;
  const collection = selection.type === 'agent' ? world.agents : selection.type === 'settlement' ? world.settlements : world.buildings;
  return collection.find(item => String(item.id) === String(selection.id)) || null;
}

function snapshot() {
  return { world, stats: getStats(world), speed, paused, selected, overlay, tool, follow, fps, lastSaved, lastAutosaved, saving: false, soundEnabled };
}

function focus(selection) {
  const item = selectedItem(selection);
  if (item && Number.isFinite(item.x) && Number.isFinite(item.y)) renderer.focus(item.x, item.y);
}

function frameHabitat() {
  // Open close enough to read people, while the atlas retains the whole world.
  const town = [...world.settlements].sort((a, b) => b.population - a.population)[0];
  if (town?.population) { renderer.focus(town.x + 0.5, town.y + 0.5, 1.65); return; }
  const groups = new Map();
  for (const person of world.agents) {
    const key = `${person.originX},${person.originY}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(person);
  }
  const habitats = [...groups.values()].map(people => {
    const x = people.reduce((sum, person) => sum + person.x, 0) / people.length;
    const y = people.reduce((sum, person) => sum + person.y, 0) / people.length;
    let obstruction = 0, count = 0;
    for (let yy = Math.floor(y - 8); yy <= y + 8; yy++) for (let xx = Math.floor(x - 8); xx <= x + 8; xx++) {
      const tile = getTile(world, xx, yy);
      if (!tile || Math.hypot(xx - x, yy - y) > 8) continue;
      obstruction += tile.trees * 0.45 + (['water', 'deepwater'].includes(tile.biome) ? 3 : 0) + (['mountain', 'snow'].includes(tile.biome) ? 2 : 0);
      count++;
    }
    return { x, y, score: obstruction / Math.max(1, count) + 1 / people.length };
  }).sort((a, b) => a.score - b.score);
  if (habitats.length) renderer.focus(habitats[0].x, habitats[0].y, 1.65);
}

function updateMapStatus(point) {
  const status = document.querySelector('#map-status-text') || document.querySelector('#map-status');
  if (!status) return;
  if (!point) { status.textContent = t('Sürükle: gezin · Tekerlek: yakınlaş · Tıkla: incele'); return; }
  const x = Math.floor(point.x), y = Math.floor(point.y);
  const tile = getTile(world, x, y);
  const labels = { deepwater: 'Açık deniz', water: 'Su', sand: 'Kumsal', grass: 'Çayır', forest: 'Orman', hill: 'Tepe', mountain: 'Dağ', snow: 'Karlı zirve' };
  if (tile) status.textContent = `${t(labels[tile.biome] || tile.biome)} · ${x}, ${y} · ${t('Verim')} ${Math.round(tile.fertility * (tile.fertility <= 1 ? 100 : 1))}%`;
}

function download(text, filename, type = 'application/json') {
  const objectURL = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = objectURL;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
}

function replaceWorld(next, view = {}) {
  world = next;
  selected = null;
  follow = false;
  tool = 'inspect';
  accumulator = 0;
  lastFrame = 0;
  overlay = ['natural', 'territory', 'fertility', 'resources', 'danger'].includes(view.overlay) ? view.overlay : 'natural';
  speed = SPEEDS.includes(view.speed) ? view.speed : 1;
  renderer.setWorld(world);
  renderer.fitWorld();
  frameHabitat();
  updateUI();
}

function save(auto = false) {
  try {
    const savedAt = writeSave(localStorage, world, { speed, overlay }, auto);
    if (auto) lastAutosaved = savedAt;
    else lastSaved = savedAt;
    autosaveFailed = false;
    if (!auto) ui.toast('Dünya kaydedildi. Aynı rastgelelik durumu ve bütün aileler korunuyor.', 'success');
    updateUI();
    return true;
  } catch (error) {
    if (!auto || !autosaveFailed) ui.toast('Tarayıcı kaydı dolu veya kapalı. Dünyanı JSON dosyası olarak dışa aktarabilirsin.', 'warning');
    autosaveFailed = true;
    return false;
  }
}

function loadWorld(auto = false) {
  try {
    const saved = readSave(localStorage, auto);
    const next = restoreWorld(saved.world);
    paused = true;
    replaceWorld(next, saved.view);
    if (auto) lastAutosaved = saved.savedAt;
    else lastSaved = saved.savedAt;
    updateUI();
    ui.toast(auto ? 'Otomatik kayıt yüklendi ve duraklatıldı.' : 'Kayıtlı dünya yüklendi ve duraklatıldı.', 'success');
  } catch (error) { ui.toast(error.message, 'error'); }
}

const actions = {
  setSpeed(value) { if (SPEEDS.includes(Number(value))) { speed = Number(value); paused = false; accumulator = 0; updateUI(); } },
  togglePause() { paused = !paused; accumulator = 0; updateUI(); },
  step() { paused = true; stepWorld(world, FIXED_SECONDS); accumulator = 0; updateUI(); },
  setOverlay(value) { overlay = value; updateUI(); },
  setTool(value) { tool = value; follow = false; updateUI(); },
  select(selection) { selected = normalizeSelection(selection); follow = false; updateUI(); },
  focus,
  follow(value) { follow = typeof value === 'boolean' ? value : !follow; if (follow) focus(selected); updateUI(); },
  newWorld(options = {}) {
    try {
      const next = createWorld({ ...DEFAULTS, ...options, seed: String(options.seed || `Vadi-${Date.now().toString(36)}`).slice(0, 100) });
      replaceWorld(next);
      paused = false;
      // Do not silently erase the manual save slot when creating another world.
      save(true);
      ui.toast('Yeni dünya doğdu. Bundan sonrası içindeki insanların hikâyesi.', 'success');
    } catch (error) { ui.toast(`Dünya oluşturulamadı: ${error.message}`, 'error'); }
  },
  save() { save(false); },
  load() { loadWorld(false); },
  loadAutosave() { loadWorld(true); },
  exportSave() {
    try {
      const safeSeed = world.seed.replace(/[^a-z0-9ığüşöçİĞÜŞÖÇ_-]/gi, '-').slice(0, 50);
      download(encodeSave(world, { speed, overlay }), `villages-${safeSeed}-day-${Math.floor(world.day)}.json`);
      ui.toast('Dünya dosyan hazır.', 'success');
    } catch (error) { ui.toast(error.message, 'error'); }
  },
  async importSave(file) {
    if (!file) return;
    try {
      if (file.size > MAX_SAVE_BYTES) throw new Error('Dünya dosyası 16 MB sınırını aşıyor.');
      const saved = decodeSave(await file.text());
      const next = restoreWorld(saved.world);
      replaceWorld(next, saved.view);
      paused = true;
      save(true);
      updateUI();
      ui.toast('Dünya dosyası doğrulandı ve yüklendi.', 'success');
    } catch (error) { ui.toast(error.message, 'error'); }
  },
  zoomIn() { renderer.zoomBy(1.25); },
  zoomOut() { renderer.zoomBy(0.8); },
  fitWorld() { follow = false; renderer.fitWorld(); },
  async toggleSound() {
    try { soundEnabled = await audio.toggle(); updateUI(); }
    catch (error) { ui.toast(error.message, 'warning'); }
  },
};

const ui = createUI({ getSnapshot: snapshot, actions });
function updateUI() {
  if (selected && selected.type !== 'tile' && !selectedItem()) {
    const wasAgent = selected.type === 'agent';
    selected = null;
    follow = false;
    if (wasAgent) ui.toast('Takip ettiğin kişi yaşamını yitirdi. Ayrıntıları kronikte bulabilirsin.', 'info');
  }
  ui.update(snapshot());
  if (minimap) renderer.drawMinimap(minimap, world, selected);
}

document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
  if (event.code === 'Space' && event.target.closest('button, summary, a[href], [role="button"]')) return;
  if (event.code === 'Space') { event.preventDefault(); actions.togglePause(); }
  else if (/^[1-5]$/.test(event.key)) actions.setSpeed(SPEEDS[Number(event.key) - 1]);
  else if (event.key === '+' || event.key === '=') actions.zoomIn();
  else if (event.key === '-') actions.zoomOut();
  else if (event.key.toLowerCase() === 'f') { actions.follow(!follow); }
  else if (event.key.toLowerCase() === 'c') actions.fitWorld();
  else if (event.key === '.') actions.step();
  else if (event.key === 'Escape') { selected = null; follow = false; tool = 'inspect'; updateUI(); }
});

document.addEventListener('visibilitychange', () => {
  // Hidden tabs do not age the world or accumulate hours of catch-up work.
  lastFrame = 0;
  accumulator = 0;
  audio.update(world, !document.hidden);
  if (document.hidden) save(true);
});
window.addEventListener('pagehide', () => save(true));

let frameCounter = 0;
let lastFPS = performance.now();
function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  if (document.hidden) { lastFrame = 0; return; }
  const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.2) : 0;
  lastFrame = now;
  if (!paused) {
    accumulator = Math.min(accumulator + delta * speed, 2.5);
    const start = performance.now();
    let steps = 0;
    // Keep painting responsive on slower hardware. Same ordered fixed steps at every speed.
    while (accumulator >= FIXED_SECONDS && steps < 40) {
      stepWorld(world, FIXED_SECONDS);
      accumulator -= FIXED_SECONDS;
      steps++;
      if (performance.now() - start > 13) break;
    }
  }
  if (follow) { const person = selectedItem(); if (person) renderer.focus(person.x, person.y); }
  renderer.render(world, { time: now / 1000, alpha: Math.min(1, accumulator / FIXED_SECONDS), selected, overlay, tool, follow, paused });
  if (now - lastUI > 250) { updateUI(); lastUI = now; audio.update(world); }
  if (now - lastAutosave > 30000 && !paused) { save(true); lastAutosave = now; }
  frameCounter++;
  if (now - lastFPS > 1000) { fps = Math.round(frameCounter * 1000 / (now - lastFPS)); frameCounter = 0; lastFPS = now; }
}

window.addEventListener('error', event => {
  if (!running) return;
  running = false;
  paused = true;
  ui.toast('Simülasyon bir hata nedeniyle durduruldu. Son kaydı yükleyebilir veya sayfayı yenileyebilirsin.', 'error');
  console.error('Villages runtime error', event.error);
});
renderer.resize();
renderer.fitWorld();
frameHabitat();
updateUI();
if (loadNote) ui.toast(loadNote, 'info');
requestAnimationFrame(frame);
