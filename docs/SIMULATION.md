# Villages: simülasyonun kuralları

Villages, küçük insan topluluklarının kaynaklar, coğrafya ve birbirleriyle etkileşimini izlemek için hazırlanmış bir ajan simülasyonudur. Bir karakterin görev sırası, bir köyün kurulacağı gün veya bir savaşın kazananı önceden yazılı değildir. Karakterler acil ihtiyaçlarını gidermeye çalışır; daha az acil seçimlerde kişilikleri, deneyimleri, yakındaki olanaklar ve topluluğun eksikleri etkili olur. Aynı coğrafyada farklı koşullar, farklı tarihler doğurabilir.

Bu dosya oynanışta **gerçekten uygulanmış** kuralları açıklar. Ana uygulama ve kayıt katmanından bağımsız motor `src/sim/` dizinindedir.

## 1. Zaman ve tekrar üretilebilirlik

- Bir yıl **96 gün**, bir mevsim **24 gün** sürer. Sıra ilkbahar, yaz, sonbahar ve kıştır.
- Ana uygulama 1× hızda saniyede 10 sabit adım çalıştırır. Bir adım 0,1 simülasyon günüdür; dolayısıyla 1× hızda bir gerçek saniye bir simülasyon gününe karşılık gelir.
- 1× hızda bir yıl 96 saniyedir. Doğumdan 18 yaşına büyüme 28,8 dakika sürer; aynı süreç 10× hızda yaklaşık 2,9 dakika, 25× hızda yaklaşık 69 saniyedir. Bunlar hedef hızlardır; cihazın işlem kapasitesi gerçek ilerlemeyi sınırlayabilir.
- Hareket ve çalışma her adımda; ekoloji, yerleşim değerlendirmesi, sağlık, doğum, diplomasi ve göç gibi daha yavaş süreçler günlük çalışır.
- Gün toplamı 10⁻⁹ gün duyarlılığında yuvarlanır. Böylece kayan nokta toplaması mevsim geçişlerini bir gün geciktirmez.

Bütün rastgele kararlar tek bir **seed'li üreteci** kullanır. Üretecin `rngState` değeri kayıt içindedir. Harita, karakter çeşitliliği ve davranışlar aynı seed, seçenekler, müdahaleler ve sabit adım dizisiyle yeniden üretilebilir. Çizim katmanı bu üreteci tüketmez: kamerayı taşımak, pencereyi yeniden boyutlandırmak veya portre göstermek tarih akışını değiştirmez. Kayıt; sürmekte olan yolları, çalışma ilerlemesini, hamilelikleri ve yarıda mola verilmiş kervan görevlerini de taşır.

## 2. Yaşayan coğrafya

Harita, farklı ölçeklerde birleştirilen deterministik gürültüden üretilir. Yükseklik, nem ve verim bağımsız olmayan katmanlardır; kıyılar, kıvrılan bir nehir ve nehrin geçilebilir sığ geçitleri araziyi şekillendirir. Biyomlar derin su, su, kum, çayır, orman, tepe, dağ ve kardır. Su ve yüksek dağlar insanlar için yürünemez. Balıkçı kıyıdan, madenci ulaşılabilir yamaçtan çalışabilir.

Her hücrenin yiyecek, ağaç biyokütlesi, taş, cevher, balık ve şifalı bitki miktarı vardır. `trees`, 0–8 aralığında sürekli bir biyokütle değeridir; tam sayı ağaç adedi değildir. Kaynak çıkarma bu gerçek miktarı azaltır. Yiyecek, orman, bitkiler ve balık mevsime ve neme göre yenilenir. **Taş ve cevher yenilenmez.** Yakındaki bir yatak tükendiğinde başka bir kaynak aranması gerekir.

Yağış nemi artırır; kuraklık ve sıcak mevsim nemi azaltır. İlkbaharda doğal büyüme hızlı, kışın yavaştır. Yürünülen hücrelerde zamanla yol izi oluşur. Yol, hareket hızına küçük bir katkı sağlar ve kullanılmadığında aşınır.

