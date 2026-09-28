import type { DersAnahtari } from "../veri/gezinme";
import { dersKimligi } from "../veri/pano_bicim";

/**
 * "Derslerim"e yıldızlanan dersler. Kişisel bir kolaylık: bu cihazda
 * hatırlanır, sunucuya gitmez (kimin hangi dersi izlediği kimseye görünmez).
 * Depolama kapalıysa (gizli sekme) sessizce boş döner.
 */
const ANAHTAR = "yazveb:derslerim";

export function sabitDersler(): DersAnahtari[] {
  try {
    const v = JSON.parse(localStorage.getItem(ANAHTAR) ?? "[]");
    return Array.isArray(v) ? v.filter((d) => d && typeof d.ad === "string").slice(0, 40) : [];
  } catch {
    return [];
  }
}

export function sabitMi(d: DersAnahtari) {
  const k = dersKimligi(d);
  return sabitDersler().some((x) => dersKimligi(x) === k);
}

export function dersSabitle(d: DersAnahtari, sabit: boolean) {
  const k = dersKimligi(d);
  const liste = sabitDersler().filter((x) => dersKimligi(x) !== k);
  if (sabit) liste.unshift({ kod: d.kod, ad: d.ad, kurum: d.kurum ?? null });
  try { localStorage.setItem(ANAHTAR, JSON.stringify(liste.slice(0, 40))); } catch { /* depolama kapalı */ }
}
