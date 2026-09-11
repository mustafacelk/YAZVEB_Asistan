# -*- coding: utf-8 -*-
"""
Kurumsal hafızayı ve sohbet kalıplarını uygulamaya aktarır.

    python bilgi_disa_aktar.py

TEK KAYNAK İLKESİ
─────────────────
Bilgi bankası iki yerde yaşamaz. `bilgi_bankasi.py` tek doğru kaynaktır;
mobil uygulamanın kullandığı dosya buradan ÜRETİLİR. Elle iki yeri güncellemek
er geç ikisinin ayrışmasıyla biter — asistan web'de doğru, telefonda eski
bilgiyi söyler ve kimse fark etmez.

Bilgi bankası değiştiğinde bu betiği çalıştır ve çıkan dosyayı commit et.

NEDEN VEKTÖR ARAMASI YOK
────────────────────────
Bankanın tamamı ~4.800 jeton; modelin tek istemine rahat sığıyor. Parçalara
bölüp en yakın beşini aramak bu ölçekte hem gereksiz bir ağ çağrısı (gömme)
hem de isabet kaybı riski. Hepsini vermek daha hızlı ve daha doğru.
"""

from __future__ import annotations

import json
from pathlib import Path

import bilgi_bankasi
import zincir

KOK = Path(__file__).parent / "uygulama"
# Sunucu tarafı: kurumsal hafızanın tamamı. Telefona inmez.
HEDEF_SUNUCU = KOK / "supabase" / "functions" / "asistan" / "bilgi.ts"
# İstemci tarafı: yalnızca hızlı yol. 17 KB'lık hafızayı her kullanıcının
# telefonuna indirmenin anlamı yok; selam cümleleri için gerekmiyor.
HEDEF_ISTEMCI = KOK / "src" / "veri" / "sohbet_kaliplari.ts"


def _basliklar(istatistik: dict) -> str:
    return f"""// ═══════════════════════════════════════════════════════════════════
// ÜRETİLMİŞ DOSYA — ELLE DÜZENLEME
// ═══════════════════════════════════════════════════════════════════
// Kaynak: bilgi_bankasi.py  ·  Üretici: bilgi_disa_aktar.py
// Banka sürümü: {istatistik['surum']}  ·  {istatistik['kayit']} kayıt
//
// Güncellemek için:  python bilgi_disa_aktar.py
// ═══════════════════════════════════════════════════════════════════
"""


def sunucu_dosyasi() -> str:
    """Kenar fonksiyonunun kullandığı tam hafıza."""
    belgeler = [bilgi_bankasi.belge_metni(k) for k in bilgi_bankasi.KAYITLAR]
    istatistik = bilgi_bankasi.istatistik()
    return f"""{_basliklar(istatistik)}
export const BANKA_SURUMU = {json.dumps(istatistik['surum'], ensure_ascii=False)};

export const SISTEM_TALIMATI = {json.dumps(zincir.SISTEM_TALIMATI, ensure_ascii=False)};

export const KURUMSAL_HAFIZA = {json.dumps(('\\n\\n').join(belgeler), ensure_ascii=False)};

export const HATA_CEVABI = {json.dumps(zincir.HATA_CEVABI, ensure_ascii=False)};
"""


def istemci_dosyasi() -> str:
    """
    Tarayıcıya inen küçük dosya: yalnızca hızlı yol.

    Selam, teşekkür, hatır sorma gibi cümleler sunucuya HİÇ gitmeden
    cevaplanır — ağ gecikmesi sıfır. Kurumsal hafıza buraya konmaz; 17 KB'ı
    her kullanıcının telefonuna indirmenin bir karşılığı yok.
    """
    istatistik = bilgi_bankasi.istatistik()
    kaliplar = [
        {"anahtarlar": list(anahtarlar), "cevaplar": list(cevaplar)}
        for anahtarlar, cevaplar in zincir.HIZLI_KALIPLAR
    ]
    return f"""{_basliklar(istatistik)}
export const HIZLI_EN_FAZLA_KELIME = {zincir.HIZLI_EN_FAZLA_KELIME};

export const DOLGU: ReadonlySet<string> = new Set({json.dumps(sorted(zincir._DOLGU), ensure_ascii=False)});

export const HIZLI_KALIPLAR: {{ anahtarlar: string[]; cevaplar: string[] }}[] =
{json.dumps(kaliplar, ensure_ascii=False, indent=2)};

export const HATA_CEVABI = {json.dumps(zincir.HATA_CEVABI, ensure_ascii=False)};
"""


def main() -> int:
    istatistik = bilgi_bankasi.istatistik()
    for hedef, uretici, etiket in (
        (HEDEF_SUNUCU, sunucu_dosyasi, "sunucu"),
        (HEDEF_ISTEMCI, istemci_dosyasi, "istemci"),
    ):
        hedef.parent.mkdir(parents=True, exist_ok=True)
        icerik = uretici()
        hedef.write_text(icerik, encoding="utf-8")
        print(f"  {etiket:8} {hedef.relative_to(Path(__file__).parent)}  "
              f"({len(icerik):,} karakter)")
    print(f"\n  {istatistik['kayit']} kayıt · {len(zincir.HIZLI_KALIPLAR)} hızlı kalıp "
          f"· banka {istatistik['surum']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