Geyik, yaban domuzu ve kurtlar ayrı varlıklardır. Otçullar beslenir, hareket eder, yaşlanır ve yeterli koşullarda ürer. Kurtlar yakındaki yabani avı izler; uygun av bulamazlarsa açlık ve savunmasızlık koşullarında insanlara da yönelebilir. Avcıların hedefleri gerçek hayvanlardır; hayvan öldüğünde et elde edilir. Hayvan nüfusunun arazi büyüklüğüne bağlı bir üst sınırı vardır.

## 3. İnsanların durumları ve kararları

Her kişinin adı, görünümü, biyolojik yaşı, sağlık, açlık, enerji, moral, sosyal ihtiyaç, kişilik, envanter, aile ilişkileri, meslek deneyimleri ve bir hareket/çalışma durumu vardır.

| Değer | Aralık ve anlam |
| --- | --- |
| Sağlık | 0–100; sıfıra düştüğünde ölüm gerçekleşir. |
| Açlık | 0–100; 0 tok, 100 ağır açlıktır. |
| Enerji | 0–100; yürüyüş ve çalışma tüketir, dinlenme yeniler. |
| Moral | 0–100; yiyecek, barınma, hastalık, sosyal bağlar ve kayıplardan etkilenir. |
| Sosyal ihtiyaç | 0–100; zamanla düşer, etkileşimlerle yenilenir. |
| Kişilik | Çalışkanlık, sosyallik, cesaret, merak, dayanıklılık, doğurganlık ve saldırganlık. |

Karar modelinin iki katmanı vardır. Yangın, yakın tehdit, ağır açlık ve tükenmiş enerji gibi acil durumlar önceliklidir. Ardından iş seçenekleri ağırlıklı bir seçimle değerlendirilir. Örneğin ortak erzak azsa yiyecek işlerinin ağırlığı artar; eksik inşaat varsa yapı işleri, az odun varsa ormancılık, yaralılar varsa şifacılık değer kazanır. Bir işte deneyim kazanmış olmak aynı işe dönme olasılığını artırır, ancak kişiyi ömür boyu o işe kilitlemez.

Bu nedenle iki benzer insan her zaman aynı kararı vermez. Rastgelelik, koşullardan bağımsız sonuç üretmek yerine **uygun seçenekler arasında çeşitlilik** sağlar. Bir madenci kaynak olmayan karede cevher üretemez, bir demirci hammaddesiz alet yapamaz, bir tüccar fiziksel olarak ulaşmadığı yerleşimle takası tamamlayamaz.

Yollar önce engel denetimi yapılan düz bir rota ile aranır. Gerektiğinde sınırlı A* kullanılır. Arazi bağlı bileşenleri, ulaşılamayan kıyı veya dağın arkasına boşuna yol aranmasını azaltır. Yakın insan sorguları mekânsal bölmeler kullanır. Karakterler birbirini fiziksel olarak itmez; kalabalıklar geçilebilir.

## 4. Yaş, görünüm ve ustalık

| Evre | Yaş |
| --- | --- |
| Bebek | 0–3 |
| Çocuk | 3–12 |
| Genç | 12–18 |
| Yetişkin | 18–58 |
| Yaşlı | 58 ve üzeri |

Görsel sistem bu gerçek yaş evresini kullanarak beden büyüklüğü, oran, saç ve duruşu değiştirir. Başlangıç dünyası farklı yaşları içerir; herkes aynı yetişkin görünümünde başlamaz. Ten, saç, saç modeli, kıyafet, vurgu rengi, sakal, şapka ve gövde varyasyonu ayrı görsel seçimlerdir. Meslek ve seviye ek ayrıntıları etkiler.

Başarılı çalışma hem toplam deneyimi hem ilgili meslek becerisini artırır. Seviye `1 + floor(sqrt(xp / 12))` ile hesaplanır ve 20 ile sınırlanır. Beceri iş süresini ve verimini; seviye iş süresini ve savaş gücünü etkiler. Deneyim görsel bir rozete indirgenmez. Aletin kullanım ömrü ayrıca izlenir; kullanıldıkça aşınır ve yenisi gerekiyorsa gerçek stoktan alınır.

