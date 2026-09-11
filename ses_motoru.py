# -*- coding: utf-8 -*-
"""
Seslendirme katmanı — çok sağlayıcılı.

Dört şey yapar:
  1. Metni sese girmeden önce temizler (yıldız, başlık, emoji, bağlantı okunmaz).
  2. Nefes aralıklarını yerleştirir: noktalama, sentezleyicinin tek prozodi
     kolu olduğu için cümle sınırları ve ara cümlecikler bilinçli düzenlenir.
  3. Sırasıyla ElevenLabs → OpenAI → edge-tts dener; ilk çalışan kazanır.
     Hangisinin çalıştığı telemetriye yazılır.
  4. Konuşmanın gerçek süresini ölçer; arayüzdeki radyal alan ve parçacık
     patlaması tam o kadar sürer.

Süre ölçümü iki yoldan gelir:
  • edge-tts'te WordBoundary olayları (son kelimenin başlangıcı + süresi).
  • Diğer sağlayıcılarda MPEG çerçeve başlıkları sayılarak (aşağıdaki
    `mp3_suresi`). Harici kütüphane gerektirmez.

Ortam değişkenleri (hiçbiri zorunlu değil):
  ELEVENLABS_API_KEY   → ElevenLabs Multilingual v2
  ELEVENLABS_VOICE_ID  → ses kimliği (varsayılan: Adam)
  OPENAI_API_KEY       → OpenAI tts-1-hd
  OPENAI_TTS_VOICE     → onyx / alloy / echo / fable / nova / shimmer
  YAZVEB_TTS           → "edge" | "openai" | "elevenlabs" | "oto" (varsayılan)
"""

from __future__ import annotations

import asyncio
import os
import re

import edge_tts

try:  # httpx zaten Streamlit bağımlılık ağacında var; yoksa requests denenir
    import httpx as _http

    _HTTP_TURU = "httpx"
except ImportError:  # pragma: no cover
    try:
        import requests as _http  # type: ignore

        _HTTP_TURU = "requests"
    except ImportError:  # pragma: no cover
        _http = None  # type: ignore
        _HTTP_TURU = ""


# ══════════════════════════════════════════════════════════════════
# SESLER VE TONLAMA PROFİLLERİ
# ══════════════════════════════════════════════════════════════════

# Türkçe sesler. Multilingual olanlar daha doğal tonlama üretir ama
# güncel bir edge-tts sürümü ister.
SESLER = {
    "Ahmet (erkek, kurumsal)": "tr-TR-AhmetNeural",
    "Emel (kadın, kurumsal)": "tr-TR-EmelNeural",
    "Andrew (çok dilli, en doğal)": "en-US-AndrewMultilingualNeural",
    "Ava (çok dilli, kadın)": "en-US-AvaMultilingualNeural",
}

VARSAYILAN_SES = "tr-TR-AhmetNeural"

# Her ses farklı bir temel tempoda konuşur. Tek bir global hız verilince
# Ahmet aceleci, Andrew uyuşuk çıkıyordu; profil sesin kendi tabanına göre
# ayarlanır. (hız, perde, seviye)
TONLAMA = {
    "tr-TR-AhmetNeural": ("+3%", "-2Hz", "+0%"),
    "tr-TR-EmelNeural": ("+2%", "-1Hz", "+0%"),
    "en-US-AndrewMultilingualNeural": ("+6%", "+0Hz", "+0%"),
    "en-US-AvaMultilingualNeural": ("+5%", "+0Hz", "+0%"),
}
VARSAYILAN_TONLAMA = ("+4%", "-1Hz", "+0%")

# Geriye dönük uyumluluk: eski kod bu üç adı doğrudan içe aktarıyordu.
HIZ, PERDE, SES_SEVIYESI = TONLAMA[VARSAYILAN_SES]

ELEVEN_VARSAYILAN_SES = "pNInz6obpgDQGcFmaJgB"   # Adam — çok dilli, sıcak ton
ELEVEN_MODEL = "eleven_multilingual_v2"
OPENAI_MODEL = "tts-1-hd"
OPENAI_VARSAYILAN_SES = "onyx"

ZAMAN_ASIMI = 30.0

_EMOJI = re.compile(
    "[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF←-⇿⬀-⯿]+"
)

