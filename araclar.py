# -*- coding: utf-8 -*-
"""
Asistanın dil modeli dışındaki yetenekleri.

1) guvenli_hesapla  : eval() kullanmadan, AST üzerinden matematik
2) hesap_notu       : Türkçe cümlenin içinden hesabı çıkarır
3) zaman_baglami    : Türkiye saati, tarih, akademik dönem
4) web_arama        : güncel bilgi katmanı (isteğe bağlı, ddgs paketi varsa)

Dil modeli aritmetikte güvenilir değildir. Sayısal sonuç burada üretilir,
modele yalnızca cümleye dökmesi için verilir.
"""

from __future__ import annotations

import ast
import math
import operator
import re
import statistics
from datetime import datetime, timedelta, timezone

TR_SAAT_DILIMI = timezone(timedelta(hours=3))

# ══════════════════════════════════════════════════════════════════
# 1) GÜVENLİ HESAP MAKİNESİ
# ══════════════════════════════════════════════════════════════════

_ISLEMLER = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

_TOPLU = {"ort", "ortalama", "mean", "medyan", "median", "mod", "std",
          "ornek_std", "varyans", "topla", "sum", "enbuyuk", "enkucuk", "max", "min"}

_FONKSIYONLAR = {
    "kok": math.sqrt, "karekok": math.sqrt, "sqrt": math.sqrt,
    "mutlak": abs, "abs": abs, "yuvarla": round, "round": round,
    "us": math.pow, "pow": math.pow, "log": math.log, "log10": math.log10,
    "log2": math.log2, "exp": math.exp, "faktoriyel": math.factorial,
    "tavan": math.ceil, "taban": math.floor,
    "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "asin": math.asin, "acos": math.acos, "atan": math.atan,
    "derece": math.degrees, "radyan": math.radians,
    # istatistik — veri bilimi topluluğu için
    "ort": statistics.fmean, "ortalama": statistics.fmean, "mean": statistics.fmean,
    "medyan": statistics.median, "median": statistics.median, "mod": statistics.mode,
    "std": statistics.pstdev, "ornek_std": statistics.stdev,
    "varyans": statistics.pvariance, "topla": sum, "sum": sum,
    "enbuyuk": max, "enkucuk": min, "max": max, "min": min,
}

_SABITLER = {"pi": math.pi, "e": math.e, "tau": math.tau}
_BILINEN = set(_FONKSIYONLAR) | set(_SABITLER)


def _dugum(dugum):
    if isinstance(dugum, ast.Constant):
        if isinstance(dugum.value, (int, float)) and not isinstance(dugum.value, bool):
            return dugum.value
        raise ValueError("sadece sayı kabul edilir")
    if isinstance(dugum, ast.BinOp) and type(dugum.op) in _ISLEMLER:
        return _ISLEMLER[type(dugum.op)](_dugum(dugum.left), _dugum(dugum.right))
    if isinstance(dugum, ast.UnaryOp) and type(dugum.op) in _ISLEMLER:
        return _ISLEMLER[type(dugum.op)](_dugum(dugum.operand))
    if isinstance(dugum, ast.Name):
        ad = dugum.id.lower()
        if ad in _SABITLER:
            return _SABITLER[ad]
        raise ValueError(f"bilinmeyen sembol: {dugum.id}")
    if isinstance(dugum, ast.Call):
        if not isinstance(dugum.func, ast.Name):
            raise ValueError("geçersiz fonksiyon çağrısı")
        ad = dugum.func.id.lower()
        if ad not in _FONKSIYONLAR:
            raise ValueError(f"izin verilmeyen fonksiyon: {ad}")
        argumanlar = [_dugum(a) for a in dugum.args]
        if ad in _TOPLU and len(argumanlar) > 1:
            return _FONKSIYONLAR[ad](argumanlar)
        return _FONKSIYONLAR[ad](*argumanlar)
    if isinstance(dugum, (ast.List, ast.Tuple)):
        return [_dugum(e) for e in dugum.elts]
    raise ValueError("desteklenmeyen ifade")


def _sadelestir(sayi):
    if isinstance(sayi, float):
        sayi = round(sayi, 10)
        if sayi == int(sayi) and abs(sayi) < 1e15:
            return int(sayi)
        return round(sayi, 4)
    return sayi


