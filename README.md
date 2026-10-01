# 12.8 L Kamyon Motoru — 3D Çalışma Animasyonu

Ağır vasıta (TIR/çekici) sınıfı **12.8 litrelik, sıralı 6 silindirli, turbolu dizel motorun** tarayıcıda çalışan 3D modeli.
Motor gerçek kinematik ve gerçek supap zamanlamasıyla çalışır; istediğiniz yerden **kesit alıp içine bakabilir**, parçalara ayırabilir, her parçanın üstüne gelerek bilgi alabilirsiniz.

## Nasıl açılır?

| Yöntem | Adım |
|---|---|
| En kolay | `kamyon-motoru-3d.html` dosyasını indirip çift tıklayın (tek dosya, internet gerekmez). |
| Geliştirme | Depoyu klonlayıp `index.html` dosyasını açın veya `python3 -m http.server` ile servis edin. |

WebGL destekleyen güncel bir tarayıcı (Chrome, Edge, Firefox, Safari) yeterlidir. Mobilde de çalışır (sol üstteki **☰ Kontroller** düğmesi).

## Neler var?

- **Gerçek çalışma:** Krank–biyel–piston kinematiği (`y = R·cosψ + √(L² − R²·sin²ψ)`), 4 zamanlı çevrim (emme → sıkıştırma → iş → egzoz), **ateşleme sırası 1-5-3-6-2-4** (120° aralıkla, krank pimleri 1/6, 2/5, 3/4 çiftleri aynı fazda).
- **Supap mekanizması:** Tek üst kam mili (SOHC), her silindirde emme + egzoz + pompa-enjektör kamı, külbütörler, supap köprüleri, 4 supap/silindir, sıkışıp açılan yaylar. **Kam lob profilleri doğrudan supap zamanlaması fonksiyonundan üretilir**; kam burnu, külbütör ve supap hareketi birbiriyle tutarlıdır (kam mili krank hızının yarısında döner).
- **Gerçek zamanlama:** Emme 12° BTDC açılır / 40° ABDC kapanır, egzoz 40° BBDC açılır / 12° ATDC kapanır (overlap dahil), enjeksiyon ≈ 14° BTDC – 20° ATDC.
- **Kesit (cutaway):** Boyuna (silindir ortasından), enine ve yatay kesit; konum kaydırıcısı; kesilen yüzeyler parça ailesine göre renkli ve tarama çizgili (stencil tabanlı kapak yüzeyi, gerçek “kapalı” kesit).
- **Patlatma (exploded view):** Kapak, üst takım, supap kapağı, karter, manifoldlar, turbo, volan, dişli kutusu ve damper birbirinden ayrılır.
- **X-ray modu:** Gövdeleri şeffaflaştırıp tüm iç mekanizmayı bir arada gösterir.
- **Gaz renkleri ve yanma:** Silindir içi gaz; emme (mavi), sıkıştırma (sarı), yanma/iş (turuncu–kırmızı), egzoz (gri). Enjektörden püskürtme konisi görünür.
- **Hava / gaz akışı:** Turbo → şarj havası borusu → emme manifoldu → supap → silindir; silindir → egzoz portu → manifold → türbin → egzoz çıkışı. Silindir başına akış, ilgili supabın açıklığıyla orantılıdır.
- **Canlı grafikler:** Strok diyagramı (6 silindir, supap açık aralıkları) ve seçili silindirin **basınç–krank açısı** eğrisi (tek bölgeli yanma modeli, Wiebe yanma fonksiyonu).
- **Mühendislik tahminleri:** Motor devri ve yük (%) kaydırıcılarına göre tepe silindir basıncı (tam yükte ≈ 200 bar), tahmini güç ve tork (tam yük: ≈ 2300 N·m plato, ≈ 480 hp tepe).
- **Parça bilgisi:** Fareyle (veya dokunarak) parçaların üstüne gelince adı ve görevi gösterilir; piston/gaz üzerinde o silindirin anlık stroku ve basıncı da yazar.
- **Zaman ölçeği:** Gerçek zamandan 1/120 yavaş çekime; ayrıca krank açısı kaydırıcısı ve 10°'lik adımlarla elle ilerletme.
- **Kamera ön ayarları:** Genel, yan, ön, arka, üst, silindir, üst takım, turbo, dişliler. İsteğe bağlı otomatik döndürme ve sentetik motor sesi.

