# -*- coding: utf-8 -*-
"""
Tasarım önizlemesi — API anahtarı, model veya internet gerektirmez.

    python onizleme.py

static/siluet-*.webp dosyalarını alır, sahneyi örnek bir konuşmayla çizer ve
onizleme.html üretir. Konuşma efekti sabit bir güçte dondurulur; --odak
değerini ve renkleri tarayıcıda deneyip arayuz.py'ye geçirebilirsin.
"""

from __future__ import annotations

import base64
import webbrowser
from pathlib import Path

import arayuz

KOK = Path(__file__).parent
ODAK = "32%"  # radyal alanın merkezi — figürün başının ekrandaki yüksekliği

ORNEK = [
    {"rol": "user", "icerik": "Genç 2030 nedir?", "etiket": "Sen"},
    {"rol": "assistant",
     "icerik": "Gençlik ve Spor Bakanlığı ile Sanayi ve Teknoloji Bakanlığı'nın "
               "yürüttüğü bir yapay zeka programı.",
     "etiket": "YAZVEB · kurumsal hafıza"},
    {"rol": "user", "icerik": "Peki nasıl katılabilirim?", "etiket": "Sen"},
    {"rol": "assistant",
     "icerik": "WhatsApp grubumuzdan Genç 2030 grubuna katılma isteği gönderiyorsun, "
               "sonra zaman zaman açılan eğitmenlik formunu dolduruyorsun.",
     "etiket": "YAZVEB · kurumsal hafıza"},
]


def _b64(adaylar: list[str]) -> str | None:
    for ad in adaylar:
        for klasor in (KOK / "static", KOK):
            yol = klasor / ad
            if yol.exists():
                return base64.b64encode(yol.read_bytes()).decode()
    return None


def _kaynak(adaylar: list[str]) -> str:
    for ad in adaylar:
        for klasor in (KOK / "static", KOK):
            yol = klasor / ad
            if yol.exists():
                tur = "webp" if yol.suffix == ".webp" else "png"
                return f"data:image/{tur};base64," + base64.b64encode(yol.read_bytes()).decode()
    return ""


def uret() -> Path:
    siluet = _kaynak(["siluet-1280.webp", "silüet.png", "siluet.png", "avatar.png"])
    hale = _kaynak(["siluet-640.webp", "siluet-1280.webp"]) or siluet
    logo = _b64(["logo.png", "LOGO.png", "logo.jpg", "LOGO.jpg"])
    figur = arayuz.figur_gorsel(siluet) if siluet else ""

    govde = f"""<!doctype html>
<html lang="tr" data-yz-mod="konusma"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YAZVEB Merkez — önizleme</title>
{arayuz.stil(ODAK)}
<style>
  body {{ margin:0; background:#05070C; }}
  /* Önizlemede ses yok; konuşma efekti sabit bir güçte dondurulur. */
  :root {{ --yz-guc:.62; --yz-bas:.5; --yz-tiz:.4; }}
  .kutu {{
    position:fixed; left:var(--kenar); bottom:clamp(20px,3.2vh,38px); width:var(--ray);
    height:52px; box-sizing:border-box; padding:0 16px; z-index:5; display:flex;
    align-items:center; background:rgba(9,14,24,.68);
    border:1px solid rgba(0,229,255,.16); backdrop-filter:blur(16px);
    font-family:var(--govde); font-weight:300; font-size:.95rem; color:rgba(111,132,150,.62);
  }}
</style></head><body data-onizleme>
{arayuz.sahne(figur, arayuz.hale_gorsel(hale) if hale else "")}
{arayuz.rozet(logo)}
{arayuz.akis(ORNEK, 3)}
{arayuz.telemetri(["önizleme kipi", "veri yok"])}
<div class="kutu">YAZVEB Asistanına sor…</div>
</body></html>"""

    hedef = KOK / "onizleme.html"
    hedef.write_text(govde, encoding="utf-8")
    return hedef


if __name__ == "__main__":
    yol = uret()
    print(f"Hazır: {yol}")
    webbrowser.open(yol.as_uri())
