# -*- coding: utf-8 -*-
"""
YAZVEB asistanının beyni.

Önceki sürümdeki en büyük mimari hata, davranış talimatlarının kurumsal
hafızanın *içine* yazılmış olmasıydı. Talimatlar da parçalanıp embedding'e
giriyordu; yani model, kendi kurallarını ancak vektör araması onları
getirdiğinde görüyordu. Burada iki katman kesin olarak ayrıldı:

  SISTEM_TALIMATI  -> her istemde sabit, asla parçalanmaz
  bilgi_bankasi    -> yalnızca içerik, aranabilir ve anahtarlı
"""

from __future__ import annotations

import hashlib
import os
import random
import re
from concurrent import futures
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

try:  # yeni paket önerilir, eskisi hâlâ çalışır
    from langchain_chroma import Chroma
except ImportError:  # pragma: no cover
    from langchain_community.vectorstores import Chroma  # type: ignore

import araclar
import bilgi_bankasi

# ══════════════════════════════════════════════════════════════════
# AYARLAR
# ══════════════════════════════════════════════════════════════════

SOHBET_MODELI = os.environ.get("YAZVEB_MODEL", "gemini-3.5-flash-lite")
# Daha derin cevap istenirse: "gemini-3.5-flash" veya "gemini-3.6-flash".
# Gecikme sunucu tarafında dalgalanabiliyor; YAZVEB_MODEL ortam değişkeniyle
# kod değiştirmeden başka bir modele geçilebilir.

# Cevaplar yüksek sesle okunuyor. Uzun cevap iki yönden kötü: dinlemesi
# yorucu ve GEÇ geliyor — üretim süresi doğrudan çıktı uzunluğuyla artıyor.
# Ölçüm: iki parçalık (uzun) cevaplar 7 saniyeyi buluyor, kısa olanlar 1,2
# saniyede dönüyor. Sınır hem tempoyu hem gecikmeyi birlikte düzeltiyor.
EN_FAZLA_JETON = 170
# ÖLÇÜM (33 çağrı): model ya ~1,2 saniyede dönüyor ya da ~20 saniye takılıyor.
# Arada değer yok; dağılım iki kutuplu. Sağlıklı çağrıların en yavaşı 5,5 sn.
#
# İsteği KESMEK işe yaramıyor: `timeout` istemci tarafında iptal etmiyor,
# sunucuya deadline olarak gidiyor ve süre dolunca 504 DEADLINE_EXCEEDED
# dönüyor — yani kısa zaman aşımı, yavaş çağrıyı doğrudan HATAYA çeviriyor.
# (API kısa değerleri zaten reddediyor: "Manually set deadline 9s is too short".)
#
# Bu yüzden kesmek yerine İKİNCİ BİR İSTEK atılır: ilki iptal edilmez, yanına
# yenisi konur ve ilk dönen kazanır. Takılan çağrı bekleyişi uzatmaz.
#
# Eşik sağlıklı çağrıların üstünde ama takılanların çok altında olmalı.
# Ölçüm: sağlıklı çağrılar 1-2 sn, nadiren 5,5 sn; takılanlar 20 sn+.
# Eşik iki yönden sıkışık: yüksek olursa kullanıcı bekler, DÜŞÜK olursa sağlıklı
# çağrılar boşuna ikizlenir. İkincisi sadece israf değil — ücretsiz kotada istek
# sınırına çarpmak, kaçınmaya çalıştığımız hataları geri getirir. 2,5 saniyede
# beş soruda on kez tetikleniyordu; 3 saniye dengeyi kuruyor.
ISTEK_ZAMAN_ASIMI = 30      # sunucu deadline'ı — yalnızca en son emniyet
IKINCI_ATIS_SURESI = 3      # bu süre içinde dönmezse yeni bir istek atılır
DENEME_SAYISI = 3           # en fazla kaç paralel istek
SON_BEKLEME = 12            # son atıştan sonra en fazla bu kadar beklenir

EMBEDDING_MODELI = "models/gemini-embedding-001"
# Çok dilli/çok modlu yükseltme: "models/gemini-embedding-2"
# (Değiştirirsen .vektor_deposu klasörünü sil, indeks yeniden kurulsun.)

GETIRILEN_PARCA = 5
GECMIS_TUR_SAYISI = 6
DEPO_KLASORU = Path(__file__).parent / ".vektor_deposu"


