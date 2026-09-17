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
    OdulGoster.tsx     işletmeye gösterilen ödül + PIN onayı
    SponsorKarti.tsx   sponsor kartı, kıtlık etiketi, detay
    qr.ts              QR çözme (BarcodeDetector / jsQR)
  yonetim/
    Yonetim.tsx        ödül yönetim paneli (lazy yüklenir)
    QrKod.tsx          QR üretimi (SVG) ve yazdırma
  ekranlar/Oduller.tsx ilerleme profili: puan, seviye, sponsorlar, cüzdan, sıralama
  tasarim/
    jetonlar.css       TEK KAYNAK: renk, boşluk, yazı, hareket, katman
    temel.css          zemin, kontroller, gezinme, sahne geçişi
    ekranlar.css       ekran düzenleri
    Simge.tsx          ikon seti (24 ızgara, 1.5 çizgi)
veritabani/
  01_sema.sql        tablolar, tetikleyiciler
  02_yetkiler.sql    satır düzeyi güvenlik
  03_kurulum.sql     ilk başkanı ata
  99_testler.sql     yetki testleri
```

### Testleri çalıştırma

```bash
npm run test:guvenlik      # girdi doğrulama, istem ayrımı, çıktı süzgeci, CORS (47)
npm run test:transkript    # mikrofon parçalarını birleştirme (12)
npm run yayina-hazir       # derleme + paket taraması (sır, kaynak haritası, CSP)
```

Veritabanı testleri (200) — Docker gerekir. Yetki ve güvenlik (86) + ödül iş
mantığı, sıralama ve saldırı senaryoları (114) tek paket hâlinde çalışır:

```bash
docker run -d --name yz-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=yazveb \
  -p 127.0.0.1:5433:5432 postgres:17-alpine
cd veritabani
for f in *.sql; do docker cp $f yz-test:/tmp/; done
docker exec yz-test psql -U postgres -d yazveb -v ON_ERROR_STOP=1 -q \
  -f /tmp/00_test_altyapisi.sql -f /tmp/01_sema.sql -f /tmp/02_yetkiler.sql \
  -f /tmp/99_testler.sql -f /tmp/03_kurulum.sql -f /tmp/04_guvenlik.sql \
  -f /tmp/99_guvenlik_testleri.sql -f /tmp/05_oduller.sql -f /tmp/99_odul_testleri.sql
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

1. `git push` — site yeni istemciyle yayına çıkar (geçiş süresince eski
   giriş fonksiyonuna da düşebilir; kimse dışarıda kalmaz).
2. Supabase SQL editöründe **`veritabani/04_guvenlik.sql`**'i çalıştır.
3. Asistan fonksiyonunu dağıt: `npx supabase functions deploy asistan`
4. Denetle: `node baglanti_kontrol.mjs` — bütün satırlar ✓ olmalı.

### Panelden yapılacak ayarlar

- Authentication → Providers → Email → **Minimum password length: 8**
  (sunucunun varsayılanı 6; uygulamadaki 8 kontrolü tek başına yetmez)
- Authentication → Attack Protection → **CAPTCHA** (Cloudflare Turnstile ücretsiz)
- Custom SMTP + **Confirm email** (bkz. Kurulum → 4)
- Başka alan adına taşınırsan: kenar fonksiyonuna ve Vercel'e
  `IZINLI_KOKENLER` değişkeni (virgülle ayrılmış kökenler)

---

## Community Rewards (QR, puan, sponsor, ödül)

### Döngü

Etkinliğe gel → QR'yi okut (ya da kısa kodu yaz) → puan → seviye → sponsor
kilidi açılır → sponsordaki QR'yi okut → sürpriz ödül → işletmede göster →
çalışan PIN'iyle onaylar → sıradaki etkinlik.

### Gezinme

Çubukta dört sekme ve ortada tarama: **Ana · Etkinlikler · [Tara] · Ödüller ·
Topluluk**. Tarama her ekrandan tek dokunuş. Asistan Ana'dan, genel sohbet
Topluluk'tan açılır; çubuk beş öğeyi geçmez.

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

