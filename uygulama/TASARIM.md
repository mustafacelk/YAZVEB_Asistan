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
ANA ─────────── dört blok: selam + durum cümlesi (sağda Topluluk ve profil) ·
                SIRADAKİ etkinlik (canlıysa "QR okut", ekranın tek birincil eylemi) ·
                BUGÜN (≤3 satır + haftanın yeni notları) · ilerleme satırı
AKADEMİ ─────── Derslerim / Tüm dersler / Notlarım → Ders → Notlar (tür) → Not → Aç / İşime yaradı
ETKİNLİKLER ─── [QR okut] · Yaklaşan / Katıldıklarım · Gönüllü ol (açık işler) · Nasıl puan kazanılır?
ÖDÜLLER ─────── ilerleme · bekleyen ödüller [Göster] · Sponsorlar (kilit ilerlemesi)
                → Ödüllerim (tümü) · Sıralama · İlerleme ve puan geçmişi
BEN ─────────── kimlik + ilerleme · Senin: (kadroysa) Ekip panosu · Ödüller'e tek satır
                · Karakterin ve odan (3D HUB) · Topluluk
                · Hesap: Öğrenci kimliği · Profil · Gizlilik ve veriler · (Yönetim) · Çıkış
  └ EKİP PANOSU  Pano · Gönüllü havuzu · Kadro — yalnızca görevli kadro
                 (yönetim görünümünde Panel'den). Bkz. README › Ekip.
  └ TOPLULUK ── Genel sohbet · Üyeler (ileride: duyurular, ilanlar, ev, 2. el) ← Ana, masaüstünde Keşfet

ASİSTAN (tam ekran)  ← her dünyanın sağ altındaki "Asistan" düğmesi (masaüstünde Keşfet)
3D HUB (ayrı dünya)  ← Ben › Karakterin ve odan (masaüstünde Keşfet); karakter, oda, çarşı, çark
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
| Üye | Altta sabit 5 sekme: Ana · Akademi · Etkinlikler · Ödüller · Ben; sağ altta Asistan düğmesi (Topluluk Ana'nın üstünden ve Ben'den) | Solda şerit: aynı 5 dünya + "Keşfet": Topluluk, Asistan, 3D HUB |
| Yönetim görünümü | Panel · Etkinlikler · [Perde QR] · Yönetim · Topluluk | Aynısı, solda |

---

## 3. Arayüz sistemi: sakin arayüz (2026-10-13)

Tek kaynak: `src/tasarim/jetonlar.css`. Bileşenler çıplak değer kullanmaz.

Kullanıcılar eski arayüzü "boğucu ve karmaşık" buldu. Araştırma raporu
("YAZVEB Asistan — Arayüz Yeniden Tasarım Araştırma Raporu", depo dışında)
teşhisi ve kararları verdi. Sekme yapısı korundu (Ödüller'i Ben'e katmak
Eylül'de denendi ve bulunamadı), arayüz sistemi baştan kuruldu.

**Teşhis.** Her şey aynı ağırlıktaydı: tek zemin tonu, her yüzeyde ince
çerçeve, küçük gri BÜYÜK HARF etiketler, her satırda vurgu renkli simge, birden
çok "birincil" düğme. Ana'da yedi blok vardı (alıntı, asistan kutusu, Topluluk,
HUB geçidi…). Arka planda kayan ışık, film greni, cam bulanıklığı.

**Karmaşıklık bütçesi** (her ekran):

| Ölçüt | Sınır |
| --- | --- |
| Katlama üstünde içerik bloğu | en fazla 4–5 |
| Dokunulabilir öğe (katlama üstü) | en fazla 9 |
| Birincil (vurgu dolgulu) düğme | tam 1; listede tekrar eden eylem ikincildir |
| Bir ekranda yazı boyutu | 3 (başlık, gövde, etiket) |
| Ana görevin derinliği | en fazla 3 dokunuş |

**Renk.** Derinlik çizgiyle değil tonla: `--z-1` sayfa #141518, `--z-2` yüzey
#1C1E22, `--z-3` yükseltilmiş/pencere #24272C, `--z-4` seçili #2B2F35. Saf
siyah yok. Metin `--m-1` #E8EAED, `--m-2` #B4B9C0, `--m-3` #959BA4 (en açık
zeminde bile ≥4.8:1); `--m-4` yalnızca süs ve devre dışı. Tek vurgu Sinyal
#8CCFE2 yalnızca ekranın birincil eylemi, seçili sekme/çip ve bağlantıda; satır
simgeleri nötr. Anlamsal üçlü yalnızca durum için: `--basari` #7FD1A0 (QR
okundu, kilit açık, katıldın), `--uyari` #F2C661, `--hata` #F28B82. Renk tek
başına anlam taşımaz; yanında simge ve metin var.

**Tip ölçeği** (Inter; başlıklar 600). Gövde 16'nın altına inmez: Türkçe
eklemeli yapısıyla uzun kelimeler küçükte daha çok göz durağı ister.