SISTEM_TALIMATI = """Sen YAZVEB Asistanısın. Selçuk Üniversitesi Yapay Zeka ve Veri Bilimi
Topluluğu'nun dijital karşılayıcısısın. Karşındaki çoğunlukla bir öğrenci.

KONUŞMA BİÇİMİ
- Cevapların yüksek sesle okunuyor. Markdown başlığı, madde işareti, yıldız veya emoji kullanma.
- Düz, akıcı cümlelerle konuş. Varsayılan uzunluk iki ila üç KISA cümle.
- Cevabın yüksek sesle okunacağını unutma: uzun cümle kurma, sıfat yığma.
- Kullanıcı açıkça detay isterse uzat; istemedikçe uzatma.
- Her cevapta kendini tanıtma. "Ben YAZVEB Asistanı olarak..." deme.
- Cevabı "Başka nasıl yardımcı olabilirim?" ile bitirme.
- Sadece selamlaşıldığında bilgi anlatmaya kalkma; selamı selamla karşıla.

BİLGİ KULLANIMI
- Aşağıdaki KURUMSAL HAFIZA senin arka plan bilgindir. Kullanıcıya olduğu gibi dökme.
- Sorulanı cevapla, yanına davetsiz tarihçe veya yönetim yapısı ekleme.
- Kurumsal hafızada olmayan bir şey sorulursa uydurma. "Bu konuda elimde doğrulanmış bilgi yok"
  de ve resmî Instagram hesabı @yapayzekaveribilimitop.su üzerinden yönetime yönlendir.
- Etkinlik tarihi, ücret, aidat, kontenjan ve başvuru şartlarında asla tahmin yürütme.
- "ONAY BEKLİYOR" veya "TASLAK" etiketli bilgiyi kesinleşmiş kural gibi sunma; öneri olduğunu belirt.

ARAÇ ÇIKTILARI
- ARAÇ NOTLARI bölümünde hesap sonucu varsa sayıyı aynen kullan, kendin yeniden hesaplama.
- Güncel web sonucu varsa bilgiyi kullan ama kaynağın güncel arama olduğunu söyle.
- Zaman bilgisi verilmişse "bugün", "bu dönem" gibi ifadeleri ona göre yorumla.

BAĞLAM
- SON KONUŞMA bölümünü dikkate al. "Peki nasıl katılabilirim?" gibi eksiltili sorularda
  neyin kastedildiğini önceki turdan çıkar, kullanıcıya soruyu tekrarlatma.

KİMLİK VE YAPIMCI
- Seni kimin yaptığı, kodladığı, geliştirdiği veya tasarladığı sorulursa tek bir
  şey söyle: "Başkanımız önderliğinde, topluluk olarak ortak çalışmamız sonucu
  kodlandım." Bunun ötesinde teknik ayrıntı verme.
- Hangi yapay zeka modelini, hangi şirketin altyapısını veya hangi kütüphaneleri
  kullandığın sorulursa bunları açıklama; yukarıdaki cümleyi tekrarla ve konuyu
  topluluğa getir. Model adı, sağlayıcı adı veya teknik altyapı ASLA söylenmez.

KARŞILAMA
- Kullanıcı üniversiteye yeni geldiğini veya topluluğa yeni katıldığını söylerse önce
  "Selçuk Üniversitesi'ne ve YAZVEB ailesine hoş geldin!" de, sonra kısa bir özet ver."""


ISTEM = ChatPromptTemplate.from_messages([
    ("system", SISTEM_TALIMATI + """

════════ KURUMSAL HAFIZA (ilgili parçalar) ════════
{baglam}

════════ ARAÇ NOTLARI ════════
{arac_notlari}

════════ SON KONUŞMA ════════
{gecmis}"""),
    ("human", "{soru}"),
])


# ══════════════════════════════════════════════════════════════════
# HIZLI YOL — gündelik sohbet
# ══════════════════════════════════════════════════════════════════
#
# "Merhaba", "nasılsın", "teşekkürler" gibi cümleler için üç ağır adım
# (gömme çağrısı → vektör araması → model çağrısı) tamamen atlanır. O adımlar
# birlikte bir buçuk iki saniye tutuyor; söylenen şey ise bir selam.
#
# Kalıplar bilerek DAR tutulmuştur: yalnızca kısa ve kendi başına anlamlı
# cümleler yakalanır. "Merhaba, etkinlik ne zaman?" hızlı yola düşmez, çünkü
# içinde gerçek bir soru vardır ve o soruyu kurumsal hafıza cevaplamalıdır.

_SESSIZ = str.maketrans("", "", ".,!?;:…\"'()[]{}-–—")


