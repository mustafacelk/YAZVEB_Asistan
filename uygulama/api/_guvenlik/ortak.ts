// ═══════════════════════════════════════════════════════════════════
// Sunucusuz fonksiyonlar için ortak güvenlik katmanı
// ═══════════════════════════════════════════════════════════════════
// Köken izin listesi, girdi doğrulama, kimlik + kota denetimi ve güvenlik
// olayı günlüğü. Saf parçalar (dogrula*, kokenIzinli) ağa dokunmaz ve
// testler/api_guvenlik.test.mts ile sınanır.
// ═══════════════════════════════════════════════════════════════════

export const SES_SINIR = {
  govdeBayt: 8_000,
  hamMetin: 1_500,       // işlenmeden önce: regex'ler dev metinle yorulmasın
  hazirMetin: 1_200,     // okunuş düzenlemelerinden sonra
} as const;

export const VARSAYILAN_KOKENLER = [
  "https://yazveb-asistan.vercel.app",
  "https://localhost",
  "capacitor://localhost",
  "http://localhost:5173",
];

export function izinliKokenler(ortam = process.env.IZINLI_KOKENLER): string[] {
  const liste = (ortam ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  return liste.length ? liste : VARSAYILAN_KOKENLER;
}

export function kokenIzinli(koken: string | undefined, izinli: string[]): boolean {
  return !!koken && izinli.includes(koken);
}

export type SesIstegi = { metin: string; ses?: string };

export function sesIstegiDogrula(
  govde: unknown,
  sesler: readonly string[],
): { tamam: true; deger: SesIstegi } | { tamam: false; neden: string } {
  if (typeof govde !== "object" || govde === null || Array.isArray(govde)) {
    return { tamam: false, neden: "gövde nesne değil" };
  }
  const g = govde as Record<string, unknown>;
  if (typeof g.metin !== "string") return { tamam: false, neden: "metin yok" };
  if (g.metin.length > SES_SINIR.hamMetin) return { tamam: false, neden: "metin çok uzun" };
  if (!g.metin.trim()) return { tamam: false, neden: "metin boş" };
  if (g.ses !== undefined && (typeof g.ses !== "string" || !sesler.includes(g.ses))) {
    return { tamam: false, neden: "bilinmeyen ses" };
  }
  return { tamam: true, deger: { metin: g.metin, ses: g.ses as string | undefined } };
}

/** JWT biçimi: üç base64url parça. Publishable anahtar bu biçimde değil. */
export function jwtBicimli(jeton: string): boolean {
  return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(jeton);
}

export type KotaSonucu = "tamam" | "sinir" | "kimliksiz" | "hata";

/**
 * Kimlik + kota tek çağrıda: kullanıcının jetonuyla `kota_harca`.
 * PostgREST jetonun imzasını doğrular; auth.uid() taklit edilemez.
 */
export async function kotaHarca(
  tur: "ses" | "asistan",
  jeton: string,
  supabaseUrl: string,
  apikey: string,
  zamanAsimiMs = 5000,
): Promise<KotaSonucu> {
  if (!supabaseUrl || !apikey) return "hata";
  try {
    const y = await fetch(`${supabaseUrl}/rest/v1/rpc/kota_harca`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jeton}`,
        apikey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_tur: tur }),
      signal: AbortSignal.timeout(zamanAsimiMs),
    });
    if (y.status === 401 || y.status === 403) return "kimliksiz";
    if (!y.ok) return "hata";
    const sonuc = await y.json();
    return sonuc === "tamam" || sonuc === "sinir" || sonuc === "kimliksiz" ? sonuc : "hata";
  } catch {
    return "hata";
  }
}

/** Yapılandırılmış güvenlik olayı. Jeton, metin, IP yazılmaz. */
export function olay(tur: string, ayrinti: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ olay: tur, zaman: new Date().toISOString(), ...ayrinti }));
}