Çocuklar daha yavaş hareket eder ve daha az üretir. Küçükler bakım, yemek, dinlenme ve sosyal etkileşimlere ağırlık verir. Gençler deneyimli biriyle sosyalleşirken onun mesleğinden küçük bir öğrenme kazanabilir. 16 yaşından küçükler kişiler arası savaşın hedefi veya savaşçı olamaz.

## 5. Kaynak akışı ve meslekler

Paylaşılan ve kişisel stoklarda altı kaynak bulunur: **yiyecek, odun, taş, cevher, alet, ilaç**. Şifalı ot ve balık arazi kaynağıdır; toplandıklarında sırasıyla ilaç ve yiyeceğe dönüşür.

| Meslek | Gerçek girdi ve eylem | Sonuç |
| --- | --- | --- |
| Toplayıcı | Yakındaki yabani yiyecek hücresine yürür, toplar. | Hücrenin yiyeceği azalır, envanter dolar. |
| Çiftçi | Tarla kurar, eker, sular, bakar ve olgun ürünü biçer. | Yiyecek üretir; ekim odun ve tohum olarak yiyecek tüketir. |
| Oduncu | Ağaç biyokütlesi olan yerde çalışır. | Biyokütle azalır, odun kazanılır. |
| Madenci | Ulaşılabilir taş veya cevher yatağında çalışır. | Sonlu yatak azalır, yapı veya alet hammaddesi kazanılır. |
| Balıkçı | Gerçek balık miktarı olan hücrenin kıyısına gider. | Balık stoku azalır, yiyecek üretilir. |
| Avcı | Bir hayvanı izler ve ona zarar verir. | Başarılı av et verir; yaban domuzu avcıyı yaralayabilir. |
| İnşaatçı | Ayrılmış bir yapının alanını temizler ve inşaatını ilerletir. | Açıklık, kullanılabilir yapı ve taş işçiliği deneyimi oluşur. |
| Demirci | Bitmiş atölyede cevher ve odun kullanır. | Alet üretir, metal işleme bilgisi kazanır. |
| Şifacı | Ot toplar veya ilaçla gerçek bir hastayı tedavi eder. | Sağlığı artırır, hastalığı azaltır, bağışıklığa katkı verir. |
| Tüccar | Fazla kaynağı taşır, başka yerleşimde takas eder, geri döner. | Kaynak açığı kapanır; güven ve bilgi yayılır. |
| Savaşçı | Kışlada çalışır veya düşmanla fiilen çatışır. | Savaş becerisi ve savunma kapasitesi oluşur. |
| Bilgin | Yeterli erzak olduğunda belirli bir bilgi alanını çalışır. | Üretimden biriken bilgiyi geliştirir. |

Karakterler ürünlerini gerçekten taşır. Envanter yeterince dolduğunda veya merkeze döndüklerinde kişisel yiyecek payını ayırıp kalanını ortak stoğa bırakırlar. Yiyecek yemek için tüketilir. Başlangıçta 1 birim yiyecek yaklaşık 43 açlık puanını giderir; çocuklar daha az, etkin çalışanlar ve kışın yaşayanlar daha fazla acıkır.

Tarımda büyüme, su ve ürün sağlığı ayrı değerlerdir. Olgun ürün zamanında hasat edilmezse kalitesi azalır. Sulama ve bakım anlamlıdır; çiftçinin aynı tarlada sürekli durması tek başına yiyecek üretmez. Tarım bilgisi büyüme verimini artırır. Bu ilk sürümde buğday ve sebze iki ürün görünümüdür; ayrıntılı besin dengesi veya ürün rotasyonu modeli yoktur.

## 6. İnşaat ve yerleşim düzeni

Yeni dünya hazır kasabalarla başlamaz. İnsanlar birkaç coğrafi öbekte bulunur. Bir yerleşimin çekirdeği oluşması için:

- Aynı ulaşılabilir çevrede en az 10 kişi ve 7 yetişkin bulunmalıdır.
- Yakında etkin başka bir yerleşim olmamalı, seçilen arazi yürünebilir ve yeterince verimli olmalıdır.
- Birlikte en az 19 odun, 5 taş ve kişi başına 0,6 yiyecek bulunmalıdır.
- Yetişkinler kişi başına ortalama en az 4,5 başarılı çalışma tamamlamış olmalıdır.
- Uygun bir kişinin kuruluş girişimi gerçekleşmelidir; koşullar sağlandığı ilk karede otomatik şehir çıkmaz.

