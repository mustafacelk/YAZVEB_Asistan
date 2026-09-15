# -*- coding: utf-8 -*-
"""
YAZVEB Merkez — sesli kurumsal asistan.

Çalıştırma:  streamlit run app.py

İKİ GİRİŞ YOLU, TEK SOHBET
──────────────────────────
1. SESLİ YOL (kesintisiz).  Tarayıcıdaki konsol mikrofonu dinler, metni
   `kopru.py` üzerindeki yerel HTTP sunucusuna gönderir, cevabı ve sesi oradan
   alır. Streamlit hiç yeniden çalışmaz: sahne, mikrofon ve çalan ses bölünmez.

2. YAZILI YOL (rerun'lu).  st.chat_input klasik Streamlit akışıdır. Burada
   kritik karar değişmedi: cevap üretildikten sonra st.rerun() ÇAĞRILMAZ.
   Önceki sürümde ses tam da bu yüzden susuyordu — <audio> etiketi sayfaya
   yazılıyor, hemen ardından gelen rerun sayfayı baştan çiziyor ve ses çalmaya
   fırsat bulamadan siliniyordu.

İki yol aynı geçmişi paylaşır; geçmiş `kopru.py` içinde tutulur ve her çizimde
session_state'e yansıtılır.

AÇILIŞ VİDEOSU BURADA ÇİZİLMEZ
──────────────────────────────
Video Streamlit'in çizim ağacında dururken her yeniden çizim öğeyi yeniden
yaratıyor ve görüntü birkaç saniyede bir başa sarıyordu. Artık katmanı konsol
üst sayfaya kuruyor (bkz. konsol.py → introKur); Streamlit ona dokunamaz.
"""

from __future__ import annotations

import base64
import uuid
from pathlib import Path
from urllib.parse import quote

import streamlit as st
from streamlit.components.v1 import html as bilesen_html

import arayuz
import kopru
import zincir
from ses_motoru import VARSAYILAN_SES, seslendir
from zincir import asistani_hazirla

# ══════════════════════════════════════════════════════════════════
# AYARLAR
# ══════════════════════════════════════════════════════════════════

SES_ACIK = True
SES_ADI = VARSAYILAN_SES          # ses_motoru.SESLER sözlüğünden seçilebilir
GORUNEN_MESAJ = 3                 # rayda kaç mesaj kalsın (eskiler söner)
ODAK_YUKSEKLIGI = "32%"           # ışık alanının merkezi — figürün başı nerede
INTRO_SURESI = 7.2                # açılış videosunun devri teslim anı (saniye)
WEB_ARAMA_ACIK = True             # güncel bilgi katmanı

SESLI_MOD = True                  # mikrofon düğmesi
KONUSMA_DILI = "tr-TR"
KARSILAMA = "Merhaba, seni dinliyorum."   # mikrofon açılınca söylenir ("" ise atlanır)

KOK = Path(__file__).parent
STATIK = KOK / "static"

st.set_page_config(
    page_title="YAZVEB Merkez",
    page_icon="◍",
    layout="wide",
    initial_sidebar_state="collapsed",
)


# ══════════════════════════════════════════════════════════════════
# KAYNAK DOSYALAR
# ══════════════════════════════════════════════════════════════════

def dosya_bul(adaylar: list[str]) -> Path | None:
    for ad in adaylar:
        for klasor in (STATIK, KOK):
            yol = klasor / ad
            if yol.exists():
                return yol
    return None


@st.cache_data(show_spinner=False)
def b64_oku(yol_metni: str) -> str:
    return base64.b64encode(Path(yol_metni).read_bytes()).decode()


def statik_servis_acik() -> bool:
    """
    app/static/... adresleri yalnızca config.toml'da enableStaticServing açıkken
    çalışır. Kapalıyken adres 404 döner ve görsel hiç yüklenmez — bu yüzden
    varsayım yapmadan doğrudan sorulur.
    """
    try:
        return bool(st.get_option("server.enableStaticServing"))
    except Exception:  # noqa: BLE001
        return False


STATIK_ACIK = statik_servis_acik()


def gorsel_kaynagi(yol: Path | None) -> str | None:
    """
    Mümkünse adres kullanılır: tarayıcı görseli bir kez indirip önbelleğe alır.
    Statik servis kapalıysa veya dosya static/ dışındaysa base64'e düşer.
    """
    if yol is None:
        return None
    if STATIK_ACIK and yol.parent == STATIK:
        # Dosya adında Türkçe harf olabilir; adres kodlanmadan verilirse
        # bazı tarayıcılar 404 döndürür.
        return "app/static/" + quote(yol.name)
    tur = yol.suffix.lstrip(".").lower().replace("jpg", "jpeg")
    return f"data:image/{tur};base64,{b64_oku(str(yol))}"


logo_yolu = dosya_bul(["logo.png", "LOGO.png", "logo.jpg", "LOGO.jpg"])
logo_b64 = b64_oku(str(logo_yolu)) if logo_yolu else None

