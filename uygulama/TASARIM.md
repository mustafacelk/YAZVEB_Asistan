# YAZVEB — Bilgi mimarisi ve arayüz sistemi

> **Karmaşık ürün, sade arayüz.** Kullanıcıya 20 özellik değil, 5 dünya
> gösterilir; özellikler o dünyaların içinde, ihtiyaç duyulunca açılır.

Bu belge 2026-09-28'deki yeniden yapılanmanın kararlarını tutar. Yeni bir
özellik eklerken önce "hangi dünyaya ait?" sorusunu burada yanıtla.

---

## 1. Denetim: yeniden yapılanmadan önce

| Özellik | Amaç | Kimin için | Önceki yeri | Karar |
| --- | --- | --- | --- | --- |
| Asistan (sesli/yazılı) | Soru-cevap, yönlendirme | Herkes | Ana'daki kutu → tam ekran | **KEEP** — sürükleyici deneyim; girişi Ana'dan |
| Ders notları | Not, çıkmış soru, özet paylaşımı | Öğrenci | Çubukta "Notlar" (düz akış) | **REBUILD** → Akademi: ders → notlar → detay |
| Öğrenci doğrulama | Notları açma/paylaşma kapısı | Öğrenci | Notlar + Topluluk'taki hesap penceresi | **RESTRUCTURE** → Ben › Öğrenci kimliği (+ Akademi'de bağlamsal çağrı) |
| Etkinlik takvimi | Ne, nerede, kaç XP | Herkes | Çubukta "Etkinlikler" | **REFINE** — QR ve katılım geçmişi bu dünyaya |
| QR okutma | Etkinlikte puan | Katılımcı | Çubuğun ortasında, her ekranda | **RESTRUCTURE** → Etkinlikler'in birincil eylemi + etkinlik canlıyken her ekranda bağlamsal şerit |
| XP, seviye, sonraki adım | İlerleme | Herkes | Ödüller'in tepesinde büyük kart; Ana'da kart | **RESTRUCTURE** → görünmez altyapı: Ana'da tek satır, Ben'de ayrıntı |
| Sponsorlar ve kilitler | Yerel işletme ödülleri | Herkes | Ödüller › Sponsorlar | **REFINE** → Ödüller dünyasının gövdesi (önce Ben'e taşınmıştı, bulunmuyordu) |
| Ödüllerim (cüzdan) | Kazanılan ödülü kullanma | Kazanan | Ödüller › Ödüllerim + Ana'da kart | **REFINE** → Ödüller'in en üstünde "Göster" ile; tümü alt sayfada; Ana'da yalnızca bekleyen varsa bir satır |
| Sıralama | Haftalık rekabet | Herkes | Ödüller › Sıralama | **REFINE** → Ödüller › Sıralama |
| Puan geçmişi | Şeffaflık | Herkes | Ödüller'de pencere | **RESTRUCTURE** → Ödüller › İlerleme ve puan geçmişi |
| Genel sohbet | Topluluk konuşması | Üye | Topluluk › satır | **KEEP** (Topluluk dünyası) |
| Üyeler ve roller | Kim kim, rol dağıtımı | Başkan | Topluluk | **KEEP** |
| Hesap (ad, görünüm, veriler, çıkış) | Hesap yönetimi | Herkes | Topluluk'ta açılır pencere | **RESTRUCTURE** → Ben |
| 3D HUB | Karakter, oda, çarşı, çark | Oyun seven üye | Ana başlığında düğme + Ana'da kart | **KEEP** deneyim, **RESTRUCTURE** giriş → Ana'da tek "portal" |
| Motivasyon sözleri | Neden buradayım | Herkes | Ana'da büyük kart | **REFINE** → selamlamanın altında sessiz tipografi |
| "Nasıl çalışır?" rehberi | XP döngüsünü öğretmek | Yeni üye | Ana'da büyük kart | **RESTRUCTURE** → Etkinlikler'de açılır bölüm |
| Sınav dönemi | Notları öne çıkarma | Öğrenci | Ana kartı + Notlar şeridi | **KEEP** — Ana'da "Bugün" satırı, Akademi'de şerit |
| Sponsorlu ilanlar | Gelir (para dönmez kuralı) | Sponsor | Not akışının içinde her 5 kartta bir | **RESTRUCTURE** → Akademi ana sayfasında ayrı, etiketli satır; ders ve not okuma ekranlarında yok |
| Yönetim (panel, QR, sponsor, notlar, şikayet) | Topluluğu işletmek | Yetkili | Yönetim görünümü + üye görünümünde satır | **KEEP** (ayrı görünüm); üye görünümünden giriş → Ben › Yönetim |
| İşletme onay sayfası | Kasada ödül onayı | Çalışan | /isletme | **KEEP** |

**Kaldırılan:** Ana'daki "3D HUB" başlık düğmesi (portal ile tekrar), Ana'daki
büyük ilerleme kartı, Topluluk'taki hesap penceresi (Ben'e taşındı), çubuğun
ortasındaki her ekranda duran QR (bağlamsal hâle geldi).

**Geri alınan karar (2026-09-29):** Ödüller ilk düzenlemede Ben'e katılmıştı;
kullanıcılar ödülleri ve sponsorları bulamadı. Sponsorlar topluluğun geliri,
ödüller üyenin puan toplama sebebi: ikisi de kendi sekmesini hak ediyor.
Ödüller yeniden sekme oldu (bekleyen ödül "Göster" düğmesiyle en üstte,
sponsorlar hemen altında); çubuktaki yeri için Topluluk telefonda Ana'ya,
masaüstünde şeridin "Keşfet" grubuna geçti.

