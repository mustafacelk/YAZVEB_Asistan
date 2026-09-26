// ═══════════════════════════════════════════════════════════════════
// Yönetim paneli — neyin önce görüneceği
// ═══════════════════════════════════════════════════════════════════
// Saf fonksiyonlar: ağa dokunmaz, testler/oncelik.test.mts ile sınanır.
//
// Yönetici paneli açtığında ilk soru "şu an bir şey yanlış mı?". Liste
// bir bildirim akışı değil, YAPILACAK İŞ listesi: her satır bir eksik ve
// onu gideren tek bir eylem. Her şey yolundaysa liste boştur.
//
// ÖNEM
//   0  şimdi — etkinlik sürüyor ya da 24 saat içinde, öğrenci kayıp yaşıyor
//   1  bu hafta — yakında sorun olacak
//   2  bilgi — göz atmaya değer
// ═══════════════════════════════════════════════════════════════════

import type { Etkinlik } from "../veri/supabase";
import type { YGorev, YKampanya, YSponsor } from "./veri";

export type DikkatEylemi = "gorev" | "sponsor" | "kampanya";
export type Dikkat = {
  onem: 0 | 1 | 2;
  baslik: string;
  ayrinti: string;
  eylem: DikkatEylemi;
  /** Aynı önemdekiler arasında sıra: daha erken olan önce. */
  zaman: number;
};

const SAAT = 3_600_000;
const GUN = 24 * SAAT;
/** Bitiş saati girilmemiş etkinliğin sürdüğü kabul edilen süre. */
const VARSAYILAN_SURE = 3 * SAAT;

const sure = (e: Etkinlik) =>
  e.bitis ? new Date(e.bitis).getTime() : new Date(e.baslangic).getTime() + VARSAYILAN_SURE;

export function suruyor(e: Etkinlik, simdi: number) {
  return new Date(e.baslangic).getTime() <= simdi && simdi < sure(e);
}

/** Şu an işleyen görev: aktif, iptal edilmemiş, süresi içinde. */
export function gorevIsliyor(g: YGorev, simdi: number) {
  return g.aktif && !g.iptal
    && new Date(g.baslangic).getTime() <= simdi && simdi < new Date(g.bitis).getTime();
}

/** Önümüzdeki bir şey için hazırlanan görev: aktif, iptal edilmemiş, henüz bitmemiş. */
function gorevHazir(g: YGorev, simdi: number) {
  return g.aktif && !g.iptal && simdi < new Date(g.bitis).getTime();
}

export function kampanyaIsliyor(k: YKampanya, simdi: number) {
  return k.aktif && !k.iptal
    && new Date(k.baslangic).getTime() <= simdi && simdi < new Date(k.bitis).getTime();
}

/** Stok: sınırsız kalem varsa null; yoksa kalanların toplamı. */
export function kampanyaKalan(k: YKampanya): number | null {
  if (k.oduller.some((o) => o.toplam === null)) return null;
  return k.oduller.reduce((t, o) => t + (o.kalan ?? 0), 0);
}

/** Panelin odak etkinliği: süren varsa o, yoksa en yakın gelecek. */
export function odakEtkinlik(etkinlikler: Etkinlik[], simdi: number): Etkinlik | null {
  const suren = etkinlikler.filter((e) => suruyor(e, simdi))
    .sort((a, b) => a.baslangic.localeCompare(b.baslangic));
  if (suren.length) return suren[0];
  return etkinlikler
    .filter((e) => new Date(e.baslangic).getTime() > simdi)
    .sort((a, b) => a.baslangic.localeCompare(b.baslangic))[0] ?? null;
}

/** Etkinliğe bağlı, hâlâ geçerli (şimdi ya da ileride işleyecek) görevler. */
export function etkinlikGorevleri(e: Etkinlik, gorevler: YGorev[], simdi: number) {
  return gorevler.filter((g) => g.etkinlik_id === e.id && gorevHazir(g, simdi));
}

