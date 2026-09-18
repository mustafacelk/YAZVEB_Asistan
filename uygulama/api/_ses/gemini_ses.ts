// ═══════════════════════════════════════════════════════════════════
// Gemini konuşma sentezi — isteğe bağlı, daha doğal ses
// ═══════════════════════════════════════════════════════════════════
//
// NEDEN İSTEĞE BAĞLI
// ──────────────────
// Microsoft'un nöral sesi ücretsiz ve sınırsıza yakın; Gemini'nin sesi daha
// doğal ve tonu doğal dille yönlendirilebiliyor ("samimi, sıcak bir tonla"),
// ama ücretsiz katmanın günlük sınırı projeye göre değişiyor ve önceden
// bilinemiyor. Bu yüzden:
//
//   SES_SAGLAYICI=gemini   ve   GOOGLE_API_KEY   tanımlıysa önce Gemini denenir;
//   kota dolarsa, hata olursa ya da geç kalırsa Microsoft sesine düşülür.
//
// Tanımlı değilse bu dosya hiç çalışmaz; davranış bugünküyle aynıdır.
//
// Ayarlar (Vercel → Settings → Environment Variables, VITE_ ÖNEKİ YOK —
// anahtar tarayıcı paketine girmesin):
//   GOOGLE_API_KEY       Google AI Studio anahtarı
//   SES_SAGLAYICI        "gemini" (yoksa Microsoft)
//   GEMINI_SES           ses adı, varsayılan "Achird" (samimi)
//   GEMINI_SES_MODELI    varsayılan "gemini-3.1-flash-tts-preview"
// ═══════════════════════════════════════════════════════════════════

/**
 * Tonu tarif eden yönerge. Model bunu okumaz, metni bu tonla okur.
 * Asistanın kişiliğiyle aynı: kampüsü bilen, samimi bir üst dönem arkadaşı.
 */
const YONERGE =
  "Aşağıdaki Türkçe metni, üniversite öğrencisiyle konuşan yardımsever bir üst dönem " +
  "arkadaşı gibi samimi, sıcak ve doğal bir tonla seslendir. Acele etme, cümle sonlarında " +
  "doğal nefes al. Yalnızca metni oku:\n\n";

export type GeminiAyari = { anahtar: string; model: string; ses: string };

export function geminiAyari(ortam: Record<string, string | undefined>): GeminiAyari | null {
  if ((ortam.SES_SAGLAYICI ?? "").trim().toLowerCase() !== "gemini") return null;
  const anahtar = (ortam.GOOGLE_API_KEY ?? "").trim();
  if (!anahtar) return null;
  // Ses ve model adı yalnızca harf, rakam, tire: istek adresine girdiği için.
  const guvenli = (d: string | undefined, v: string) => (d && /^[A-Za-z0-9.-]{1,64}$/.test(d) ? d : v);
  return {
    anahtar,
    model: guvenli(ortam.GEMINI_SES_MODELI, "gemini-3.1-flash-tts-preview"),
    ses: guvenli(ortam.GEMINI_SES, "Achird"),
  };
}

/** 16 bit mono PCM'i tarayıcının çalabileceği WAV'a sarar (44 baytlık başlık). */
export function pcmdenWav(pcm: Buffer, ornekleme: number): Buffer {
  const baslik = Buffer.alloc(44);
  baslik.write("RIFF", 0);
  baslik.writeUInt32LE(36 + pcm.length, 4);
  baslik.write("WAVE", 8);
  baslik.write("fmt ", 12);
  baslik.writeUInt32LE(16, 16);            // fmt bölüm boyu
  baslik.writeUInt16LE(1, 20);             // PCM
  baslik.writeUInt16LE(1, 22);             // mono
  baslik.writeUInt32LE(ornekleme, 24);
  baslik.writeUInt32LE(ornekleme * 2, 28); // bayt/sn
  baslik.writeUInt16LE(2, 32);             // blok hizası
  baslik.writeUInt16LE(16, 34);            // bit derinliği
  baslik.write("data", 36);
  baslik.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([baslik, pcm]);
}

// ~90 saniyelik 24 kHz ses ~4,3 MB. Karşı taraf ne gönderirse göndersin
// bundan büyüğü belleğe alınmaz.
const EN_FAZLA_SES_BAYT = 6 * 1024 * 1024;

/**
 * Metni Gemini ile seslendirir. Başarısızlıkta HATA fırlatır; çağıran
 * Microsoft sesine düşer.
 */
export async function geminiSeslendir(
  metin: string,
  ayar: GeminiAyari,
  zamanAsimiMs: number,
): Promise<{ ses: Buffer; tur: string }> {
  const adres =
    `https://generativelanguage.googleapis.com/v1beta/models/${ayar.model}:generateContent`;
  const y = await fetch(adres, {
    method: "POST",
    // Anahtar başlıkta; adreste olsaydı ara sunucu günlüklerine düşebilirdi.
    headers: { "x-goog-api-key": ayar.anahtar, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: YONERGE + metin }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ayar.ses } } },
      },
    }),
    signal: AbortSignal.timeout(zamanAsimiMs),
  });
  if (!y.ok) throw new Error(`gemini HTTP ${y.status}`);

  const govde = (await y.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
  };
  const parca = govde.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!parca?.data) throw new Error("gemini ses verisi yok");
  if (parca.data.length > (EN_FAZLA_SES_BAYT * 4) / 3) throw new Error("gemini ses çok büyük");

  const ham = Buffer.from(parca.data, "base64");
  const tur = (parca.mimeType ?? "").toLowerCase();
  // Varsayılan çıktı ham PCM: "audio/L16;codec=pcm;rate=24000"
  if (tur.startsWith("audio/l16") || tur.includes("pcm") || !tur) {
    const oran = Number(/rate=(\d+)/.exec(tur)?.[1] ?? 24000);
    return { ses: pcmdenWav(ham, oran >= 8000 && oran <= 48000 ? oran : 24000), tur: "audio/wav" };
  }
  if (tur.startsWith("audio/wav") || tur.startsWith("audio/mpeg") || tur.startsWith("audio/mp3")) {
    return { ses: ham, tur: tur.startsWith("audio/wav") ? "audio/wav" : "audio/mpeg" };
  }
  throw new Error(`gemini beklenmeyen ses türü ${tur.slice(0, 40)}`);
}
