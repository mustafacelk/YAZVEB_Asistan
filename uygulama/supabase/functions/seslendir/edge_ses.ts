// ═══════════════════════════════════════════════════════════════════
// Microsoft Edge okuma servisi — Deno istemcisi
// ═══════════════════════════════════════════════════════════════════
//
// NEDEN
// ─────
// Tarayıcının kendi `speechSynthesis` motoru cihazın sistem sesini kullanır:
// Türkçe tonlama düz, vurgular yanlış, "YAZVEB" gibi kısaltmalar harf harf
// okunuyor. Buradaki neural sesler (tr-TR-AhmetNeural, EmelNeural) doğal
// nefes aralıkları ve tonlama üretir — Streamlit sürümündeki ses budur.
//
// Servis ücretsizdir ve anahtar istemez; yalnızca Edge'in kullandığı istemci
// jetonunu ve zaman damgasından türetilen bir imzayı bekler.
//
// PROTOKOL
// ────────
//   1. WebSocket açılır (imza sorgu dizesinde gider).
//   2. "speech.config" mesajı: çıktı biçimi bildirilir.
//   3. "ssml" mesajı: metin ve ses ayarları.
//   4. İkili mesajlar gelir: [2 bayt başlık uzunluğu][başlık][ses verisi].
//      Path:audio olanların gövdesi MP3 parçasıdır.
//   5. "Path:turn.end" metin mesajı bitişi bildirir.
//
// NEDEN npm:ws
// ────────────
// Deno'nun yerleşik WebSocket'i bu sunucuyla el sıkışamıyor ("unspecific
// protocol error" — HTTP/2 pazarlığı) ve özel başlık göndermeye de izin
// vermiyor. Servis ise Edge'in User-Agent ve Origin başlıklarını bekliyor.
// npm:ws ikisini birden çözüyor: HTTP/1.1 zorlar ve başlık kabul eder.
// ═══════════════════════════════════════════════════════════════════

import WebSocket from "npm:ws@8";

const GUVENILIR_JETON = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const TEMEL = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const KROM_SURUMU = "143.0.3650.75";
const WIN_EPOCH = 11644473600;

// Servis bu başlıkları bekliyor; Edge tarayıcısının gönderdiklerinin aynısı.
const BASLIKLAR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
  "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "Pragma": "no-cache",
  "Cache-Control": "no-cache",
  "Accept-Language": "en-US,en;q=0.9",
};

export type SesAyari = {
  ses: string;      // ör. "tr-TR-AhmetNeural"
  hiz: string;      // ör. "+3%"
  perde: string;    // ör. "-2Hz"
  seviye: string;   // ör. "+0%"
};

/**
 * Sec-MS-GEC imzası.
 *
 * Zaman damgası Windows dosya zamanına çevrilir, 5 dakikaya yuvarlanır ve
 * istemci jetonuyla birlikte SHA-256'lanır. Yuvarlama sayesinde imza beş
 * dakika boyunca geçerli kalır; sunucu ile saat farkı olsa bile çalışır.
 */
async function imzaUret(): Promise<string> {
  let tik = Date.now() / 1000 + WIN_EPOCH;
  tik -= tik % 300;
  tik *= 1e9 / 100;                       // 100 nanosaniyelik aralıklara
  const metin = `${tik.toFixed(0)}${GUVENILIR_JETON}`;
  const ozet = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(metin));
  return [...new Uint8Array(ozet)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function kimlik(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function tarihMetni(): string {
  // Edge'in beklediği JavaScript tarzı tarih dizesi.
  return new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
}

function xmlKacir(metin: string): string {
  return metin
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** İkili çerçeveyi başlık ve gövdeye ayırır. */
function cerceveyiAyir(veri: Uint8Array): { yol: string; govde: Uint8Array } {
  const baslikBoyu = (veri[0] << 8) | veri[1];
  const baslik = new TextDecoder().decode(veri.subarray(2, 2 + baslikBoyu));
  const yol = baslik.match(/Path:([^\r\n]+)/)?.[1]?.trim() ?? "";
  return { yol, govde: veri.subarray(2 + baslikBoyu) };
}

/**
 * Metni seslendirir ve MP3 baytlarını döndürür.
 *
 * Zaman aşımı bilerek var: WebSocket açık kalıp hiç veri gelmezse fonksiyon
 * sonsuza kadar bekler ve kullanıcı boş ekrana bakar.
 */
export function seslendir(
  metin: string,
  ayar: SesAyari,
  zamanAsimiMs = 20000,
): Promise<Uint8Array> {
  return new Promise((coz, red) => {
    imzaUret().then((imza) => {
      const adres =
        `wss://${TEMEL}/edge/v1?TrustedClientToken=${GUVENILIR_JETON}` +
        `&ConnectionId=${kimlik()}` +
        `&Sec-MS-GEC=${imza}` +
        `&Sec-MS-GEC-Version=1-${KROM_SURUMU}`;

      const ws = new WebSocket(adres, { headers: BASLIKLAR });

      const parcalar: Uint8Array[] = [];
      let bitti = false;

      const saat = setTimeout(() => {
        if (bitti) return;
        bitti = true;
        try { ws.close(); } catch { /* zaten kapalı olabilir */ }
        red(new Error("seslendirme zaman aşımı"));
      }, zamanAsimiMs);

      const kapat = (hata?: Error) => {
        if (bitti) return;
        bitti = true;
        clearTimeout(saat);
        try { ws.close(); } catch { /* önemsiz */ }
        if (hata) return red(hata);
        if (!parcalar.length) return red(new Error("ses verisi gelmedi"));
        const toplam = parcalar.reduce((t, p) => t + p.length, 0);
        const cikti = new Uint8Array(toplam);
        let i = 0;
        for (const p of parcalar) { cikti.set(p, i); i += p.length; }
        coz(cikti);
      };

      ws.on("open", () => {
        ws.send(
          `X-Timestamp:${tarihMetni()}\r\n` +
          "Content-Type:application/json; charset=utf-8\r\n" +
          "Path:speech.config\r\n\r\n" +
          '{"context":{"synthesis":{"audio":{"metadataoptions":{' +
          '"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},' +
          '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n',
        );

        const ssml =
          "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='tr-TR'>" +
          `<voice name='${ayar.ses}'>` +
          `<prosody pitch='${ayar.perde}' rate='${ayar.hiz}' volume='${ayar.seviye}'>` +
          xmlKacir(metin) +
          "</prosody></voice></speak>";

        ws.send(
          `X-RequestId:${kimlik()}\r\n` +
          "Content-Type:application/ssml+xml\r\n" +
          // Sondaki Z bir Edge tuhaflığı; kaldırılırsa servis reddediyor.
          `X-Timestamp:${tarihMetni()}Z\r\n` +
          "Path:ssml\r\n\r\n" +
          ssml,
        );
      });

      ws.on("message", (veri: ArrayBufferLike, ikili: boolean) => {
        if (!ikili) {
          if (String(veri).includes("Path:turn.end")) kapat();
          return;
        }
        const { yol, govde } = cerceveyiAyir(new Uint8Array(veri as ArrayBuffer));
        if (yol === "audio" && govde.length) parcalar.push(govde);
      });

      ws.on("error", (h: Error) =>
        kapat(new Error("seslendirme bağlantısı kurulamadı: " + h.message)));

      // Sunucu turn.end göndermeden kapatmış olabilir; elimizde ses varsa
      // onu kullan, yoksa hata ver.
      ws.on("close", () => { if (!bitti) kapat(); });
    }).catch(red);
  });
}