Bilerek **eklenmeyenler**: başlangıçta hediye XP (defteri şişirir, sıralamayı
bozar), "puanların silinecek" uyarıları ve bırakma maliyeti tasarımı (karanlık
desen), rozet/unvan enflasyonu, bildirim altyapısı (önce içerik), bölüm bazlı
sıralama (profilde bölüm verisi yok).

### Kurulum

1. Supabase SQL editöründe **`veritabani/05_oduller.sql`**'i çalıştır
   (04'ten sonra; tekrar çalıştırmak zararsız).
2. `node baglanti_kontrol.mjs` → "Ödül sistemi kurulu, anonime kapalı" ✓
3. Uygulamada **Topluluk → Ödül yönetimi** (ya da Ödüller → Yönetim).

### Yönetim

| Ne | Kim |
| --- | --- |
| QR görevi oluştur, QR göster/yazdır, QR yenile, iptal | başkan + yönetici |
| Sponsor, kampanya, ödül stoğu, işletme PIN'i | başkan + yönetici |
| Başkanın oluşturduğu/düzenlediği görev, sponsor, kampanya | yalnızca başkan |
| Elle puan ekle/düş, seviyeler, seri bonusu, sıralama aç/kapa, denetim kaydı | yalnızca başkan |

- **Etkinlik QR'si:** görev oluştur → QR simgesi → perdeye yansıt ya da yazdır.
  Kamerası olmayan için altında kısa kod yazar.
- **Sponsor QR'si:** kampanyanın QR'sini yazdırıp işletmeye bırak. İşletmeye
  **PIN'i** ayrıca ilet; ödül onayında çalışan girer. PIN tanımlanmadan ödül
  kullanılamaz.
- **Stok:** kampanyayı düzenle → kaleme "stok ekle". Tükenen kampanya yeniden
  açılır. Sınırsız kalemde stok düşmez, kişi başı hak yine işler.
- **QR sızdıysa:** "QR yenile" — basılmış eski QR'ler anında geçersiz olur.

### Güvenlik modeli

- Tablolar API'ye açık olmayan `odul` şemasında; istemci yalnızca `odul_*`
  fonksiyonlarını çağırır. Puan, kilit, stok, ödül kararı sunucuda.
- QR içeriği `YAZVEB:G:` / `YAZVEB:S:` + 192 bit rastgele token. Sıralı kimlik yok.
- Eşzamanlılık: görev ve kampanya satırı kilitlenir; son ödülü iki kişi aynı
  anda isterse biri alır. Stok eksiye düşemez.
- Olası ödüller (başlık, ikon, kalan adet) istemciye gider; kalem kimliği,
  çekiliş ağırlığı, token, kısa kod ve PIN gitmez. Hangisinin çıkacağı yalnızca
  sunucuda, tarama anında belirlenir.
- Etkinlik özeti (`odul_etkinlik_ozeti`) yalnızca etkinlik başına toplam puanı
  ve kişinin katılıp katılmadığını döner; görev kodları sızmaz.
- Kaba kuvvet: 10 dakikada 10 hatalı kod; ödül başına 15 dakikada 5 hatalı PIN;
  dakikada 20 tarama.
- Ödül ekranında saniyesi akan saat ve 30 saniyede değişen doğrulama kodu;
  asıl koruma PIN ile sunucuda "kullanıldı" işareti — ekran görüntüsüyle ikinci
  kullanım yok.
- Her yönetim işlemi `odul.denetim` tablosuna yazılır.

### Testler

```bash
npm run test:odul       # QR gidiş-dönüşü, ilerleme dili, bir sonraki adım, son kullanım (31)
```

İş mantığı ve saldırı senaryoları (114) — tekrar tarama, süre, iptal, konum,
kilit, stok, son 3, tükenme, sınırsız, PIN, başkasının ödülü, hız sınırı,
haftalık sıralama, etkinlik özeti —
yukarıdaki "Testleri çalıştırma" paketinin içinde çalışır.

Gerçek eşzamanlılık (20 kişi aynı anda son ödüle) ayrı ve **boş** bir
veritabanına karşı, yukarıdaki kabı kullanarak:

```bash
docker exec yz-test psql -U postgres -d postgres -q -c "create database yaris"
PG_URL=postgres://postgres:test@127.0.0.1:5433/yaris npm run test:yaris
```

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