İnsanlar bu koşullar altında stoklarını birleştirir, ortak ocak kurar ve bir topluluk adı oluşur. Koşullar güçlü olduğunda kuruluş ilk birkaç on gün içinde görülebilir. Belirli bir gün veya isim garanti edilmez.

Yapı planları nüfusun barınma ihtiyacı, tamamlanmamış işler, mevcut tesisler, bilgi ve stoklar üzerinden seçilir. En fazla üç yapı aynı anda plan halinde bulunur. Malzemeler yapı başlatılırken gerçek stoktan ayrılır. İnşaatçı önce 3×3 hazırlık alanındaki gerçek biyokütleyi keser; bunun %70'i oduna dönüşür. Alan temizlenmeden yapı ilerlemez. Yapı alanında orman tekrar büyümez.

Yapı merkezleri en az 2,8 hücre, tarlalar yapı merkezlerinden en az 2,1 hücre uzak seçilir. Büyük nüfus daha geniş bir çevrede inşaat alanı arayabilir. Bir yapının çatısını göstermek için alttaki kaynakları görsel olarak gizlemek yerine arazi gerçekten değişir.

| Yapı | İşlev |
| --- | --- |
| Ortak ocak | Kuruluş merkezi; yakınında bulunan evsizlerin kış maruziyetini azaltır. |
| Kulübe / ev | Sırasıyla 5 / 8 kişilik barınma kapasitesi sağlar. |
| Ambar | Günlük ortak yiyecek bozulmasını %0,6'dan %0,18'e düşürür. |
| Kuyu | Tarla suyunu destekler; kalabalık yerleşimin hastalık riskini azaltır. |
| Oduncu alanı / maden | İlgili kaynak çıkarma verimine %20 katkı sağlar. |
| Atölye | Cevher ve odunun alete dönüştürülmesini mümkün kılar. |
| Pazar | Düzenli kervan işini mümkün kılar. |
| Kışla / gözetleme kulesi | Eğitim ve yakındaki savunmacıya koruma sağlar. |
| Yönetim evi | Araştırma verimine %25 katkı sağlar. |
| Tapınak | Ortak moral hedefini artırır. |

Yangın yapıları zedeler. Bir yapı kullanılamaz hale gelirse konut işlevini kaybeder; onarım için malzeme maliyetinin yarısı ve yeniden inşaat emeği gerekir.

## 7. Medeniyet ölçeği

Topluluğun evresi süreye göre açılmaz. Günlük olarak gerçek koşullar değerlendirilir:

| Evre | Asgari koşullar |
| --- | --- |
| Oba | Ortak ocak ve yerleşim üyeliği. |
| Mezra | 10 kişi, 8 kişilik konut, 3 bitmiş yapı. |
| Köy | 18 kişi, 15 kişilik konut, ambar, 2 tarla, 4 meslekte edinilmiş beceri. |
| Kasaba | 32 kişi, 30 kişilik konut, pazar, atölye, 65 yönetim bilgisi, 6 meslekte beceri. |
| Kent | 64 kişi, 60 kişilik konut, yönetim evi, 150 metal işleme ve 100 takas bilgisi, 55 üzeri refah, 8 meslekte beceri. |

Bir alanda en az bir sakinin becerisi 2'ye ulaşmışsa o meslek toplulukta temsil edilir. Demircinin hasada yardım etmesi geçmişte öğrendiği beceriyi silmez. Ancak bütün uzmanların kaybedilmesi, nüfus azalması veya barınma kaybı evreyi geriletebilir. Kent kalıcı bir başarı rozeti değildir.

Refah; moral, kişi başına erzak, konut yeterliliği, savaş ve kıtlıktan türetilir. Lider, yetişkinlerin deneyim, yaş ve sosyallik bileşiminden seçilir; öldüğünde başka biri seçilir. Tarım, taş işçiliği, metal işleme, tıp, takas ve yönetim bilgileri ayrı birikir. Keşif adları bu sayısal yetkinlik eşiklerinin anlatımıdır; bağımsız görev veya teknoloji ağacı düğmesi değildir.

