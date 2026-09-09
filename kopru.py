# -*- coding: utf-8 -*-
"""
Tarayıcı ile asistan arasındaki köprü — Streamlit'in yeniden çizim döngüsünün
dışında çalışan yerel HTTP sunucusu.

NEDEN VAR
─────────
Streamlit'te her etkileşim betiği baştan çalıştırır (rerun). Sesli sohbet
bunu kaldırmaz: kullanıcı konuştuğu an sayfa yeniden çizilirse çalan ses
kesilir, mikrofon kapanır, WebGL sahnesi sıfırlanır. Klasik çözüm
`setComponentValue` ile veriyi Streamlit'e yollamaktır — ama o da rerun
tetikler.

Bu yüzden konuşma trafiği Streamlit'in dışından akar: aynı Python süreci
içinde 127.0.0.1 üzerinde küçük bir HTTP sunucusu açılır, tarayıcıdaki
konsol doğrudan oraya `fetch` eder. Sayfa hiç yenilenmez; sahne, mikrofon
ve ses zinciri kesintisiz kalır.

GÜVENLİK
────────
• Yalnızca 127.0.0.1'e bağlanır, dışarıya açılmaz.
• Her oturumda üretilen rastgele anahtar `X-YZ-Anahtar` başlığında istenir;
  makinedeki başka bir sekme asistanı kullanamaz.
• CORS yalnızca istek yapan kaynağa yansıtılır (Streamlit sayfası).

SOHBET GEÇMİŞİ
──────────────
Yazılı giriş (st.chat_input) ile sesli giriş aynı geçmişi paylaşmalı; yoksa
kullanıcı sesle sorduğunu yazılı sorunun bağlamında bulamaz. Geçmiş bu
modülde tutulur, iki taraf da buradan okur.
"""

from __future__ import annotations

import base64
import json
import os
import re
import secrets
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable

import ses_motoru

# ══════════════════════════════════════════════════════════════════
# AYARLAR
# ══════════════════════════════════════════════════════════════════

ILK_KAPI = 8787
KAPI_DENEME = 24
ONBELLEK_BOYU = 64          # kaç seslendirme bellekte tutulsun
GECMIS_SINIRI = 40          # oturum başına saklanan mesaj sayısı
EN_UZUN_GOVDE = 12 * 1024 * 1024   # 12 MB — ses yüklemesi için yeterli, DoS için değil

_gecmis_kilidi = threading.RLock()
_GECMIS: dict[str, list[dict]] = {}

_ses_kilidi = threading.RLock()
_SES_ONBELLEK: "OrderedDict[str, tuple[bytes, float]]" = OrderedDict()


# ══════════════════════════════════════════════════════════════════
# PAYLAŞILAN GEÇMİŞ
# ══════════════════════════════════════════════════════════════════

def gecmis(oturum: str) -> list[dict]:
    with _gecmis_kilidi:
        return list(_GECMIS.get(oturum, []))


def ekle(oturum: str, rol: str, icerik: str, etiket: str = "") -> None:
    with _gecmis_kilidi:
        raf = _GECMIS.setdefault(oturum, [])
        raf.append({"rol": rol, "icerik": icerik, "etiket": etiket})
        if len(raf) > GECMIS_SINIRI:
            del raf[: len(raf) - GECMIS_SINIRI]


def gecmisi_kur(oturum: str, mesajlar: list[dict]) -> None:
    """Sayfa yenilendiğinde Streamlit'teki liste ile köprüyü eşitler."""
    with _gecmis_kilidi:
        _GECMIS[oturum] = list(mesajlar)[-GECMIS_SINIRI:]


def temizle(oturum: str) -> None:
    with _gecmis_kilidi:
        _GECMIS.pop(oturum, None)


# ══════════════════════════════════════════════════════════════════
# SESLENDİRME ÖNBELLEĞİ
# ══════════════════════════════════════════════════════════════════

# Bir parçanın en az kaç karakter olacağı. Sınır cümle sınırlarıyla birlikte
# çalışır: parça hep tam cümlelerden oluşur, ortasından kesilmez. Bu yüzden
# küçük tutulabiliyor — 60 karakter, tek bir kısa cümle demek ve ilk sesin
# gecikmesini bir saniyenin altına indiriyor.
EN_KISA_PARCA = 60