# Sıra önemli: optimize edilmiş WebP sürümler önce denenir. Kaynak PNG 8448
# piksel genişliğinde ve 35 MB; tam ekran arka plan için gereğinden yüzlerce
# kat büyük. WebP sürümler aynı görüntüyü ~360 KB'da veriyor.
siluet_yolu = dosya_bul([
    "siluet-2560.webp", "silüet.png", "siluet.png", "avatar.png",
    "silhouette.png", "avatar.jpg",
])
orta_yolu = dosya_bul(["siluet-1280.webp"])
# Hale katmanı 15 piksel bulanıklaştırılır; ayrıntı zaten kaybolur, en küçük
# sürüm yeter ve bellekte yer kaplamaz.
hale_yolu = dosya_bul(["siluet-640.webp", "siluet-1280.webp"]) or siluet_yolu

siluet_kaynagi = gorsel_kaynagi(siluet_yolu)
hale_kaynagi = gorsel_kaynagi(hale_yolu)

kaynak_seti = ""
if STATIK_ACIK and siluet_yolu and orta_yolu and siluet_yolu.suffix == ".webp":
    kaynak_seti = (
        f"{gorsel_kaynagi(orta_yolu)} 1280w, {siluet_kaynagi} 2560w"
    )

intro_yolu = STATIK / "intro.mp4"
intro_kaynagi = "app/static/intro.mp4" if (intro_yolu.exists() and STATIK_ACIK) else ""


# ══════════════════════════════════════════════════════════════════
# DURUM
# ══════════════════════════════════════════════════════════════════

st.session_state.setdefault("mesajlar", [])
# Oturum kimliği köprüdeki geçmişin anahtarıdır; sekme kapanana kadar aynı kalır.
st.session_state.setdefault("oturum", uuid.uuid4().hex)
OTURUM = st.session_state.oturum


def tasiyici(html_metni: str) -> None:
    """
    Sıfır yükseklikli taşıyıcı çerçeve — üst sayfaya betik kurmanın tek yolu.

    st.components.v1.html kullanımdan kaldırılıyor; st.iframe onun yerini aldı.
    Eski Streamlit sürümlerinde st.iframe yok, o yüzden ikisi de destekleniyor.
    """
    if hasattr(st, "iframe"):
        # st.iframe sıfır yüksekliği reddeder (pozitif tam sayı ister); görünür
        # yüksekliği CSS sıfırlar, bkz. arayuz.stil() içindeki iframe kuralı.
        st.iframe(html_metni, height=1)
    else:  # pragma: no cover — Streamlit < 1.5x
        bilesen_html(html_metni, height=0)


st.markdown(arayuz.stil(ODAK_YUKSEKLIGI), unsafe_allow_html=True)

# Klavye açıldığında sabit katmanların görünen alanın dışında kalmasını önler.
tasiyici(arayuz.gorunum_takibi())

# Yer tutucular: sahne bir kez çizilir, ray yerinde güncellenir.
sahne_yeri = st.empty()
rozet_yeri = st.empty()
akis_yeri = st.empty()
ses_yeri = st.empty()


# ══════════════════════════════════════════════════════════════════
# SAHNE
# ══════════════════════════════════════════════════════════════════

if not siluet_kaynagi:
    sahne_yeri.markdown(arayuz.sahne("", ""), unsafe_allow_html=True)
    st.markdown(arayuz.uyari([
        "Görsel kaynak bulunamadı.",
        "static/ klasörüne siluet-2560.webp veya silüet.png koy.",
    ]), unsafe_allow_html=True)
    st.stop()

# Sahne HTML'i her çizimde birebir aynı. Tek karakteri bile değişirse tarayıcı
# öğeleri baştan kurar ve silüet bir an kaybolur.
sahne_yeri.markdown(
    arayuz.sahne(
        arayuz.figur_gorsel(siluet_kaynagi, kaynak_seti),
        arayuz.hale_gorsel(hale_kaynagi) if hale_kaynagi else "",
    ),
    unsafe_allow_html=True,
)
rozet_yeri.markdown(arayuz.rozet(logo_b64), unsafe_allow_html=True)


# ══════════════════════════════════════════════════════════════════
# ASİSTAN
# ══════════════════════════════════════════════════════════════════

@st.cache_resource(show_spinner=False)
def asistan_ornegi():
    try:
        anahtar = st.secrets.get("GOOGLE_API_KEY", "")
    except Exception:  # noqa: BLE001 — secrets.toml yoksa Streamlit istisna atar
        anahtar = ""
    return asistani_hazirla(api_anahtari=anahtar or None, web_acik=WEB_ARAMA_ACIK)


@st.cache_data(show_spinner=False)
def seslendir_onbellekli(metin: str, ses_adi: str):
    return seslendir(metin, ses_adi)


try:
    asistan = asistan_ornegi()
