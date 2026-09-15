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
| Riski | Sahte e-postayla kayıt olunabilir | Kurulum işi |

Kapalı topluluk için **kolay yol** yeterli: rolleri zaten başkan dağıtıyor,
kayıt olmak tek başına hiçbir yetki vermiyor. Üye sayısı büyürse sağlam yola
geçilir.

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
  ekranlar/
    Asistan.tsx        küre, sesli/yazılı asistan
    Giris.tsx          giriş ve kayıt
    Sohbet.tsx         genel sohbet (anlık)
    Etkinlikler.tsx    takvim, rol kısıtlı düzenleme
    Topluluk.tsx       üye listesi, rol dağıtma, hesap
  canli/
    sahne.ts           WebGL parçacık küresi (durumlar, sönümlü hareket)
    olcer.ts           mikrofon ve yanıt sesinden gerçek genlik
    Kure.tsx           kürenin React kabuğu
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

Docker gerekir:

```bash
docker run -d --name yz-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=yazveb postgres:16-alpine
cd veritabani
for f in 00_test_altyapisi.sql 01_sema.sql 02_yetkiler.sql 99_testler.sql; do
  docker cp $f yz-test:/tmp/
done
docker exec yz-test psql -U postgres -d yazveb -v ON_ERROR_STOP=1 -q \
  -f /tmp/00_test_altyapisi.sql -f /tmp/01_sema.sql \
  -f /tmp/02_yetkiler.sql -f /tmp/99_testler.sql
```

Bir kural bozulursa betik hata ile durur.

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