### Kontroller

| Eylem | Fare / Dokunmatik | Klavye |
|---|---|---|
| Döndür | Sol tuş sürükle / tek parmak | — |
| Kaydır | Sağ tuş veya Shift + sürükle / iki parmak | — |
| Yakınlaş | Tekerlek / iki parmakla kıstırma | — |
| Çalıştır / durdur | **Çalıştır** düğmesi | `Boşluk` |
| Açı adımı | **◀ 10° / 10° ▶** | `←` `→` |
| Silindir seç | Pistona tıkla veya durum kutusu | — |

## Motor özellikleri (modelde kullanılan)

| Özellik | Değer |
|---|---|
| Konfigürasyon | Sıralı 6, 4 zamanlı, turbo dizel |
| Silindir çapı × strok | 131 × 158 mm |
| Toplam hacim | 12.78 L (π/4 · 13.1² · 15.8 · 6) |
| Biyel boyu / krank yarıçapı | 262 mm / 79 mm (λ ≈ 0.30) |
| Sıkıştırma oranı | ≈ 17 : 1 |
| Ateşleme sırası | 1-5-3-6-2-4 |
| Supap | 4 / silindir (2 emme, 2 egzoz) |
| Valf mekanizması | Tek üst kam mili, külbütör + supap köprüsü |
| Yakıt sistemi | Kam tahrikli pompa-enjektör (silindir başına 1) |
| Krank mili | 7 ana yatak, 12 karşı ağırlık |
| Zaman dişlileri | Arka (volan tarafı); krank 36 diş → kam 72 diş (1:2), 3 ara dişli |
| Aşırı doldurma | Turbo (türbin + kompresör çarkı), şarj havası hattı |

> **Önemli not:** Bu, 12.8 L sınıfındaki ağır vasıta motorlarının (ör. Volvo D13: 131×158 mm = 12.78 L, Mercedes-Benz OM 471: 132×156 mm = 12.8 L) kamuya açık ana ölçülerinden üretilmiş **temsili bir parametrik modeldir**; hiçbir üreticinin CAD verisi değildir. Silindir basıncı, güç ve tork değerleri basit bir yanma modelinden **yaklaşık** hesaplanır ve gerçek bir motorun dinamometre sonuçlarının yerine geçmez.

## Dosya yapısı

```
index.html              Arayüz ve sayfa iskeleti
kamyon-motoru-3d.html   Tek dosyalık derleme (tools/build_single.py ile üretilir)
js/params.js            Ölçüler, kinematik, supap zamanlaması, silindir basıncı modeli (Node'da da çalışır)
js/geo.js               Geometri yardımcıları (devrim katıları, ekstrüzyon, dişli profili, helis yay)
js/engine.js            3D modelin üretimi, kesit altyapısı, her karedeki kinematik güncelleme
js/app.js               Sahne, kamera, arayüz, grafikler, ses
js/three.min.js         three.js r149 (MIT lisansı)
tools/build_single.py   Tek dosya derleyici
```

Tek dosya sürümünü yeniden üretmek için: `python3 tools/build_single.py`.

## Teknik notlar

- Birim: 1 sahne birimi = 1 cm. Krank ekseni X, silindir ekseni Y, ön taraf −X, volan/zaman dişlileri +X (arka).
- Kesit yüzeyleri, three.js stencil tamponu ile her parça ailesi için ayrı üretilir: kesilen katıların iç hacmi sayılır ve kesme düzleminde taramalı bir yüzey çizilir. Bu yüzden kapalı (watertight) geometri kullanılır.
- Her parçanın yönü çalışma anında doğrulanır (`fixOrient`), kapalı olmayan parçalar (ör. yaylar) kapak yüzeyi üretmez.
- `js/params.js` tarayıcı dışında da yüklenebilir: `node -e "const E=require('./js/params.js'); console.log(E.G.vdTotal)"`.
- Test için URL parametreleri: `?theta=120&run=0&clip=1&axis=z&pos=0&expl=0.5&xray=1&cover=1&ui=0&view=Silindir`.