except Exception as hata:  # noqa: BLE001
    # Ayrıntı yalnızca terminale: kütüphane hataları istek adresi, yol veya
    # yapılandırma parçası taşıyabilir. Ekranda genel bir cümle.
    print(f"[app] asistan başlatılamadı: {hata!r}", flush=True)
    st.markdown(arayuz.uyari([
        "Asistan başlatılamadı.",
        "Ayrıntı için terminal çıktısına bak (çoğunlukla GOOGLE_API_KEY eksik).",
    ]), unsafe_allow_html=True)
    st.stop()


# ══════════════════════════════════════════════════════════════════
# KÖPRÜ — sesli yolun taşıyıcısı
# ══════════════════════════════════════════════════════════════════

@st.cache_resource(show_spinner=False)
def kopru_ornegi(_asistan, ses_adi: str):
    """
    Süreç ömrü boyunca tek köprü. Asistan örneği kapatma içinde taşınır; böylece
    köprünün iş parçacığı Streamlit bağlamına hiç dokunmaz (dokunsaydı
    "missing ScriptRunContext" uyarıları başlardı).
    """
    def cozucu(soru: str, gecmis: list[dict]) -> dict:
        return _asistan.sor(soru, gecmis)

    kopru_nesnesi = kopru.baslat(cozucu, ses_adi)
    if kopru_nesnesi and SES_ACIK:
        # Gündelik cevaplar ve karşılama önden seslendirilir; ilk "merhaba"da
        # bile bekleme olmaz.
        kopru.onden_isit(zincir.hizli_cevap_metinleri() + [KARSILAMA], ses_adi)
    return kopru_nesnesi


kopru_nesnesi = kopru_ornegi(asistan, SES_ADI)


def mesajlari_oku() -> list[dict]:
    """Köprü varsa geçmişin tek doğru kaynağı odur; yoksa session_state."""
    if kopru_nesnesi is None:
        return st.session_state.mesajlar
    return kopru.gecmis(OTURUM)


def mesaj_ekle(rol: str, icerik: str, etiket: str) -> None:
    if kopru_nesnesi is not None:
        kopru.ekle(OTURUM, rol, icerik, etiket)
    else:
        st.session_state.mesajlar.append({"rol": rol, "icerik": icerik, "etiket": etiket})


# Sesli turlar Streamlit'in haberi olmadan geçmişi büyütür; her çizimde
# session_state köprüye göre tazelenir.
st.session_state.mesajlar = mesajlari_oku()


# ══════════════════════════════════════════════════════════════════
# RAY VE KONSOL
# ══════════════════════════════════════════════════════════════════

# Kullanılan model, kayıt sayısı gibi ayrıntılar ekranda GÖSTERİLMEZ.
# Ziyaretçinin görmesi gereken tek şey asistanın kendisi; altyapı bilgisi
# sayfa kaynağına bile girmemeli.
akis_yeri.markdown(
    arayuz.akis(st.session_state.mesajlar, GORUNEN_MESAJ), unsafe_allow_html=True
)

tasiyici(arayuz.sesli_konsol(
    adres=kopru_nesnesi.adres if kopru_nesnesi else "",
    anahtar=kopru_nesnesi.anahtar if kopru_nesnesi else "",
    oturum=OTURUM,
    gorunen=GORUNEN_MESAJ,
    selam=KARSILAMA if SES_ACIK else "",
    dil=KONUSMA_DILI,
    sesli=SESLI_MOD,
    intro=intro_kaynagi,
    introSure=INTRO_SURESI,
))


# ══════════════════════════════════════════════════════════════════
# YAZILI GİRİŞ VE CEVAP — tek geçiş, rerun yok
# ══════════════════════════════════════════════════════════════════

girdi = st.chat_input("YAZVEB Asistanına sor…")

if girdi:
    onceki = list(st.session_state.mesajlar)
    mesaj_ekle("user", girdi, "Sen")
    mesajlar = mesajlari_oku()
    st.session_state.mesajlar = mesajlar

    akis_yeri.markdown(
        arayuz.akis(mesajlar, GORUNEN_MESAJ, dusunuyor=True), unsafe_allow_html=True
    )

    try:
        sonuc = asistan.sor(girdi, onceki)
        cevap = sonuc["cevap"]
        etiket = "YAZVEB · " + " + ".join(sonuc["kaynaklar"])
    except Exception as hata:  # noqa: BLE001
        cevap = "Bağlantıda bir sorun oluştu, tekrar dener misin?"
        etiket = "YAZVEB · hata"
        print(f"[zincir hatası] {hata}")

    mesaj_ekle("assistant", cevap, etiket)
    mesajlar = mesajlari_oku()
    st.session_state.mesajlar = mesajlar
    akis_yeri.markdown(arayuz.akis(mesajlar, GORUNEN_MESAJ), unsafe_allow_html=True)

    if SES_ACIK:
        baytlar, _ = seslendir_onbellekli(cevap, SES_ADI)
        if baytlar:
            # data-yz işaretli etiket: sesli konsol açıksa sesi devralır ve
            # silüeti gerçek tonlamayla sürer; değilse etiket kendi başına çalar.
            ses_yeri.markdown(
                arayuz.ses(base64.b64encode(baytlar).decode()), unsafe_allow_html=True
            )