# Kilit BİLEREK yok. Sentezleme ağ işidir ve paylaşılan durum tutmaz:
# `_calistir` her çağrıda kendi olay döngüsünü açar, edge_tts.Communicate
# çağrı başına yeni nesnedir. Global kilit varken açılıştaki önden ısıtma
# kullanıcının ilk sorusunu saniyelerce bekletiyordu.
_son_saglayici = "hazır değil"


# ══════════════════════════════════════════════════════════════════
# METİN HAZIRLIĞI
# ══════════════════════════════════════════════════════════════════

def metni_temizle(metin: str) -> str:
    """Ekranda iyi duran işaretler seste kötü durur. Hepsini ayıklar."""
    t = metin or ""
    t = re.sub(r"```.*?```", " ", t, flags=re.DOTALL)          # kod blokları
    t = re.sub(r"`([^`]*)`", r"\1", t)                          # satır içi kod
    t = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", t)            # bağlantı / görsel
    t = re.sub(r"https?://\S+", " bağlantı ", t)
    t = re.sub(r"[*_#>|]+", " ", t)                             # markdown işaretleri
    t = re.sub(r"^\s*[-•·]\s*", "", t, flags=re.MULTILINE)      # madde işaretleri
    t = _EMOJI.sub(" ", t)
    t = t.replace("@", " et ")                                  # kullanıcı adları
    t = re.sub(r"\s{2,}", " ", t)
    return t.strip()


def nefes_ver(metin: str) -> str:
    """
    Sentezleyicinin elindeki tek prozodi kolu noktalamadır: virgül kısa,
    nokta uzun, üç nokta en uzun duraklamayı üretir. Robotik tını çoğunlukla
    metnin tek nefeste yazılmış olmasından gelir — burada nefes yerleri
    açıkça işaretlenir.
    """
    t = metin

    # Madde ayracı olarak kullanılan tireler seste "eksi" gibi okunur.
    t = re.sub(r"\s+[-–—]\s+", ", ", t)

    # Ardışık noktalama sadeleşir; "?!" gibi diziler tonlamayı bozuyor.
    t = re.sub(r"([.!?])\1+", r"\1", t)
    t = re.sub(r"[.!?]{2,}", lambda m: m.group(0)[0], t)

    # Cümle sonundan sonra boşluk. Ama nokta her zaman cümle sonu değildir:
    #   "...top.su"  hesap adı — bölünürse "top. su" diye okunur
    #   "14.30"      saat       — bölünürse "14. 30" diye okunur
    # Bu yüzden yalnızca BÜYÜK harf geliyorsa gerçek cümle sınırı sayılır.
    t = re.sub(r"([.!?])(?=[A-ZÇĞİÖŞÜ])", r"\1 ", t)

    # Uzun bağlaçlardan önce kısa nefes. Türkçede bu bağlaçlar zaten cümlecik
    # sınırıdır; virgül konunca tonlama doğal olarak alçalıp yükselir.
    t = re.sub(r"(?<![,;:.!?])\s+(ama|fakat|ancak|çünkü|yani|dolayısıyla)\s+",
               r", \1 ", t, flags=re.IGNORECASE)

    # Satır sonları paragraf duraklamasına çevrilir.
    t = re.sub(r"\n{2,}", ". ", t)
    t = t.replace("\n", ", ")

    t = re.sub(r"\s*,\s*,+", ", ", t)
    t = re.sub(r"\s{2,}", " ", t).strip()

    # Nokta ile bitmeyen metin, sentezleyicide asılı kalmış gibi duruyor.
    if t and t[-1] not in ".!?":
        t += "."
    return t


def sese_hazirla(metin: str) -> str:
    return nefes_ver(metni_temizle(metin))


# ══════════════════════════════════════════════════════════════════
# MP3 SÜRE ÖLÇÜMÜ  (harici kütüphane yok)
# ══════════════════════════════════════════════════════════════════

_BITRATE = {
    # (sürüm, katman) -> indeksten kbit/s
    (1, 3): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    (2, 3): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
}
_ORNEKLEME = {1: [44100, 48000, 32000, 0], 2: [22050, 24000, 16000, 0], 25: [11025, 12000, 8000, 0]}