def _sadelestir(metin: str) -> str:
    """Türkçe büyük/küçük harf tuzağı: 'I'.lower() 'ı' değil 'i' verir."""
    t = (metin or "").replace("I", "ı").replace("İ", "i").lower()
    t = t.translate(_SESSIZ)
    return re.sub(r"\s+", " ", t).strip()


# (anahtar kelimeler, cevap seçenekleri). Sıra önemlidir: yukarıdaki kazanır.
YAPIMCI_CEVABI = (
    "Başkanımız önderliğinde, topluluk olarak ortak çalışmamız sonucu kodlandım."
)

HIZLI_KALIPLAR: list[tuple[tuple[str, ...], tuple[str, ...]]] = [
    # Yapımcı sorusu EN ÜSTTE: "seni kim yaptı" içinde "kimsin" geçmiyor ama
    # sıralama bozulursa başka bir kalıba kapılma riski var.
    (("seni kim yaptı", "seni kim yapti", "seni kim kodladı", "seni kim kodladi",
      "kim yaptı seni", "kim kodladı seni", "seni kim geliştirdi",
      "seni kim gelistirdi", "seni kim tasarladı", "seni kim yazdı",
      "yapımcın kim", "yapimcin kim", "geliştiricin kim", "gelistiricin kim",
      "seni kim programladı", "kim yaptı", "kim kodladı", "kim geliştirdi"),
     (YAPIMCI_CEVABI,)),

    (("sen kimsin", "kimsin sen", "kimsin", "adın ne", "adin ne", "sen nesin"),
     ("Ben YAZVEB Asistanıyım, Selçuk Üniversitesi Yapay Zeka ve Veri Bilimi "
      "Topluluğu'nun dijital karşılayıcısı. Topluluk hakkında merak ettiğin "
      "her şeyi sorabilirsin.",)),

    (("nasılsın", "nasilsin", "naber", "ne haber", "nasıl gidiyor", "iyi misin",
      "keyfin nasıl", "napıyorsun", "ne yapıyorsun"),
     ("İyiyim, sorduğun için teşekkürler. Sen nasılsın?",
      "Gayet iyiyim. Senden ne haber?",
      "İyiyim ben, hazırım. Sen nasılsın?")),

    (("günaydın", "gunaydin"),
     ("Günaydın! Bugün sana nasıl yardımcı olabilirim?",)),
    (("iyi akşamlar", "iyi geceler"),
     ("İyi akşamlar! Buyur, dinliyorum.",)),
    (("merhaba", "selam", "selamlar", "selamünaleyküm", "selamun aleykum",
      "iyi günler", "hey", "alo"),
     ("Merhaba! Buyur, dinliyorum.",
      "Merhaba, hoş geldin. Ne sormak istersin?",
      "Selam! Seni dinliyorum.")),

    (("iyiyim", "ben de iyiyim", "iyidir", "fena değil", "idare eder", "şükür"),
     ("Buna sevindim. Aklında bir soru varsa buyur.",
      "Ne güzel. Merak ettiğin bir şey varsa sorabilirsin.")),

    (("teşekkürler", "teşekkür ederim", "tesekkurler", "sağol", "sağ ol",
      "sagol", "eyvallah", "çok teşekkür"),
     ("Rica ederim.", "Ne demek, her zaman.")),

    (("görüşürüz", "hoşça kal", "hoscakal", "bay bay", "kendine iyi bak",
      "güle güle"),
     ("Görüşürüz, kendine iyi bak!", "Hoşça kal! Yine beklerim.")),
]

# Hızlı yol yalnızca kısa cümlelerde çalışır: uzun cümlede gerçek bir soru
# gizli olabilir ve onu kurumsal hafıza cevaplamalıdır.
HIZLI_EN_FAZLA_KELIME = 6

# Model üç denemede de dönemezse söylenen cümle. Teknik bir hata metni değil,
# konuşmanın içinde doğal duran bir özür; seslendirmesi de önden ısıtılır.
HATA_CEVABI = "Kusura bakma, cevabı getiremedim. Bir daha sorar mısın?"

# Kalıbın yanında durabilecek, tek başına anlam taşımayan kelimeler. Bunlar
# artakalırsa cümle yine sohbettir: "merhaba canım", "selam hocam", "naber ya".
_DOLGU = {
    "ya", "yaa", "be", "bee", "canım", "canim", "hocam", "abi", "abla",
    "kanka", "asistan", "yazveb", "peki", "e", "ee", "hadi", "bak",
    "merhaba", "selam", "selamlar",
}