def cumlelere_bol(metin: str) -> list[str]:
    """
    Metni seslendirme parçalarına böler.

    Uzun bir cevabın tamamını sentezlemek beş saniye sürüyor; o beş saniye
    boyunca ortalık sessiz kalıyor. İlk cümle tek başına bir saniyede hazır
    olur ve çalmaya başlar, kalanı o çalarken üretilir. Kullanıcı açısından
    bekleme beş saniyeden bir saniyeye iner.

    Kısa metinler bölünmez: bölmenin maliyeti (parçalar arası ek istek) ancak
    uzun metinlerde karşılığını verir.
    """
    metin = (metin or "").strip()
    if len(metin) <= EN_KISA_PARCA * 2:
        return [metin] if metin else []

    parcalar: list[str] = []
    tampon = ""
    for cumle in re.split(r"(?<=[.!?])\s+", metin):
        tampon = (tampon + " " + cumle).strip() if tampon else cumle
        if len(tampon) >= EN_KISA_PARCA:
            parcalar.append(tampon)
            tampon = ""
    if tampon:
        # Artakalan çok kısaysa son parçaya eklenir; tek başına duyulursa
        # cümle ortasında kesilmiş gibi olur.
        if parcalar and len(tampon) < EN_KISA_PARCA // 2:
            parcalar[-1] += " " + tampon
        else:
            parcalar.append(tampon)
    return parcalar or [metin]


def _seslendir_onbellekli(metin: str, ses_adi: str) -> tuple[bytes | None, float]:
    anahtar = f"{ses_adi}|{metin}"
    with _ses_kilidi:
        vurus = _SES_ONBELLEK.get(anahtar)
        if vurus is not None:
            _SES_ONBELLEK.move_to_end(anahtar)
            return vurus

    baytlar, sure = ses_motoru.seslendir(metin, ses_adi)
    if baytlar:
        with _ses_kilidi:
            _SES_ONBELLEK[anahtar] = (baytlar, sure)
            while len(_SES_ONBELLEK) > ONBELLEK_BOYU:
                _SES_ONBELLEK.popitem(last=False)
    return baytlar, sure


def onden_isit(metinler: list[str], ses_adi: str) -> None:
    """
    Sık kullanılan cümleleri açılışta arka planda seslendirip önbelleğe koyar.

    Hızlı yolun cevapları (selam, teşekkür, hatır sorma) modele hiç gitmez;
    geriye tek gecikme kaynağı olarak seslendirme kalır. O da önceden
    üretilirse "merhaba" demekle cevabı duymak arasında ölçülebilir bir bekleme
    kalmaz. Tek iş parçacığında sırayla yapılır — açılışta ağı boğmamak için.
    """
    def calis():
        for metin in metinler:
            if not metin:
                continue
            try:
                _seslendir_onbellekli(metin, ses_adi)
            except Exception:  # noqa: BLE001 — ısıtma başarısızsa sorun değil
                pass

    threading.Thread(target=calis, name="yazveb-isitma", daemon=True).start()


# ══════════════════════════════════════════════════════════════════
# KONUŞMA ÇÖZÜMLEME (STT yedeği)
# ══════════════════════════════════════════════════════════════════

def _whisper(ses_baytlari: bytes, tur: str = "webm") -> str:
    """
    Tarayıcının konuşma tanıması yoksa (Firefox, Safari, izin reddi) ses
    buraya gelir. OPENAI_API_KEY varsa Whisper'a gider; yoksa boş döner ve
    arayüz yazılı moda düşer.
    """
    anahtar = os.getenv("OPENAI_API_KEY", "").strip()
    if not anahtar or not ses_baytlari:
        return ""
    try:
        import httpx

        with httpx.Client(timeout=60.0) as istemci:
            yanit = istemci.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {anahtar}"},
                files={"file": (f"ses.{tur}", ses_baytlari, f"audio/{tur}")},
                data={"model": os.getenv("OPENAI_STT_MODEL", "whisper-1"),
                      "language": "tr"},
            )
        if yanit.status_code != 200:
            print(f"[kopru] whisper {yanit.status_code}: {yanit.text[:160]}")
            return ""
        return (yanit.json().get("text") or "").strip()
    except Exception as hata:  # noqa: BLE001
        print(f"[kopru] whisper hatası: {str(hata)[:160]}")
        return ""


def ses_motoru_hata_cevabi() -> str:
    """Zincir cevap veremediğinde söylenecek cümle (bkz. zincir.HATA_CEVABI)."""
    try:
        import zincir

        return zincir.HATA_CEVABI
    except Exception:  # noqa: BLE001 — zincir yüklenemese bile bir şey söylenmeli
        return "Kusura bakma, cevabı getiremedim. Bir daha sorar mısın?"


def stt_hazir() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


# ══════════════════════════════════════════════════════════════════
# KÖPRÜ
# ══════════════════════════════════════════════════════════════════

@dataclass
class Kopru:
    kapi: int
    anahtar: str
    sunucu: ThreadingHTTPServer = field(repr=False)
    iplik: threading.Thread = field(repr=False)

    @property
    def adres(self) -> str:
        return f"http://127.0.0.1:{self.kapi}"

    def kapat(self) -> None:
        try:
            self.sunucu.shutdown()
        except Exception:  # noqa: BLE001
            pass