def guvenli_hesapla(ifade: str):
    """Hazır bir matematik ifadesini hesaplar. (sonuc, hata) döndürür."""
    try:
        temiz = (ifade or "").strip()
        if not temiz:
            return None, "boş ifade"
        agac = ast.parse(temiz, mode="eval")
        return _sadelestir(_dugum(agac.body)), None
    except ZeroDivisionError:
        return None, "sıfıra bölme"
    except Exception as hata:  # noqa: BLE001 — kullanıcıya sade mesaj döner
        return None, str(hata)


# ── Türkçe cümleyi ifadeye çevirme ────────────────────────────────

_SAYI = r"\d+(?:[.,]\d+)?"

_KELIME_ONEK = [
    (rf"({_SAYI})\s*'?\w*\s*karekök\w*", r"kok(\1)"),
    (rf"({_SAYI})\s*'?\w*\s*faktöriyel\w*", r"faktoriyel(\1)"),
    (r"\bkarekök(?:ü|u)?\b", "kok"),
    (r"\bkarekok(?:u)?\b", "kok"),
    (r"\bkök(?:ü|u)?\b", "kok"),
    (r"\bfaktöriyel(?:i)?\b", "faktoriyel"),
    (r"\blogaritma(?:sı|si)?\b", "log"),
    (r"\bmutlak değer(?:i)?\b", "mutlak"),
]

# Ek çekimli biçimler ("ortalaması", "medyanı") alt dizge eşleşmesiyle yakalanır.
_TOPLU_IPUCU = {
    "standart sapma": "std",
    "ortalama": "ort",
    "medyan": "medyan",
    "ortanca": "medyan",
    "varyans": "varyans",
}

_PARCALA = re.compile(r"\d+\.?\d*|[a-zçğıöşü_]+|[()+\-*/%,]")


def _ifadeyi_ayikla(soru: str) -> str | None:
    """Serbest Türkçe cümleden ayrıştırılabilir bir matematik ifadesi üretir."""
    m = (soru or "").lower()
    m = m.replace("×", "*").replace("÷", "/").replace("^", "**")
    m = m.replace("’", " ").replace("'", " ")

    for desen, karsilik in _KELIME_ONEK:
        m = re.sub(desen, karsilik, m)

    # "kok 225" -> "kok(225)"
    m = re.sub(rf"\b(kok|faktoriyel|log10|log2|log|exp|mutlak)\s+({_SAYI})", r"\1(\2)", m)

    # yüzde ifadeleri kesire dönüşür
    m = re.sub(rf"yüzde\s*({_SAYI})", r"(\1/100)", m)
    m = re.sub(rf"%\s*({_SAYI})", r"(\1/100)", m)
    m = re.sub(rf"({_SAYI})\s*%", r"(\1/100)", m)

    # ondalık virgül — liste ayıracıyla karışmasın diye yalnız rakam arasında
    m = re.sub(r"(\d),(\d)", r"\1.\2", m)

    # yalnızca sayı, işleç, parantez ve tanıdık isimler kalsın
    parcalar = []
    for jeton in _PARCALA.findall(m):
        if jeton.isalpha() or "_" in jeton:
            if jeton in _BILINEN:
                parcalar.append(jeton)
        else:
            parcalar.append(jeton)
    ifade = " ".join(parcalar)

    # örtük çarpma: "400 (15/100)" -> "400*(15/100)"
    ifade = re.sub(r"(\d)\s+\(", r"\1*(", ifade)
    ifade = re.sub(r"\)\s+(\d)", r")*\1", ifade)
    ifade = re.sub(r"\s+", "", ifade)
    ifade = re.sub(r"[,+\-*/]+$", "", ifade)

    if not re.search(r"\d", ifade):
        return None
    # tek başına sayı hesap sayılmaz
    if not re.search(r"[+\-*/(]", ifade):
        return None
    return ifade


def _toplu_not(soru: str) -> str | None:
    """'şu sayıların ortalaması' türü soruları doğrudan çözer."""
    m = (soru or "").lower()
    for anahtar, fonksiyon in _TOPLU_IPUCU.items():
        if anahtar in m:
            sayilar = [float(s.replace(",", ".")) for s in re.findall(_SAYI, m)]
            if len(sayilar) >= 2:
                try:
                    sonuc = _sadelestir(_FONKSIYONLAR[fonksiyon](sayilar))
                except Exception:  # noqa: BLE001
                    return None
                dizi = ", ".join(str(_sadelestir(s)) for s in sayilar)
                return f"HESAP SONUCU (doğrulanmış): {anahtar} [{dizi}] = {sonuc}"
    return None