## 8. Aileler ve yeni kuşaklar

Yakın çevrede uygun kişiler sosyal etkileşimle eşleşebilir. Her iki taraf yetişkin olmalı, yaş farkı makul aralıkta kalmalı ve mevcut eşleri bulunmamalıdır. Ebeveyn-çocuk veya ortak ebeveynli kardeş eşleşmesi yapılmaz. Başlangıçta kurulan biyolojik ebeveyn bağlarında da en az 18 yaş farkı aranır.

Doğum için yalnızca yakın iki karakter yeterli değildir. 18–44 yaşındaki anne adayının sağlık, tokluk, moral, eş yakınlığı ve doğum aralığı şartlarını sağlaması gerekir. Barınmada yer, kişi başına erzak, yaşa bağlı doğurganlık ve kalıtsal özellikler gebelik olasılığını etkiler. Gebelik yaklaşık 63–69 gün sürer; doğumdan sonra en az 110 günlük bir bekleme vardır.

Bebeğin ten ve saç rengi ebeveynlerinden seçilir. Kişilik özellikleri iki ebeveynin ortalaması ve küçük bir değişimle oluşur. Çocuğun anne-baba kimlikleri, kuşağı ve aile adı saklanır. Doğumdan önce baba ölürse gebeliğin kaydındaki kalıtsal bilgi kaybolmaz.

Bebek yakınındaki ebeveynden veya uygun bir yetişkinden yiyecek alabilir. Çok küçük bebek için bakım verenin beslenme ve enerji maliyeti de vardır. Konut, güvenlik ve yakınlık bakımın başarısını etkiler. Her doğan çocuğun yetişkinliğe ulaşması garanti edilmez.

## 9. Hastalık, ölüm ve göç

Ağır açlık sağlığı azaltır. Enerji tükenmesi, kışın açıkta kalma, hastalık, yangın, av tehlikesi ve savaş da sağlık üzerinde etkilidir. İleri yaşta ölüm olasılığı giderek artar; kişiler 96 yaştan sonra yaşamaz. Ölen kişi etkin ajan listesinden çıkar; adı, yaşı, seviyesi, kuşağı, yeri ve ölüm nedeni sınırlı anı kaydında tutulur. Yakınlar moral kaybeder. Yerleşime yakın taşınabilir malların bir kısmı topluluğa dönebilir.

Hastalık yalnız rastgele bir ölüm düğmesi değildir. Açlık ve temiz su eksikliği riski artırabilir; yakın temas hastalığı yayabilir. Dayanıklılık, iyileşme, bağışıklık ve şifacının gerçek ilaç kullanımı süreci değiştirir.

Göçü uzayan açlık, savaş tehlikesi, barınma sıkışıklığı veya gelişmiş toplulukta bazı kişilerin merakı tetikleyebilir. Hedef, daha iyi durumda ulaşılabilir bir yerleşim veya verimli ve yeterince uzak bir arazi olabilir. Yakındaki eş ve çocuklar; ağır kıtlıkta bazı komşular birlikte yola çıkabilir. Yolculukta yemek ve dinlenme gerekir. Göçmenler vardıklarında mevcut topluluğa katılabilir veya yeterli insan ve üretim birikirse yeni bir yerleşim çekirdeği oluşturabilir.

Göç sayacı **kişilerin taşınma olaylarını** sayar; aynı kişi yaşamı boyunca birden çok kez sayılabilir. Boşalan yerleşimin yapıları ve adı dünyada kalır. Etkin yerleşim sayısı yalnız yaşayan sakini olanları kapsar.

## 10. Ticaret, çatışma ve ateşkes

Tüccar, topluluğun fazla kaynağı ile başka bir topluluğun açığını karşılaştırır. Kargo ortak stoktan çıkarılır ve kişinin envanterine konur. Takas ancak hedefe ulaşıldığında ve karşı tarafın malı bulunduğunda tamamlanır. Ardından kazanılan mal eve taşınır. Açlık veya enerji yüzünden verilen mola görevi unutmaz. Ölüm veya uzun yol, ticareti gerçekten başarısız kılabilir.