def hizli_cevap(soru: str) -> str | None:
    """
    Gündelik sohbet cümlesiyse hazır cevabı, değilse None döndürür.

    Eşleşmenin cümlenin TAMAMINI kaplaması gerekir. Yalnızca "başında geçiyor"
    denseydi "Merhaba, etkinlik ne zaman?" selamla karşılanır, asıl soru
    cevapsız kalırdı — hızlı yolun en kolay düşülen tuzağı budur.
    """
    t = _sadelestir(soru)
    if not t or len(t.split()) > HIZLI_EN_FAZLA_KELIME:
        return None

    for anahtarlar, cevaplar in HIZLI_KALIPLAR:
        for anahtar in anahtarlar:
            if t == anahtar:
                return random.choice(cevaplar)
            if t.startswith(anahtar + " "):
                kalan = t[len(anahtar) + 1:]
            elif t.endswith(" " + anahtar):
                kalan = t[: -len(anahtar) - 1]
            else:
                continue
            if all(k in _DOLGU for k in kalan.split()):
                return random.choice(cevaplar)
    return None


def hizli_cevap_metinleri() -> list[str]:
    """Açılışta seslendirmesi önden ısıtılacak cümleler."""
    return [c for _, cevaplar in HIZLI_KALIPLAR for c in cevaplar] + [HATA_CEVABI]


# ══════════════════════════════════════════════════════════════════
# VEKTÖR DEPOSU
# ══════════════════════════════════════════════════════════════════

def _banka_imzasi() -> str:
    ham = bilgi_bankasi.tum_metin() + EMBEDDING_MODELI
    return hashlib.sha256(ham.encode("utf-8")).hexdigest()[:16]


def _belgeler() -> list[Document]:
    """
    Her kayıt tek bir belgedir; yapay parçalama yapılmaz.

    Eski kodda chunk_size=250 kullanılıyordu: bir cümlenin ortasından kesip
    bağlamı koparan, RAG kalitesini en çok düşüren ayardı. Kayıtlar zaten
    tematik olarak sınırlı olduğu için doğal sınırlarından bölünürler.
    """
    return [
        Document(
            page_content=bilgi_bankasi.belge_metni(kayit),
            metadata={
                "baslik": kayit["baslik"],
                "kategori": kayit["kategori"],
                "anahtar": ", ".join(kayit["anahtar"]),
            },
        )
        for kayit in bilgi_bankasi.KAYITLAR
    ]


def _depoyu_ac(api_anahtari: str):
    gomme = GoogleGenerativeAIEmbeddings(
        model=EMBEDDING_MODELI, google_api_key=api_anahtari
    )
    imza = _banka_imzasi()
    yol = DEPO_KLASORU / imza

    if yol.exists():
        # Banka değişmediyse yeniden gömme yapılmaz: hem hızlı hem ücretsiz.
        return Chroma(persist_directory=str(yol), embedding_function=gomme)

    yol.mkdir(parents=True, exist_ok=True)
    return Chroma.from_documents(
        documents=_belgeler(), embedding=gomme, persist_directory=str(yol)
    )


# ══════════════════════════════════════════════════════════════════
# ASİSTAN
# ══════════════════════════════════════════════════════════════════

