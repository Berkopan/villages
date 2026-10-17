import { icon, hydrateIcons } from './icons.js';
import { drawPortrait } from '../render/sprites.js';

const ROLE = {
  gatherer: 'Toplayıcı', farmer: 'Çiftçi', lumberjack: 'Oduncu', miner: 'Madenci',
  fisher: 'Balıkçı', hunter: 'Avcı', builder: 'İnşaatçı', smith: 'Demirci',
  healer: 'Şifacı', trader: 'Tüccar', warrior: 'Savaşçı', scholar: 'Bilgin',
  baby: 'Bebek', child: 'Çocuk', wanderer: 'Gezgin',
};
const LIFE_STAGE = { baby: 'Bebek', child: 'Çocuk', teen: 'Genç', adult: 'Yetişkin', elder: 'Yaşlı' };
const STAGE = { camp: 'Kamp', hamlet: 'Mezra', village: 'Köy', town: 'Kasaba', city: 'Şehir' };
const SEASON = { spring: ['İlkbahar', 'sprout'], summer: ['Yaz', 'sun'], autumn: ['Sonbahar', 'leaf'], winter: ['Kış', 'snow'] };
const WEATHER = { clear: ['Açık', 'sun'], rain: ['Yağmurlu', 'rain'], storm: ['Fırtına', 'storm'], drought: ['Kuraklık', 'sun'], snow: ['Kar yağışı', 'snow'] };
const RESOURCE = { food: ['Yiyecek', 'wheat'], wood: ['Odun', 'tree'], stone: ['Taş', 'stone'], ore: ['Cevher', 'ore'], tools: ['Alet', 'tools'], medicine: ['İlaç', 'medicine'] };
const RESOURCE_KEYS = Object.keys(RESOURCE);
const ACTION = {
  idle: ['Çevresini gözlemliyor', 'eye'], walk: ['Yol alıyor', 'footsteps'], gather: ['Yiyecek topluyor', 'sprout'],
  farm: ['Tarlayla ilgileniyor', 'wheat'], chop: ['Odun topluyor', 'tree'], mine: ['Cevher çıkarıyor', 'ore'],
  fish: ['Balık tutuyor', 'fish'], hunt: ['Avlanıyor', 'target'], build: ['Bir yapı inşa ediyor', 'hammer'],
  craft: ['Alet üretiyor', 'tools'], heal: ['Birini iyileştiriyor', 'medicine'], trade: ['Ticaret yapıyor', 'trade'],
  fight: ['Savaşıyor', 'sword'], flee: ['Tehlikeden kaçıyor', 'shield'], migrate: ['Yeni bir yuva arıyor', 'footsteps'],
  eat: ['Yemek yiyor', 'wheat'], rest: ['Dinleniyor', 'cloud'], socialize: ['Sosyalleşiyor', 'people'], study: ['Bilgisini geliştiriyor', 'book'],
};
const KNOWLEDGE = { agriculture: 'Tarım', masonry: 'Yapı ustalığı', metallurgy: 'Metalürji', medicine: 'Tıp', trade: 'Ticaret', civics: 'Toplum' };
const SKILL = {
  ...ROLE, ...KNOWLEDGE, gathering: 'Toplayıcılık', foraging: 'Toplayıcılık', farming: 'Çiftçilik',
  lumberjacking: 'Odunculuk', woodcutting: 'Odunculuk', logging: 'Odunculuk', mining: 'Madencilik',
  fishing: 'Balıkçılık', hunting: 'Avcılık', building: 'İnşaat', construction: 'İnşaat',
  smithing: 'Demircilik', crafting: 'Zanaat', healing: 'Şifacılık', trading: 'Ticaret',
  combat: 'Savaş', fighting: 'Savaş', scholarship: 'Bilgelik', learning: 'Öğrenme',
};
const TRAIT = {
  brave: 'Cesur', cautious: 'Temkinli', curious: 'Meraklı', kind: 'Şefkatli', social: 'Sosyal',
  sociable: 'Sosyal', industrious: 'Çalışkan', resilient: 'Dayanıklı', fertile: 'Üretken',
  ambitious: 'Hırslı', wanderer: 'Gezgin', nomadic: 'Göçebe', aggressive: 'Atılgan',
  peaceful: 'Barışçıl', strong: 'Güçlü', agile: 'Çevik', patient: 'Sabırlı',
  creative: 'Yaratıcı', generous: 'Cömert', hardy: 'Dayanıklı', loner: 'Yalnızlığı seven',
  explorer: 'Kâşif', diligent: 'Çalışkan', sturdy: 'Sağlam', impulsive: 'Dürtüsel',
  calm: 'Sakin', restless: 'Hareketli', clever: 'Kavrayışlı', stubborn: 'İnatçı',
};
const TRAIT_DIMENSION = { diligence: 'Çalışkanlık', sociability: 'Sosyallik', courage: 'Cesaret', curiosity: 'Merak', resilience: 'Dayanıklılık', fertility: 'Doğurganlık', aggression: 'Saldırganlık' };
const BIOME = {
  deepwater: ['Açık deniz', 'droplet'], water: ['Su', 'droplet'], sand: ['Kumsal', 'sun'],
  grass: ['Çayır', 'sprout'], forest: ['Orman', 'tree'], hill: ['Tepe', 'mountain'],
  mountain: ['Dağ', 'mountain'], snow: ['Karlı zirve', 'snow'],
};
const BUILDING = {
  campfire: 'Kamp ateşi', hut: 'Kulübe', house: 'Ev', granary: 'Ambar', well: 'Kuyu',
  lumberyard: 'Odun deposu', mine: 'Maden', workshop: 'Atölye', market: 'Pazar',
  barracks: 'Kışla', watchtower: 'Gözetleme kulesi', hall: 'Toplantı evi', shrine: 'Tapınak',
};
const RELATION = { neutral: 'Tarafsız', peace: 'Barış', trade: 'Ticaret', war: 'Savaş' };
const EVENT_ICON = { info: 'info', birth: 'heart', death: 'cross', founding: 'flag', growth: 'village', migration: 'footsteps', trade: 'trade', war: 'sword', peace: 'sprout', discovery: 'sparkle', fire: 'fire' };
const EVENT_FILTER = {
  life: ['birth', 'death', 'migration'],
  civilization: ['founding', 'growth', 'trade', 'discovery'],
  conflict: ['war', 'peace', 'fire'],
};
const TOOL_TEXT = { rain: 'Yağmur için toprağa tıkla', food: 'Yiyecek eklemek için toprağa tıkla', trees: 'Ağaç dikmek için toprağa tıkla', settlers: 'İnsan eklemek için toprağa tıkla', fire: 'Ateş başlatmak için toprağa tıkla' };
const SEED_WORDS = ['Söğüt', 'Kehribar', 'Yosun', 'Ardıç', 'Gümüş', 'Sedir', 'Mercan', 'Sessiz', 'Kızıl', 'Zümrüt'];
const SEED_PLACES = ['Vadisi', 'Kıyısı', 'Tepeleri', 'Adası', 'Ormanı', 'Ovası', 'Diyarları', 'Yaylası'];
const INTEGER = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

