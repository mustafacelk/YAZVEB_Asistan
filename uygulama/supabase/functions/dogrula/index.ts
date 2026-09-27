// ═══════════════════════════════════════════════════════════════════
// Öğrenci doğrulama kodu — Supabase Edge Function
// ═══════════════════════════════════════════════════════════════════
//
// Üye üniversite e-postasını yollar; bu fonksiyon:
//   1. Kim olduğunu KULLANICININ jetonundan öğrenir (/auth/v1/user).
//   2. Kodu veritabanından sunucu anahtarıyla ister (kimlik_kod_olustur
//      yalnızca sunucu rolüne açık). Hız sınırları orada.
//   3. Kodu e-postaya yazar. Kod istemciye ASLA dönmez.
// Kodu bilmek = o posta kutusuna erişmek = o üniversitenin üyesi olmak.
//
// Gizli değişkenler (npx supabase secrets set ...):
//   EPOSTA_SAGLAYICI   brevo | resend
//   EPOSTA_ANAHTARI    sağlayıcının API anahtarı
//   EPOSTA_GONDEREN    "YAZVEB <yazveb.toplulugu@gmail.com>" (sağlayıcıda doğrulanmış)
// SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY Supabase'de hazır gelir.
// ═══════════════════════════════════════════════════════════════════

import { kokenIzinli, VARSAYILAN_KOKENLER } from "../asistan/guvenlik.ts";
import {
  epostaNormal,
  gonderenCoz,
  iletiOlustur,
  istemciYaniti,
  saglayiciIstegi,
  type Saglayici,
} from "./eposta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUNUCU_ANAHTARI = Deno.env.get("YAZVEB_SUNUCU_ANAHTARI") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SAGLAYICI = (Deno.env.get("EPOSTA_SAGLAYICI") ?? "").trim().toLowerCase();
const EPOSTA_ANAHTARI = Deno.env.get("EPOSTA_ANAHTARI") ?? "";
const GONDEREN = gonderenCoz(Deno.env.get("EPOSTA_GONDEREN") ?? "");
const KOKENLER = (Deno.env.get("IZINLI_KOKENLER") ?? "").split(",").map((k) => k.trim()).filter(Boolean);
const IZINLI = KOKENLER.length ? KOKENLER : VARSAYILAN_KOKENLER;
const ZAMAN_ASIMI_MS = 8000;
const GOVDE_SINIRI = 1024;

function cors(koken: string | null): Record<string, string> {
  const b: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (koken && kokenIzinli(koken, IZINLI)) b["Access-Control-Allow-Origin"] = koken;
  return b;
}

function yanit(govde: unknown, durum: number, koken: string | null) {
  return new Response(JSON.stringify(govde), {
    status: durum,
    headers: { ...cors(koken), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Günlüğe e-posta, kod, jeton YAZILMAZ; yalnızca olayın türü. */
function olay(tur: string, ayrinti: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ olay: tur, zaman: new Date().toISOString(), ...ayrinti }));
}

const sureli = (adres: string, secenek: RequestInit) =>
  fetch(adres, { ...secenek, signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) });

/** Sunucu anahtarı: eski biçim JWT ise Authorization'a da konur; yeni biçim (sb_secret_) yalnızca apikey. */
function sunucuBasliklari(): Record<string, string> {
  const b: Record<string, string> = { apikey: SUNUCU_ANAHTARI, "Content-Type": "application/json" };
  if (SUNUCU_ANAHTARI.startsWith("eyJ")) b.Authorization = `Bearer ${SUNUCU_ANAHTARI}`;
  return b;
}

Deno.serve(async (istek) => {
  const koken = istek.headers.get("origin");
  if (istek.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(koken) });
  if (istek.method !== "POST") return yanit({ durum: "hata" }, 405, koken);
  if (koken && !kokenIzinli(koken, IZINLI)) {
    olay("koken_red");
    return yanit({ durum: "hata" }, 403, koken);
  }

  if (!SUPABASE_URL || !SUNUCU_ANAHTARI || !GONDEREN || !EPOSTA_ANAHTARI
      || (SAGLAYICI !== "brevo" && SAGLAYICI !== "resend")) {
    olay("yapilandirma_eksik");
    return yanit({ durum: "yapilandirilmamis" }, 503, koken);
  }

  const baslik = istek.headers.get("authorization") ?? "";
  const jeton = baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : "";
  const apikey = istek.headers.get("apikey") ?? "";
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(jeton) || !apikey) return yanit({ durum: "kimliksiz" }, 401, koken);

  // Gövde küçük: yalnızca e-posta.
  const ham = await istek.text().catch(() => "");
  if (ham.length > GOVDE_SINIRI) return yanit({ durum: "gecersiz" }, 413, koken);
  let eposta: string | null = null;
  try { eposta = epostaNormal(JSON.parse(ham)?.eposta); } catch { eposta = null; }
  if (!eposta) return yanit({ durum: "gecersiz" }, 400, koken);

  // 1. Kim?
  let kullanici = "";
  try {
    const y = await sureli(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${jeton}`, apikey } });
    if (!y.ok) return yanit({ durum: "kimliksiz" }, 401, koken);
    kullanici = String((await y.json())?.id ?? "");
  } catch {
    return yanit({ durum: "hata" }, 502, koken);
  }
  if (!/^[0-9a-f-]{36}$/.test(kullanici)) return yanit({ durum: "kimliksiz" }, 401, koken);

  // 2. Kod (sınırlar veritabanında).
  let db: Record<string, unknown>;
  try {
    const y = await sureli(`${SUPABASE_URL}/rest/v1/rpc/kimlik_kod_olustur`, {
      method: "POST",
      headers: sunucuBasliklari(),
      body: JSON.stringify({ p_kullanici: kullanici, p_eposta: eposta }),
    });
    if (!y.ok) {
      olay("kod_uretilemedi", { http: y.status });
      return yanit({ durum: "hata" }, 502, koken);
    }
    db = await y.json();
  } catch {
    return yanit({ durum: "hata" }, 502, koken);
  }
  if (db?.durum !== "tamam") return yanit(istemciYaniti(db), 200, koken);

  // 3. E-posta.
  try {
    const ileti = iletiOlustur(String(db.kod), Number(db.dakika) || 15, String(db.universite ?? "Üniversiten"));
    const t = saglayiciIstegi(SAGLAYICI as Saglayici, EPOSTA_ANAHTARI, GONDEREN, eposta, ileti);
    const y = await sureli(t.adres, { method: "POST", headers: t.basliklar, body: t.govde });
    if (!y.ok) {
      olay("eposta_gonderilemedi", { saglayici: SAGLAYICI, http: y.status });
      return yanit({ durum: "gonderilemedi" }, 502, koken);
    }
  } catch {
    olay("eposta_gonderilemedi", { saglayici: SAGLAYICI });
    return yanit({ durum: "gonderilemedi" }, 502, koken);
  }
  return yanit(istemciYaniti(db), 200, koken);
});