def mp3_suresi(baytlar: bytes) -> float:
    """
    MPEG çerçeve başlıklarını sayarak süreyi bulur. ElevenLabs ve OpenAI
    kelime zamanlaması vermez; süre buradan gelmezse ışık ile ses ayrışır.
    """
    if not baytlar or len(baytlar) < 4:
        return 0.0

    i = 0
    # ID3v2 etiketi varsa atlanır (senkron güvenli 7-bitlik uzunluk).
    if baytlar[:3] == b"ID3" and len(baytlar) > 10:
        b6, b7, b8, b9 = baytlar[6], baytlar[7], baytlar[8], baytlar[9]
        i = 10 + ((b6 << 21) | (b7 << 14) | (b8 << 7) | b9)

    toplam = 0.0
    sinir = len(baytlar) - 4
    bulunan = 0
    while i < sinir:
        if baytlar[i] != 0xFF or (baytlar[i + 1] & 0xE0) != 0xE0:
            i += 1
            continue
        b1, b2 = baytlar[i + 1], baytlar[i + 2]
        surum_bit = (b1 >> 3) & 0x03
        katman_bit = (b1 >> 1) & 0x03
        if surum_bit == 1 or katman_bit == 0:      # ayrılmış değerler
            i += 1
            continue
        surum = {0: 25, 2: 2, 3: 1}[surum_bit]
        katman = {1: 3, 2: 2, 3: 1}[katman_bit]
        if katman != 3:                             # yalnızca Layer III
            i += 1
            continue

        anahtar = (1, 3) if surum == 1 else (2, 3)
        bitrate = _BITRATE[anahtar][(b2 >> 4) & 0x0F] * 1000
        ornekleme = _ORNEKLEME[surum][(b2 >> 2) & 0x03]
        if not bitrate or not ornekleme:
            i += 1
            continue
        dolgu = (b2 >> 1) & 0x01
        if surum == 1:
            uzunluk = 144 * bitrate // ornekleme + dolgu
            ornek = 1152
        else:
            uzunluk = 72 * bitrate // ornekleme + dolgu
            ornek = 576
        if uzunluk < 24:
            i += 1
            continue
        toplam += ornek / ornekleme
        bulunan += 1
        i += uzunluk

    return toplam if bulunan else 0.0


# ══════════════════════════════════════════════════════════════════
# SAĞLAYICILAR
# ══════════════════════════════════════════════════════════════════

def _istek(yontem: str, url: str, **kw) -> tuple[int, bytes]:
    """httpx ve requests arasındaki tek farkı gizler."""
    if _http is None:
        raise RuntimeError("HTTP istemcisi yok (httpx veya requests kurulu değil)")
    if _HTTP_TURU == "httpx":
        with _http.Client(timeout=ZAMAN_ASIMI) as istemci:
            y = istemci.request(yontem, url, **kw)
            return y.status_code, y.content
    y = _http.request(yontem, url, timeout=ZAMAN_ASIMI, **kw)  # type: ignore[union-attr]
    return y.status_code, y.content


def _elevenlabs(metin: str) -> tuple[bytes, float]:
    anahtar = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not anahtar:
        raise RuntimeError("ELEVENLABS_API_KEY yok")
    ses_kimligi = os.getenv("ELEVENLABS_VOICE_ID", "").strip() or ELEVEN_VARSAYILAN_SES
    url = (
        f"https://api.elevenlabs.io/v1/text-to-speech/{ses_kimligi}"
        "?output_format=mp3_44100_128"
    )
    durum, icerik = _istek(
        "POST",
        url,
        headers={"xi-api-key": anahtar, "accept": "audio/mpeg",
                 "content-type": "application/json"},
        json={
            "text": metin,
            "model_id": ELEVEN_MODEL,
            # stability düşük → daha canlı tonlama; style biraz açık →
            # nefes ve vurgu taklidi. İkisi de yüksek olursa ton düzleşiyor.
            "voice_settings": {
                "stability": 0.42,
                "similarity_boost": 0.78,
                "style": 0.34,
                "use_speaker_boost": True,
            },
        },
    )
    if durum != 200 or not icerik:
        raise RuntimeError(f"ElevenLabs {durum}")
    return icerik, mp3_suresi(icerik)


def _openai(metin: str) -> tuple[bytes, float]:
    anahtar = os.getenv("OPENAI_API_KEY", "").strip()
    if not anahtar:
        raise RuntimeError("OPENAI_API_KEY yok")
    durum, icerik = _istek(
        "POST",
        "https://api.openai.com/v1/audio/speech",
        headers={"Authorization": f"Bearer {anahtar}",
                 "content-type": "application/json"},
        json={
            "model": os.getenv("OPENAI_TTS_MODEL", OPENAI_MODEL),
            "voice": os.getenv("OPENAI_TTS_VOICE", OPENAI_VARSAYILAN_SES),
            "input": metin,
            "response_format": "mp3",
            "speed": 1.02,
        },
    )
    if durum != 200 or not icerik:
        raise RuntimeError(f"OpenAI {durum}")
    return icerik, mp3_suresi(icerik)