// Imported saves are data, never markup. Every imported label and every attribute
// goes through this encoder; CSS colors and chart coordinates have separate guards.
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, function (character) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
  });
}
function number(value, fallback = 0) { const result = Number(value); return Number.isFinite(result) ? result : fallback; }
function hasNumber(value) { return value != null && value !== '' && Number.isFinite(Number(value)); }
function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, number(value))); }
function format(value, decimal = false) { return (decimal ? DECIMAL : INTEGER).format(number(value)); }
function percent(value) { const n = number(value); return clamp(n <= 1 ? n * 100 : n); }
function list(value) { return Array.isArray(value) ? value : []; }
function sameId(a, b) { return a != null && b != null && String(a) === String(b); }
function color(value) { return /^#(?:[a-f\d]{3}|[a-f\d]{6}|[a-f\d]{8})$/i.test(String(value)) ? String(value) : '#a9bc86'; }
function label(mapping, key, fallback = '—') { return mapping[key] ?? (key ? String(key) : fallback); }
function seasonAt(day) { return ['spring', 'summer', 'autumn', 'winter'][Math.floor(Math.max(0, number(day)) / 24) % 4]; }
function eventDate(day) { const d = Math.max(0, number(day)); return 'Y' + format(Math.floor(d / 96) + 1) + ' · ' + String(Math.floor(d % 96) + 1).padStart(2, '0'); }
function fullDate(day) { const d = Math.max(0, number(day)); return 'Yıl ' + format(Math.floor(d / 96) + 1) + ' · ' + SEASON[seasonAt(d)][0] + ' · ' + format(Math.floor(d % 24) + 1) + '. gün'; }
function section(title, body, annotation = '') {
  return '<section class="inspector-section"><div class="inspector-section-title"><span>' + escapeHtml(title) + '</span>' + (annotation ? '<span>' + escapeHtml(annotation) + '</span>' : '') + '</div>' + body + '</section>';
}
function detailRow(title, value) { return '<div class="detail-row"><span>' + escapeHtml(title) + '</span><strong>' + escapeHtml(value) + '</strong></div>'; }
function personLink(person, fallback = '—') {
  return person ? '<button data-select-type="agent" data-select-id="' + escapeHtml(person.id) + '" data-focus-key="person-' + escapeHtml(person.id) + '">' + escapeHtml(person.name || 'İsimsiz') + '</button>' : '<strong>' + escapeHtml(fallback) + '</strong>';
}
function resourceGrid(resources, keys = RESOURCE_KEYS, overrides = {}) {
  return '<div class="resources-grid">' + keys.map(function (key) {
    const title = overrides[key] || RESOURCE[key][0];
    return '<div class="resource-item ' + key + '" title="' + escapeHtml(title) + '"><span>' + icon(RESOURCE[key][1]) + '</span><strong>' + format(resources?.[key]) + '</strong><span>' + escapeHtml(title) + '</span></div>';
  }).join('') + '</div>';
}
function needRow(title, value, symbol) {
  const n = clamp(value);
  const category = n < 30 ? ' low' : n < 55 ? ' medium' : '';
  return '<div class="need-row"><div class="need-top"><span class="need-label">' + icon(symbol) + escapeHtml(title) + '</span><span class="need-value">' + format(n) + '%</span></div><div class="need-track' + category + '" role="meter" aria-label="' + escapeHtml(title) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(n) + '"><span style="width:' + n.toFixed(2) + '%"></span></div></div>';
}
function settlementButton(settlement, population) {
  return '<button class="settlement-row" data-select-type="settlement" data-select-id="' + escapeHtml(settlement.id) + '" data-focus-key="settlement-' + escapeHtml(settlement.id) + '"><span class="settlement-color" style="--civilization-color:' + color(settlement.color) + '">' + icon('village') + '</span><span class="settlement-label"><strong>' + escapeHtml(settlement.name || 'İsimsiz yerleşim') + '</strong><small>' + escapeHtml(label(STAGE, settlement.stage)) + '</small></span><span class="settlement-population">' + format(population ?? settlement.population) + '</span><span class="settlement-arrow">' + icon('chevron-right') + '</span></button>';
}
function populationChart(history, population, day) {
  const samples = list(history).filter(function (sample) { return Number.isFinite(Number(sample.population)); }).slice(-90);
  if (!samples.length) samples.push({ day, population });
  if (samples.length === 1) samples.unshift({ day: Math.max(0, number(samples[0].day) - 1), population: samples[0].population });
  const values = samples.map(function (sample) { return clamp(sample.population, 0, 1e7); });
  let min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(8, max - min);
  min = Math.max(0, min - span * .15);
  max += span * .15;
  const height = Math.max(1, max - min);
  const points = values.map(function (value, index) { return [(index / (values.length - 1) * 246).toFixed(2), (49 - (value - min) / height * 42).toFixed(2)]; });
  const line = points.map(function (point, index) { return (index ? 'L' : 'M') + point[0] + ',' + point[1]; }).join(' ');
  const last = points.at(-1);
  return '<svg class="population-chart" viewBox="0 0 246 56" preserveAspectRatio="none" role="img" aria-label="Nüfus geçmişi: ' + format(values[0]) + ' kişiden ' + format(values.at(-1)) + ' kişiye"><defs><linearGradient id="population-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#9bb584" stop-opacity=".2"/><stop offset="100%" stop-color="#9bb584" stop-opacity=".01"/></linearGradient></defs><path d="M0 18H246M0 36H246" stroke="#526345" stroke-opacity=".25" stroke-width=".6" stroke-dasharray="3 4"/><path d="' + line + ' L246,56 L0,56Z" fill="url(#population-shade)"/><path d="' + line + '" fill="none" stroke="#aac591" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.3" fill="#d5e6b8"/></svg><div class="chart-legend"><span>' + escapeHtml(eventDate(samples[0].day)) + '</span><span>NÜFUSUN YOLCULUĞU</span><span>Şimdi</span></div>';
}
function totalsFor(world, stats) {
  const totals = Object.fromEntries(RESOURCE_KEYS.map(function (key) { return [key, 0]; }));
  list(world.agents).forEach(function (agent) { RESOURCE_KEYS.forEach(function (key) { totals[key] += number(agent.inventory?.[key]); }); });
  list(world.settlements).forEach(function (settlement) { RESOURCE_KEYS.forEach(function (key) { totals[key] += number(settlement.stockpile?.[key]); }); });
  RESOURCE_KEYS.forEach(function (key) { if (Number.isFinite(Number(stats[key]))) totals[key] = number(stats[key]); });
  return totals;
}
function observation(world, stats) {
  const agents = list(world.agents);
  const hungry = agents.filter(function (agent) { return number(agent.hunger) >= 70; }).length;
  const wars = number(stats.wars);
  const activeSettlements = list(world.settlements).filter(function (settlement) { return number(settlement.population) > 0; });
  if (!agents.length) return 'Bu dünyada yaşayan insan kalmadı. Yeni hayatlar aracıyla bir topluluk ekleyebilir, aynı ekosistemde yeni bir başlangıcı izleyebilirsin.';
  if (wars > 0) return format(wars) + ' çatışma sürüyor. Sınırlar katmanını açarak komşu toplulukları, bir yerleşimi seçerek ilişkilerini inceleyebilirsin.';
  if (hungry >= Math.max(5, agents.length * .18)) return format(hungry) + ' kişinin açlığı yükseliyor. Kaynaklar katmanı, yakın çevredeki yiyecek dağılımını görünür kılar.';
  if (world.season === 'winter') return 'Kış geldi. Depolanan erzakların, barınakların ve birlikte yaşamanın bu nesli nasıl etkilediğini izle.';
  if (!activeSettlements.length) return 'Şu an yaşayan bir yerleşim yok. İnsanlar kaynak ararken yakınlaşabilir; yeni toplulukların nerede kök salacağını izle.';
  if (activeSettlements.length === 1) return 'Bir topluluk kök saldı. Yiyecek, barınak ve biriken bilgi; bu küçük yerin geleceğini birlikte şekillendiriyor.';
  return format(activeSettlements.length) + ' yerleşim aynı dünyayı paylaşıyor. Birini seç; iş bölümünü, biriken bilgiyi ve komşularıyla ilişkilerini keşfet.';
}
function overview(world, stats) {
  const agents = list(world.agents);
  const population = number(stats.population, agents.length);
  const births = number(stats.births, number(world.metrics?.births));
  const deaths = number(stats.deaths, number(world.metrics?.deaths));
  const avgAge = number(stats.avgAge, agents.reduce(function (sum, agent) { return sum + number(agent.age); }, 0) / Math.max(1, population));
  const avgLevel = number(stats.avgLevel, agents.reduce(function (sum, agent) { return sum + number(agent.level, 1); }, 0) / Math.max(1, population));
  const young = agents.filter(function (agent) { return number(agent.age) < 18; }).length;
  const elder = agents.filter(function (agent) { return number(agent.age) >= 58; }).length;
  const adult = agents.length - young - elder;
  const denom = Math.max(1, agents.length);
  const settlements = list(world.settlements).filter(function (settlement) { return number(settlement.population) > 0; }).sort(function (a, b) { return number(b.population) - number(a.population); });
  const settlementMarkup = settlements.length ? '<div class="settlement-list">' + settlements.map(function (settlement) {
    const members = agents.filter(function (agent) { return sameId(agent.settlementId, settlement.id); }).length;
    return settlementButton(settlement, members);
  }).join('') + '</div>' : '<p class="empty-settlements">' + (list(world.settlements).length ? 'Eski yerleşimlerde hayat söndü. Yeni toplulukların doğuşu için dünya hâlâ burada.' : 'İlk ateş henüz yakılmadı. Birlikte yaşamanın başlayacağı yeri insanlar bulacak.') + '</p>';
  const occupations = {};
  agents.filter(function (agent) { return number(agent.age) >= 12; }).forEach(function (agent) { occupations[agent.role] = (occupations[agent.role] || 0) + 1; });
  const occupationMarkup = Object.entries(occupations).sort(function (a, b) { return b[1] - a[1]; }).map(function ([role, count]) {
    return '<div class="occupation-row"><span>' + escapeHtml(label(ROLE, role)) + '</span><span class="occupation-track"><i style="width:' + (count / denom * 100).toFixed(2) + '%"></i></span><strong>' + format(count) + '</strong></div>';
  }).join('');
  return '<div class="overview-population"><div><span class="metric-label">Yaşayan insanlar</span><strong class="population-large">' + format(population) + '<small>kişi</small></strong></div><div class="population-movement"><span>' + icon('heart') + format(births) + ' doğum</span><span class="death-count">' + icon('cross') + format(deaths) + ' ölüm</span></div></div>' +
    populationChart(world.history, population, world.day) +
    '<div class="overview-submetrics"><div class="overview-submetric"><strong>' + format(avgAge, true) + '</strong><span>Ortalama yaş</span></div><div class="overview-submetric"><strong>' + format(avgLevel, true) + '</strong><span>Ortalama seviye</span></div><div class="overview-submetric"><strong>' + format(stats.wars) + '</strong><span>Aktif çatışma</span></div></div>' +
    '<div class="demographic-line" aria-label="' + format(young) + ' genç, ' + format(adult) + ' yetişkin, ' + format(elder) + ' yaşlı"><span class="young" style="width:' + (young / denom * 100).toFixed(2) + '%"></span><span class="adult" style="width:' + (adult / denom * 100).toFixed(2) + '%"></span><span class="elder" style="width:' + (elder / denom * 100).toFixed(2) + '%"></span></div><div class="demographic-legend"><span><i></i>Genç ' + format(young) + '</span><span><i></i>Yetişkin ' + format(adult) + '</span><span><i></i>Yaşlı ' + format(elder) + '</span></div>' +
    section('ERZAK VE HAM MADDELER', resourceGrid(totalsFor(world, stats))) +
    section('YERLEŞİMLER', settlementMarkup, format(settlements.length) + ' topluluk') +
    (occupationMarkup ? section('İŞ BÖLÜMÜ', '<div class="occupation-list">' + occupationMarkup + '</div>') : '') +
    section('DÜNYADA YAŞAM', detailRow('Yaban hayvanları', format(stats.animals ?? list(world.animals).length)) + detailRow('Tarlalar', format(stats.farms ?? list(world.farms).length)) + detailRow('Tamamlanan yapılar', format(stats.buildings)) + detailRow('Göçler', format(stats.migrations ?? world.metrics?.migrations)) + detailRow('Ticaret seferleri', format(stats.trades ?? world.metrics?.trades))) +
    '<div class="world-observation"><div class="observation-label">' + icon('eye') + 'GÖZLEMCİ NOTU</div><p>' + escapeHtml(observation(world, stats)) + '</p></div>';
}
function traitsFor(agent) {
  if (Array.isArray(agent.traits)) return agent.traits.map(function (trait) { return typeof trait === 'string' ? trait : trait?.name; }).filter(Boolean);
  if (agent.traits && typeof agent.traits === 'object') return Object.entries(agent.traits).filter(function ([, value]) { return value === true; }).map(function ([key]) { return key; });
  return [];
}
function personInspector(agent, world, snapshot) {
  const agents = list(world.agents);
  const home = list(world.settlements).find(function (settlement) { return sameId(settlement.id, agent.settlementId); });
  const partner = agents.find(function (person) { return sameId(person.id, agent.partnerId); });
  const children = list(agent.childrenIds);
  const livingChildren = children.map(function (id) { return agents.find(function (person) { return sameId(person.id, id); }); }).filter(Boolean);
  const parents = list(agent.parents).map(function (id) { return agents.find(function (person) { return sameId(person.id, id); }); }).filter(Boolean);
  const traits = traitsFor(agent);
  const traitDimensions = Object.entries(TRAIT_DIMENSION).filter(function ([key]) { return hasNumber(agent.traits?.[key]); }).map(function ([key, text]) {
    const value = percent(agent.traits[key]);
    return '<div class="trait-dimension"><span>' + text + '</span><span class="trait-dots" role="img" aria-label="' + text + ' ' + format(value) + '%">' + Array.from({ length: 5 }, function (_, i) { return '<i' + (value >= (i + 1) * 20 - 10 ? ' class="filled"' : '') + '></i>'; }).join('') + '</span><strong>' + format(value) + '</strong></div>';
  }).join('');
  const act = ACTION[agent.action?.type] || [agent.action?.type || 'Çevresini gözlemliyor', 'eye'];
  const lifeStage = agent.lifeStage || (number(agent.age) < 3 ? 'baby' : number(agent.age) < 12 ? 'child' : number(agent.age) < 18 ? 'teen' : number(agent.age) < 58 ? 'adult' : 'elder');
  const skills = Object.entries(agent.skills || {}).filter(function ([, value]) { return Number.isFinite(Number(value)) && Number(value) > 0; }).sort(function (a, b) { return number(b[1]) - number(a[1]); }).slice(0, 5);
  const family = '<div class="detail-row"><span>Yaşadığı yer</span>' + (home ? '<button data-select-type="settlement" data-select-id="' + escapeHtml(home.id) + '" data-focus-key="home">' + escapeHtml(home.name) + '</button>' : '<strong>Yolculukta</strong>') + '</div>' +
    detailRow('Soy nesli', format(agent.generation || 1) + '. nesil') +
    (parents.length ? '<div class="detail-row"><span>Ebeveynleri</span><span class="family-links">' + parents.map(function (person) { return personLink(person); }).join('') + '</span></div>' : '') +
    '<div class="detail-row"><span>Eşi</span>' + personLink(partner, agent.partnerId == null ? 'Henüz yok' : 'Şu an yanında değil') + '</div>' +
    detailRow('Çocukları', children.length ? format(children.length) + ' · ' + format(livingChildren.length) + ' hayatta' : 'Henüz yok') +
    (agent.pregnant ? detailRow('Yeni bir hayat', 'Doğuma yaklaşık ' + format(agent.pregnant.remaining) + ' gün') : '') +
    (livingChildren.length ? '<div class="citizen-list">' + livingChildren.slice(0, 6).map(function (child) { return citizenButton(child); }).join('') + '</div>' : '');
  return '<div class="person-header"><div class="portrait-frame"><canvas id="person-portrait" width="80" height="80" role="img" aria-label="' + escapeHtml(agent.name || 'Seçili kişinin') + ' piksel portresi"></canvas></div><div class="person-identity"><div class="person-role">' + escapeHtml(label(ROLE, agent.role, 'Gezgin')) + '</div><div class="person-age">' + format(agent.age, true) + ' yaş · ' + escapeHtml(label(LIFE_STAGE, lifeStage)) + '</div><div class="level-badge">' + icon('star') + 'Seviye ' + format(agent.level || 1) + '</div><div class="person-xp">' + format(agent.xp, true) + ' deneyim</div></div></div>' +
    '<div class="action-card"><span class="action-icon">' + icon(act[1]) + '</span><div><small>ŞU ANDA</small><strong>' + escapeHtml(act[0]) + '</strong></div></div>' +
    '<div class="person-actions"><button class="button ' + (snapshot.follow ? 'button-primary' : 'button-subtle') + '" data-action="follow" data-focus-key="follow">' + icon('eye') + (snapshot.follow ? 'Takip ediliyor' : 'Bu hayatı takip et') + '</button><button class="icon-button" data-action="focus-selected" data-focus-key="focus-selected" aria-label="Seçili kişiye odaklan" title="Haritada bul">' + icon('target') + '</button></div>' +
    section('YAŞAM DENGESİ', '<div class="needs-list">' + needRow('Sağlık', agent.health, 'heart') + needRow('Tokluk', 100 - number(agent.hunger), 'wheat') + needRow('Enerji', agent.energy, 'energy') + needRow('Moral', agent.morale, 'sun') + '</div>' + (number(agent.sickness) > 0 ? '<div class="condition-note">' + icon('medicine') + '<span>Hastalık etkisi: ' + format(agent.sickness) + '%</span></div>' : '') + (number(agent.exposure) > 20 ? '<div class="condition-note">' + icon('snow') + '<span>Soğuğa maruz kalıyor</span></div>' : '')) +
    (traitDimensions ? section('KALITSAL EĞİLİMLER', '<div class="trait-dimensions">' + traitDimensions + '</div>') : traits.length ? section('MİZAÇ', '<div class="trait-list">' + traits.map(function (trait) { return '<span class="trait-chip">' + escapeHtml(label(TRAIT, trait)) + '</span>'; }).join('') + '</div>') : '') +
    section('YANINDAKİLER', resourceGrid(agent.inventory)) +
    section('AİLE VE YUVA', family) +
    (skills.length ? section('GELİŞEN USTALIKLAR', skills.map(function ([key, value]) { return '<div class="skill-row"><span>' + escapeHtml(label(SKILL, key)) + '</span><strong>' + format(value, true) + '</strong></div>'; }).join('')) : '');
}
function citizenButton(agent) {
  return '<button class="citizen-button" data-select-type="agent" data-select-id="' + escapeHtml(agent.id) + '" data-focus-key="citizen-' + escapeHtml(agent.id) + '" title="' + escapeHtml(agent.name || 'İsimsiz') + ' · ' + escapeHtml(label(ROLE, agent.role)) + '"><span class="citizen-dot"></span><span>' + escapeHtml(agent.name || 'İsimsiz') + '</span></button>';
}
function settlementInspector(settlement, world) {
  const citizens = list(world.agents).filter(function (agent) { return sameId(agent.settlementId, settlement.id); });
  const buildings = list(world.buildings).filter(function (building) { return sameId(building.settlementId, settlement.id); });
  const farms = list(world.farms).filter(function (farm) { return sameId(farm.settlementId, settlement.id); });
  const leader = citizens.find(function (agent) { return sameId(agent.id, settlement.leaderId); });
  const relations = Object.entries(settlement.relations || {}).map(function ([id, relation]) { return { settlement: list(world.settlements).find(function (other) { return sameId(other.id, id); }), relation }; }).filter(function (item) { return item.settlement; });
  const knowledge = Object.entries(KNOWLEDGE).map(function ([key, text]) {
    return '<div class="knowledge-item"><span>' + text + '</span><strong>' + format(settlement.knowledge?.[key], true) + '</strong></div>';
  }).join('');
  const structureCounts = {};
  buildings.forEach(function (building) { structureCounts[building.type] = (structureCounts[building.type] || 0) + 1; });
  const structures = Object.entries(structureCounts).map(function ([type, count]) { return detailRow(label(BUILDING, type), format(count)); }).join('') + detailRow('Tarla', format(farms.length));
  return '<div class="settlement-hero"><span class="settlement-color" style="--civilization-color:' + color(settlement.color) + '">' + icon('village') + '</span><div><div class="settlement-stage">' + escapeHtml(citizens.length ? label(STAGE, settlement.stage) : 'Terk edilmiş ' + label(STAGE, settlement.stage).toLocaleLowerCase('tr')) + '</div><div class="settlement-detail">' + format(citizens.length) + ' insan · ' + format(buildings.length) + ' yapı</div></div></div>' +
    '<div class="needs-list">' + needRow('Refah', settlement.prosperity, 'sun') + '</div>' +
    '<div class="person-actions"><button class="button button-subtle" data-action="focus-selected" data-focus-key="focus-selected">' + icon('target') + 'Haritada bul</button><button class="icon-button" data-action="world-overview" data-focus-key="world-overview" aria-label="Dünya özetine dön" title="Dünya özetine dön">' + icon('compass') + '</button></div>' +
    section('ORTAK ERZAK', resourceGrid(settlement.stockpile)) +
    section('TOPLUMUN DOKUSU', detailRow('Kuruluş', fullDate(settlement.foundedDay)) + '<div class="detail-row"><span>Önderi</span>' + personLink(leader, 'Önderi yok') + '</div>' + detailRow('Toplumsal uyum', format(settlement.cohesion) + '%') + detailRow('Huzursuzluk', format(settlement.unrest) + '%') + (number(settlement.famineDays) > 0 ? detailRow('Kıtlık', format(settlement.famineDays) + ' gündür') : '')) +
    section('BİRİKEN BİLGİ', '<div class="knowledge-grid">' + knowledge + '</div>') +
    (list(settlement.discovered).length ? section('KEŞİFLER', '<div class="trait-list">' + list(settlement.discovered).map(function (subject) { return '<span class="trait-chip">' + escapeHtml(label(KNOWLEDGE, subject)) + '</span>'; }).join('') + '</div>') : '') +
    section('YAPILAR VE ÜRETİM', structures || '<p class="empty-settlements">Bu topluluk henüz ilk yapılarını kuruyor.</p>') +
    section('KOMŞULARLA İLİŞKİLER', relations.length ? relations.map(function ({ settlement: other, relation }) {
      const status = typeof relation === 'object' ? relation.status : 'neutral';
      const safeStatus = Object.hasOwn(RELATION, status) ? status : 'neutral';
      const affinity = typeof relation === 'object' ? ' · Yakınlık ' + format(relation.affinity) : '';
      return '<div class="relation-row"><button class="relation-name" data-select-type="settlement" data-select-id="' + escapeHtml(other.id) + '" data-focus-key="relation-' + escapeHtml(other.id) + '">' + escapeHtml(other.name) + '</button><span class="relation-status ' + safeStatus + '" title="' + escapeHtml(label(RELATION, safeStatus) + affinity) + '">' + escapeHtml(label(RELATION, safeStatus)) + '</span></div>';
    }).join('') : '<p class="empty-settlements">Henüz kayda geçen bir komşuluk ilişkisi yok.</p>') +
    (citizens.length ? section('BU TOPLULUKTAN HAYATLAR', '<div class="citizen-list">' + citizens.slice().sort(function (a, b) { return number(b.level) - number(a.level); }).slice(0, 8).map(citizenButton).join('') + '</div>', format(citizens.length) + ' insan') : '');
}
function tileInspector(tile, world, building = null) {
  const biome = BIOME[tile?.biome] || ['Bilinmeyen toprak', 'compass'];
  if (!tile) return '<div class="inspector-empty">' + icon('compass') + 'Bu nokta dünyanın dışında.</div>';
  const localBuildings = building ? [building] : list(world.buildings).filter(function (item) { return Math.abs(number(item.x) - number(tile.x)) < .6 && Math.abs(number(item.y) - number(tile.y)) < .6; });
  const people = list(world.agents).filter(function (agent) { return Math.floor(number(agent.x)) === number(tile.x) && Math.floor(number(agent.y)) === number(tile.y); });
  const nearResources = { food: tile.food, wood: tile.trees, stone: tile.stone, ore: tile.ore };
  let body = '<div class="tile-hero"><span class="tile-symbol">' + icon(building ? 'village' : biome[1]) + '</span><div><strong>' + escapeHtml(building ? label(BUILDING, building.type) : biome[0]) + '</strong><small>' + format(tile.x) + ', ' + format(tile.y) + ' · ' + escapeHtml(biome[0]) + '</small></div></div>';
  if (building) body += '<div class="needs-list">' + needRow('İnşa durumu', percent(building.progress ?? 1), 'hammer') + '</div><div class="inspector-section">' + detailRow('Yapı seviyesi', format(building.level || 1)) + '</div>';
  body += section('TOPRAĞIN DURUMU', '<div class="needs-list">' + needRow('Verimlilik', percent(tile.fertility), 'sprout') + needRow('Nem', percent(tile.moisture), 'droplet') + '</div><div style="margin-top:14px">' + detailRow('Yükselti', format(tile.elevation, true)) + detailRow('Ağaç miktarı', format(tile.trees, true)) + detailRow('Balık', format(tile.fish, true)) + (number(tile.fire) > 0 ? detailRow('Ateş', 'Bu toprak yanıyor') : '') + '</div>');
  body += section('DOĞAL KAYNAKLAR', resourceGrid(nearResources, ['food', 'wood', 'stone', 'ore'], { wood: 'Ağaç' }));
  if (localBuildings.length && !building) body += section('BURADAKİ YAPILAR', localBuildings.map(function (item) { return '<button class="settlement-row" data-select-type="building" data-select-id="' + escapeHtml(item.id) + '" data-focus-key="building-' + escapeHtml(item.id) + '"><span class="settlement-color">' + icon('village') + '</span><span class="settlement-label"><strong>' + escapeHtml(label(BUILDING, item.type)) + '</strong><small>Seviye ' + format(item.level || 1) + '</small></span><span class="settlement-arrow">' + icon('chevron-right') + '</span></button>'; }).join(''));
  if (people.length) body += section('BURADAKİ HAYATLAR', '<div class="citizen-list">' + people.slice(0, 8).map(citizenButton).join('') + '</div>');
  body += '<div class="world-observation"><div class="observation-label">' + icon('layers') + 'DÜNYANIN BİR PARÇASI</div><p>Bu toprağı ve yakınındaki kaynakları izlemek için harita katmanlarını kullan. Her müdahale, çevresindeki hayatların koşullarını değiştirir.</p></div>';
  return body;
}

export function createUI({ getSnapshot, actions }) {
  hydrateIcons();
  const abort = new AbortController();
  const signal = abort.signal;
  const timers = new Set();
  const $ = function (id) { return document.getElementById(id); };
  const inspector = $('inspector-content');
  const chronicle = $('chronicle-events');
  const saveMenu = $('save-menu');
  const mobile = window.matchMedia('(max-width: 760px)');
  let current = null;
  let selectionKey = '';
  let inspectorMarkup = '';
  let chronicleMarkup = '';
  let eventFilter = 'all';
  let visibleEvents = [];
  let hintDismissed = false;
  let portraitFailure = false;
  let destroyed = false;

  function setText(id, value) {
    const element = $(id);
    const text = String(value ?? '');
    if (element && element.textContent !== text) element.textContent = text;
  }
  function setIcon(element, name) {
    if (!element || element.dataset.currentIcon === name) return;
    element.innerHTML = icon(name);
    element.dataset.currentIcon = name;
  }
  function runAction(name, ...args) {
    if (typeof actions[name] !== 'function') return;
    try {
      const result = actions[name](...args);
      if (result && typeof result.catch === 'function') result.catch(function (error) { toast(error.message || 'İşlem tamamlanamadı.', 'error'); });
      return result;
    } catch (error) {
      toast(error.message || 'İşlem tamamlanamadı.', 'error');
    }
  }
  function schedule(callback, delay) {
    const timer = setTimeout(function () { timers.delete(timer); callback(); }, delay);
    timers.add(timer);
    return timer;
  }
  function toast(message, type = 'info') {
    if (destroyed) return;
    const safeType = ['info', 'success', 'warning', 'error'].includes(type) ? type : 'info';
    const region = $('toast-region');
    const item = document.createElement('div');
    item.className = 'toast ' + safeType;
    item.innerHTML = icon(safeType === 'success' ? 'check' : safeType === 'error' || safeType === 'warning' ? 'warning' : 'info') + '<span></span><button aria-label="Bildirimi kapat">' + icon('close') + '</button>';
    item.querySelector('span').textContent = String(message);
    let removing = false;
    const remove = function () {
      if (removing) return;
      removing = true;
      item.classList.add('removing');
      schedule(function () { item.remove(); }, 180);
    };
    item.querySelector('button').addEventListener('click', remove, { signal });
    region.append(item);
    while (region.children.length > 4) region.firstElementChild.remove();
    schedule(remove, safeType === 'error' ? 9000 : safeType === 'warning' ? 7000 : 5000);
  }
  function dialogOpen(id) {
    saveMenu.open = false;
    const dialog = $(id);
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog(target) {
    const dialog = target?.closest('dialog');
    if (dialog?.open) dialog.close();
  }
  function randomSeed() {
    const random = function (max) {
      if (globalThis.crypto?.getRandomValues) { const value = new Uint32Array(1); crypto.getRandomValues(value); return value[0] % max; }
      return Math.floor(Math.random() * max);
    };
    const seed = SEED_WORDS[random(SEED_WORDS.length)] + ' ' + SEED_PLACES[random(SEED_PLACES.length)] + ' ' + String(random(900) + 100);
    $('world-seed').value = seed;
    return seed;
  }
  function openNewWorld() {
    randomSeed();
    const settings = current?.world?.config || current?.world?.settings || {};
    const population = clamp(settings.initialPopulation || settings.population || 96, 24, 192);
    $('world-population').value = String(Math.round(population / 8) * 8);
    setText('population-output', format($('world-population').value) + ' kişi');
    const climate = ['balanced', 'lush', 'dry'].includes(settings.climate) ? settings.climate : 'balanced';
    document.querySelectorAll('input[name="climate"]').forEach(function (input) { input.checked = input.value === climate; });
    $('world-aggression').value = String(clamp(settings.aggression ?? 1, 0, 2));
    updateAggressionLabel();
    dialogOpen('new-world-dialog');
  }
  function updateAggressionLabel() {
    const value = number($('world-aggression').value, 1);
    setText('aggression-output', value === 0 ? 'Barışçıl' : value < .75 ? 'Sakin' : value <= 1.25 ? 'Dengeli' : value < 2 ? 'Rekabetçi' : 'Sert rekabet');
  }
  function selectAndFocus(type, id) {
    const selection = { type, id };
    runAction('select', selection);
    runAction('focus', selection);
    if (mobile.matches) document.body.classList.add('inspector-open');
  }
  function showEvent(event) {
    if (!event || !current?.world) return;
    const world = current.world;
    if (event.agentId != null && list(world.agents).some(function (agent) { return sameId(agent.id, event.agentId); })) {
      selectAndFocus('agent', event.agentId);
    } else if (event.settlementId != null && list(world.settlements).some(function (settlement) { return sameId(settlement.id, event.settlementId); })) {
      selectAndFocus('settlement', event.settlementId);
    } else if (hasNumber(event.x) && hasNumber(event.y)) {
      const point = { x: number(event.x), y: number(event.y) };
      runAction('select', { type: 'tile', ...point });
      runAction('focus', point);
    }
  }

  document.addEventListener('click', function (event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.speed) { runAction('setSpeed', number(button.dataset.speed, 1)); return; }
    if (button.dataset.tool) { runAction('setTool', button.dataset.tool); return; }
    if (button.dataset.selectType) { selectAndFocus(button.dataset.selectType, button.dataset.selectId); return; }
    if (button.dataset.eventId != null) { showEvent(list(current?.world?.events).find(function (item) { return sameId(item.id, button.dataset.eventId); })); return; }
    const action = button.dataset.action;
    if (!action) return;
    const snapshot = current || getSnapshot();
    switch (action) {
      case 'pause': runAction('togglePause'); break;
      case 'step': runAction('step'); break;
      case 'new-world': openNewWorld(); break;
      case 'save': runAction('save'); saveMenu.open = false; break;
      case 'load': runAction('load'); saveMenu.open = false; break;
      case 'export': runAction('exportSave'); saveMenu.open = false; break;
      case 'import': $('save-file-input').click(); saveMenu.open = false; break;
      case 'sound': runAction('toggleSound'); break;
      case 'help': dialogOpen('help-dialog'); break;
      case 'close-dialog': closeDialog(button); break;
      case 'random-seed': randomSeed(); break;
      case 'zoom-in': runAction('zoomIn'); break;
      case 'zoom-out': runAction('zoomOut'); break;
      case 'fit-world': runAction('fitWorld'); break;
      case 'focus-selected': if (snapshot?.selected) runAction('focus', snapshot.selected); break;
      case 'follow': runAction('follow', !snapshot?.follow); break;
      case 'unfollow': runAction('follow', false); break;
      case 'inspect-tool': runAction('setTool', 'inspect'); break;
      case 'dismiss-hint': hintDismissed = true; $('map-hint').hidden = true; break;
      case 'open-inspector': document.body.classList.add('inspector-open'); break;
      case 'close-inspector':
        if (mobile.matches) document.body.classList.remove('inspector-open');
        else runAction('select', null);
        break;
      case 'world-overview': runAction('select', null); if (mobile.matches) document.body.classList.add('inspector-open'); break;
      case 'toggle-chronicle': {
        const collapsed = document.querySelector('.chronicle').classList.toggle('collapsed');
        button.setAttribute('aria-expanded', String(!collapsed));
        button.setAttribute('aria-label', collapsed ? 'Kroniği genişlet' : 'Kroniği küçült');
        button.title = collapsed ? 'Kroniği genişlet' : 'Kroniği küçült';
        break;
      }
    }
  }, { signal });

  document.addEventListener('pointerdown', function (event) {
    if (saveMenu.open && !saveMenu.contains(event.target)) saveMenu.open = false;
  }, { signal });
  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    if (event.key.toLowerCase() === 'h' || event.key === '?') { event.preventDefault(); dialogOpen('help-dialog'); }
  }, { signal });
  document.querySelectorAll('dialog').forEach(function (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    }, { signal });
  });
  $('overlay-select').addEventListener('change', function (event) { runAction('setOverlay', event.target.value); }, { signal });
  $('event-filter').addEventListener('change', function (event) { eventFilter = event.target.value; renderChronicle(); chronicle.scrollTop = 0; }, { signal });
  $('world-population').addEventListener('input', function (event) { setText('population-output', format(event.target.value) + ' kişi'); }, { signal });
  $('world-aggression').addEventListener('input', updateAggressionLabel, { signal });
  $('save-file-input').addEventListener('change', function (event) {
    const file = event.target.files?.[0];
    if (file) runAction('importSave', file);
    event.target.value = '';
  }, { signal });
  $('new-world-form').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    const form = new FormData(event.target);
    const [width, height] = String(form.get('size')).split('x').map(Number);
    runAction('newWorld', { seed: String(form.get('seed')).trim(), population: number(form.get('population'), 96), climate: String(form.get('climate')), aggression: number(form.get('aggression'), 1), width: number(width, 88), height: number(height, 64), maxPopulation: 500 });
    $('new-world-dialog').close();
    document.body.classList.remove('inspector-open');
  }, { signal });
  $('minimap').addEventListener('click', function (event) {
    if (!current?.world) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * current.world.width;
    const y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1) * current.world.height;
    runAction('follow', false);
    runAction('focus', { x: Math.min(current.world.width - .5, x), y: Math.min(current.world.height - .5, y) });
  }, { signal });
  $('minimap').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { event.preventDefault(); runAction('fitWorld'); }
  }, { signal });

  // A live inspector updates four times a second. Preserve the user's scroll and
  // keyboard focus whenever its data changes, rather than replacing their place.
  function replaceInspector(markup) {
    if (markup === inspectorMarkup) return;
    const scroll = inspector.scrollTop;
    const active = inspector.contains(document.activeElement) ? document.activeElement.closest('[data-focus-key]') : null;
    const focusKey = active?.dataset.focusKey;
    inspector.innerHTML = markup;
    inspectorMarkup = markup;
    inspector.scrollTop = scroll;
    if (focusKey) {
      const replacement = [...inspector.querySelectorAll('[data-focus-key]')].find(function (element) { return element.dataset.focusKey === focusKey; });
      replacement?.focus({ preventScroll: true });
    }
  }
  function renderInspector() {
    if (!current?.world) return;
    const { world, stats = {}, selected } = current;
    const key = selected ? selected.type + ':' + (selected.id ?? (selected.x + ',' + selected.y)) : '';
    if (key !== selectionKey) {
      const hadSelection = Boolean(selectionKey);
      selectionKey = key;
      inspectorMarkup = '';
      inspector.scrollTop = 0;
      if (mobile.matches && selected) document.body.classList.add('inspector-open');
      else if (mobile.matches && hadSelection && !selected) document.body.classList.remove('inspector-open');
    }
    let name = 'Dünyanın nabzı';
    let eyebrow = 'GÖZLEM DEFTERİ';
    let markup = '';
    let selectedPerson = null;
    if (selected?.type === 'agent') {
      selectedPerson = list(world.agents).find(function (agent) { return sameId(agent.id, selected.id); });
      if (selectedPerson) {
        name = selectedPerson.name || 'İsimsiz bir hayat';
        eyebrow = 'BİR HAYATIN HİKÂYESİ';
        markup = personInspector(selectedPerson, world, current);
      }
    } else if (selected?.type === 'settlement') {
      const settlement = list(world.settlements).find(function (item) { return sameId(item.id, selected.id); });
      if (settlement) { name = settlement.name || 'İsimsiz yerleşim'; eyebrow = 'BİR TOPLULUĞUN HİKÂYESİ'; markup = settlementInspector(settlement, world); }
    } else if (selected?.type === 'building') {
      const building = list(world.buildings).find(function (item) { return sameId(item.id, selected.id); });
      if (building) {
        name = label(BUILDING, building.type);
        eyebrow = 'BİR YAPININ HİKÂYESİ';
        const tile = world.tiles?.[Math.floor(number(building.y)) * world.width + Math.floor(number(building.x))];
        markup = tileInspector(tile, world, building);
      }
    } else if (selected?.type === 'tile') {
      const tile = world.tiles?.[Math.floor(number(selected.y)) * world.width + Math.floor(number(selected.x))];
      name = BIOME[tile?.biome]?.[0] || 'Dünyadan bir parça';
      eyebrow = 'TOPRAĞIN HİKÂYESİ';
      markup = tileInspector(tile, world);
    }
    if (!markup) markup = overview(world, stats);
    setText('inspector-title', name);
    setText('inspector-eyebrow', eyebrow);
    setText('mobile-inspector-label', selected ? name : 'Dünya defteri');
    const close = $('inspector-close');
    close.style.visibility = !selected && !mobile.matches ? 'hidden' : 'visible';
    close.setAttribute('aria-label', mobile.matches ? 'Dünya defterini kapat' : 'Seçimi temizle ve dünya özetine dön');
    replaceInspector(markup);
    if (selectedPerson && !portraitFailure) {
      const canvas = $('person-portrait');
      if (canvas) {
        try { drawPortrait(canvas.getContext('2d'), selectedPerson, 80, performance.now() / 1000); }
        catch (error) { portraitFailure = true; console.error('Villages portrait could not be drawn', error); }
      }
    }
  }
  function renderChronicle() {
    if (!current?.world) return;
    const events = list(current.world.events).slice().reverse().sort(function (a, b) { return number(b.day) - number(a.day); });
    const allowed = EVENT_FILTER[eventFilter];
    visibleEvents = events.filter(function (event) { return !allowed || allowed.includes(event.type); }).slice(0, 60);
    setText('chronicle-count', format(visibleEvents.length) + ' olay');
    const markup = visibleEvents.length ? visibleEvents.map(function (event, index) {
      const type = Object.hasOwn(EVENT_ICON, event.type) ? event.type : 'info';
      const hasAgent = event.agentId != null && list(current.world.agents).some(function (agent) { return sameId(agent.id, event.agentId); });
      const hasSettlement = event.settlementId != null && list(current.world.settlements).some(function (settlement) { return sameId(settlement.id, event.settlementId); });
      const focusable = hasAgent || hasSettlement || (hasNumber(event.x) && hasNumber(event.y));
      const tag = focusable ? 'button' : 'article';
      return '<' + tag + ' class="chronicle-event"' + (focusable ? ' data-event-id="' + escapeHtml(event.id) + '"' : '') + ' title="' + escapeHtml(fullDate(event.day) + (event.description ? ' · ' + event.description : '')) + '"><span class="event-time">' + escapeHtml(eventDate(event.day)) + '</span><span class="event-symbol ' + type + '">' + icon(EVENT_ICON[type]) + '</span><span class="event-text"><span class="event-title">' + escapeHtml(event.title || 'Dünyadan bir haber') + '</span>' + (event.description ? '<span class="event-description" style="display:block">' + escapeHtml(event.description) + '</span>' : '') + '</span><span class="event-focus">' + (focusable ? icon('arrow-up-right') : '') + '</span></' + tag + '>';
    }).join('') : '<div class="empty-chronicle">' + icon('sprout') + '<span>' + (eventFilter === 'all' ? 'Dünya yeni uyandı. İlk hikâyeler birazdan başlayacak.' : 'Bu türde henüz kayda geçen bir olay yok.') + '</span></div>';
    if (markup !== chronicleMarkup) {
      const scroll = chronicle.scrollTop;
      const focusId = chronicle.contains(document.activeElement) ? document.activeElement.dataset.eventId : null;
      chronicle.innerHTML = markup;
      chronicleMarkup = markup;
      chronicle.scrollTop = scroll;
      if (focusId != null) [...chronicle.querySelectorAll('[data-event-id]')].find(function (element) { return sameId(element.dataset.eventId, focusId); })?.focus({ preventScroll: true });
    }
  }
  function update(snapshot) {
    if (destroyed) return;
    current = snapshot || getSnapshot();
    if (!current?.world) return;
    const { world, stats = {}, speed = 1, paused = false, selected, tool = 'inspect', overlay = 'natural', follow = false, soundEnabled = false } = current;
    const population = number(stats.population, list(world.agents).length);
    setText('seed-name', world.seed || 'İsimsiz dünya');
    $('seed-name').title = String(world.seed || '');
    setText('stat-population', format(population));
    setText('stat-settlements', format(stats.settlements ?? list(world.settlements).length));
    setText('stat-food', format(stats.food));
    setText('stat-happiness', format(stats.happiness) + '%');
    const change = number(stats.births) - number(stats.deaths);
    setText('population-trend', change ? (change > 0 ? '+' : '') + format(change) : '');
    $('population-trend').classList.toggle('negative', change < 0);
    const season = SEASON[world.season] || SEASON[seasonAt(world.day)];
    setText('calendar-year', 'Yıl ' + format(world.year || Math.floor(number(world.day) / 96) + 1) + ' · ' + season[0]);
    setText('calendar-day', format(Math.floor(number(world.day) % 24) + 1) + '. gün');
    setIcon($('season-icon'), season[1]);
    const pause = $('pause-button');
    setIcon(pause, paused ? 'play' : 'pause');
    pause.setAttribute('aria-label', paused ? 'Simülasyonu sürdür' : 'Simülasyonu duraklat');
    pause.setAttribute('aria-pressed', String(paused));
    document.querySelectorAll('[data-speed]').forEach(function (button) {
      const active = number(button.dataset.speed) === number(speed);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-tool]').forEach(function (button) {
      const active = button.dataset.tool === tool;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if ($('overlay-select').value !== overlay) $('overlay-select').value = overlay;
    $('live-badge').classList.toggle('paused', paused);
    setText('live-label', paused ? 'ZAMAN DURDU' : 'CANLI DÜNYA');
    const weather = WEATHER[world.weather?.type] || WEATHER.clear;
    const weatherMarkup = icon(weather[1]) + '<span>' + escapeHtml(weather[0]) + '</span>' + (Number.isFinite(Number(world.weather?.temperature)) ? '<span class="weather-temperature">' + format(world.weather.temperature) + '°</span>' : '');
    if ($('map-weather').innerHTML !== weatherMarkup) $('map-weather').innerHTML = weatherMarkup;
    $('map-weather').hidden = tool !== 'inspect';
    $('active-tool-banner').hidden = tool === 'inspect' || !TOOL_TEXT[tool];
    setText('active-tool-text', TOOL_TEXT[tool] || '');
    $('selection-follow-chip').hidden = !follow || !selected;
    const followedPerson = selected?.type === 'agent' ? list(world.agents).find(function (agent) { return sameId(agent.id, selected.id); }) : null;
    setText('follow-label', followedPerson ? (followedPerson.name || 'Seçili kişi') + ' izleniyor' : 'Seçim izleniyor');
    $('map-hint').hidden = hintDismissed || Boolean(selected) || tool !== 'inspect' || follow;
    setText('performance-status', Number.isFinite(Number(current.fps)) ? format(current.fps) + ' fps' : '');
    const sound = $('sound-button');
    setIcon(sound, soundEnabled ? 'sound' : 'sound-off');
    sound.setAttribute('aria-pressed', String(soundEnabled));
    sound.setAttribute('aria-label', soundEnabled ? 'Ortam sesini kapat' : 'Ortam sesini aç');
    sound.title = soundEnabled ? 'Ortam sesi açık' : 'Ortam sesi kapalı';
    if (current.saving) setText('save-status', 'Kaydediliyor…');
    else if (current.lastSaved) {
      const date = new Date(current.lastSaved);
      setText('save-status', Number.isFinite(date.getTime()) ? 'Son kayıt ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Dünyan kaydedildi');
    }
    else setText('save-status', 'Hikâyene sonra devam et');
    renderInspector();
    renderChronicle();
  }
  function destroy() {
    destroyed = true;
    abort.abort();
    timers.forEach(clearTimeout);
    timers.clear();
    document.querySelectorAll('dialog[open]').forEach(function (dialog) { dialog.close(); });
    $('toast-region').replaceChildren();
    document.body.classList.remove('inspector-open');
  }

  update();
  return { update, toast, destroy };
}