Bir toplulukta aynı anda en az bir, yaklaşık her 12 kişi için bir kervan görevi açılabilir. Dönüşten sonra bekleme uygulanır; herkes kervana dönüşüp üretimi terk etmez. Takas güveni ve takas bilgisini artırır, diğer bilgilerin küçük bir kısmını da yayar. Para, fiyat pazarlığı veya küresel pazar yoktur; yerel mal değişimi vardır.

Komşu topluluklar arasında ilişki durumu, yakınlık, kaynak baskısı, stok farkı, kültürel saldırganlık, güven ve geçmiş ticaret birlikte değerlendirilir. Yüksek gerilim, olumsuz ilişki veya güçlü saldırganlık ve yeterli nüfus savaşı başlatabilir. **Saldırganlık 0 seçildiğinde yeni savaş başlatılmaz.**

Savaşçılar düşman kişilere yürür. Darbe; seviye, beceri, cesaret, alet, savunma ve yerel kule korumasından hesaplanır ve gerçek sağlığı azaltır. Zayıf veya cesareti düşük kişiler kaçmaya çalışır. Bu nedenle savaşın maliyeti yalnız doğrudan ölümler değildir: kaçış, yaralanma, üretim kesintisi ve açlık da sonuç doğurur.

Savaş yorgunluğu, erzak sıkıntısı, nüfus kaybı veya savaşın uzaması ateşkese yol açar. Ateşkesten sonra yeni savaş için bir bekleme süresi vardır. Taraflardan biri boşaldığında o ilişki etkin savaş sayılmaktan çıkar.

## 11. Oyuncunun müdahaleleri

İnceleme hiçbir dünya değerini değiştirmez. Diğer araçlar koşulları değiştirir; sonrasındaki davranış akışı yine motor tarafından hesaplanır.

- **Yağmur:** Nem ve tarla suyunu artırır, yangını bastırır. Mevcut bol yiyeceği azaltmaz; aynı yağışı tekrar uygulamak sıcaklığı sürekli düşürmez.
- **Yiyecek:** Yürünebilir çevredeki gerçek yabani yiyecek miktarını artırır. İnsanlar yine oraya yürüyüp toplamalıdır.
- **Ağaç:** Uygun boş arazide biyokütleyi artırır. Bina hazırlık alanına veya ekili tarlaya ağaç koymaz.
- **Gezginler:** Uygun karaya erzak taşıyan yetişkinler ekler. Nüfus sınırını aşmaz; kendiliğinden şehir vermez.
- **Kıvılcım:** Yakıt bulunan alanda yangın çıkarır. Yayılımı nem, yağış, biyokütle ve komşuluk belirler.

## 12. Sayıların anlamı ve sınırlar

Simülasyon bir tarih, tarım ekonomisi veya biyoloji tahmin modeli değildir. Takvim, tüketim, gebelik ve üretim süreleri izlenebilir bir oyun dünyası için ölçeklenmiştir. Karakterler LLM, planlama modeli veya doğal dil zekâsı kullanmaz; ihtiyaç kuralları ve ağırlıklı olasılıklar kullanır. Karmaşık sonuçlar bu yerel kararların birleşiminden oluşur.

Kaynaklar soyut birimlerdir. Bireysel para, yük hayvanı, gemi, köprü inşası, kuşatma, ülke ele geçirme, siyasi yasa sistemi veya ayrıntılı fiziksel çarpışma uygulanmaz. Kentleşme, üretim, aile, bilgi, göç ve çatışma bu sürümün odaklarıdır. Yerleşim adı, keşif başlığı ve olay metni davranış komutu değildir.

En fazla 500 insan desteklenir; bu gözlem ve performans sınırıdır. Bu sınırın altında asıl baskılar kaynak, bakım, barınma ve güvenliktir. Nüfus sınırında hazır bir doğum, yer açılana kadar bekler. Tarih grafiği son 720 günün örneklerini; olay günlüğü ve anı kayıtları son 180 girdiyi tutar. Doğum, ölüm, göç, ticaret ve başlatılan savaş sayaçları birikimlidir. Etkin savaş sayısı, toplam başlatılmış savaş sayısından farklıdır.

