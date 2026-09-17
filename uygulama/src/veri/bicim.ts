// Genel metin biçimlendirme (ağ yok, React yok).

/** Selamlama için ilk ad: "mustafa çelik" → "Mustafa", yoksa kullanıcı adı. */
export function selamAdi(adSoyad?: string | null, kullaniciAdi?: string) {
  const ilk = (adSoyad ?? "").trim().split(/\s+/)[0];
  const kaynak = ilk || kullaniciAdi || "";
  if (!kaynak) return "";
  return kaynak.charAt(0).toLocaleUpperCase("tr") + kaynak.slice(1);
}

/** Etkinlik şu an sürüyor mu? Bitiş yoksa başlangıçtan sonraki 3 saat. */
export function suruyorMu(e: { baslangic: string; bitis: string | null }, simdi = Date.now()) {
  const bas = new Date(e.baslangic).getTime();
  const son = e.bitis ? new Date(e.bitis).getTime() : bas + 3 * 3_600_000;
  return bas <= simdi && simdi < son;
}