def _sunucu_ac(isleyici) -> ThreadingHTTPServer | None:
    """
    Portu deneme yanılma ile DOĞRUDAN sunucuyu kurarak bulur.

    Önce "boş mu" diye ayrı bir soket ile yoklamak Windows'ta yanıltıcıdır:
    SO_REUSEADDR açıkken başka bir sürecin dinlediği port da bağlanabilir
    görünür. O zaman iki Streamlit örneği aynı portu paylaşır, istekler
    rastgele birine düşer ve karşı taraf anahtarı tanımadığı için 403 döner —
    dışarıdan "köprü bağlı ama cevap vermiyor" gibi görünen bir hata.

    Bu yüzden tek doğrulama gerçek bağlanmadır ve adres yeniden kullanımı
    açıkça kapatılır.
    """
    class TekSahip(ThreadingHTTPServer):
        allow_reuse_address = False   # port gerçekten boş değilse hata versin
        daemon_threads = True

    for kapi in range(ILK_KAPI, ILK_KAPI + KAPI_DENEME):
        try:
            return TekSahip(("127.0.0.1", kapi), isleyici)
        except OSError:
            continue
    # Aralığın tamamı doluysa işletim sistemi bir port seçsin.
    try:
        return TekSahip(("127.0.0.1", 0), isleyici)
    except OSError:
        return None