# Türkçe ek alır: "karekökü", "ortalaması", "medyanı". Bu yüzden sonda \b değil \w*.
_MATEMATIK_IPUCU = re.compile(
    r"(\d\s*[\+\-\*/×÷\^%]\s*\d)"
    r"|\b(hesapla|kaç eder|kaçtır|kaç yapar|yüzde|karekök|karekok|kök|faktöriyel|"
    r"ortalama|medyan|ortanca|standart sapma|varyans|logaritma)\w*"
    r"|(%\s*\d)",
    re.IGNORECASE,
)


def matematik_var_mi(soru: str) -> bool:
    return bool(_MATEMATIK_IPUCU.search(soru or ""))


def hesap_notu(soru: str) -> str | None:
    """Soruda hesaplanabilir bir şey varsa doğrulanmış sonucu not olarak döndürür."""
    if not matematik_var_mi(soru):
        return None
    toplu = _toplu_not(soru)
    if toplu:
        return toplu
    ifade = _ifadeyi_ayikla(soru)
    if not ifade:
        return None
    sonuc, hata = guvenli_hesapla(ifade)
    if hata is not None or sonuc is None:
        return None
    return f"HESAP SONUCU (doğrulanmış): {ifade} = {sonuc}"


# ══════════════════════════════════════════════════════════════════
# 2) ZAMAN BAĞLAMI
# ══════════════════════════════════════════════════════════════════

_GUNLER = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
_AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
          "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]


def _akademik_donem(simdi: datetime) -> str:
    ay = simdi.month
    if ay in (9, 10, 11, 12, 1):
        return "güz dönemi"
    if ay in (2, 3, 4, 5, 6):
        return "bahar dönemi"
    return "yaz tatili"


def zaman_baglami() -> str:
    simdi = datetime.now(TR_SAAT_DILIMI)
    return (
        f"ŞU ANKİ ZAMAN (Türkiye): {_GUNLER[simdi.weekday()]}, "
        f"{simdi.day} {_AYLAR[simdi.month - 1]} {simdi.year}, saat {simdi:%H:%M}. "
        f"Akademik takvimde {_akademik_donem(simdi)} dönemindeyiz."
    )


# ══════════════════════════════════════════════════════════════════
# 3) GÜNCEL BİLGİ KATMANI
# ══════════════════════════════════════════════════════════════════

_GUNCEL_IPUCU = re.compile(
    r"\b(güncel|son dakika|bugün|dün|bu hafta|bu ay|şu an|haber|yeni çıkan|"
    r"en yeni|en son|kaç tl|dolar|euro|altın|kur|fiyat|piyasa|"
    r"sonuç açıkland|takvim|ne zaman açıklan)\b",
    re.IGNORECASE,
)


def guncel_gerekiyor_mu(soru: str) -> bool:
    return bool(_GUNCEL_IPUCU.search(soru or ""))


def web_arama(sorgu: str, adet: int = 4) -> str | None:
    """
    İsteğe bağlı güncel bilgi katmanı.
    `pip install ddgs` kurulu değilse sessizce devre dışı kalır.
    """
    try:
        from ddgs import DDGS  # type: ignore
    except ImportError:
        try:
            from duckduckgo_search import DDGS  # type: ignore
        except ImportError:
            return None
    try:
        with DDGS() as arama:
            sonuclar = list(arama.text(sorgu, region="tr-tr", max_results=adet))
    except Exception:  # noqa: BLE001 — ağ hatası asistanı durdurmamalı
        return None
    satirlar = []
    for s in sonuclar or []:
        baslik = (s.get("title") or "").strip()
        ozet = (s.get("body") or "").strip().replace("\n", " ")
        if baslik and ozet:
            satirlar.append(f"- {baslik}: {ozet[:280]}")
    if not satirlar:
        return None
    return "GÜNCEL WEB SONUÇLARI (doğrulanmamış, kaynağı belirt):\n" + "\n".join(satirlar)