async def _edge_sentezle(metin: str, ses: str) -> tuple[bytes, float]:
    hiz, perde, seviye = TONLAMA.get(ses, VARSAYILAN_TONLAMA)
    konusmaci = edge_tts.Communicate(metin, ses, rate=hiz, pitch=perde, volume=seviye)
    parcalar: list[bytes] = []
    bitis_100ns = 0
    async for olay in konusmaci.stream():
        if olay["type"] == "audio":
            parcalar.append(olay["data"])
        elif olay["type"] == "WordBoundary":
            bitis_100ns = max(bitis_100ns, olay["offset"] + olay["duration"])
    return b"".join(parcalar), bitis_100ns / 10_000_000


def _calistir(is_parcasi):
    """Streamlit'in çalışan bir döngüsü olabilir; her seferinde temiz döngü açar."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(is_parcasi)
    dongu = asyncio.new_event_loop()
    try:
        return dongu.run_until_complete(is_parcasi)
    finally:
        dongu.close()


def _edge(metin: str, ses: str) -> tuple[bytes, float]:
    baytlar, sure = _calistir(_edge_sentezle(metin, ses))
    if not baytlar:
        raise RuntimeError("edge-tts boş döndü")
    if sure <= 0:
        sure = mp3_suresi(baytlar)
    return baytlar, sure


# ══════════════════════════════════════════════════════════════════
# SEÇİCİ
# ══════════════════════════════════════════════════════════════════

def _sira() -> list[tuple[str, object]]:
    """
    Denenecek sağlayıcı sırası. YAZVEB_TTS ile sabitlenebilir; sabitlenen
    sağlayıcı çökerse yine de edge-tts'e düşülür — asistan susmamalı.
    """
    tercih = os.getenv("YAZVEB_TTS", "oto").strip().lower()
    eleven = ("ElevenLabs v2", _elevenlabs)
    openai = ("OpenAI tts-1-hd", _openai)
    edge = ("edge-tts", _edge)

    if tercih == "edge":
        return [edge]
    if tercih == "elevenlabs":
        return [eleven, edge]
    if tercih == "openai":
        return [openai, edge]

    sira: list[tuple[str, object]] = []
    if os.getenv("ELEVENLABS_API_KEY", "").strip():
        sira.append(eleven)
    if os.getenv("OPENAI_API_KEY", "").strip():
        sira.append(openai)
    sira.append(edge)
    return sira


def saglayici_adi() -> str:
    """Telemetri için: yapılandırmaya göre beklenen sağlayıcı."""
    return _sira()[0][0]


def son_saglayici() -> str:
    """Telemetri için: gerçekten sesi üreten sağlayıcı."""
    return _son_saglayici


def seslendir(metin: str, ses: str = VARSAYILAN_SES) -> tuple[bytes | None, float]:
    """
    Metni seslendirir. (ses_baytlari, süre_saniye) döndürür.
    Hata olursa (None, 0.0) döner — asistan sessiz devam eder, çökmez.
    """
    global _son_saglayici

    hazir = sese_hazirla(metin)
    if not hazir:
        return None, 0.0

    son_hata: Exception | None = None
    for ad, fonksiyon in _sira():
        try:
            if fonksiyon is _edge:
                baytlar, sure = _edge(hazir, ses)
            else:
                baytlar, sure = fonksiyon(hazir)  # type: ignore[operator]
        except Exception as hata:  # noqa: BLE001 — sıradaki sağlayıcı denenir
            son_hata = hata
            print(f"[ses] {ad} başarısız: {str(hata)[:140]}")
            continue

        if not baytlar:
            continue
        if sure <= 0:  # ölçüm yapılamadıysa kaba tahmin: ~14 karakter/saniye
            sure = max(1.5, len(hazir) / 14)
        _son_saglayici = ad
        return baytlar, sure + 0.45  # son hecenin sönümlenmesi için küçük kuyruk

    if son_hata:
        print(f"[ses] tüm sağlayıcılar başarısız: {str(son_hata)[:140]}")
    return None, 0.0
