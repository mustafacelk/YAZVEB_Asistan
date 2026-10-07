import type { Etkinlik } from "./supabase";
import type { EtkinlikOzeti, KazanimOzeti } from "./odul";
import type { SinavDurumu } from "./pano_bicim";
import { bugunGunu, gunFarki, type BenimUstlenmem, type EkipOzeti, type PanoIsi } from "./ekip_bicim";

/**
 * Ana ekranın "Bugün" bölümü: her özellik için bir kart değil, şu an
 * önemli olan en fazla ÜÇ şey (TASARIM.md §2). Saf; testler/gezinme.test.mts.
 *
 * Öncelik:
 *   1.   Şu an süren etkinlik (QR okutulmadıysa en üstte, eylemiyle)
 *   1.5  Bugün yapılacak, üstlendiğin gönüllü işi
 *   2.   Süresi 3 gün içinde dolacak ödül; geciken ya da bugün teslim pano işin
 *   3.   Sınav dönemi (yaklaşıyor / sürüyor)
 *   3.2  Yarınki gönüllü işin; 1–2 gün içinde teslim pano işin
 *   4.   7 gün içindeki sıradaki etkinlik
 *   5.   Bekleyen ödül (acil değilse)
 */
export type BugunOgesi =
  | { tur: "etkinlik"; etkinlik: Etkinlik; canli: boolean; puan: number; katildi: boolean }
  | { tur: "odul"; aktif: KazanimOzeti[]; acil: boolean }
  | { tur: "sinav"; sinav: SinavDurumu; bolum: string | null; notSayisi: number | null }
  | { tur: "gonullu"; is: BenimUstlenmem; fark: number }
  | { tur: "ekip_isi"; is: PanoIsi; fark: number; digerleri: number };

const GUN = 86_400_000;

export function sureliMi(e: Pick<Etkinlik, "baslangic" | "bitis">, simdi: number) {
  const bas = new Date(e.baslangic).getTime();
  const son = e.bitis ? new Date(e.bitis).getTime() : bas + 3 * 3_600_000;
  return bas <= simdi && simdi < son;
}

/** Her ekranın altındaki "QR okut" şeridi: süren, puanlı, henüz okutulmamış etkinlik. */
export function canliEtkinlik(etkinlikler: Etkinlik[], ozet: EtkinlikOzeti[], simdi = Date.now()) {
  for (const e of etkinlikler) {
    if (!sureliMi(e, simdi)) continue;
    const o = ozet.find((x) => x.etkinlik_id === e.id);
    if (o && o.puan > 0 && !o.katildi) return { etkinlik: e, puan: o.puan };
  }
  return null;
}

