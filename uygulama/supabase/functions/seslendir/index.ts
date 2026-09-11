// ═══════════════════════════════════════════════════════════════════
// Seslendirme — Supabase Edge Function
// ═══════════════════════════════════════════════════════════════════
// Metni alır, MP3 döndürür. Ses Microsoft'un neural Türkçe seslerinden
// gelir (bkz. edge_ses.ts); anahtar gerekmez, ücretsizdir.
//
// Yalnızca giriş yapmış üyeler çağırabilir — Supabase JWT'yi kendisi
// doğrular.
// ═══════════════════════════════════════════════════════════════════

import { seslendir, type SesAyari } from "./edge_ses.ts";
import { seseHazirla } from "./metin.ts";

// Her sesin kendi temposu var. Tek bir global hız verilince Ahmet aceleci,
// Emel uyuşuk çıkıyor; profil sesin kendi tabanına göre ayarlanır.
const SESLER: Record<string, SesAyari> = {
  ahmet: { ses: "tr-TR-AhmetNeural", hiz: "+3%", perde: "-2Hz", seviye: "+0%" },
  emel: { ses: "tr-TR-EmelNeural", hiz: "+2%", perde: "-1Hz", seviye: "+0%" },
};
const VARSAYILAN = "ahmet";

const EN_UZUN_METIN = 1200;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (istek) => {
  if (istek.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (istek.method !== "POST") {
    return new Response(JSON.stringify({ hata: "yalnızca POST" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let metin = "";
  let sesAdi = VARSAYILAN;
  try {
    const govde = await istek.json();
    metin = String(govde?.metin ?? "");
    if (typeof govde?.ses === "string" && SESLER[govde.ses]) sesAdi = govde.ses;
  } catch {
    return new Response(JSON.stringify({ hata: "bozuk istek" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const hazir = seseHazirla(metin).slice(0, EN_UZUN_METIN);
  if (!hazir) {
    return new Response(JSON.stringify({ hata: "boş metin" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const ses = await seslendir(hazir, SESLER[sesAdi]);
    return new Response(ses, {
      headers: {
        ...CORS,
        "Content-Type": "audio/mpeg",
        // Aynı cevap iki kez seslendirilmesin diye tarayıcı önbelleğine bırak.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (hata) {
    console.error("[seslendir]", String(hata).slice(0, 200));
    // Ses gelmezse uygulama susar ama çökmez; metin zaten ekranda.
    return new Response(JSON.stringify({ hata: "seslendirilemedi" }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
