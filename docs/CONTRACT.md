# Teknik sözleşme ve geliştirme noktaları

Villages; çalışma zamanında bağımlılığı olmayan ES modülleri, Canvas 2D ve tarayıcı API'lerinden oluşur. Simülasyon DOM'a bağımlı değildir. Node içinde aynı motorla test, uzun koşu veya kayıt analizi yapılabilir.

## Modül sınırları

| Modül | Sorumluluk |
|---|---|
| `src/sim/random.js` | Tohumdan başlayan, durumu kaydedilebilir rastgele sayı üreteci |
| `src/sim/worldgen.js` | Arazi, biyomlar, kaynaklar, geçitler ve bağlı kara bölgeleri |
| `src/sim/model.js` | Varlık üretimi, kimlikler, genetik, deneyim, olaylar ve sabitler |
| `src/sim/navigation.js` | Kaynak araması, doğrudan yol denetimi ve sınırlı A* |
| `src/sim/ecosystem.js` | İklim, kaynak yenilenmesi, tarla, yangın ve hayvanlar |
| `src/sim/engine.js` | İhtiyaçlar, eylemler, üretim, toplum, aile, göç ve diplomasi |
| `src/render/sprites.js` | Ortak piksel çizimleri ve sınırlı sprite atlası |
| `src/render/renderer.js` | Dünya katmanları, kamera, pointer etkileşimi ve minimap |
| `src/ui/ui.js` | Durumdan üretilen arayüz, defter, kronik, form ve kontroller |
| `src/persistence.js` | Kayıt zarfı, sürüm, doğrulama, JSON ve iki depolama yuvası |
| `src/audio.js` | İstek üzerine açılan, tarayıcıda sentezlenmiş ortam sesi |
| `src/main.js` | Sabit adım döngüsü, modüllerin bağlantısı, kayıt ve kısayollar |

Çizici veya arayüz, simülasyonun RNG'sini tüketmez ve dünya verisini değiştirmez. Kullanıcı işlemleri `main.js` eylemlerine, dünyayı değiştiren müdahaleler motor API'sine gider. Arayüz verileri yaklaşık saniyede dört kez yenilenir; harita ayrı animasyon döngüsünde çizilir.

## Motor API'si

`src/sim/engine.js` şu dışa aktarımları sunar:

```js
createWorld(options = {})
stepWorld(world, dt = 0.1)
getStats(world)
applyIntervention(world, type, x, y, options = {})
restoreWorld(data)
getTile(world, x, y)
DAYS_PER_YEAR
DAYS_PER_SEASON
```

`createWorld` seçenekleri `seed`, `width`, `height`, `population`, `climate`, `aggression`, `maxPopulation` alanlarıdır. Motor boyutları 40–160 × 32–112, nüfusu 0–500 aralığına sınırlar. Arayüz daha küçük bir başlangıç seçenek kümesi sunar. İklim `balanced`, `lush` veya `dry`; saldırganlık 0–3 aralığındadır.

`stepWorld`, `(0, 1]` aralığında simülasyon günü kabul eder ve dünyayı yerinde değiştirir. Uygulama daima `0.1` kullanır. Farklı adım büyüklüklerinin aynı davranış dizisini üretmesi beklenmez. Tekrarlanabilirlik için aynı sürüm, başlangıç seçenekleri ve aynı sırada sabit adımlar kullanılmalıdır.

Adımda hayvanlar, geçici etkiler ve insanlar ilerler; ölenler ayrılır. Yeni gün tamamlandığında ekosistem, yerleşim kuruluşu ve gelişimi, nüfus, diplomasi ve göç değerlendirilir. Tarih örneği bu işlemlerden sonra gerçek sayaçlardan alınır. Sonuçlar görüntüleme saatinden türetilmez.

`applyIntervention` için `rain`, `food`, `trees`, `settlers`, `fire` gerçek değişiklik uygular ve `{ ok, changed, message }` döndürür. `inspect` yalnız hücreyi döndürür. Hücre koordinatları harita birimindedir. `getTile`, dışarıda veya sonlu olmayan koordinatlarda `null` döndürür.

`restoreWorld` motorun yapısal önkoşullarını denetler ve geçici önbellekleri sıfırlar. Harici JSON için önce `decodeSave` kullanılmalıdır; `restoreWorld` tek başına tam dosya doğrulayıcısı değildir.

### Başsız kullanım

```js
import { createWorld, stepWorld, getStats } from './src/sim/engine.js';
import { encodeSave, decodeSave } from './src/persistence.js';

const world = createWorld({ seed: 'bereket', population: 192, climate: 'lush' });
for (let i = 0; i < 60000; i++) stepWorld(world, 0.1);
console.log(getStats(world));
const portable = encodeSave(world, { speed: 25, overlay: 'natural' });
const checked = decodeSave(portable);
```

## Dünya verisi

Dünya JSON ile tam olarak ifade edilir; kaydın içinde fonksiyon, DOM düğümü, `Map` veya `Set` yoktur. Çalışma zamanı mekânsal önbellekleri `WeakMap` içinde, kayıt dışında tutulur.

