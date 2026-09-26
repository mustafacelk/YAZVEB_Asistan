// ═══════════════════════════════════════════════════════════════════
// HUB görünüş verisi — renk paletleri ve eşyaların istemci tarafı
// ═══════════════════════════════════════════════════════════════════
// Fiyat, ad, nadirlik SUNUCUDA (hub.esyalar). Burada yalnızca 3B modelin
// nasıl çizileceği: aynı kimlik, iki yarım. Sunucuda olup burada olmayan
// eşya gri bir kutu olarak çizilir; uygulama kırılmaz.
// ═══════════════════════════════════════════════════════════════════

export const TEN = ["#f6d7c3", "#eec2a0", "#d9a27a", "#b97d55", "#8d5a3b", "#5e3b28"];
export const SAC_RENK = ["#2a1d17", "#5b3a26", "#a86b3c", "#e0c07a", "#c9c9cc", "#3e5a8f"];
export const SAC_ADI = ["Kısa", "Dağınık", "Uzun", "Topuz", "Kazınmış"];
export const YUZ_ADI = ["Gülümseyen", "Sakin", "Neşeli", "Dalgın"];

/** Kıyafet ve oda eşyalarının ana/ikincil rengi. */
export const RENK: Record<string, [string, string?]> = {
  tisort_beyaz: ["#eef0f2"],
  tisort_mavi: ["#3d7bd9"],
  sweat_gri: ["#8a9099"],
  hoodie_gece: ["#1f2a4a", "#8ccfe2"],
  ceket_deri: ["#3a2a22", "#1a1310"],
  sweat_yazveb: ["#0e2433", "#8ccfe2"],
  ceket_yazveb: ["#121417", "#e2b659"],
  pantolon_kot: ["#3b5d8f"],
  pantolon_siyah: ["#1d1f24"],
  sort_bej: ["#cbb892"],
  spor_beyaz: ["#f3f3f3", "#cfd6de"],
  bot_kahve: ["#5a3a24"],
  spor_neon: ["#b8ff5c", "#1d1f24"],
  bere_siyah: ["#1b1d22"],
  kep_yazveb: ["#0e2433", "#8ccfe2"],
  gozluk_yuvarlak: ["#2b2b2b"],
  gozluk_gunes: ["#111111"],
  gozluk_vr: ["#e9ecef", "#1a1d22"],
  canta_sirt: ["#c2542d"],
  canta_laptop: ["#2d3440"],
};

export const NADIRLIK_ADI = { siradan: "Sıradan", nadir: "Nadir", efsane: "Efsane" } as const;
export const SLOT_ADI: Record<string, string> = {
  ust: "Üst", alt: "Alt", ayakkabi: "Ayakkabı", sapka: "Şapka", gozluk: "Gözlük", canta: "Çanta",
  mobilya: "Mobilya", zemin: "Halı", duvar: "Duvar",
};

/** Emoji hediyeler: sunucudaki izin listesiyle aynı anahtarlar. */
export const HEDIYELER: { kod: string; ad: string; emoji: string }[] = [
  { kod: "kahve", ad: "Kahve", emoji: "☕" },
  { kod: "kalp", ad: "Kalp", emoji: "💙" },
  { kod: "alkis", ad: "Alkış", emoji: "👏" },
  { kod: "yildiz", ad: "Yıldız", emoji: "⭐" },
  { kod: "kulaklik", ad: "Kulaklık", emoji: "🎧" },
  { kod: "cicek", ad: "Çiçek", emoji: "🌷" },
  { kod: "roket", ad: "Roket", emoji: "🚀" },
  { kod: "kupa", ad: "Kupa", emoji: "🏆" },
];
export const hediyeEmoji = (kod: string) => HEDIYELER.find((h) => h.kod === kod)?.emoji ?? "🎁";

/** Oda ızgarası: 6×6 hücre. */
export const ODA_BOYU = 6;