export function bugunListesi(g: {
  simdi?: number;
  etkinlikler: Etkinlik[];
  ozet: EtkinlikOzeti[];
  sinav: { sinav: SinavDurumu | null; bolum: string | null; bolum_notlari: number | null } | null;
  cuzdan: KazanimOzeti[];
  /** Ekip modülü (kurulu değilse ya da kişi kadroda değilse boş kalır). */
  ekip?: Pick<EkipOzeti, "ustlenmeler" | "isler"> | null;
}): BugunOgesi[] {
  const simdi = g.simdi ?? Date.now();
  const liste: { oncelik: number; oge: BugunOgesi }[] = [];

  const sirali = [...g.etkinlikler].sort((a, b) => a.baslangic.localeCompare(b.baslangic));
  const suren = sirali.find((e) => sureliMi(e, simdi));
  const siradaki = suren ?? sirali.find((e) => {
    const t = new Date(e.baslangic).getTime();
    return t >= simdi && t - simdi <= 7 * GUN;
  });
  if (siradaki) {
    const o = g.ozet.find((x) => x.etkinlik_id === siradaki.id);
    const canli = !!suren;
    liste.push({
      oncelik: canli ? (o?.katildi ? 3.5 : 1) : 4,
      oge: { tur: "etkinlik", etkinlik: siradaki, canli, puan: o?.puan ?? 0, katildi: !!o?.katildi },
    });
  }

  const aktif = g.cuzdan.filter((z) => z.durum === "aktif")
    .sort((a, b) => a.son_kullanma.localeCompare(b.son_kullanma));
  if (aktif.length) {
    const acil = new Date(aktif[0].son_kullanma).getTime() - simdi <= 3 * GUN;
    liste.push({ oncelik: acil ? 2 : 5, oge: { tur: "odul", aktif, acil } });
  }

  if (g.sinav?.sinav) {
    liste.push({
      oncelik: 3,
      oge: { tur: "sinav", sinav: g.sinav.sinav, bolum: g.sinav.bolum, notSayisi: g.sinav.bolum_notlari },
    });
  }

  // Gönüllü işi: bugün ya da yarın yapılacak olan (en yakını). "Yaptım" dediysen gösterilmez.
  const gun = bugunGunu(new Date(simdi));
  const gonullu = (g.ekip?.ustlenmeler ?? [])
    .filter((u) => u.durum === "ustlendi")
    .map((u) => ({ u, fark: gunFarki(gun, u.tarih) }))
    .filter((x) => x.fark >= 0 && x.fark <= 1)
    .sort((a, b) => a.fark - b.fark || (a.u.saat ?? "").localeCompare(b.u.saat ?? ""))[0];
  if (gonullu) {
    liste.push({ oncelik: gonullu.fark === 0 ? 1.5 : 3.2, oge: { tur: "gonullu", is: gonullu.u, fark: gonullu.fark } });
  }

  // Pano işi: teslimi en yakın açık işin (geciken önce); 2 günden uzaksa Bugün'e girmez.
  const isler = (g.ekip?.isler ?? [])
    .filter((i) => i.durum === "sirada" || i.durum === "yapiliyor")
    .map((i) => ({ i, fark: gunFarki(gun, i.teslim) }))
    .filter((x) => x.fark <= 2)
    .sort((a, b) => a.fark - b.fark);
  if (isler.length) {
    const ilk = isler[0];
    liste.push({
      oncelik: ilk.fark <= 0 ? 2 : 3.3,
      oge: { tur: "ekip_isi", is: ilk.i, fark: ilk.fark, digerleri: isler.length - 1 },
    });
  }

  return liste.sort((a, b) => a.oncelik - b.oncelik).slice(0, 3).map((x) => x.oge);
}

/** Selamlamanın altındaki tek cümle: en önemli şeyin özeti. */
export function durumCumlesi(ogeler: BugunOgesi[], simdi = Date.now()): string {
  const ilk = ogeler[0];
  if (!ilk) return "Bugün sakin.";
  if (ilk.tur === "etkinlik") {
    if (ilk.canli) return ilk.katildi ? "Etkinliktesin; puanın işlendi." : "Şu an bir etkinlik sürüyor.";
    const t = new Date(ilk.etkinlik.baslangic);
    const bugun = t.toDateString() === new Date(simdi).toDateString();
    const yarin = t.toDateString() === new Date(simdi + GUN).toDateString();
    return bugun ? "Bugün bir etkinlik var." : yarin ? "Yarın bir etkinlik var." : "Bu hafta bir etkinlik var.";
  }
  if (ilk.tur === "odul") return ilk.acil ? "Bir ödülünün süresi dolmak üzere." : "Kullanılmayı bekleyen bir ödülün var.";
  if (ilk.tur === "gonullu") return ilk.fark === 0 ? "Bugün üstlendiğin bir gönüllü işi var." : "Yarın üstlendiğin bir gönüllü işi var.";
  if (ilk.tur === "ekip_isi") {
    return ilk.fark < 0 ? "Ekip panosunda geciken bir işin var." : ilk.fark === 0 ? "Bugün teslim edeceğin bir iş var." : "Yakında teslim edeceğin bir iş var.";
  }
  return ilk.sinav.asama === "suruyor" ? `${ilk.sinav.ad} haftası sürüyor.` : `${ilk.sinav.ad} haftası yaklaşıyor.`;
}
