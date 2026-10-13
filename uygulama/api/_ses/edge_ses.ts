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
import type { IncomingMessage } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { gecImzasi, GUVENILIR_JETON } from "./gec_imza.js";

const TEMEL = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const KROM_SURUMU = "143.0.3650.75";
// 2026-10: sürüm etiketi "1-" ile başlayan eski imza 403 alıyor; v2 imza
// ve "2-" etiketi gerekiyor (bkz. gec_imza.ts).
const IMZA_SURUMU = `2-${KROM_SURUMU}`;

// 1.200 karakterlik metin ~90 saniyelik sestir, ~600 KB. Karşı taraf ne
// gönderirse göndersin bellekte bundan fazlası biriktirilmez.
const EN_FAZLA_SES_BAYT = 4 * 1024 * 1024;

// Servis bu başlıkları bekliyor; Edge tarayıcısının gönderdiklerinin aynısı.
const BASLIKLAR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  Pragma: "no-cache",
  "Cache-Control": "no-cache",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br, zstd",
};

/** Sunucuyla saat farkı (saniye). 403'te sunucunun Date başlığından düzeltilir. */
let saatFarki = 0;

/** Edge her bağlantıda rastgele bir MUID çerezi gönderiyor; servis bunu da bekliyor. */
const muid = () => randomBytes(16).toString("hex").toUpperCase();

export type SesAyari = {
  ses: string;      // ör. "tr-TR-AhmetNeural"
  hiz: string;      // ör. "+3%"
  perde: string;    // ör. "-2Hz"
  seviye: string;   // ör. "+0%"
};

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
export async function seslendir(
  metin: string,
  ayar: SesAyari,
  zamanAsimiMs = 20000,
): Promise<Buffer> {
  const bitis = Date.now() + zamanAsimiMs;
  try {
    return await birKez(metin, ayar, zamanAsimiMs);
  } catch (h) {
    // Saat farkı yüzünden imza reddedildiyse (403) düzeltilmiş saatle bir kez daha.
    if (!(h instanceof SaatHatasi)) throw h;
    const kalan = bitis - Date.now();
    if (kalan < 1500) throw h;
    return birKez(metin, ayar, kalan);
  }
}

class SaatHatasi extends Error {}

function birKez(metin: string, ayar: SesAyari, zamanAsimiMs: number): Promise<Buffer> {
  return new Promise((coz, red) => {
    const adres =
      `wss://${TEMEL}/edge/v1?TrustedClientToken=${GUVENILIR_JETON}` +
      `&ConnectionId=${kimlik()}` +
      `&Sec-MS-GEC=${gecImzasi(Date.now() / 1000 + saatFarki)}` +
      `&Sec-MS-GEC-Version=${IMZA_SURUMU}`;

    const ws = new WebSocket(adres, { headers: { ...BASLIKLAR, Cookie: `muid=${muid()};` } });
    const parcalar: Uint8Array[] = [];
    let toplamBayt = 0;
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
      if (veri.length < 2) return;
      if (!ikili) {
        if (veri.toString().includes("Path:turn.end")) kapat();
        return;
      }
      const baslikBoyu = (veri[0] << 8) | veri[1];
      const baslik = veri.subarray(2, 2 + baslikBoyu).toString();
      if (baslik.includes("Path:audio")) {
        const govde = veri.subarray(2 + baslikBoyu);
        toplamBayt += govde.length;
        if (toplamBayt > EN_FAZLA_SES_BAYT) {
          kapat(new Error("ses verisi sınırı aşıldı"));
          return;
        }
        if (govde.length) parcalar.push(govde);
      }
    });

    // 403: imza reddedildi. Sunucunun saatini öğren; fark büyükse bir kez daha dene.
    ws.on("unexpected-response", (_istek: unknown, yanit: IncomingMessage) => {
      const kod = yanit.statusCode ?? 0;
      const sunucu = Date.parse(String(yanit.headers.date ?? ""));
      if (kod === 403 && Number.isFinite(sunucu)) {
        const fark = sunucu / 1000 - Date.now() / 1000;
        if (Math.abs(fark - saatFarki) > 60) {
          saatFarki = fark;
          return kapat(new SaatHatasi("seslendirme imzası reddedildi (saat farkı düzeltildi)"));
        }
      }
      kapat(new Error(`seslendirme bağlantısı kurulamadı: sunucu ${kod}`));
    });

    ws.on("error", (h: Error) =>
      kapat(new Error("seslendirme bağlantısı kurulamadı: " + h.message)));

    // Sunucu turn.end göndermeden kapatmış olabilir; elimizde ses varsa onu
    // kullan, yoksa hata ver.
    ws.on("close", () => { if (!bitti) kapat(); });
  });
}