Motorun her koşuda refah veya sürekli nüfus artışı üretmesi beklenmez. Bir vadide uzun süreli kent oluşurken başka bir yerleşim küçülebilir. Aynı seed altında küçük bir müdahale, daha sonra farklı eşleşmeler ve göçlerle büyüyen bir ayrışma yaratabilir.

## 13. Doğrulama

`node --test`, coğrafya ve yol bulma özelliklerini, deterministik devamı, kayıt doğrulamasını ve simülasyonun anlamlı değişmezlerini denetlemek için kullanılır. Uzun koşularda özellikle nüfus muhasebesi, sonlu sayılar, kaynakların negatif olmaması, fiziksel konumlar, kuşak devamı ve erişilebilir medeniyet evreleri izlenir.

Son kodun örnek uzun koşu sonuçları aşağıya eklenmiştir. Bunlar başarı garantisi veya seed seçimiyle verilmiş ödüller değildir; aynı motorun farklı başlangıç koşullarındaki ölçümleridir.

| Senaryo | Seed | Harita | Başlangıç | İklim | Saldırganlık | Süre |
| --- | --- | --- | ---: | --- | ---: | ---: |
| A: standart dünya | `ilk-ışık` | 88×64 | 96 | Dengeli | 1 | 6.000 gün / 60.000 adım |
| B: kalabalık ve verimli | `bereket` | 88×64 | 192 | Bereketli | 1 | 6.000 gün / 60.000 adım |
| C: sıkışık ve çatışmalı | `sınır` | 64×48 | 160 | Kurak | 3 | 2.000 gün / 20.000 adım |
| D: aynı kurak arazi, barış | `sınır` | 64×48 | 160 | Kurak | 0 | 2.000 gün / 20.000 adım |

| Senaryo | Son nüfus | Doğum | Ölüm | Göç olayı | Takas | Başlatılmış savaş | Bitmiş yapı | Tarla |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 96 | 90 | 90 | 10 | 17 | 0 | 64 | 35 |
| B | 174 | 170 | 188 | 59 | 30 | 0 | 77 | 55 |
| C | 43 | 5 | 122 | 121 | 24 | 11 | 73 | 29 |
| D | 79 | 19 | 100 | 80 | 71 | 0 | 65 | 28 |

A senaryosunda yerleşimler 21, 23, 25 ve 28. günlerde kuruldu. 6.000. günde Kestaneova 46, Pınardere 35 kişilik kasabalardı; Sarıbel 12 kişilik mezra, Kestanekıyı 3 kişilik oba olarak kaldı. Dünya başlangıçtaki 96 kişiye geri dönerken 90 doğum ve 90 ölüm yaşadı: sayı sabit görünse de kuşaklar değişti.

B senaryosunda **Günova 2.640. günde kent ölçeğine ulaştı**. 6.000. günde 127 kişilik kent, 26 kişilik Taşköy, 14 kişilik Söğütbel ve 7 kişilik Gökdere birlikte yaşıyordu. Kent oluşması için başlangıçta hazır yapı veya ileri bilgi eklenmedi.

C senaryosunda aynı anda en fazla üç savaş ve toplam 11 savaş başlangıcı görüldü; koşu sonunda hepsi bitmişti. 122 ölümün 114'ü açlık, 5'i hastalık, 2'si ileri yaş, 1'i doğrudan şiddet olarak kaydedildi. Koşullar yalnız dövüş sonucunu değil üretim ve bakımın sürdürülebilmesini de etkiledi. D senaryosunda saldırganlık sıfırken savaş sayısı sıfır kaldı ve daha çok takas tamamlandı. İki koşu, davranışlar ayrıştıktan sonra aynı rastgele karar dizisini bire bir paylaşmak zorunda değildir; karşılaştırma tek değişkenli bilimsel bir tahmin iddiası taşımaz.

Bu dört koşunun motor süreleri aynı çalışma ortamında yaklaşık 6,9 saniye, 10,1 saniye, 1,5 saniye ve 1,6 saniyeydi. Ölçüm Canvas çizimi olmadan Node üzerinde yapıldı; tarayıcıdaki kare hızından farklı bir ölçümdür. Seed ve parametreler yukarıda belirtildiği için motorun aynı sürümünde sonuçlar tekrar üretilebilir.
