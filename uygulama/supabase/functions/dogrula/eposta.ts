// ═══════════════════════════════════════════════════════════════════
// Doğrulama e-postası — saf fonksiyonlar (Deno'ya bağlı değil, testli)
// ═══════════════════════════════════════════════════════════════════
// İki sağlayıcı desteklenir; hangisi kullanılacağı EPOSTA_SAGLAYICI ile
// seçilir. İkisinin de ücretsiz katmanı bir topluluk için yeter:
//   brevo   alan adı gerekmez: tek bir gönderen adresini (ör. kulübün
//           Gmail'i) doğrulamak yeter. Günde 300 e-posta.
//   resend  kendi alan adı ister (DNS kaydı). Ayda 3.000 e-posta.
// ═══════════════════════════════════════════════════════════════════

export type Saglayici = "brevo" | "resend";

export type Gonderen = { ad: string; eposta: string };

/** "YAZVEB <yazveb@ornek.com>" ya da yalnızca adres. */
export function gonderenCoz(metin: string): Gonderen | null {
  const t = metin.trim();
  const m = t.match(/^(.{1,60}?)\s*<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>$/);
  if (m) return { ad: m[1].replace(/^"|"$/g, "").trim() || "YAZVEB", eposta: m[2] };
  if (/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(t)) return { ad: "YAZVEB", eposta: t };
  return null;
}

/** Veritabanıyla aynı kural: küçük harf, boşluksuz, .edu.tr ya da bilinen alan. */
export function epostaNormal(metin: unknown): string | null {
  if (typeof metin !== "string") return null;
  const e = metin.trim().toLowerCase();
  if (e.length > 254 || !/^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(e)) return null;
  return e;
}

const kacis = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type Ileti = { konu: string; metin: string; html: string };

/**
 * E-postanın içeriği. Kod yalnızca gövdede (konu satırı bildirimlerde
 * kilit ekranında görünür). Üniversite adı veritabanından gelir ama yine de
 * HTML'e kaçışla girer: yönetici panelinden yazılan bir ad betik taşıyamaz.
 */
export function iletiOlustur(kod: string, dakika: number, universite: string): Ileti {
  if (!/^[0-9]{6}$/.test(kod)) throw new Error("kod biçimi");
  const uni = universite.slice(0, 80);
  const konu = "YAZVEB öğrenci doğrulama kodun";
  const metin = [
    "Merhaba,",
    "",
    `YAZVEB'de öğrenciliğini doğrulamak için kodun: ${kod}`,
    "",
    `Kod ${dakika} dakika geçerli. ${uni} öğrencisi olarak doğrulanacaksın.`,
    "",
    "Bu isteği sen yapmadıysan bu e-postayı yok say: kod girilmedikçe hiçbir şey değişmez,",
    "hesabına kimse erişemez. E-posta adresin YAZVEB'de saklanmaz.",
    "",
    "YAZVEB — Selçuk Üniversitesi Yapay Zekâ ve Veri Bilimi Topluluğu",
  ].join("\n");
  const html = `<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#0f1216;font-family:Arial,Helvetica,sans-serif;color:#e8eaed">
<div style="max-width:440px;margin:0 auto;background:#171b21;border:1px solid #2a3038;border-radius:14px;padding:28px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;color:#8ccfe2">YAZVEB</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#ffffff">Öğrenci doğrulama kodun</h1>
<p style="margin:0 0 20px;line-height:1.5">YAZVEB'de öğrenciliğini doğrulamak için bu kodu uygulamaya yaz:</p>
<p style="margin:0 0 20px;font-size:34px;font-weight:bold;letter-spacing:10px;color:#ffffff;text-align:center;background:#0f1216;border-radius:10px;padding:14px 0">${kod}</p>
<p style="margin:0 0 8px;line-height:1.5;color:#b7bcc4">Kod ${dakika} dakika geçerli. ${kacis(uni)} öğrencisi olarak doğrulanacaksın.</p>
<p style="margin:0;line-height:1.5;color:#8a9099;font-size:13px">Bu isteği sen yapmadıysan bu e-postayı yok say: kod girilmedikçe hiçbir şey değişmez. E-posta adresin YAZVEB'de saklanmaz.</p>
</div></body></html>`;
  return { konu, metin, html };
}

export type IstekTarifi = { adres: string; basliklar: Record<string, string>; govde: string };

/** Sağlayıcıya gidecek HTTP isteği (fetch'i çağıran taraf yapar). */
export function saglayiciIstegi(s: Saglayici, anahtar: string, gonderen: Gonderen, alici: string, ileti: Ileti): IstekTarifi {
  if (s === "brevo") {
    return {
      adres: "https://api.brevo.com/v3/smtp/email",
      basliklar: { "api-key": anahtar, "Content-Type": "application/json", Accept: "application/json" },
      govde: JSON.stringify({
        sender: { name: gonderen.ad, email: gonderen.eposta },
        to: [{ email: alici }],
        subject: ileti.konu,
        textContent: ileti.metin,
        htmlContent: ileti.html,
      }),
    };
  }
  return {
    adres: "https://api.resend.com/emails",
    basliklar: { Authorization: `Bearer ${anahtar}`, "Content-Type": "application/json" },
    govde: JSON.stringify({
      from: `${gonderen.ad} <${gonderen.eposta}>`,
      to: [alici],
      subject: ileti.konu,
      text: ileti.metin,
      html: ileti.html,
    }),
  };
}

/** Veritabanının döndüğü durumlar istemciye aynen iletilir; kod ASLA. */
export const ISTEMCI_DURUMLARI = ["tamam", "gecersiz", "bekle", "sinir", "genel_sinir", "kullanimda", "zaten"] as const;
export type IstemciDurumu = (typeof ISTEMCI_DURUMLARI)[number];

export function istemciYaniti(db: unknown): Record<string, unknown> {
  const d = (db && typeof db === "object" ? db : {}) as Record<string, unknown>;
  const durum = ISTEMCI_DURUMLARI.includes(d.durum as IstemciDurumu) ? (d.durum as IstemciDurumu) : "hata";
  const y: Record<string, unknown> = { durum };
  if (durum === "bekle" && typeof d.saniye === "number") y.saniye = d.saniye;
  if (durum === "tamam") {
    if (typeof d.dakika === "number") y.dakika = d.dakika;
    if (typeof d.universite === "string") y.universite = d.universite;
    if (d.tur === "ogrenci" || d.tur === "kurum") y.tur = d.tur;
  }
  return y;
}
