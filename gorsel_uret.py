# -*- coding: utf-8 -*-
"""
Silüetin web sürümlerini üretir.

Kaynak görsel 8448×4608 ve 35 MB. Tam ekran arka plan için gereğinden yüzlerce
kat büyük: tarayıcı her açılışta onu çözmek zorunda kalıyor, depoya girince de
klonu şişiriyor. Bu betik üç WebP sürüm üretir:

    siluet-2560.webp   geniş ekran / retina        ~360 KB
    siluet-1280.webp   dizüstü ve telefon          ~140 KB
    siluet-640.webp    hale katmanı (bulanık)       ~38 KB

Kaynak PNG depoya girmez (bkz. .gitignore); üretilen WebP'ler girer.

Kullanım:
    python gorsel_uret.py [kaynak.png]

Gereksinim:  pip install pillow
"""

from __future__ import annotations

import sys
from pathlib import Path

KOK = Path(__file__).parent
STATIK = KOK / "static"

# (genişlik, kalite, dosya adı)
SURUMLER = (
    (2560, 84, "siluet-2560.webp"),
    (1280, 84, "siluet-1280.webp"),
    (640, 80, "siluet-640.webp"),
)

VARSAYILAN_KAYNAKLAR = ("silüet.png", "siluet.png", "avatar.png")


def kaynak_bul(verilen: str | None) -> Path | None:
    if verilen:
        yol = Path(verilen)
        return yol if yol.exists() else None
    for ad in VARSAYILAN_KAYNAKLAR:
        for klasor in (STATIK, KOK):
            if (klasor / ad).exists():
                return klasor / ad
    return None


def main() -> int:
    try:
        from PIL import Image
    except ImportError:
        print("Pillow kurulu değil:  pip install pillow")
        return 1

    kaynak = kaynak_bul(sys.argv[1] if len(sys.argv) > 1 else None)
    if kaynak is None:
        print("Kaynak görsel bulunamadı. Aranan: " + ", ".join(VARSAYILAN_KAYNAKLAR))
        return 1

    STATIK.mkdir(exist_ok=True)
    with Image.open(kaynak) as gorsel:
        print(f"kaynak: {kaynak.name}  {gorsel.size[0]}×{gorsel.size[1]}  "
              f"{kaynak.stat().st_size / 1e6:.1f} MB")
        for genislik, kalite, ad in SURUMLER:
            oran = genislik / gorsel.width
            kucuk = gorsel.resize((genislik, round(gorsel.height * oran)), Image.LANCZOS)
            hedef = STATIK / ad
            kucuk.save(hedef, "WEBP", quality=kalite, method=6)
            print(f"  {ad:20} {kucuk.size[0]}×{kucuk.size[1]}  "
                  f"{hedef.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
