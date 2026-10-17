# Villages

[English](#english) · [Türkçe](#türkçe)

<a id="english"></a>

## English

**Small lives, big stories.** Villages is a living, pixel-art civilization simulation that runs entirely in your browser.

People gather food, get tired, rest, learn, form families, and grow old. Surplus production can give rise to settlements, while pressure on resources can trigger migration or conflict. There is no scripted quest line: individual rules and actions change the conditions faced by everyone else.

![The settlement of Korudere in the Söğüt Vadisi world on simulation day 480; actual in-game rendering](assets/preview.png)

*An actual simulation snapshot: `Söğüt Vadisi`, day 480. No buildings or characters were manually placed for this preview.*

[View the live interface and Korudere inspector screenshot.](assets/interface-1792233917993.jpg)

### What happens in this world?

- **Distinct individuals:** Names, family relationships, seven inherited dispositions, inventories, health, hunger, energy, social needs, and morale. Children can inherit aspects of their parents' appearance and dispositions.
- **Visible life stages:** Babies, children, teenagers, adults, and elders have distinct body proportions and stances. Clothing details evolve across 20 levels, with bags, cloaks, and equipment appearing as characters gain experience.
- **Twelve occupations:** Gatherer, farmer, lumberjack, miner, fisher, hunter, builder, blacksmith, healer, trader, warrior, and scholar. Work choices respond to needs, supplies, experience, and local opportunities. A person can acquire skills in multiple professions.
- **Real resource flows:** Resources are removed from terrain, carried by people, and deposited in settlements. Houses require materials and labor; tools increase productivity but wear down. Food is consumed or spoils. Traders physically carry their cargo.
- **Emergent communities:** Proximity, adult population, work experience, fertile terrain, and shared food can create a communal camp. Housing, specialization, infrastructure, and accumulated knowledge unlock hamlets, villages, towns, and cities. Settlements can regress when conditions deteriorate.
- **Families and generations:** Adults' partnerships, adequate food, and living conditions influence the probability of childbirth. Pregnancy takes time. The inspector tracks living family members, parents, children, and generations.
- **Migration, trade, and war:** Hunger, housing shortages, conflicts, and curiosity can drive migration. Trading settlements exchange trust and knowledge. Border pressure, scarcity, and tensions can lead to warfare; exhaustion and losses can eventually lead to peace.
- **Living ecosystems:** Seeded rivers, crossings, shores, forests, hills, and mountains. Four seasons, rain, snow, drought, fire, irrigation, growing crops, and finite resources. Deer, boar, and wolves have their own feeding, movement, and reproduction cycles.
- **Thirteen buildings:** Communal hearth, hut, house, granary, well, lumberyard, mine, workshop, market, barracks, watchtower, town hall, and shrine. Construction clears real terrain, and fires can leave damaged structures.

Detailed mechanics and civilization thresholds are described in [Simulation rules](docs/SIMULATION.md) (Turkish).

### Observer's desk

Click a person, building, settlement, or tile to inspect it. Follow individuals to watch their needs, jobs, skills, possessions, and families. Settlement journals reveal resources, knowledge, relationships, and residents. The chronicle and population chart come from actual simulation data.

Alongside the natural map, switch between **civilization borders, soil fertility, natural resources, and danger** overlays. The atlas and camera controls help you navigate large worlds. On mobile, the inspector is a slide-up panel and the map supports dragging and pinch-to-zoom.

You can intervene by adding rain, food, trees, new people, or fire. Interventions alter the same terrain and resources as the simulation, so subsequent outcomes still emerge from the rules. Optional ambient wind and bird sounds are synthesized in the browser.

### Language / Dil

Use the **TR / EN** selector in the top bar to switch the interface between Turkish and English without restarting the simulation. The preference is saved in your browser and, when no saved preference exists, defaults to the browser's language. This changes only presentation; world state, deterministic random state, and save files are unchanged. Previously saved Turkish chronicle entries are translated for display where their templates are recognized; player-entered names and seed strings are left intact.

### Time and controls

A year lasts **96 simulation days**, and a season lasts **24 days**. At `1×`, the target rate is one simulation day per real second. `2×`, `5×`, `10×`, and `25×` let you watch generations evolve faster. Actual performance may vary with device speed; the simulation does not advance while the tab is in the background.

| Control | Action |
|---|---|
| Click / tap | Inspect a person, structure, settlement, or tile |
| Drag | Pan the map |
| Mouse wheel / pinch | Zoom in and out |
| `Space` | Pause / resume |
| `1` – `5` | Select 1×, 2×, 5×, 10×, or 25× speed |
| `.` | Pause and advance by 0.1 simulation day |
| `+` / `−` | Zoom in / out |
| `F` | Follow selected person |
| `C` | Fit the whole world |
| `Esc` | Clear selection and return to inspect tool |
| `H` / `?` | Open the observer's guide |

Shortcuts do not intercept typing in forms or open dialogs.

### Saves and new worlds

**Manual and automatic saves occupy separate slots.** While the world is running, an autosave is taken about every 30 seconds and when leaving the page. A normal reload restores the last autosave in a paused state. Creating a new world does not erase the manual save; both can be loaded independently.

JSON export/import preserves the complete world state, families, ongoing tasks, trading trips, and random generator state. Imports are validated. If browser storage is unavailable, you can export a portable JSON backup. Clearing the browser's site data also removes local saves.

The new-world dialog lets you choose seed, initial population, map dimensions, climate, and aggression. The initial population range is 24–192; the living-population cap is 500. You may open a seeded new world using `?seed=Ardic` in the URL, but a seed link is not a replacement for a save file. With the same engine version, settings, and interventions in the same order, simulation results are deterministic.

### Run locally

Requires **Node.js 24+** for development tooling. No external npm packages need to be installed.

```bash
npm run dev
```

Open `http://localhost:4173`. Because the app uses ES modules, serve it over HTTP rather than opening `index.html` directly with `file://`.

```bash
npm run check
npm test
npm run build
```

The build copies self-contained static assets to `dist/` and validates local paths. No server API, accounts, secrets, CDN, or external fonts are needed at runtime. Relative asset paths make subdirectory hosting possible; the repository root can also be served statically without building.

### Pixel art

Every game sprite is drawn pixel by pixel on Canvas specifically for this project—no third-party sprite sheets or emoji assets. The same drawing system powers gameplay, character portraits, and the visual catalog.

The character renderer combines eight skin tones, ten hair tones, ten hairstyles, twelve clothing palettes, eight accent colors, and sixteen body/clothing variants with age, gender, profession, orientation, action, and level details. Animations reflect actual actions: a character walking to work does not start chopping wood or mining before arriving.

With the development server running, visit `/docs/assets-preview.html` to inspect age groups, appearance variations, occupation animations, all 20 levels, and building construction stages. The catalog is included in static builds.

### Verification and development

Node's built-in test runner covers deterministic world generation, river crossings, unreachable areas, genetics, ancestry, seasonal boundaries, causes of death, war damage, population caps, interventions, and malformed saves. A longer simulation test runs for **3,000 simulation days**, then saves and restores the mature world and checks that decisions and events continue identically.

GitHub Actions runs syntax/import checks, automated tests, and static builds on changes. The interface has also been manually checked on desktop and narrow screens. Architecture, APIs, and integration points are documented in the [Technical contract](docs/CONTRACT.md) (Turkish).

### Design limitations

Villages is a rule-based toy world, **not** a scientific predictor of human behavior or historical civilizations. Characters do not use LLMs; needs, weighted probabilities, local relationships, and pathfinding drive their actions. A particular seed is not guaranteed to develop a city, war, or indefinitely growing population. Communities can die out.

The simulation runs in a single browser tab on your device. There is no multiplayer server or cloud save synchronization, and no maritime transport. Recent events, chart samples, and memorial records are bounded to limit long-running memory use. Performance depends on your device, especially with large maps, high speed, and a 500-person population.

---

<a id="türkçe"></a>

## Türkçe

**Küçük hayatlar, büyük hikâyeler.** Tarayıcıda yaşayan, tamamen piksel sanatıyla çizilmiş bir medeniyet simülasyonu.

İnsanlar yiyecek arar, yorulur, dinlenir, öğrenir, aile kurar ve yaşlanır. Birlikte ürettikleri fazlalık yerleşimlere dönüşebilir; kaynak baskısı göçe veya çatışmaya yol açabilir. Hikâyeyi belirleyen bir görev dizisi yoktur. Aynı çevrede çalışan bireysel kurallar birbirlerinin koşullarını değiştirir.

![Söğüt Vadisi dünyasında 480. simülasyon günündeki Korudere yerleşimi; gerçek oyun çizimi](assets/preview.png)

*Gerçek simülasyondan bir an: `Söğüt Vadisi`, 480. gün. Önizleme için binalar veya karakterler elle yerleştirilmedi.*

[Çalışan oyun arayüzünü ve Korudere gözlem defterini görüntüle.](assets/interface-1792233917993.jpg)

## Dünyada neler oluyor?

- **Birbirinden farklı insanlar:** İsimler, aile bağları, yedi kalıtsal eğilim, kişisel envanter, sağlık, açlık, enerji, sosyal ihtiyaç ve moral. Çocukların görünüşleri ve eğilimleri ebeveynlerinden izler taşır.
- **Gözle görülen bir ömür:** Bebek, çocuk, genç, yetişkin ve yaşlı için farklı beden oranları ve duruşlar. Yirmi seviyenin her birinde değişen kıyafet işlemesi; ilerleyen ustalıkla çanta, pelerin ve ekipman ayrıntıları.
- **On iki iş:** Toplayıcı, çiftçi, oduncu, madenci, balıkçı, avcı, inşaatçı, demirci, şifacı, tüccar, savaşçı ve bilgin. İşler ihtiyaç, malzeme, tecrübe ve çevredeki olanaklara göre ağırlık kazanır. Bir insan yaşamı boyunca farklı işlerde deneyim kazanabilir.
- **Gerçek kaynak akışı:** Kaynak araziden azalır, birinin envanterine girer ve yerleşime taşınır. Evler malzeme ve emek ister. Aletler üretimi artırır ve yıpranır; yiyecek tüketilir ve depoda bozulur. Tüccarlar yüklerini fiziksel olarak taşır.
- **Koşullardan doğan topluluklar:** Yakınlık, yetişkin nüfus, üretim deneyimi, verimli arazi ve ortak erzak bir obanın temelini oluşturur. Konut, iş bölümü, altyapı ve bilgi birikimi mezra, köy, kasaba ve kent evrelerini açar. Kapasite kaybolursa yerleşim gerileyebilir.
- **Aileler ve kuşaklar:** Yetişkin eşler, yeterli beslenme ve yaşam koşulları doğum olasılığını etkiler. Gebelik zaman alır. Bebeklerin bakımı, yaşayan aile üyeleri, kuşak numarası ve çocuklar kişi defterinden izlenebilir.
- **Göç, ticaret ve savaş:** Kıtlık, barınma sıkıntısı, çatışma ve bazı bireylerin merakı aileleri yola çıkarabilir. Yerleşimler ticaretle güven ve bilgi kazanır. Bölge baskısı, kıtlık ve gerginlik savaşa; yorgunluk ve kayıplar barışa yol açabilir.
- **Yaşayan çevre:** Tohumdan üretilen nehirler, geçitler, kıyılar, ormanlar, tepeler ve dağlar. Dört mevsim, yağmur, kar, kuraklık, yangın, sulama, büyüyen ekinler ve sınırlı kaynaklar. Geyik, yaban domuzu ve kurtların da beslenme, hareket ve üreme döngüleri vardır.
- **On üç yapı:** Ortak ocak, kulübe, ev, ambar, kuyu, oduncu alanı, maden, atölye, pazar, kışla, gözetleme kulesi, yönetim evi ve tapınak. İnşaat sırasında arazi gerçekten temizlenir; yangınlar yapıları kullanılmaz hale getirebilir.

Mekaniklerin ayrıntıları ve medeniyet eşikleri [Simülasyon kuralları](docs/SIMULATION.md) belgesinde açıklanıyor.

## Gözlemci masası

Haritada bir kişiye, yapıya veya yere tıklayarak ayrıntılarını aç. Bir insanı takip edip ihtiyaçlarını, işini, ustalığını, eşyalarını ve ailesini izle. Yerleşim defteri stokları, bilgi birikimini, ilişkileri ve sakinleri gösterir. Dünya kroniğindeki olaylar ve nüfus grafiği gerçek simülasyon durumundan üretilir.

Doğal görünümün yanında **medeniyet sınırları, toprak verimliliği, doğal kaynaklar ve tehlike** katmanları bulunur. Atlas ve kamera kontrolleri büyük haritalarda gezinmeyi kolaylaştırır. Mobilde ayrıntı defteri açılır bir paneldir; harita sürükleme ve iki parmakla yakınlaştırmayı destekler.

Dünyaya müdahale etmek istersen yağmur, yiyecek, ağaç, yeni insanlar ve ateş araçlarını kullanabilirsin. Müdahaleler aynı araziyi ve aynı kaynakları değiştirir; sonuçlar yine simülasyon kurallarından doğar. Ortam sesi istek üzerine açılır; rüzgâr ve kuş sesleri tarayıcıda sentezlenir.

### Zaman ve kontroller

Bir yıl **96**, bir mevsim **24 simülasyon günü** sürer. `1×` hız hedefi gerçek bir saniyede bir simülasyon günüdür. `2×`, `5×`, `10×` ve `25×` seçenekleri nesillerin değişimini izlemeyi kolaylaştırır. Düşük performanslı cihazlarda gerçek ilerleme hızı hedefin altında kalabilir; arka plandaki sekmede zaman ilerlemez.

| Kontrol | İşlev |
|---|---|
| Tıkla / dokun | İnsan, yapı, yerleşim veya araziyi incele |
| Sürükle | Haritada gezin |
| Fare tekerleği / iki parmak | Yakınlaştır ve uzaklaştır |
| `Boşluk` | Duraklat / sürdür |
| `1` – `5` | Sırasıyla 1×, 2×, 5×, 10×, 25× |
| `.` | Duraklatıp 0,1 simülasyon günü ilerlet |
| `+` / `−` | Yakınlaştır / uzaklaştır |
| `F` | Seçili kişiyi takip et |
| `C` | Bütün dünyayı göster |
| `Esc` | Seçimi temizle ve gözlem aracına dön |
| `H` / `?` | Gözlemci rehberini aç |

Form alanları ve açık diyaloglarda oyun kısayolları yazmayı engellemez.

### Kayıt ve yeni dünyalar

**Elle kayıt ve otomatik kayıt ayrı yuvalardır.** Otomatik kayıt, dünya çalışırken yaklaşık 30 saniyede bir ve sekmeden ayrılırken alınır. Normal sayfa yenilemesi son otomatik kaydı duraklatılmış halde geri getirir. Yeni bir dünya, elle sakladığın dünyayı silmez; menüden her iki kayıt ayrı ayrı açılabilir.

JSON dışa aktarma/içe aktarma bütün dünya durumunu, aileleri, süren işleri, ticaret yolculuklarını ve rastgele sayı üretecinin durumunu taşır. Dosya yüklenmeden önce doğrulanır. Tarayıcı depolaması kapalı veya doluysa dosya olarak dışa aktarabilirsin. Tarayıcı verilerinin silinmesi yerel kayıtları da siler; JSON dosyası taşınabilir yedektir.

Yeni dünya penceresinde tohum, başlangıç nüfusu, harita büyüklüğü, iklim ve çatışma eğilimi seçilir. Başlangıç nüfusu 24–192, yaşayan insan üst sınırı 500'dür. URL'ye `?seed=Ardıç` eklemek o tohumla yeni bir dünya açar; yalnız tohum bağlantısı bir kayıt dosyasının yerine geçmez. Aynı motor sürümü, ayarlar ve aynı adımlarda uygulanan müdahaleler aynı sonucu üretir.

## Yerelde çalıştırma

Geliştirme araçları için **Node.js 24 veya üstü** yeterlidir. Projede kurulum gerektiren npm bağımlılığı yoktur.

```bash
npm run dev
```

Uygulamayı `http://localhost:4173` adresinde aç. ES modülleri nedeniyle `index.html` dosyasını doğrudan `file://` ile açmak yerine bir HTTP sunucusu kullan.

```bash
npm run check
npm test
npm run build
```

`build`, kendi başına sunulabilen statik dosyaları `dist/` içine kopyalar ve yerel dosya yollarını doğrular. Çalışma zamanında sunucu API'si, hesap, gizli anahtar, CDN veya harici font gerektirmez. Bütün çalışma zamanı yolları görecelidir; depo alt yolu altında çalışabilir. Depo kökündeki uygulama da derleme gerektirmeden statik sunulabilir.

## Piksel sanatı

Bütün oyun sprite'ları bu repo için Canvas üzerinde piksel piksel çizilir. Üçüncü taraf sprite paketi veya emoji karakter kullanılmaz. Ortak çizici; oyun, karakter portreleri ve görsel katalog tarafından paylaşılır.

Karakter sistemi 8 ten tonu, 10 saç tonu, 10 saç biçimi, 12 giysi paleti, 8 vurgu rengi ve 16 beden/giyim varyantını birleştirir. Bunlara yaşam evresi, cinsiyet, meslek, yön, hareket ve seviye ayrıntıları eklenir. Animasyonlar gerçek eylemlerle bağlantılıdır; hedefe yürüyen bir kişi varıştan önce odun kesme veya kazma efekti çıkarmaz.

Çalışan geliştirme sunucusunda `/docs/assets-preview.html` sayfası yaşları, görünüş varyantlarını, meslek hareketlerini, 20 seviyeyi ve yapıların inşa evrelerini gösterir. Aynı katalog statik çıktıya da dahildir.

## Doğrulama ve geliştirme

Node'un yerleşik test çalıştırıcısıyla; deterministik arazi üretimi, gerçek nehir geçişleri, ulaşılmaz bölgeler, genetik çeşitlilik, soy yaşları, mevsim sınırları, ölüm nedenleri, savaş hasarı, nüfus sınırı, müdahale etkileri ve bozuk kayıtlar sınanır. Otomatik testlerin uzun koşusu **3.000 simülasyon günü** boyunca dünyayı kontrol eder; bu olgun dünya kaydedilip yüklendikten sonra kararların ve olayların birebir aynı devam ettiğini karşılaştırır.

GitHub Actions, değişikliklerde sözdizimi/import denetimini, testleri ve statik üretimi çalıştırır. Tarayıcı arayüzü ayrıca masaüstü ve dar ekran üzerinde elle doğrulanmıştır. Mimari, API'ler ve yeni sistem ekleme noktaları [Teknik sözleşme](docs/CONTRACT.md) içinde bulunur.

### Tasarım sınırları

Bu bir kurallı oyuncak dünya modelidir. İnsan davranışını veya tarihsel medeniyetleri bilimsel olarak tahmin etmez. Karakterler LLM kullanmaz; ihtiyaç öncelikleri, ağırlıklı olasılıklar, yerel ilişkiler ve yol bulma ile hareket eder. Belirli bir tohumun mutlaka kent, savaş veya sınırsız nüfus üretmesi garanti edilmez; topluluklar sönümlenebilir.

Oyun tek sekmede ve cihazda çalışır; çok oyunculu sunucu veya bulut kayıt eşitlemesi yoktur. Deniz taşımacılığı bulunmaz; hareket kara bölgeleri ve fiziksel geçitlerle sınırlıdır. Son olaylar, grafik örnekleri ve mezar kayıtları uzun süreli çalışmada belleği sınırlamak için tutulabilecek sayı ile sınırlandırılmıştır. 500 insan üst sınırı, büyük harita ve yüksek hız birlikte kullanıldığında cihazın kapasitesi belirleyicidir.
