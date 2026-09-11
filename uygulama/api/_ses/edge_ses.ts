// ═══════════════════════════════════════════════════════════════════
// Microsoft Edge okuma servisi — Node istemcisi
// ═══════════════════════════════════════════════════════════════════
//
// NEDEN VERCEL'DE, SUPABASE'DE DEĞİL
// ───────────────────────────────────
// Bu protokol WebSocket ister. Supabase'in kenar çalışma ortamı ham soket
// açtırmıyor: fonksiyon oraya konduğunda bağlantı bir saniye içinde
// reddediliyor ve ses hiç gelmiyordu. Tarayıcıdan doğrudan bağlanmak da
// çalışmıyor — servis kendi Origin başlığını bekliyor, sitenin Origin'ini
// reddediyor.
//
// Vercel'in Node ortamı ikisini de çözüyor: ham soket açabiliyor ve istediği
// başlığı gönderebiliyor. Site zaten Vercel'de olduğu için ek bir hesap veya
// servis gerekmiyor.
//
// Servis ücretsizdir ve API anahtarı istemez; yalnızca Edge'in kullandığı
// istemci jetonunu ve zaman damgasından türetilen bir imzayı bekler.
//
// PROTOKOL
//   1. WebSocket açılır (imza sorgu dizesinde gider).
//   2. "speech.config": çıktı biçimi bildirilir.
//   3. "ssml": metin ve ses ayarları.
//   4. İkili mesajlar: [2 bayt başlık uzunluğu][başlık][ses verisi].
//      Path:audio olanların gövdesi MP3 parçasıdır.
//   5. "Path:turn.end" bitişi bildirir.
// ═══════════════════════════════════════════════════════════════════

import WebSocket from "ws";
import { createHash, randomUUID } from "node:crypto";

const GUVENILIR_JETON = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const TEMEL = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const KROM_SURUMU = "143.0.3650.75";
const WIN_EPOCH = 11644473600;

// Servis bu başlıkları bekliyor; Edge tarayıcısının gönderdiklerinin aynısı.
const BASLIKLAR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  Pragma: "no-cache",
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
 * dakika geçerli kalır; sunucuyla saat farkı olsa bile çalışır.
 */
function imzaUret(): string {
  let tik = Date.now() / 1000 + WIN_EPOCH;
  tik -= tik % 300;
  tik *= 1e9 / 100;                     // 100 nanosaniyelik aralıklara
  return createHash("sha256")
    .update(`${tik.toFixed(0)}${GUVENILIR_JETON}`)
    .digest("hex")
    .toUpperCase();
}

const kimlik = () => randomUUID().replace(/-/g, "");

function tarihMetni(): string {
  return new Date().toUTCString();
}

function xmlKacir(metin: string): string {
  return metin
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Metni seslendirir ve MP3 baytlarını döndürür.
 *
 * Zaman aşımı bilerek var: bağlantı açık kalıp hiç veri gelmezse istek
 * sonsuza kadar bekler ve kullanıcı boş ekrana bakar.
 */
export function seslendir(
  metin: string,
  ayar: SesAyari,
  zamanAsimiMs = 20000,
): Promise<Buffer> {
  return new Promise((coz, red) => {
    const adres =
      `wss://${TEMEL}/edge/v1?TrustedClientToken=${GUVENILIR_JETON}` +
      `&ConnectionId=${kimlik()}` +
      `&Sec-MS-GEC=${imzaUret()}` +
      `&Sec-MS-GEC-Version=1-${KROM_SURUMU}`;

    const ws = new WebSocket(adres, { headers: BASLIKLAR });
    const parcalar: Uint8Array[] = [];
    let bitti = false;

    const saat = setTimeout(() => {
      if (bitti) return;
      bitti = true;
      try { ws.terminate(); } catch { /* zaten kapalı */ }
      red(new Error("seslendirme zaman aşımı"));
    }, zamanAsimiMs);

    const kapat = (hata?: Error) => {
      if (bitti) return;
      bitti = true;
      clearTimeout(saat);
      try { ws.close(); } catch { /* önemsiz */ }
      if (hata) return red(hata);
      if (!parcalar.length) return red(new Error("ses verisi gelmedi"));
      coz(Buffer.concat(parcalar));
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

    ws.on("message", (veri: Buffer, ikili: boolean) => {
      if (!ikili) {
        if (veri.toString().includes("Path:turn.end")) kapat();
        return;
      }
      const baslikBoyu = (veri[0] << 8) | veri[1];
      const baslik = veri.subarray(2, 2 + baslikBoyu).toString();
      if (baslik.includes("Path:audio")) {
        const govde = veri.subarray(2 + baslikBoyu);
        if (govde.length) parcalar.push(govde);
      }
    });

    ws.on("error", (h: Error) =>
      kapat(new Error("seslendirme bağlantısı kurulamadı: " + h.message)));

    // Sunucu turn.end göndermeden kapatmış olabilir; elimizde ses varsa onu
    // kullan, yoksa hata ver.
    ws.on("close", () => { if (!bitti) kapat(); });
  });
}