def _isleyici_uret(anahtar: str, cozucu: Callable[[str, list[dict]], dict], ses_adi: str):
    """
    İsteği karşılayan sınıfı kapatma (closure) içinde üretir; böylece asistan
    örneği ve oturum anahtarı global değişkene taşınmadan taşınır.
    """

    class Isleyici(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "YAZVEB-Kopru/1.0"

        # ── altyapı ────────────────────────────────────────────
        def log_message(self, bicim, *args):  # noqa: A002 — konsolu kirletmesin
            pass

        def _kaynak(self) -> str:
            return self.headers.get("Origin", "*") or "*"

        def _basliklar(self, durum: int, tur: str, uzunluk: int) -> None:
            self.send_response(durum)
            self.send_header("Content-Type", tur)
            self.send_header("Content-Length", str(uzunluk))
            self.send_header("Access-Control-Allow-Origin", self._kaynak())
            self.send_header("Access-Control-Allow-Credentials", "false")
            self.send_header("Vary", "Origin")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

        def _json(self, veri: dict, durum: int = 200) -> None:
            govde = json.dumps(veri, ensure_ascii=False).encode("utf-8")
            self._basliklar(durum, "application/json; charset=utf-8", len(govde))
            try:
                self.wfile.write(govde)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def _govde(self) -> bytes:
            try:
                boy = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return b""
            if boy <= 0 or boy > EN_UZUN_GOVDE:
                return b""
            return self.rfile.read(boy)

        def _yetkili(self) -> bool:
            gelen = self.headers.get("X-YZ-Anahtar", "")
            if not gelen and "?" in self.path:
                from urllib.parse import parse_qs, urlparse

                gelen = (parse_qs(urlparse(self.path).query).get("anahtar") or [""])[0]
            return secrets.compare_digest(gelen, anahtar)

        # ── uçlar ──────────────────────────────────────────────
        def do_OPTIONS(self):  # noqa: N802
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", self._kaynak())
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-YZ-Anahtar")
            self.send_header("Access-Control-Max-Age", "86400")
            self.send_header("Content-Length", "0")
            self.send_header("Vary", "Origin")
            self.end_headers()

        def do_GET(self):  # noqa: N802
            yol = self.path.split("?", 1)[0]
            if yol == "/yz/saglik":
                self._json({
                    "tamam": True,
                    "tts": ses_motoru.saglayici_adi(),
                    "stt_yedek": stt_hazir(),
                })
                return
            if not self._yetkili():
                self._json({"hata": "yetkisiz"}, 403)
                return
            if yol == "/yz/gecmis":
                from urllib.parse import parse_qs, urlparse

                oturum = (parse_qs(urlparse(self.path).query).get("oturum") or [""])[0]
                self._json({"mesajlar": gecmis(oturum)})
                return
            self._json({"hata": "bulunamadı"}, 404)

        def do_POST(self):  # noqa: N802
            yol = self.path.split("?", 1)[0]
            if not self._yetkili():
                self._json({"hata": "yetkisiz"}, 403)
                return

            ham = self._govde()

            if yol == "/yz/dinle":
                tur = (self.headers.get("X-YZ-Bicim") or "webm").strip().lower()
                metin = _whisper(ham, tur if tur.isalnum() else "webm")
                self._json({"metin": metin, "hazir": stt_hazir()})
                return

            try:
                istek = json.loads(ham.decode("utf-8") or "{}")
            except Exception:  # noqa: BLE001
                self._json({"hata": "bozuk istek"}, 400)
                return

            if yol == "/yz/ses":
                metin = (istek.get("metin") or "").strip()
                if not metin:
                    self._json({"hata": "boş metin"}, 400)
                    return
                # Uzun cevap parçalara bölünür; tarayıcı ilk parçayı çalarken
                # bir sonrakini ister. Bölme burada yapılır ki iki taraf aynı
                # sınırlar üzerinde anlaşsın.
                parcalar = cumlelere_bol(metin)
                try:
                    indeks = max(0, min(int(istek.get("parca") or 0), len(parcalar) - 1))
                except (TypeError, ValueError):
                    indeks = 0
                baytlar, sure = _seslendir_onbellekli(parcalar[indeks],
                                                     istek.get("ses") or ses_adi)
                self._json({
                    "ses": base64.b64encode(baytlar).decode() if baytlar else None,
                    "sure": round(sure, 3),
                    "parca": indeks,
                    "toplam": len(parcalar),
                })
                return

            if yol == "/yz/sor":
                self._sor(istek)
                return

            if yol == "/yz/temizle":
                temizle((istek.get("oturum") or "").strip())
                self._json({"tamam": True})
                return

            self._json({"hata": "bulunamadı"}, 404)

        def _sor(self, istek: dict) -> None:
            soru = (istek.get("soru") or "").strip()
            oturum = (istek.get("oturum") or "varsayilan").strip()
            ses_ister = bool(istek.get("ses", False))

            if not soru:
                self._json({"hata": "boş soru"}, 400)
                return

            onceki = gecmis(oturum)
            ekle(oturum, "user", soru, "Sen")

            basla = time.perf_counter()
            try:
                sonuc = cozucu(soru, onceki)
                cevap = (sonuc.get("cevap") or "").strip()
                kaynaklar = sonuc.get("kaynaklar") or []
                etiket = "YAZVEB · " + " + ".join(kaynaklar) if kaynaklar else "YAZVEB"
            except Exception as hata:  # noqa: BLE001 — konuşma kopmamalı
                print(f"[kopru] zincir hatası: {str(hata)[:200]}")
                cevap = ses_motoru_hata_cevabi()
                etiket = "YAZVEB · hata"

            ekle(oturum, "assistant", cevap, etiket)

            yanit = {
                "cevap": cevap,
                "etiket": etiket,
                "sure_ms": int((time.perf_counter() - basla) * 1000),
                "ses": None,
                "sure": 0.0,
                # Tam geçmiş bilerek geri gönderilir. Tarayıcıdaki konsol
                # yalnızca kendi turlarını biliyor; yazılı yoldan (st.chat_input)
                # gelen mesajları göremez, çünkü Streamlit bileşeni yeniden
                # çalıştırmadan sayfayı tazeliyor. Her turda liste sunucudan
                # tazelenince iki yol tek raya düşer.
                "mesajlar": gecmis(oturum),
            }
            if ses_ister:
                baytlar, sure = _seslendir_onbellekli(cevap, ses_adi)
                if baytlar:
                    yanit["ses"] = base64.b64encode(baytlar).decode()
                    yanit["sure"] = round(sure, 3)
                    yanit["motor"] = ses_motoru.son_saglayici()
            self._json(yanit)

    return Isleyici


def baslat(cozucu: Callable[[str, list[dict]], dict],
           ses_adi: str = ses_motoru.VARSAYILAN_SES) -> Kopru | None:
    """
    Köprüyü açar ve arka planda çalıştırır. Açılamazsa None döner — arayüz
    o zaman sessizce Streamlit'in kendi giriş kutusuna (rerun modu) düşer.
    """
    try:
        anahtar = secrets.token_urlsafe(24)
        sunucu = _sunucu_ac(_isleyici_uret(anahtar, cozucu, ses_adi))
        if sunucu is None:
            print("[kopru] boş port bulunamadı")
            return None
        kapi = sunucu.server_address[1]
        iplik = threading.Thread(target=sunucu.serve_forever, name="yazveb-kopru", daemon=True)
        iplik.start()
        print(f"[kopru] 127.0.0.1:{kapi} üzerinde açık", flush=True)
        return Kopru(kapi=kapi, anahtar=anahtar, sunucu=sunucu, iplik=iplik)
    except Exception as hata:  # noqa: BLE001
        print(f"[kopru] açılamadı: {str(hata)[:200]}")
        return None
