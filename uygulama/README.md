# YAZVEB Topluluk — uygulama

Topluluğun ortak alanı: giriş, genel sohbet ve etkinlik takvimi.
Tek kod tabanı; **web sitesi**, **Android** ve **iOS** olarak çalışır.

---

## Ne var, ne yok

| Özellik | Durum |
| --- | --- |
| Kullanıcı adı + parola ile giriş / kayıt | ✅ hazır |
| Genel sohbet (anlık) | ✅ hazır |
| Etkinlik takvimi | ✅ hazır |
| Üç kademeli yetki (başkan / yönetici / üye) | ✅ hazır, testli |
| Notlar (ders notu, çıkmış soru, özet) + öğrenci doğrulama | ✅ hazır, testli; e-posta servisi anahtarı bekliyor |
| Web sitesi olarak yayın | ⏳ senin hesabını bekliyor |
| Android APK | ⏳ GitHub Actions hazır, çalıştırman yeter |
| iOS | ⏳ Mac + Apple Developer hesabı gerekiyor |
| Sesli asistan (ana klasördeki uygulama) | ayrı çalışıyor, henüz bu uygulamaya taşınmadı |

---

## Yetki modeli

Üç rol var ve **kural veritabanında** uygulanır, uygulamada değil:

| | Üye | Yönetici | Başkan |
| --- | :-: | :-: | :-: |
| Sohbeti okuma / yazma | ✅ | ✅ | ✅ |
| Kendi mesajını silme | ✅ | ✅ | ✅ |
| Başkasının mesajını silme | — | ✅ | ✅ |
| Etkinlik ekleme | — | ✅ | ✅ |
| Etkinlik düzenleme / silme | — | ✅ (kilitli olanlar hariç) | ✅ (hepsi) |
| Rol dağıtma | — | — | ✅ |

**Başkan kilidi:** başkanın oluşturduğu veya düzenlediği her etkinlik
kilitlenir. Yöneticiler o kayda bir daha dokunamaz — ne düzenleyebilir ne
silebilir. Kilit alanını istemci ayarlayamaz; veritabanı tetikleyicisi yönetir.

Neden veritabanında? Çünkü mobil uygulama kullanıcının cihazında çalışır ve
orada çalışan hiçbir kontrole güvenilemez. Kurcalanmış bir istemci "ben
başkanım" diyen istekler gönderebilir; veritabanı yine reddeder.

Bu kuralların hepsi `veritabani/99_testler.sql` içinde, gerçek bir PostgreSQL
üzerinde kullanıcı kılığına girilerek sınanır (27 test).

---

## Kurulum

### 1. Supabase projesi (ücretsiz)