- **Zaman ve yürütme:** `version`, `seed`, `tick`, `day`, `year`, `season`, `rngState`, `nextId`, `lastDailyDay`, `weather`, `config`.
- **Arazi:** `tiles[y * width + x]`. Hücreler konum, biyom, yükseklik, nem, verim, kaynaklar, yol, yanma ve kara bölgesi taşır. Yükseklik deniz tabanında negatif olabilir. Kaynaklar negatif olamaz; `trees` sürekli biyokütledir.
- **İnsanlar:** `agents`; gerçek yaş, 0–100 ihtiyaçlar, 12 mesleğin becerisi, seviye, görünüm, kişilik, envanter, aile ve yerleşim referansları. `action` hedef ve çalışma ilerlemesini; `path` ve `pathIndex` gerçek yolculuğu; `pendingAction` moladan sonra sürülecek görevi taşır.
- **Yerleşimler:** `settlements`; nüfus, evre, stok, üretim, altı bilgi alanı, refah, toplumsal uyum, ilişkiler ve lider. `stage`, `camp / hamlet / village / town / city` değerlerinden biridir. Sıfır nüfuslu yerleşimler harita tarihinin parçası olarak kalabilir.
- **Yapılar ve tarlalar:** `buildings`, `farms`; ayrı ilerleme, sağlık, kullanım ve sahiplik alanları. Yapı ve tarla konumları tamsayı hücreleridir; çizim merkezi `x + 0.5, y + 0.5` olur. İnsan konumları kesirlidir.
- **Yaşam ve tarih:** `animals`, `events`, `history`, `effects`, `graves`, `metrics`. Olaylar 180, grafik örnekleri 720, mezarlar 180, geçici efektler 100 kayıtla sınırlıdır. Toplam sayaçlar ayrı tutulur.

Kimlikler ortak ve artan bir sayısal diziden üretilir. `nextId`, saklanan bütün varlık ve tarihsel bağlantı kimliklerinin üzerinde olmalıdır. Mezar kimliği, ölen insanın eski kimliğidir; yeni bir insan veya bağımsız varlık kimliği değildir.

Açlıkta **yüksek değer kötü**, sağlık/enerji/moralde yüksek değer iyidir. Arayüz tokluğu `100 - hunger` olarak gösterir. Yaş yıl, motor adımı gün cinsindedir. Yönler `0: kuzey, 1: doğu, 2: güney, 3: batı` olarak tutulur.

## Çizim ve arayüz API'leri

```js
const renderer = new WorldRenderer(canvas, {
  onSelect, onHover, onPaint, onCameraChange,
});
renderer.setWorld(world);
renderer.render(world, { time, alpha, selected, overlay, tool, follow, paused });
renderer.drawMinimap(minimapCanvas, world, selected);
renderer.focus(x, y, zoom);
renderer.zoomBy(factor);
renderer.fitWorld();
renderer.resize();
renderer.destroy();
```

`time` animasyon için saniyedir. Seçim `{ type: 'agent' | 'settlement' | 'building', id }`, `{ type: 'tile', x, y }` veya `null` olur. Katmanlar `natural`, `territory`, `fertility`, `resources`, `danger`; araçlar `inspect`, `rain`, `food`, `trees`, `settlers`, `fire` değerleridir. Kamera kullanıcı tarafından taşındığında `onCameraChange` içindeki `userInput` takibi bırakmak için kullanılır.

Zemin önbelleğe alınır. Yakın görünümde çevre ve varlıklar Y konumuna göre çizilir; tam haritada doğal çevre ayrı bir önbellek katmanındadır. Seviye, meslek, yaş, görünüm ve hareket değişkenleri sprite anahtarında yer alır. Atlas 4.800 öğede sınırlandırılır. `drawPortrait(ctx, agent, size, time)` aynı insan çizimini defterde kullanır.

```js
const ui = createUI({ getSnapshot, actions });
ui.update(snapshot);
ui.toast(message, type);
ui.destroy();
```

Snapshot: `{ world, stats, speed, paused, selected, overlay, tool, follow, fps, lastSaved, lastAutosaved, saving, soundEnabled }`.

Eylemler: `setSpeed`, `togglePause`, `step`, `setOverlay`, `setTool`, `select`, `focus`, `follow`, `newWorld`, `save`, `load`, `loadAutosave`, `exportSave`, `importSave`, `zoomIn`, `zoomOut`, `fitWorld`, `toggleSound`. `importSave` bir `File` alır. Arayüz bağımsız bir simülasyon döngüsü başlatmaz. Dışarıdan gelen metinler HTML'e eklenmeden önce kaçışlanır.

## Kayıt zarfı ve devamlılık

Kayıt biçimi `{ format: 'villages-world', version: 1, savedAt, view, world }` yapısındadır. `view` hız ve harita katmanını taşır. Dosya sınırı 16 MB'dir. Boyut, sürüm, sonlu sayılar, diziler, konumlar, ihtiyaçlar, stoklar, yollar, aileler, kimlikler ve sayaçlar canlı dünya değiştirilmeden önce doğrulanır.

Elle kayıt `villages.world.v1`, otomatik kayıt `villages.autosave.v1` anahtarındadır. Yeniden yüklemede geçen gerçek dünya saati simülasyona eklenmez. Kaydedilmiş dünya duraklatılarak açılır; kaydedilen rastgelelik ve süreç durumundan devam eder.

## Yeni sistem ekleme

Yeni bir kaynak veya meslek eklemek; modelde alanı tanımlamayı, üretim/tüketim kurallarını, ihtiyaç ağırlıklarını, kayıt doğrulamasını, defter etiketlerini ve ilgili piksel eylemini birlikte güncellemeyi gerektirir. Kaynak artışının girdisini ve kaynağın nereye taşındığını açıkça belirle. Günlük veya adımlık sürece eklerken RNG çağrı sırasının mevcut tohum sonuçlarını değiştirebileceğini hesaba kat.

Yeni kayıt alanı eklenirse alanın devam eden bir süreci etkileyip etkilemediğini değerlendir. Gerekirse kayıt sürümünü ve açık bir göç dönüşümünü ekle. `Math.random`, render kare sayısı veya gerçek saatten simülasyon kararı üretme. Anlamlı testler; kaynak/nüfus muhasebesini, fiziksel ulaşılabilirliği, kayıt devamını ve yeni kuralın olumlu/olumsuz koşullarını denetlemelidir.
