# YAZVEB Merkez

Selçuk Üniversitesi Yapay Zeka ve Veri Bilimi Topluluğu'nun sesli dijital
karşılayıcısı. Tam ekran bir silüet, kurumsal hafızaya bağlı bir asistan ve
kesintisiz karşılıklı sesli sohbet.

Kullanıcı konuşur, asistan cevaplar; cevabı verirken silüetin kendisi sesin
tonlamasına göre içeriden aydınlanır. Sayfa hiçbir aşamada yenilenmez.

---

## Kurulum

```bash
git clone <depo-adresi>
cd YAZVEB_Asistan

python -m venv venv
venv\Scripts\activate          # Linux / macOS:  source venv/bin/activate
pip install -r requirements.txt

copy .streamlit\secrets.toml.example .streamlit\secrets.toml
# secrets.toml içine Google AI Studio anahtarını yaz:
# https://aistudio.google.com/apikey

streamlit run app.py
```

Vektör deposu ilk çalıştırmada `bilgi_bankasi.py` içeriğinden kendiliğinden
kurulur; depoya dahil değildir.

---

## Mimari

```
app.py            Streamlit sayfası — sahne, ray, yazılı giriş yolu
arayuz.py         Görsel katman: bütün CSS ve HTML parçaları
konsol.py         Tarayıcı konsolu — mikrofon, ses zinciri, açılış katmanı
kopru.py          Yerel HTTP köprüsü — sesli yolun rerun'suz taşıyıcısı
zincir.py         Asistanın beyni — hızlı yol, RAG, model
ses_motoru.py     Seslendirme: ElevenLabs → OpenAI → edge-tts
araclar.py        Zaman, hesap ve güncel arama yardımcıları
bilgi_bankasi.py  Kurumsal hafıza (tek doğru kaynak)
gorsel_uret.py    Silüetin WebP sürümlerini üretir
```

### Neden ayrı bir HTTP köprüsü var

Streamlit her etkileşimde betiği baştan çalıştırır. Sesli sohbet bunu
kaldırmaz: kullanıcı konuştuğu an sayfa yeniden çizilirse çalan ses kesilir,
mikrofon kapanır, açılış videosu başa sarar.

Bu yüzden konuşma trafiği Streamlit'in dışından akar. Aynı Python süreci içinde
`127.0.0.1` üzerinde küçük bir HTTP sunucusu açılır; tarayıcıdaki konsol
doğrudan oraya `fetch` eder. Sunucu yalnızca loopback'e bağlanır ve her
oturumda üretilen rastgele bir anahtarla korunur.

Yazılı giriş (`st.chat_input`) klasik Streamlit akışında kalır. İki yol aynı
sohbet geçmişini paylaşır; geçmiş `kopru.py` içinde tutulur.

### Konuşan silüet

JavaScript hiçbir şey çizmez. Yaptığı tek şey her karede kök öğeye üç sayı
yazmaktır:

| değişken    | anlamı            |
| ----------- | ----------------- |
| `--yz-guc`  | genel ses gücü    |
| `--yz-bas`  | bas enerjisi      |
| `--yz-tiz`  | tiz enerjisi      |

Silüetin parlaması, halenin genişlemesi ve halkaların atması tamamen CSS'te bu
değişkenlerden türetilir. Böylece animasyon derleyici katmanında kalır. Ölçüm
döngüsü yalnızca konuşurken veya dinlerken döner; sayfa sessizken CPU kullanımı
sıfırdır.

### Hızlı yol

"Merhaba", "nasılsın", "teşekkürler" gibi cümleler için gömme çağrısı, vektör
araması ve model çağrısı tamamen atlanır (`zincir.hizli_cevap`). Bu cevapların
seslendirmesi açılışta arka planda hazırlanır, böylece bekleme kalmaz.

Kalıplar bilerek dardır: eşleşmenin cümlenin tamamını kaplaması gerekir.
"Merhaba, etkinlik ne zaman?" hızlı yola düşmez — içindeki gerçek soruyu
kurumsal hafıza cevaplar.

---

## Yapılandırma

Ayarlar `app.py` başındadır: ses açık/kapalı, ses adı, rayda görünen mesaj
sayısı, açılış süresi, karşılama cümlesi.

Ortam değişkenleriyle (hiçbiri zorunlu değil):

| değişken              | etkisi                                              |
| --------------------- | --------------------------------------------------- |
| `GOOGLE_API_KEY`      | secrets.toml yerine ortamdan okunur                 |
| `YAZVEB_MODEL`        | sohbet modelini değiştirir                          |
| `YAZVEB_TTS`          | `edge` · `openai` · `elevenlabs` · `oto`            |
| `ELEVENLABS_API_KEY`  | ElevenLabs Multilingual v2 (en doğal Türkçe)        |
| `OPENAI_API_KEY`      | OpenAI `tts-1-hd` ve Whisper (konuşma tanıma yedeği) |

Hiçbiri tanımlı değilse optimize edilmiş `edge-tts` kullanılır.

---

## Tarayıcı desteği

Sesli sohbet, tarayıcının konuşma tanıma API'sini kullanır: Chrome ve Edge'de
tam çalışır. Firefox ve Safari'de `OPENAI_API_KEY` tanımlıysa ses sunucuya
gönderilip Whisper ile çözümlenir; o da yoksa arayüz yazılı moda düşer.

Mikrofon izni tarayıcı tarafından sorulur ve yalnızca `Sesli sohbet` düğmesine
basıldığında istenir.

---

## Görseller

Kaynak silüet 35 MB'lık bir PNG'dir ve depoya dahil değildir. Uygulama
`static/siluet-*.webp` sürümlerini kullanır (toplam ~540 KB). Kaynak görseli
değiştirirsen:

```bash
pip install pillow
python gorsel_uret.py yeni-siluet.png
```