1. [supabase.com](https://supabase.com) → ücretsiz hesap → **New project**.
   Bölge olarak **Frankfurt** seç (Türkiye'ye en yakın gecikme).
2. Proje açılınca **SQL Editor**'e git ve sırayla çalıştır:
   - `veritabani/01_sema.sql`
   - `veritabani/02_yetkiler.sql`
3. **Project Settings → API** bölümünden iki değeri kopyala:

   | Panelde adı | `.env` karşılığı |
   | --- | --- |
   | **Project URL** (`https://xxxx.supabase.co`) | `VITE_SUPABASE_URL` |
   | **Publishable key** (`sb_publishable_...`) | `VITE_SUPABASE_ANON_KEY` |

   > Supabase anahtar adlarını değiştirdi: eski projelerde "anon public"
   > yazıyordu, yenilerde **Publishable key**. İkisi de aynı işi görür.
   > **Secret key**'i (eski adıyla `service_role`) asla uygulamaya koyma.

### 2. Anahtarları bağla

```bash
cd uygulama
cp .env.example .env
```

`.env` içine yapıştır:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Bu iki değer gizli değildir; uygulamanın içinden okunabilir ve öyle olması
beklenir. Güvenliği sağlayan şey satır kurallarıdır.
**`service_role` anahtarını asla buraya koyma.**

### 3. Bağlantıyı denetle

```bash
node baglanti_kontrol.mjs
```

Şemanın kurulup kurulmadığını, kuralların çalışıp çalışmadığını ve anonim
erişimin kapalı olduğunu tek seferde söyler. Hiçbir şey yazmaz, yalnızca okur.

### 4. E-posta onayı kararı

Yeni Supabase projelerinde **"Confirm email" açık** gelir: üye kayıt olunca
e-postasına gelen bağlantıya tıklamadan giriş yapamaz.

Bu, kalabalık bir toplulukta sorun çıkarır. Supabase'in yerleşik e-posta
servisi ücretsiz katmanda **saatte birkaç mektupla** sınırlıdır; otuz kişi
aynı akşam kayıt olmaya kalkarsa çoğu mektup hiç gitmez ve kimse giremez.

İki seçenek var:

| | Kolay yol | Sağlam yol |
| --- | --- | --- |
| Ayar | Authentication → Sign In / Providers → Email → **Confirm email: kapalı** | Açık bırak, **Custom SMTP** tanımla (Resend, Brevo — ücretsiz katmanları var) |
| Sonuç | Üye kayıt olur olmaz girer | E-posta doğrulanır, sınır kalkar |
| Riski | Herkes (başkasının adresiyle bile) anında hesap açar | Kurulum işi |

Kolay yolda kayıt olmak hiçbir yetki vermez (rolleri başkan dağıtır) ve
asistan/seslendirme maliyeti kişi başı kota + **topluluk geneli günlük
bütçe** ile sınırlıdır (bkz. Güvenlik). Yine de sahte hesaplar sohbete
yazabilir ve ortak bütçeyi tüketebilir. **Önerilen:** Custom SMTP ile
e-posta onayını aç ve Authentication → Attack Protection → **CAPTCHA**'yı
etkinleştir.

Ayrıca **Authentication → URL Configuration → Site URL** alanını yayına
aldığın adrese ayarla (geliştirirken `http://localhost:5180`). Yanlışsa
onay bağlantısı kırık bir sayfaya düşer.

### 5. Çalıştır

```bash
npm install
npm run dev
```

### 6. Kendini başkan yap

Önce uygulamadan normal şekilde kayıt ol. Sonra Supabase SQL Editor'de
`veritabani/03_kurulum.sql` dosyasını kendi e-postanla düzenleyip çalıştır.

Bu tek istisna sunucu tarafında çalıştığı için rol denetimini atlar; web ve
mobil istemciden bu yol kapalıdır. İlk başkan atandıktan sonra rolleri
uygulamanın **Topluluk** sekmesinden dağıtırsın.

---

## Yayına alma

### Web sitesi (ücretsiz)

GitHub deposunu [Vercel](https://vercel.com), [Netlify](https://netlify.com)
veya [Cloudflare Pages](https://pages.cloudflare.com) hesabına bağla:

| Ayar | Değer |
| --- | --- |
| Framework | Vite |
| Root directory | `uygulama` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

> **En sık yapılan hata:** değişkenleri ekleyip yeniden dağıtmamak. Vite bu
> değerleri **derleme sırasında** pakete gömer; sonradan eklemek yayındaki
> paketi değiştirmez. Ekledikten sonra Vercel → Deployments → en üstteki
> dağıtım → ⋯ → **Redeploy**.
>
> Değişkenleri eklerken **Production, Preview ve Development** kutularının
> üçünü de işaretle.
>
> Dağıtım bitince Supabase → Authentication → URL Configuration →
> **Site URL** alanına yayın adresini yaz.

Yayına alındıktan sonra telefonda adresi aç → tarayıcı menüsü →
**Ana ekrana ekle**. Uygulama gibi tam ekran açılır (PWA). Mağaza beklemeden
kullanmaya başlayabilirsin.

### Android (APK)

Bilgisayarına Android Studio kurmana gerek yok:

1. GitHub → **Settings → Secrets and variables → Actions** →
   `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` ekle.
2. GitHub → **Actions** → **Android APK** → **Run workflow**.
3. Biten işin **Artifacts** bölümünden `yazveb-apk` indir, telefona kur.

Bu bir *debug* APK'dır: kendin ve ekibin kurabilir. Play Store'a yüklemek
için imzalı *release* derlemesi ve bir kerelik 25 $ geliştirici hesabı gerekir.

Yerelde derlemek istersen Android Studio kurup:

```bash
npm run build && npx cap sync android && npx cap open android
```

### iOS

iOS için **Mac gerekiyor** ve App Store dağıtımı için Apple Developer
hesabı **yılda 99 $**. Ücretsiz kısmı yok; bu adım bilinçli olarak
ertelenebilir. Proje tarafı hazır:

```bash
npx cap add ios && npx cap open ios
```

iPhone kullanıcıları o zamana kadar web sürümünü ana ekrana ekleyerek
neredeyse aynı deneyimi alır.

---

## Yapı

```
src/
  veri/supabase.ts     bağlantı ve tipler
  veri/oturum.tsx      kim giriş yapmış, rolü ne
  veri/transkript.ts   konuşma tanıma parçalarını tekrarsız birleştirir
  veri/gezinme.ts      sekmeler, alt görünümler, "ödül değişti" olayı
  ekranlar/
    Ana.tsx            açılış: sıradaki etkinlik, bir sonraki adım, bekleyen ödül
    Asistan.tsx        küre, sesli/yazılı asistan (Ana'dan açılır)
    Giris.tsx          giriş ve kayıt
    Sohbet.tsx         genel sohbet, anlık (Topluluk'tan açılır)
    Etkinlikler.tsx    takvim, etkinlik başına XP / katılım, rol kısıtlı düzenleme
    Topluluk.tsx       sohbet girişi, hesap, verilerin nasıl kullanıldığı, üyeler
  canli/
    sahne.ts           WebGL parçacık küresi (durumlar, sönümlü hareket)
    olcer.ts           mikrofon ve yanıt sesinden gerçek genlik
    Kure.tsx           kürenin React kabuğu
  odul/
    Tarayici.tsx       kamera + kısa kod, görev başarısı
    Reveal.tsx         sürpriz ödül açılışı
    OdulGoster.tsx     işletmeye gösterilen ödül + çalışanın okutacağı QR
    QrSvg.tsx          QR çizimi (SVG, ayrı yüklenir)
    SponsorKarti.tsx   sponsor kartı, kıtlık etiketi, detay
    qr.ts              QR çözme (BarcodeDetector / jsQR)
  isletme/
    Isletme.tsx        /isletme — çalışanın kendi telefonunda ödül onayı (girişsiz)
  yonetim/
    Yonetim.tsx        ödül yönetim paneli (lazy yüklenir)
    QrKod.tsx          QR penceresi, yazdırma, canlı kodlu perde ekranı
  ekranlar/Oduller.tsx ilerleme profili: puan, seviye, sponsorlar, cüzdan, sıralama
  tasarim/
    jetonlar.css       TEK KAYNAK: renk, boşluk, yazı, hareket, katman
    temel.css          zemin, kontroller, gezinme, sahne geçişi
    ekranlar.css       ekran düzenleri
    Simge.tsx          ikon seti (24 ızgara, 1.5 çizgi)
  hub/                 YAZVEB HUB — 3B görünüm (lazy; Three.js yalnızca açılınca iner)
    Hub.tsx            ekran, paneller (karakter, mağaza, görevler, çark, hediye)
    sahne.ts           Three.js sahnesi: bina, oda, çarşı, kamera, dokunma
    modeller.ts        low-poly karakter, eşyalar, oda kabuğu, dükkân
    katalog.ts         renkler, adlar, hediye emojileri (sunucu kataloğuyla aynı kimlikler)
    veri.ts            hub_* çağrıları, tipler, "HUB açık kalsın" tercihi
    HubSiniri.tsx      HUB çökerse uygulama değil yalnızca HUB kapanır
  ekranlar/Notlar.tsx  notlar: keşfet, paylaş, aç, "işime yaradı", şikayet, Notlarım
  kimlik/
    Dogrulama.tsx      üniversite e-postasıyla öğrenci doğrulama (e-posta → kod → bölüm)
    KimlikKarti.tsx    hesap penceresinde öğrenci kimliği, doğrulamayı kaldırma
  veri/kimlik.ts       kimlik_* çağrıları ve kullanıcıya gösterilecek mesajlar
  veri/pano.ts         pano_* çağrıları, Storage'a yükleme / indirme
  veri/pano_bicim.ts   saf yardımcılar: künye denetimi, dönem, sponsorlu kart yerleşimi
  yonetim/PanoYonetim.tsx  şikayet kuyruğu, sınav dönemleri, sponsorlu ilanlar, puan kuralları
veritabani/
  01_sema.sql        tablolar, tetikleyiciler
  02_yetkiler.sql    satır düzeyi güvenlik
  03_kurulum.sql     ilk başkanı ata
  04_guvenlik.sql    kota, giriş sınırı, sohbet seli, görünen ad
  05_oduller.sql     puan, görev (canlı kod), sponsor, kampanya, ödül
  06_isletme.sql     çalışanın cihazında ödül doğrulama (anonim, sınırlı)
  07_hub.sql         YAZVEB HUB: Coin defteri, envanter, oda, ziyaret, hediye, çark
  08_kimlik.sql      öğrenci doğrulama: kod (yalnız sunucuda), alan → üniversite, süre
  09_pano.sql        notlar, oy, puan, şikayet/moderasyon, sınav dönemi, sponsorlu, Storage
  99_*.sql           yetki, güvenlik, ödül, işletme, HUB, doğrulama ve not testleri
supabase/functions/
  asistan/           sesli/yazılı asistan
  dogrula/           doğrulama kodunu üniversite e-postasına gönderir (Brevo ya da Resend)
```

### Testleri çalıştırma

```bash
npm run test:guvenlik      # girdi doğrulama, istem ayrımı, çıktı süzgeci, CORS (67)
npm run test:transkript    # mikrofon parçalarını birleştirme (12)
npm run test:notlar        # künye, sponsorlu yerleşimi, doğrulama e-postası (46)
npm run lint               # CI'da da çalışır; hata varsa APK derlenmez
npm run yayina-hazir       # derleme + paket taraması (sır, kaynak haritası, CSP)
```

Veritabanı testleri (486) — Docker gerekir. Yetki ve güvenlik (86) + ödül iş
mantığı, canlı kod, sıralama ve saldırı senaryoları (141) + işletme
doğrulaması (27) + YAZVEB HUB ekonomisi (74) + öğrenci doğrulama (50) +
notlar, depo kuralları, puan ve moderasyon (108) tek paket hâlinde çalışır:

```bash
docker run -d --name yz-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=yazveb \
  -p 127.0.0.1:5433:5432 postgres:17-alpine
cd veritabani
for f in *.sql; do docker cp $f yz-test:/tmp/; done
docker exec yz-test psql -U postgres -d yazveb -v ON_ERROR_STOP=1 -q \
  -f /tmp/00_test_altyapisi.sql -f /tmp/01_sema.sql -f /tmp/02_yetkiler.sql \
  -f /tmp/99_testler.sql -f /tmp/03_kurulum.sql -f /tmp/04_guvenlik.sql \
  -f /tmp/99_guvenlik_testleri.sql -f /tmp/05_oduller.sql -f /tmp/99_odul_testleri.sql \
  -f /tmp/06_isletme.sql -f /tmp/99_isletme_testleri.sql \
  -f /tmp/07_hub.sql -f /tmp/99_hub_testleri.sql \
  -f /tmp/08_kimlik.sql -f /tmp/99_kimlik_testleri.sql \
  -f /tmp/09_pano.sql -f /tmp/99_pano_testleri.sql
```

Bir kural bozulursa betik hata ile durur.

Paket **boş bir veritabanı** ister: kendi test kullanıcılarını ve etkinliklerini
kurar, aynı veritabanına ikinci kez çalıştırılamaz. Tekrarlamadan önce:

```bash
docker exec yz-test psql -U postgres -d postgres -q \
  -c "drop database yazveb" -c "create database yazveb"
```

---

## Güvenlik

### Katmanlar

| Katman | Ne korur |
| --- | --- |
| Satır kuralları (RLS) | Kim hangi satırı okur/yazar — gerçek yetki burada |
| `kota_harca` | Asistan ve seslendirme: kişi başı dakikalık/günlük sınır + topluluk geneli günlük bütçe. Sınırlar `kota_ayarlari` tablosunda |
| `giris_epostasi(ad, parola)` | E-posta yalnızca parola doğruysa döner; kullanıcı adı ve IP başına deneme sınırı; zamanlama eşit |
| Sohbet tetikleyicisi | 10 sn'de 5, dakikada 20 mesaj; zaman damgası sunucudan |
| Kenar fonksiyonu / Vercel ucu | Köken izin listesi, gövde boyutu, şema doğrulama, kimlik + kota, zaman aşımı, genel hata mesajı |
| İstem ayrımı | Sistem talimatı `systemInstruction`'da, kullanıcı metni ayrı turda; çıktı süzgeci talimat sızıntısını ve anahtar biçimli dizeleri engeller |
| Tarayıcı | CSP (satır içi betik yok, eval yok), HSTS, çerçeveleme yasağı, mikrofon yalnızca kendi sayfamızda |
| CI | Salt okuma yetkisi, kurulum betikleri kapalı, `npm audit` + güvenlik testleri |

### Güvenlik olayları

Başkan son olayları SQL editöründe görebilir (parola, jeton, ham IP tutulmaz):

```sql
select zaman, tur, ayrinti from public.guvenlik_olaylari order by zaman desc limit 50;
```

Kota sınırlarını değiştirmek (yeniden dağıtım gerekmez):

```sql
update public.kota_ayarlari set dakika = 12, gun = 150, genel = 3000 where tur = 'asistan';
```

### Güncelleme sırası (mevcut kurulum için)

1. Supabase SQL editöründe sırayla **`veritabani/04_guvenlik.sql`**,
   **`05_oduller.sql`**, **`06_isletme.sql`**, **`07_hub.sql`**,
   **`08_kimlik.sql`**, **`09_pano.sql`**'i çalıştır (hepsi tekrar
   çalıştırılabilir; mevcut veri korunur).
2. `git push` — site yeni istemciyle ve `/isletme` sayfasıyla yayına çıkar.
   Önce 1. adım: yeni istemci ödül onayını `06_isletme.sql`'deki fonksiyonla
   yapar, o yoksa ödüller onaylanamaz.
3. Asistan fonksiyonunu dağıt: `npx supabase functions deploy asistan`
   (güncel kurumsal hafıza ve yerel geliştirme kökenleri).
4. Denetle: `node baglanti_kontrol.mjs` — bütün satırlar ✓ olmalı.
5. Sponsorlara `/isletme` adresini ilet; 4-5 haneli eski PIN'leri 6 haneye
   çıkar (Ödül yönetimi → Sponsorlar → düzenle).

### Panelden yapılacak ayarlar

- Authentication → Providers → Email → **Minimum password length: 8**
  (sunucunun varsayılanı 6; uygulamadaki 8 kontrolü tek başına yetmez)
- Authentication → Attack Protection → **CAPTCHA** (Cloudflare Turnstile ücretsiz)
- Custom SMTP + **Confirm email** (bkz. Kurulum → 4)
- Başka alan adına taşınırsan: kenar fonksiyonuna ve Vercel'e
  `IZINLI_KOKENLER` değişkeni (virgülle ayrılmış kökenler)

---

## Asistanın sesi

Seslendirme `api/seslendir.ts` (Vercel). Varsayılan ses Microsoft'un nöral
Türkçe sesi: ücretsiz, anahtar istemez.

**Okunuş:** `api/_ses/metin.ts` metni bir insanın okuyacağı biçime çevirir:
CV → "si vi", QR → "kü ar", XP → "iks pi", 14.00'te → "on dörtte",
1.050 → "bin elli", %20 → "yüzde yirmi", Doç. Dr. → "Doçent Doktor",
Instagram hesabı ve selcuk.edu.tr okunur biçimde. Yeni bir kısaltma okunuşu
bozuksa `INGILIZCE_KISALTMA` ya da `MARKA` listesine eklenir;
`npm run test:ses` ile denenir.

**İsteğe bağlı daha doğal ses (Gemini):** Vercel → Settings → Environment
Variables (VITE_ öneki YOK, anahtar tarayıcıya inmesin):

| Değişken | Değer |
| --- | --- |
| `SES_SAGLAYICI` | `gemini` |
| `GOOGLE_API_KEY` | Google AI Studio anahtarı |
| `GEMINI_SES` | isteğe bağlı, varsayılan `Achird` (samimi); `Sulafat` (sıcak, kadın), `Charon` (bilgilendirici) |

Gemini'nin ücretsiz katmanında günlük sınır var; dolarsa, hata verirse ya da
6 saniyede cevap gelmezse ses kendiliğinden Microsoft sesine döner (günlükte
`gemini_ses_yedege_dustu`). Değişkenleri silmek eski davranışa döndürür.

Piper'ın Türkçe `fettah` ve `fahrettin` sesleri Aralık 2025'te sahiplerinin
isteğiyle resmî depodan kaldırıldı; bu yüzden kullanılmıyor.

---

## Community Rewards (QR, puan, sponsor, ödül)

### Döngü

Etkinliğe gel → ekrandaki canlı QR'yi okut (ya da kısa kodu yaz) → puan →
seviye → sponsor kilidi açılır → sponsordaki QR'yi okut → sürpriz ödül →
işletmede "Ödülü göster" → çalışan **kendi telefonunda** `/isletme`
sayfasıyla QR'yi okutup PIN'ini girer → öğrencinin ekranı "Kullanıldı" olur →
sıradaki etkinlik.

### Gezinme

Çubukta dört sekme ve ortada tarama: **Ana · Etkinlikler · [Tara] · Notlar ·
Ödüller**. Tarama her ekrandan tek dokunuş. Asistan Ana'dan açılır; Topluluk
(genel sohbet, hesap, üyeler) Ana'nın sağ üstündeki profil düğmesinden. Çubuk
beş öğeyi geçmez. Yönetim görünümünde çubuk değişmez (Topluluk orada sekme).

### Role göre arayüz

Herkes aynı girişi kullanır; hangi arayüzün açılacağını **başkanın verdiği
rol** belirler (Topluluk → üye listesinde rol seçimi). Seçim ekranı yok.

| Kim | Açılış | Çubuğun ortası | Öncelik |
| --- | --- | --- | --- |
| Üye | Ana: alıntı, sıradaki etkinlik, ilerleme, bekleyen ödül | QR tara | Katıl, okut, kazan |
| Yönetici / başkan | Panel: alıntı, şu anki etkinlik + "Perdeye yansıt", yapılacaklar (QR görevi yok, PIN yok, stok bitti…), sayılar | Perde QR | Etkinlik anında QR göstermek, eksikleri gidermek |
| Sponsor işletme | Girişteki "Ödül onay ekranı" bağlantısı ya da `/isletme` (hesap yok, PIN) | — | QR okut → PIN → onayla |

- Yetkililer üye görünümüne Hesabım → Açılış görünümü'nden geçer; yetki değişmez.
- Yapılacaklar listesinin kuralları `src/yonetim/oncelik.ts`.

### Alıntılar ve görsel dil

- Her pencerenin kendi sözleri var (`src/veri/alintilar.ts`): üye neden
  burada olduğunu, yönetici neden yönettiğini, işletme neden bu ortaklıkta
  olduğunu her açılışta başka bir sözle görür. Kelimeler yumuşakça belirir.
- **Yalnızca sahibi belgelenmiş sözler.** Kime ait olduğu tartışmalı popüler
  sözler bilerek yok; yeni söz eklerken aynı kural.
- Görsel dil tek: yapay sinir ağı motifi (`src/tasarim/Ag.tsx`) ve canlı
  küre. İşletme ekranında küre sonuca göre değişir (bekliyor, onay, red),
  sonuç işareti çizilerek belirir. Hareket azaltma tercihinde hepsi durur.
- Test: `npm run test:rol` (39) — öncelik kuralları ve alıntı sırası.

### Ürün kararları (UX araştırması sonrası)

| Karar | Neden |
| --- | --- |
| Ana ekran yalnızca sıradaki etkinlik, bir sonraki adım, bekleyen ödül | İlk bakışta "burada benim için ne var?" cevabı; kontrol paneli değil |
| "Bir sonraki adım" cümlesi (en yakın kilit ya da seviye) | XP bir sayı değil, bir sonuç: "Coffee Lab kilidine 30 XP" |
| Takvimde etkinlik başına "+100 XP" ve "Katıldın" | "Bu etkinliğe gelirsem ne olur?" |
| Kamera izninden önce YAZVEB'in kendi açıklaması, kısa kod eşit ağırlıkta | Bağlamsız izin penceresi reddedilir; görüntü cihazdan çıkmaz |
| Bağlantı hatasında okutulan kod saklanır, tek dokunuşla tekrar gönderilir | Kalabalıkta QR'yi yeniden yakalamak zorunda kalınmaz |
| Sıralama varsayılan olarak haftalık, her pazartesi sıfırlanır | Tüm zamanlar tablosu yeni gelen üyeyi kalıcı olarak alta iter |
| Sürpriz kampanyada olası ödüller ve gerçek kalan adet görünür | Sürpriz hangisinin çıkacağı; kör kutu kumar hissi verir |
| Açılış animasyonu 750 ms, dokununca biter | Beklenti evet, yapay bekletme hayır |
| İşletme ekranında tek cümle yönerge, adres, "kullanıldı" onay anı | Öğrenci "ne yapacağım?", çalışan "geçerli mi?" diye sormasın |
| Onay çalışanın cihazında (`/isletme`), öğrencinin telefonunda değil | Öğrencinin elindeki ekran sahte olabilir; karar sunucudan, çalışanın ekranına gelmeli |
| Yeni QR görevi varsayılan olarak canlı kodlu | Perdedeki kodun fotoğrafı WhatsApp'a düşünce gelmeyen de puan alıyordu |

Bilerek **eklenmeyenler**: başlangıçta hediye XP (defteri şişirir, sıralamayı
bozar), "puanların silinecek" uyarıları ve bırakma maliyeti tasarımı (karanlık
desen), rozet/unvan enflasyonu, bildirim altyapısı (önce içerik), bölüm bazlı
sıralama (profilde bölüm verisi yok).

### Kurulum

1. Supabase SQL editöründe **`veritabani/05_oduller.sql`**'i çalıştır
   (04'ten sonra; tekrar çalıştırmak zararsız).
2. Ardından **`veritabani/06_isletme.sql`**'i çalıştır (çalışanın onay sayfası).
3. `node baglanti_kontrol.mjs` → ödül, canlı kod ve işletme satırları ✓
4. Uygulamada **Topluluk → Ödül yönetimi** (ya da Ödüller → Yönetim).

### Yönetim

| Ne | Kim |
| --- | --- |
| QR görevi oluştur, QR göster/yazdır, QR yenile, iptal | başkan + yönetici |
| Sponsor, kampanya, ödül stoğu, işletme PIN'i | başkan + yönetici |
| Başkanın oluşturduğu/düzenlediği görev, sponsor, kampanya | yalnızca başkan |
| Elle puan ekle/düş, seviyeler, seri bonusu, sıralama aç/kapa, denetim kaydı | yalnızca başkan |

- **Etkinlik QR'si:** görev oluştur → QR simgesi → perdeye yansıt. Görev
  **canlı kodluysa** (yeni görevlerde varsayılan) QR ve kısa kodun son dört
  harfi dakikada bir değişir; paylaşılan fotoğraf ya da kod iki dakikada
  eskir. Canlı kod yazdırılamaz. Basılı QR gereken yerde (stand, afiş) canlı
  kodu kapat ve mümkünse konum şartı ekle.
- **Sponsor QR'si:** kampanyanın QR'sini yazdırıp işletmeye bırak. İşletmeye
  **PIN'i** (6-8 hane) ve **`<site>/isletme`** adresini ilet. Çalışan ödülü
  kendi telefonunda bu sayfadan onaylar; PIN'i öğrencinin telefonuna girmez.
  PIN tanımlanmadan ödül kullanılamaz.
- **Stok:** kampanyayı düzenle → kaleme "stok ekle". Tükenen kampanya yeniden
  açılır. Sınırsız kalemde stok düşmez, kişi başı hak yine işler.
- **QR sızdıysa:** "QR yenile" — basılmış eski QR'ler anında geçersiz olur.

### Güvenlik modeli

- Tablolar API'ye açık olmayan `odul` şemasında; istemci yalnızca `odul_*`
  fonksiyonlarını çağırır. Puan, kilit, stok, ödül kararı sunucuda.
- QR içeriği `YAZVEB:G:` / `YAZVEB:S:` + 192 bit rastgele token. Sıralı kimlik yok.
- Canlı görev: kabul edilen kod `HMAC(sır, token + dakika)`'dan türetilir; o
  anki ve bir önceki dakikanınki geçer. Sır sunucudan çıkmaz; istemci gelecek
  kodu hesaplayamaz. Eskimiş kod "süresi geçmiş" der ve deneme sayılmaz;
  uydurma kod hatalı deneme sayılır.
- Eşzamanlılık: görev ve kampanya satırı kilitlenir; son ödülü iki kişi aynı
  anda isterse biri alır. Stok eksiye düşemez.
- Olası ödüller (başlık, ikon, kalan adet) istemciye gider; kalem kimliği,
  çekiliş ağırlığı, token, kısa kod ve PIN gitmez. Hangisinin çıkacağı yalnızca
  sunucuda, tarama anında belirlenir.
- Etkinlik özeti (`odul_etkinlik_ozeti`) yalnızca etkinlik başına toplam puanı
  ve kişinin katılıp katılmadığını döner; görev kodları sızmaz.
- Kaba kuvvet: 10 dakikada 10 hatalı kod; dakikada 20 tarama. İşletme
  sayfasında 15 dakikada kaynak başına 10, ödül kodu başına 5, sponsor
  başına 30 hatalı deneme; başarılı onaylar sayılmaz.
- Ödül onayı **çalışanın cihazında**: `/isletme` sayfası kod + PIN'i sunucuya
  sorar, cevabı sunucudan gösterir. Kod ya da PIN yanlışsa yalnızca
  "geçersiz" döner (hangisi olduğu ve kodun varlığı söylenmez). "Kullanıldı"
  işareti sunucuda; ekran görüntüsü ya da sahte bir sayfa ikinci kullanım
  sağlamaz. Çalışan öğrencinin adını görmez, yalnızca ödülü.
- Eski sürümün öğrenci telefonundaki PIN akışı (`odul_kullan`) veritabanında
  duruyor: güncellenmemiş uygulamalar bozulmasın diye. Yeni arayüz onu
  kullanmaz.
- Her yönetim işlemi `odul.denetim` tablosuna yazılır.

### Testler

```bash
npm run test:odul       # QR gidiş-dönüşü (canlı ve ödül QR'si dahil), ilerleme dili, son kullanım (48)
```

İş mantığı ve saldırı senaryoları (141 + 27) — tekrar tarama, süre, iptal,
konum, canlı kod (eksik, eskimiş, uydurma, yenilenen QR), kilit, stok, son 3,
tükenme, sınırsız, PIN, başkasının ödülü, hız sınırı, haftalık sıralama,
etkinlik özeti, sponsor kilidinin kampanyaları kapsaması, işletme onayı
(yanlış PIN, olmayan kod, başka sponsorun PIN'i, ikinci onay, kaba kuvvet) —
yukarıdaki "Testleri çalıştırma" paketinin içinde çalışır.

Gerçek eşzamanlılık (20 kişi aynı anda son ödüle; HUB'a aynı anda ilk giriş;
aynı Coin'le aynı anda beş satın alma) ayrı ve **boş** bir veritabanına karşı,
yukarıdaki kabı kullanarak:

```bash
docker exec yz-test psql -U postgres -d postgres -q -c "drop database if exists yaris" -c "create database yaris"
PG_URL=postgres://postgres:test@127.0.0.1:5433/yaris npm run test:yaris
```

---

## YAZVEB HUB (3B görünüm)

Topluluğun dijital kampüsü: her üyenin bir odası, bir karakteri var; sponsorlar
bir çarşıda dükkân. **Görünüm değiştirmedir**, ayrı bir uygulama değil: Ana
ekrandaki **3D HUB** düğmesiyle açılır, sol üstteki düğmeyle klasik görünüme
dönülür. Seçim cihazda hatırlanır. Günde ~10 dakikalık bir döngü için
tasarlandı; asıl uygulamanın (etkinlik, QR, ödül) önüne geçmez.

### Ne var

| Yer | Ne yapılır |
| --- | --- |
| **Bina** | 3/4 izometrik kule; her katta iki oda. Kendi odan en başta, sonra en son düzenlenen odalar (sayfa başına 27). Topluluk büyüdükçe çatıda yeni bölümler açılır (HUB’a katılan üye sayısı: Lounge 50, Oyun odası 150, Çatı kafe 300). |
| **Odam** | Karakteri giydir (ten, saç, yüz, tişört, sweatshirt, ceket, pantolon, ayakkabı, şapka, gözlük, çanta, YAZVEB eşyaları). Odayı düzenle (6×6 ızgara: yerleştir, döndür, kaldır, kaydet). |
| **Ziyaret** | Binadan bir odaya dokun: sahibinin **son kaydettiği** hâli görünür. Emoji, mesaj ya da kendi eşyanı hediye bırak (günde 10). |
| **Çarşı** | Sponsorlar XP eşiklerine göre basamaklı teraslarda. Kapıyı çal: açıksa sponsorun ödülleri açılır, kilitliyse kaç XP kaldığını söyler. |
| **Görevler** | Günlük: 1 ziyaret +20, 3 ziyaret +75, hediye +25, oda düzeni +30 Coin. Okutulan her etkinlik QR'si bir kez Coin'e çevrilir (XP×5, en az 10, en çok 1000). |
| **Şans Çarkı** | Haftada bir, ücretsiz. Bütün dilimlerin olasılığı ekranda yazılı. |
| **Mağaza** | Kıyafet ve oda eşyaları Coin ile. |

### Kararlar

- **Coin XP'den ayrı.** XP sıralamayı ve sponsor kilitlerini belirler; Coin
  yalnızca karakter/oda için harcanır. Coin harcamak XP'yi düşürmez, çark XP
  vermez — oyun, ödül defterini bozamaz.
- **Çark kumar değil:** parayla ya da Coin'le ek çevirme yok, boş dilim yok,
  olasılıklar açık. Hafta Pazartesi 00:00'da (İstanbul) yenilenir.
- **Hoş geldin:** ilk girişte 150 Coin + başlangıç kıyafeti + masa ve sandalye.
- **Gerçek zamanlı çok oyunculu yok** (MVP): sunucu maliyeti ve moderasyon
  yükü olmadan sosyal his; ziyaret son kayıtlı odayı gösterir.
- **Hafif:** Three.js (~150 KB gzip) yalnızca HUB açılınca iner; sekme
  arka plandayken çizim durur; hareket azaltma tercihinde animasyon yok;
  WebGL yoksa ya da HUB bir hata verirse uygulama klasik görünümde devam eder.

### Güvenlik modeli

- Tablolar API'ye kapalı `hub` şemasında; istemci yalnızca `hub_*`
  fonksiyonlarını çağırır, hepsi anonime kapalı.
- Coin, fiyat, envanter ve çark sonucu **istemciden kabul edilmez**. Her Coin
  hareketi `hub.coin_islemleri` defterine yazılır; bakiye eksiye düşemez.
- Satın alma ve hoş geldin satırı kilitlenir: aynı anda beş satın alma ya da
  beş ilk giriş tek sonuç üretir (yarış testi Y6, Y7).
- Karakter yalnızca **sahip olunan** ve doğru yuvaya ait eşyayı giyer; oda
  yalnızca sahip olunan kadar eşya alır, çakışma ve ızgara dışı reddedilir.
- Hediye edilen eşya gönderenin envanterinden ve odasından düşer; emoji ve
  mesaj beyaz liste/uzunluk sınırlı, görünmez karakter reddedilir.

### Kurulum

1. Supabase SQL editöründe **`veritabani/07_hub.sql`**'i çalıştır (05'ten
   sonra; tekrar çalıştırmak zararsız, mevcut Coin ve odalar korunur).
2. `node baglanti_kontrol.mjs` → "YAZVEB HUB kurulu, anonime kapalı" ✓
3. Ardından `git push`. SQL'den önce yayına çıkarsa HUB açılır ama "YAZVEB
   HUB henüz kurulmamış" der; uygulamanın geri kalanı etkilenmez.

---

## Notlar ve öğrenci doğrulama

Uygulamanın kampüs geneline açılan ilk modülü: bölüm bölüm **ders notu,
çıkmış soru çözümü ve özet**. Aynı altyapı (doğrulanmış yazar, künye,
şikayet, moderasyon, sponsorlu kart) ileride ev devri, 2. el ve duyurular
için kullanılacak.

### Değişmez kurallar

- **Uygulamada para dönmez.** Ödeme, kapora, komisyon yok. Gelir yalnızca
  reklam, duyuru ve sponsordan gelir; öğrenciden para alınmaz.
- **Her öğrenci ağa eşit erişir.** Öğrencinin notu parayla öne çıkarılamaz.
  Sponsorlu kart kademesine göre (altın → gümüş → bronz) üstte ve daha dikkat
  çekici durur, ama her zaman "Sponsorlu" etiketiyle ve en fazla her beş
  kartta bir; organik notu listeden itmez. Not yokken en fazla bir sponsorlu
  kart görünür.
- **Hedefleme kişisel veriyle değil bağlamla:** üniversite ve sınav dönemi.

### Öğrenci doğrulama (resmî prosedür yok)

Üniversitenin kendi e-posta sunucusu kanıttır. Öğrenci `.edu.tr` ile biten
adresini yazar (Selçuk: `öğrencinumarası@ogr.selcuk.edu.tr`), `dogrula`
fonksiyonu 6 haneli bir kod gönderir, öğrenci kodu uygulamaya yazar.

- Herhangi bir üniversite kabul edilir; üniversite **e-posta alanından**
  gelir, elle yazılamaz. Bölüm ve sınıf beyandır. Öğrenci alt alanları
  (`ogr.`, `ogrenci.`, `std.`, `stu.`, `stud.`, `student.`) "Doğrulanmış
  öğrenci", kurumun ana alanı "Doğrulanmış üniversite e-postası" rozeti alır.
  Tanınmayan alanın adını yönetici verir (Yönetim → Notlar → Üniversiteler).
- **Adres saklanmaz**; yalnızca alan adı, doğrulama tarihi ve adresin gizli
  anahtarlı özeti (aynı adres iki hesabı doğrulamasın diye). Öğrenci numarası
  veritabanına hiç girmez. Kullanıcı doğrulamasını kendisi kaldırabilir.
- Kodu üreten fonksiyon **yalnızca sunucu rolüne** açık; kod istemciye hiç
  dönmez. 30 dakika geçerli (Selçuk'un sunucusu yeni göndereni ~10 dk
  bekletiyor), 5 hatalı denemede yanar. Kullanıcı başına
  dakikada 1, günde 5; adres başına günde 5; toplam günde 250 gönderim
  (e-posta servisinin ücretsiz katmanı aşılmasın).
- Doğrulama her yıl **31 Ekim**'de biter (en az üç ay geçerli). Selçuk'ta
  öğrenci e-postası mezuniyetten 60 gün sonra silinir: mezun yenileyemez.
- Doğrulanmamış üye notun **var olduğunu** görür (künye, kaç kişinin işine
  yaradığı) ama dosyayı açamaz ve paylaşamaz. Kural Storage'ın satır
  kurallarında: istemci atlayamaz.

### Puan (cazip, abartısız — Yönetim → Notlar'dan başkan değiştirir)

| Ne | XP |
| --- | --- |
| Not onaylandı (48 saat içinde açık şikayet yok) | +20 |
| Sınavdan önceki 14 gün / sınav haftası içinde paylaşılan | taban ×1,5 (+30) |
| Her "işime yaradı" (notu açmış, doğrulanmış, farklı kişi) | +3 |
| Bir notun tavanı | 60 |
| Haftalık not puanı tavanı (net) | 150 |

Puanın çoğu yüklemekten değil, başkasının işine yaramaktan gelir. Tavanı
aşan kısım kaybolmaz; sonraki haftalarda tamamlanır. Not gizlenir ya da
kaldırılırsa verilen puan geri alınır. Aynı dosya ikinci kez paylaşılamaz;
kişi başı günde 5 paylaşım.

### Şikayet ve moderasyon

Notlar ve sohbet mesajları şikayet edilebilir. Not için **doğrulanmış**
öğrencilerin şikayeti sayılır (sahte hesaplarla not düşürülemesin); eşik (3)
dolunca içerik incelemeye kadar gizlenir, yetkilinin şikayeti tek başına
gizler. Karar Yönetim → Şikayetler'de: "Yayında tut" ya da "Kaldır". Her
karar denetim kaydına yazılır. Yazar onaylanmış notunun dosyasını silip
yerine başka dosya koyamaz (Storage kuralı).

### Sınav dönemi

Yönetim → Notlar → Sınav dönemleri: üniversite (e-posta alanı), ad (Vize,
Final...) ve tarihler. Dönemden 14 gün önce ana ekranda kart çıkar, Notlar'da
şerit ve "en faydalı" sıralama gelir, o sırada paylaşılan not ×1,5 taban puan
alır ve "yalnızca sınav döneminde" sponsorlu ilanlar görünür.

### Kurulum

1. Supabase SQL editöründe **`veritabani/08_kimlik.sql`**, sonra
   **`veritabani/09_pano.sql`**'i çalıştır. 09, `notlar` Storage kovasını
   (özel, 15 MB, PDF/JPG/PNG/WEBP) ve satır kurallarını da kurar.
2. E-posta servisi (ücretsiz): **Brevo** (alan adı gerekmez; topluluğun
   Gmail adresini gönderen olarak doğrulamak yeter, günde 300 e-posta) ya da
   **Resend** (kendi alan adı + DNS kaydı ister). Anahtarı al, sonra:

   ```bash
   npx supabase secrets set EPOSTA_SAGLAYICI=brevo EPOSTA_ANAHTARI=xkeysib-... "EPOSTA_GONDEREN=YAZVEB <topluluk@gmail.com>"
   npx supabase functions deploy dogrula
   ```

3. `node baglanti_kontrol.mjs` → doğrulama, kod üreticinin kapalılığı, Notlar
   ve e-posta fonksiyonu satırları ✓.
4. Yönetim → Notlar'dan bu dönemin vize/final tarihlerini gir.

Gönderen adresin alan adı (ör. gmail.com) servis tarafından imzalanmadığı
için bazı üniversite sunucuları ilk e-postaları gereksiz klasörüne atabilir;
uygulama bu yüzden "gereksiz klasörüne de bak" der. Kalıcı çözüm, topluluğa
ait bir alan adını servise doğrulatmak (DNS kaydı).

E-posta servisi kurulmadan yayına çıkılırsa uygulama çalışır; doğrulama
penceresi "E-posta gönderimi henüz kurulmadı" der, notlar görünür ama açılamaz.

---

## Asistan (Edge Function)

Asistanın beyni **sunucuda** çalışır: `supabase/functions/asistan/`.

Model anahtarı uygulamanın içine konulamaz — mobil paketten çıkarılır ve
başkasının faturasına sınırsız istek atmak için kullanılır. Anahtar Supabase'in
gizli değişkenlerinde durur, cihaza hiç inmez. Fonksiyonu yalnızca **giriş
yapmış üyeler** çağırabilir (Supabase JWT'yi kendisi doğrular), böylece
internetteki rastgele biri kotayı tüketemez.

Selam ve teşekkür gibi cümleler sunucuya **hiç gitmez**; cihazda anında
cevaplanır (`src/veri/hizli.ts`).

### Kurulum

```bash
cd uygulama
npx supabase login                      # tarayıcıda onaylanır
npx supabase link --project-ref difbuvccdyyscktalahy
npx supabase secrets set GOOGLE_API_KEY=BURAYA_ANAHTARI_YAZ
npx supabase functions deploy asistan
```

Anahtarı Google AI Studio'dan alırsın: https://aistudio.google.com/apikey
(Streamlit sürümünde kullandığın anahtarın aynısı işe yarar —
`.streamlit/secrets.toml` içinde duruyor.)

### Kurumsal hafıza nasıl güncellenir

Tek doğru kaynak `bilgi_bankasi.py`. Değiştirdikten sonra:

```bash
python bilgi_disa_aktar.py              # depo kökünde
npx supabase functions deploy asistan   # uygulama/ içinde
```

Bilgiyi iki yerde tutmuyoruz; elle iki yeri güncellemek er geç ikisinin
ayrışmasıyla biter — asistan web'de doğru, telefonda eski bilgiyi söyler ve
kimse fark etmez.

### Neden vektör araması yok

Hafızanın tamamı ~4.800 jeton ve modelin tek istemine sığıyor. Parçalayıp en
yakın beşini aramak bu ölçekte fazladan bir ağ çağrısı (gömme) ve isabet kaybı
riski demek. Hepsini vermek daha hızlı, daha basit, daha doğru.