| Rol | Jeton | Boyut / satır / ağırlık | Kullanım |
| --- | --- | --- | --- |
| Display | `--t-display` | 28→36 akışkan / 1.15 / 600 | Masaüstünde dünya başlığı |
| H1 | `--t-h1` | 26 / 1.2 / 600 | Dünya başlığı, selam |
| H2 | `--t-h2` | 20 / 1.3 / 600 | Alt sayfa, pencere başlığı |
| H3 | `--t-h3` | 17 / 1.35 / 600 | Bölüm başlığı (`Bolum`), kart başlığı |
| Body | `--t-govde` | 16 / 1.5 / 400 | Metin, satır başlığı (500) |
| Caption | `--t-aciklama` | 14 / 1.45 / 400 | Açıklama, ikincil satır |
| Label | `--t-etiket` | 12 / 1.25 / 500, büyük harf YOK | Çip, rozet, sekme etiketi |
| Button | `--t-dugme` | 15 / 1 / 600 | Düğmeler |
| Metadata | `--t-ustveri` | 13 / 1.35 / 400, tabular | Tarih, sayı, boyut |

Veritabanından büyük harfle gelen seviye adı ekranda `seviyeAdi()` ile
düzeltilir ("STARTER" → "Starter").

**Boşluk** 4 tabanlı (`--b-1`…`--b-9`), sayfa kenarı `--kenar-bosluk` 16
(320 px'te 12). **Köşe** tek aile: `--k-1` 8 çip, `--k-2` 12 giriş ve satır
simgesi, `--k-3` 16 kart/liste yüzeyi, `--k-4` 20 pencere; düğmeler hap.
**Dokunma** en az 44 (ikon düğmesi), birincil 48.

**Düğmeler.** `.birincil` vurgu dolgusu (ekran başına bir), `.cizgili` tonlu
ikincil (her yüzeyde seçilir), yalın üçüncül. Listede tekrar eden "Göster",
"Üstlen" gibi eylemler ikincildir.

**Hareket** (Material 3 eğrileri): giren öğe 400 ms vurgulu yavaşlama, çıkan
150–200 ms vurgulu hızlanma, yerinde değişen 250 ms standart. Sekme geçişi
yalnızca solma; ekrana giren öğeler 6 px yükselir. Sonsuz döngü yalnızca "şu an
oluyor" noktasında. Kıtlık etiketi nabız atmaz (sahte aciliyet). Titreşim
yalnızca üç olayda: sekme değişimi (kısa tık), QR başarı, QR hata.

**Gezinme.** Telefonda alta oturan çubuk (yüzen hap ve cam değil): beş eşit
sütun, simge + her zaman görünen etiket, seçili sekmenin simgesinin arkasında
vurgu tonunda hap. Asistan sağ altta (canlı etkinlik şeridi varken yalnızca
simge); Asistan ekranında hiçbir sekme seçili görünmez.

**Bileşenler** (`src/tasarim/Dunya.tsx`): `DunyaBasi` (başlık + tek cümle +
tek eylem; üstteki küçük etiket artık çizilmez), `Bolum` (gerçek ara başlık,
`h2.bolum-baslik`), `Satir` (liste satırı: nötr simge, başlık, açıklama, sağda
değer/ok), `AltBasi` (geri + başlık).

**Kart enflasyonu yok.** Varsayılan liste satırıdır. Kart yalnızca kendi başına
bir nesne olan içerikte: sıradaki etkinlik, sponsor, ödül kuponu.

**Oyunlaştırma sessiz.** XP büyük sayı olarak yalnızca ilerleme satırında ve
Ödüller'de; başka yerde 12 px etiket. Sıralama yalnızca ilk onu ve senin yerini
gösterir; alt sıralar listelenmez, düşüş bildirimi yok. Sponsor ödülleri kendi
bölümünde, okunur "Sponsorlu" etiketiyle; kilit herkes için aynı puan şartı.

**Bilerek sonraya bırakılanlar** (rapor yol haritası): açık tema (açıkta vurgu
#0E6F8C olmalı, #8CCFE2 açık zeminde 1.6:1), not okuma modu, Asistan'ın
alttan açılan yarım sayfa olması, düşük bellekli cihazda 3D'yi kapatma,
karmaşıklık ölçümlerinin CI'da ekran görüntüsünden hesaplanması.

---

## 4. Yeni özellik eklerken

1. Hangi dünyaya ait? Hiçbirine uymuyorsa önce bu belgeyi tartış.
2. Dünyanın giriş sayfasına kart ekleme; dünyanın **içine** bir satır/sekme ekle.
3. Ana'ya yalnızca "bugün önemli" ise ve geçiciyse girer (ör. sınav dönemi).
4. Çubuk beş öğeyi geçmez.
5. Ekranın karmaşıklık bütçesine bak (§3): yeni blok eklemek için bir blok
   çıkar ya da ikinci seviyeye indir. Yeni bir vurgu dolgulu düğme eklemeden
   önce ekranda zaten bir birincil eylem olup olmadığına bak.