---

## 2. Bilgi mimarisi: beş sekme, iki sürükleyici deneyim

```
ANA ─────────── yön verir: durum cümlesi, Asistan'a sor, BUGÜN (≤3), ilerleme satırı,
                Topluluk kapısı, HUB portalı
AKADEMİ ─────── Derslerim / Tüm dersler / Notlarım → Ders → Notlar (tür) → Not → Aç / İşime yaradı
ETKİNLİKLER ─── [QR okut] · Yaklaşan / Katıldıklarım · Gönüllü ol (açık işler) · Nasıl puan kazanılır?
ÖDÜLLER ─────── ilerleme · bekleyen ödüller [Göster] · Sponsorlar (kilit ilerlemesi)
                → Ödüllerim (tümü) · Sıralama · İlerleme ve puan geçmişi
BEN ─────────── kimlik + ilerleme · (kadroysa) Ekip panosu · Ödüller'e tek satır
                · Öğrenci kimliği · Profil · Gizlilik ve veriler · (Yönetim) · Çıkış
  └ EKİP PANOSU  Pano · Gönüllü havuzu · Kadro — yalnızca görevli kadro
                 (yönetim görünümünde Panel'den). Bkz. README › Ekip.
  └ TOPLULUK ── Genel sohbet · Üyeler (ileride: duyurular, ilanlar, ev, 2. el) ← Ana, masaüstünde Keşfet

ASİSTAN (tam ekran)  ← Ana'daki "Asistana sor"
3D HUB (ayrı dünya)  ← Ana'daki portal; içinde karakter, oda, çarşı, çark, ziyaret
```

Kurallar:

1. **İlgisiz şeyler yan yana durmaz.** Akademi'de oyun, sohbet, ödül kartı yok.
   Sponsorlu içerik yalnızca Akademi'nin giriş sayfasında, ayrı ve etiketli.
2. **Seviye seviye açılır.** Dünya → araçlar → detay → eylem. Her ekranda
   önce amaç (başlık + tek cümle), sonra ana eylem, sonra destek bilgisi.
3. **XP bağırmaz.** Ana'da tek satır, etkinlik satırında küçük bir çip,
   ayrıntısı Ben'de. Kazanıldığı anda (QR) görünür, gerisinde sessiz.
4. **QR bağlamsaldır.** Etkinlikler'in birincil eylemi; bir etkinlik
   şu an sürüyorsa ve okutulmadıysa her ekranın altında tek satırlık şerit.
5. **Geri dönmek kolaydır.** Her alt sayfada sol üstte geri; tarayıcının ve
   Android'in geri tuşu da aynı yolu izler (gezinme geçmişi).

### Gezinme

| | Telefon | Masaüstü |
| --- | --- | --- |
| Üye | Altta 5 sekme: Ana · Akademi · Etkinlikler · Ödüller · Ben (Topluluk Ana'dan) | Solda şerit: aynı 5 dünya + "Keşfet": Topluluk, Asistan, 3D HUB |
| Yönetim görünümü | Panel · Etkinlikler · [Perde QR] · Yönetim · Topluluk | Aynısı, solda |

---

## 3. Arayüz sistemi

Tek kaynak: `src/tasarim/jetonlar.css`. Bileşenler çıplak değer kullanmaz.

**Tip ölçeği** (Inter, üç ağırlık)

| Rol | Jeton | Boyut / satır / ağırlık | Kullanım |
| --- | --- | --- | --- |
| Display | `--t-display` | 44→30 akışkan / 1.1 / 500 | Dünya girişi (masaüstü), karşılama |
| H1 | `--t-h1` | 28 / 1.2 / 500 | Dünya başlığı |
| H2 | `--t-h2` | 20 / 1.3 / 500 | Alt sayfa, pencere başlığı |
| H3 | `--t-h3` | 16 / 1.35 / 500 | Satır başlığı, kart başlığı |
| Body | `--t-govde` | 15 / 1.55 / 400 | Metin |
| Caption | `--t-aciklama` | 13 / 1.45 / 400 | Açıklama, ikincil satır |
| Label | `--t-etiket` | 11 / 1 / 500, büyük harf, +0.12em | Bölüm etiketi |
| Button | `--t-dugme` | 13-15 / 1 / 500 | Düğmeler |
| Metadata | `--t-ustveri` | 12 / 1.3 / 400, tabular | Tarih, sayı, boyut |

**Boşluk** 4 tabanlı (`--b-1`…`--b-9`), **köşe** üç kademe (`--k-1` 6,
`--k-2` 10, `--k-3` 14), **hareket** dört katman (`--t-mikro`, `--t-ui`,
`--t-sinema`, `--t-ortam`), **katmanlar** `--kat-*`.

**Bileşenler** (`src/tasarim/Dunya.tsx`): `DunyaBasi` (etiket + başlık +
tek cümle + tek eylem), `Satir` (liste satırı: simge, başlık, açıklama, sağda
değer/ok), `Bolum` (etiketli bölüm), `AltBasi` (geri + başlık).

**Kart enflasyonu yok.** Varsayılan liste satırıdır. Kart yalnızca kendi başına
bir nesne olan içerikte: sponsor, ödül kuponu, not önizlemesi değil.

---

## 4. Yeni özellik eklerken

1. Hangi dünyaya ait? Hiçbirine uymuyorsa önce bu belgeyi tartış.
2. Dünyanın giriş sayfasına kart ekleme; dünyanın **içine** bir satır/sekme ekle.
3. Ana'ya yalnızca "bugün önemli" ise ve geçiciyse girer (ör. sınav dönemi).
4. Çubuk beş öğeyi geçmez.