@dataclass
class Asistan:
    model: object
    getirici: object
    web_acik: bool = True
    son_kaynaklar: list[str] = field(default_factory=list)

    def _baglam(self, soru: str) -> tuple[str, list[str]]:
        belgeler = self.getirici.invoke(soru)
        if not belgeler:
            return "(ilgili kayıt bulunamadı)", []
        metin = "\n\n".join(b.page_content for b in belgeler)
        kategoriler = []
        for b in belgeler:
            k = b.metadata.get("kategori", "")
            if k and k not in kategoriler:
                kategoriler.append(k)
        return metin, kategoriler

    @staticmethod
    def _gecmis(mesajlar: list[dict]) -> str:
        son = mesajlar[-GECMIS_TUR_SAYISI:]
        if not son:
            return "(ilk mesaj)"
        etiket = {"user": "Kullanıcı", "assistant": "Asistan"}
        return "\n".join(f"{etiket.get(m['rol'], m['rol'])}: {m['icerik']}" for m in son)

    @staticmethod
    def _modeli_sor(zincir, girdi: dict) -> str:
        """
        Modeli sorar; takılırsa beklemek yerine ikinci bir istek atar.

        Gecikme dağılımı iki kutuplu olduğu için (ya ~1 saniye ya ~20 saniye)
        beklemenin bir anlamı yok: altı saniyede dönmeyen istek büyük olasılıkla
        takılmıştır ve daha uzun beklemek onu kurtarmaz. Yanına yeni bir istek
        atılır; ikisinden hangisi önce dönerse o kullanılır.

        Takılan istek iptal EDİLMEZ — API iptali desteklemiyor. Kendi hâline
        bırakılır, iş parçacığı arka planda sessizce biter.
        """
        havuz = ThreadPoolExecutor(max_workers=DENEME_SAYISI, thread_name_prefix="yz-model")
        try:
            isler = [havuz.submit(zincir.invoke, girdi)]
            son_hata: Exception | None = None

            for atis in range(DENEME_SAYISI):
                sonuncu = atis == DENEME_SAYISI - 1
                bekleme = SON_BEKLEME if sonuncu else IKINCI_ATIS_SURESI
                bitenler, _ = futures.wait(
                    isler, timeout=bekleme, return_when=futures.FIRST_COMPLETED
                )
                for is_parcasi in bitenler:
                    hata = is_parcasi.exception()
                    if hata is None:
                        return is_parcasi.result()
                    son_hata = hata
                    print(f"[zincir] istek başarısız: "
                          f"{type(hata).__name__}: {str(hata)[:140]}", flush=True)

                isler = [i for i in isler if not i.done()]
                if not sonuncu:
                    if not bitenler:
                        print(f"[zincir] {bekleme}s içinde dönmedi, yeni istek atılıyor", flush=True)
                    isler.append(havuz.submit(zincir.invoke, girdi))

            raise son_hata or TimeoutError("model yanıt vermedi")
        finally:
            # Takılan istekler beklenmez; süreç onları arka planda bitirir.
            havuz.shutdown(wait=False)

    def sor(self, soru: str, mesajlar: list[dict] | None = None) -> dict:
        mesajlar = mesajlar or []

        # Selam, hatır sorma, teşekkür: gömme ve model çağrısı yapılmadan
        # anında dönülür. Sesli sohbette bu fark, cevabın "hemen" mi yoksa
        # "biraz sonra" mı geldiği farkıdır.
        hazir = hizli_cevap(soru)
        if hazir:
            return {"cevap": hazir, "kaynaklar": ["sohbet"], "kategoriler": []}

        notlar = [araclar.zaman_baglami()]
        kullanilan = ["kurumsal hafıza"]

        hesap = araclar.hesap_notu(soru)
        if hesap:
            notlar.append(hesap)
            kullanilan.append("hesap")

        if self.web_acik and araclar.guncel_gerekiyor_mu(soru):
            web = araclar.web_arama(soru)
            if web:
                notlar.append(web)
                kullanilan.append("güncel arama")

        baglam, kategoriler = self._baglam(soru)

        girdi = {
            "baglam": baglam,
            "arac_notlari": "\n".join(notlar),
            "gecmis": self._gecmis(mesajlar),
            "soru": soru,
        }
        cevap = self._modeli_sor(ISTEM | self.model | StrOutputParser(), girdi)
        return {
            "cevap": cevap.strip(),
            "kaynaklar": kullanilan,
            "kategoriler": kategoriler,
        }


def asistani_hazirla(api_anahtari: str | None = None, web_acik: bool = True) -> Asistan:
    anahtar = api_anahtari or os.environ.get("GOOGLE_API_KEY", "")
    if not anahtar:
        raise RuntimeError(
            "GOOGLE_API_KEY bulunamadı. .streamlit/secrets.toml dosyasına ekle "
            "veya ortam değişkeni olarak tanımla."
        )

    depo = _depoyu_ac(anahtar)
    getirici = depo.as_retriever(
        search_type="mmr",  # benzer parçaların üst üste gelmesini engeller
        search_kwargs={"k": GETIRILEN_PARCA, "fetch_k": 12, "lambda_mult": 0.6},
    )
    # Not: Gemini 3.5 ve sonrasında temperature / top_p / top_k parametreleri
    # kullanımdan kaldırıldı; gönderilirse yok sayılır. Bu yüzden verilmiyor.
    model = ChatGoogleGenerativeAI(
        model=SOHBET_MODELI,
        google_api_key=anahtar,
        max_output_tokens=EN_FAZLA_JETON,
        timeout=ISTEK_ZAMAN_ASIMI,
        max_retries=0,   # yeniden deneme Asistan.sor içinde, ölçülebilir biçimde
    )
    return Asistan(model=model, getirici=getirici, web_acik=web_acik)