export function dikkatListesi(
  etkinlikler: Etkinlik[],
  gorevler: YGorev[],
  sponsorlar: YSponsor[],
  simdi: number,
): Dikkat[] {
  const liste: Dikkat[] = [];

  // ── Etkinlik var, QR görevi yok: gelen öğrenci puan alamaz. ──
  for (const e of etkinlikler) {
    const bas = new Date(e.baslangic).getTime();
    const bitti = simdi >= sure(e);
    if (bitti || bas - simdi > 7 * GUN) continue;
    if (etkinlikGorevleri(e, gorevler, simdi).length) continue;
    const yakin = suruyor(e, simdi) || bas - simdi <= GUN;
    liste.push({
      onem: yakin ? 0 : 1,
      baslik: `QR görevi yok: ${e.baslik}`,
      ayrinti: suruyor(e, simdi)
        ? "Etkinlik sürüyor; gelenler puan alamıyor."
        : "Görev oluşturulmazsa gelenler puan alamaz.",
      eylem: "gorev",
      zaman: bas,
    });
  }

  // ── Süren etkinliğin sabit kodlu görevi: paylaşılan kod dışarıdan okutulur. ──
  for (const e of etkinlikler) {
    if (!suruyor(e, simdi)) continue;
    for (const g of etkinlikGorevleri(e, gorevler, simdi)) {
      if (g.dinamik || g.enlem !== null) continue;
      liste.push({
        onem: 2,
        baslik: `Sabit kod: ${g.baslik}`,
        ayrinti: "Kodu paylaşılırsa gelmeyen de okutabilir. Canlı kod ya da konum şartı önerilir.",
        eylem: "gorev",
        zaman: new Date(g.baslangic).getTime(),
      });
    }
  }

  // ── Sponsorlar ve kampanyalar ──
  for (const s of sponsorlar) {
    if (!s.aktif) continue;
    const isleyen = s.kampanyalar.filter((k) => kampanyaIsliyor(k, simdi));
    if (!s.pin_tanimli && isleyen.length) {
      liste.push({
        onem: 0,
        baslik: `PIN yok: ${s.ad}`,
        ayrinti: "Kazanılan ödüller kasada onaylanamaz. İşletme PIN'i tanımla.",
        eylem: "sponsor",
        zaman: simdi,
      });
    }
    if (!isleyen.length) {
      liste.push({
        onem: 2,
        baslik: `Aktif kampanya yok: ${s.ad}`,
        ayrinti: "Kilidi açılan üyeler bu sponsorda ödül alamıyor.",
        eylem: "kampanya",
        zaman: simdi,
      });
    }
    for (const k of isleyen) {
      const kalan = kampanyaKalan(k);
      const bitis = new Date(k.bitis).getTime();
      if (kalan === 0) {
        liste.push({
          onem: 1,
          baslik: `Stok bitti: ${s.ad} · ${k.ad}`,
          ayrinti: "Okutan üye 'tükendi' görüyor. Stok ekle ya da kampanyayı kapat.",
          eylem: "kampanya",
          zaman: bitis,
        });
      } else if (kalan !== null && kalan <= 3) {
        liste.push({
          onem: 1,
          baslik: `Stok azaldı: ${s.ad} · ${k.ad}`,
          ayrinti: `${kalan} ödül kaldı.`,
          eylem: "kampanya",
          zaman: bitis,
        });
      }
      if (bitis - simdi <= 3 * GUN && kalan !== 0) {
        liste.push({
          onem: 2,
          baslik: `Kampanya bitiyor: ${s.ad} · ${k.ad}`,
          ayrinti: `${Math.max(1, Math.ceil((bitis - simdi) / GUN))} gün içinde sona eriyor.`,
          eylem: "kampanya",
          zaman: bitis,
        });
      }
    }
  }

  return liste.sort((a, b) => a.onem - b.onem || a.zaman - b.zaman);
}
