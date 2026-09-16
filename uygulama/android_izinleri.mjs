/**
 * Android izinleri — `npx cap add/sync android` SONRASINDA çalıştırılır.
 *
 *   node android_izinleri.mjs
 *
 * Native proje depoda tutulmuyor, CI her derlemede yeniden üretiyor. Üretilen
 * AndroidManifest.xml kamera izni içermez; o hâlde WebView'deki QR tarayıcı
 * kamerayı hiç açamaz ve kullanıcı yalnızca kısa kod girebilir.
 *
 * Eklenenler:
 *   CAMERA                 QR tarama (yalnızca kullanıcı tarayıcıyı açtığında istenir)
 *   ACCESS_FINE_LOCATION   yalnızca konum şartlı görevlerde, sunucu isterse
 *   camera donanımı        "zorunlu değil": kamerasız cihazlara da kurulabilsin
 *
 * Betik idempotent: izin zaten varsa bir daha eklemez.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const yol = new URL("./android/app/src/main/AndroidManifest.xml", import.meta.url);
if (!existsSync(yol)) {
  console.error("AndroidManifest.xml yok. Önce: npx cap add android");
  process.exit(1);
}

let xml = readFileSync(yol, "utf8");
const eklenecek = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
];

let degisti = 0;
for (const satir of eklenecek) {
  const ad = satir.match(/android:name="([^"]+)"/)[1];
  if (xml.includes(`"${ad}"`)) continue;
  xml = xml.replace("</manifest>", `    ${satir}\n</manifest>`);
  degisti++;
}

if (degisti) writeFileSync(yol, xml);
console.log(degisti ? `${degisti} izin eklendi.` : "İzinler zaten tanımlı.");
