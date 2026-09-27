// Notlar ve öğrenci doğrulama — saf mantık:  npm run test:notlar
//
// Sponsorlu kart organik notu itmiyor mu, künye veritabanıyla aynı kuralı
// mı uyguluyor, doğrulama e-postası kodu istemciye sızdırıyor mu?

import {
  akisKur, boyutEtiketi, donemEtiketi, dosyaTuru, kunyeHatasi, puanOzeti, simdikiDonem, sinavMetni, type Kunye,
} from "../src/veri/pano_bicim.ts";
import {
  epostaNormal, gonderenCoz, iletiOlustur, istemciYaniti, saglayiciIstegi,
} from "../supabase/functions/dogrula/eposta.ts";

let hata = 0;
let adet = 0;
function bekle(ad: string, kosul: boolean, ayrinti = "") {
  adet++;
  if (!kosul) hata++;
  console.log(kosul ? "✓" : "✗", ad, kosul ? "" : ayrinti);
}

// ── Akış: sponsorlu kart yerleşimi ─────────────────────────────────
const notlar = Array.from({ length: 12 }, (_, i) => `n${i}`);
const sp = ["altin", "gumus", "bronz", "bronz2", "bronz3"];
const akis = akisKur(notlar, sp);
const turler = akis.map((o) => (o.tur === "not" ? "N" : "S")).join("");
bekle("sponsorlu en fazla her beş kartta bir", turler === "SNNNNSNNNNSNNNN", turler);
bekle("hiçbir organik not kaybolmaz", akis.filter((o) => o.tur === "not").length === notlar.length);
bekle("kademe sırası korunur (sunucudan gelen)",
  akis.filter((o) => o.tur === "sponsorlu").map((o) => (o.tur === "sponsorlu" ? o.sponsorlu : "")).join() === "altin,gumus,bronz");
bekle("not yokken en fazla bir sponsorlu (sayfa reklamdan ibaret olmaz)", akisKur([], sp).length === 1);
bekle("sponsorlu yokken yalnızca notlar", akisKur(["a", "b"], []).every((o) => o.tur === "not"));
for (let n = 0; n <= 40; n++) {
  const a = akisKur(Array.from({ length: n }, (_, i) => i), sp);
  const s = a.filter((o) => o.tur === "sponsorlu").length;
  if (n > 0 && s > Math.ceil(n / 4)) { bekle(`${n} notta sponsorlu oranı`, false, `${s}`); break; }
  if (n === 40) bekle("0-40 not arası: sponsorlu ≤ ⌈not/4⌉ ve ≤ 1/5 oran", true);
}

// ── Künye ──────────────────────────────────────────────────────────
const k: Kunye = {
  baslik: "Vize notları", ders_adi: "Veri Yapıları", ders_kodu: "bm 203", bolum: "Bilgisayar Mühendisliği",
  sinif: "2", tur: "ders_notu", yil: 2026, yariyil: "guz", hoca: "", aciklama: "",
};
bekle("geçerli künye", kunyeHatasi(k) === null);
bekle("kısa başlık", kunyeHatasi({ ...k, baslik: "ab" }) !== null);
bekle("sınıf zorunlu", kunyeHatasi({ ...k, sinif: "" }) !== null);
bekle("ders kodu biçimi (küçük harf büyütülür, geçer)", kunyeHatasi({ ...k, ders_kodu: "bm 203" }) === null);
bekle("ders kodu biçimi (özel karakter reddedilir)", kunyeHatasi({ ...k, ders_kodu: "BM<203>" }) !== null);
bekle("görünmez karakter reddedilir", kunyeHatasi({ ...k, baslik: "Vize" + String.fromCharCode(0x200b) + "notu" }) !== null);
bekle("tek harfli hoca adı reddedilir", kunyeHatasi({ ...k, hoca: "A" }) !== null);

// ── Dönem, dosya, metin ────────────────────────────────────────────
bekle("2026 güz → 2026-27 Güz", donemEtiketi(2026, "guz") === "2026-27 Güz");
bekle("2027 bahar → 2026-27 Bahar", donemEtiketi(2027, "bahar") === "2026-27 Bahar");
bekle("Ekim → güz, aynı yıl", JSON.stringify(simdikiDonem(new Date(2026, 9, 5))) === '{"yil":2026,"yariyil":"guz"}');
bekle("Ocak → önceki yılın güzü", JSON.stringify(simdikiDonem(new Date(2027, 0, 10))) === '{"yil":2026,"yariyil":"guz"}');
bekle("Mart → bahar", simdikiDonem(new Date(2027, 2, 1)).yariyil === "bahar");
bekle("PDF tanınır", dosyaTuru("notlar.PDF", "application/pdf") === "pdf");
bekle("jpeg uzantısı jpg olur", dosyaTuru("foto.jpeg", "image/jpeg") === "jpg");
bekle("uzantı ile tür çelişirse reddedilir", dosyaTuru("virus.pdf", "application/x-msdownload") === null);
bekle("exe reddedilir", dosyaTuru("a.exe", "") === null);
bekle("boyut: 2048 bayt → 2 KB", boyutEtiketi(2048) === "2 KB");
bekle("boyut: 3,5 MB", boyutEtiketi(3.5 * 1048576) === "3,5 MB");
bekle("sınav: 10 gün", sinavMetni({ id: 1, ad: "Vize", baslangic: "", bitis: "", asama: "yaklasiyor", gun: 10 }) === "Vize haftasına 10 gün");
bekle("sınav: sürüyor", sinavMetni({ id: 1, ad: "Final", baslangic: "", bitis: "", asama: "suruyor", gun: 0 }) === "Final haftası sürüyor");
const ayar = { taban_xp: 20, oy_xp: 3, not_tavan: 60, haftalik_tavan: 150, sinav_carpani: 1.5, onay_saat: 48, sinav_oncesi_gun: 14, azami_bayt: 1 };
bekle("puan özeti: sınav öncesi +30", puanOzeti(ayar, true).startsWith("Onaylanınca +30 XP"));
bekle("puan özeti: normal +20", puanOzeti(ayar, false).startsWith("Onaylanınca +20 XP"));

// ── Doğrulama e-postası ────────────────────────────────────────────
bekle("adres normalize (boşluk, büyük harf)", epostaNormal("  Ali@OGR.Selcuk.EDU.TR ") === "ali@ogr.selcuk.edu.tr");
bekle("biçimsiz adres null", epostaNormal("ali @ogr.selcuk.edu.tr") === null && epostaNormal(42) === null);
bekle("gönderen: ad + adres", JSON.stringify(gonderenCoz("YAZVEB <yazveb@ornek.com>")) === '{"ad":"YAZVEB","eposta":"yazveb@ornek.com"}');
bekle("gönderen: yalnızca adres", gonderenCoz("yazveb@ornek.com")?.ad === "YAZVEB");
bekle("gönderen: bozuk → null", gonderenCoz("YAZVEB") === null);
const ileti = iletiOlustur("123456", 15, `<script>alert(1)</script> Üni`);
bekle("kod gövdede", ileti.metin.includes("123456") && ileti.html.includes("123456"));
bekle("kod konu satırında YOK (kilit ekranında görünmesin)", !ileti.konu.includes("123456"));
bekle("üniversite adı HTML'de kaçışlı", !ileti.html.includes("<script>") && ileti.html.includes("&lt;script&gt;"));
let firlatti = false;
try { iletiOlustur("12ab56", 15, "x"); } catch { firlatti = true; }
bekle("biçimsiz kod e-postaya girmez", firlatti);
const g = { ad: "YAZVEB", eposta: "yazveb@ornek.com" };
const brevo = saglayiciIstegi("brevo", "ANAHTAR", g, "ali@ogr.selcuk.edu.tr", ileti);
bekle("brevo: doğru uç ve anahtar başlıkta", brevo.adres === "https://api.brevo.com/v3/smtp/email" && brevo.basliklar["api-key"] === "ANAHTAR");
bekle("brevo: alıcı ve gönderen", JSON.parse(brevo.govde).to[0].email === "ali@ogr.selcuk.edu.tr" && JSON.parse(brevo.govde).sender.email === g.eposta);
const resend = saglayiciIstegi("resend", "re_x", g, "ali@ogr.selcuk.edu.tr", ileti);
bekle("resend: Bearer ve from biçimi", resend.basliklar.Authorization === "Bearer re_x" && JSON.parse(resend.govde).from === "YAZVEB <yazveb@ornek.com>");
bekle("anahtar URL'de değil", !brevo.adres.includes("ANAHTAR") && !resend.adres.includes("re_x"));
const yanit = istemciYaniti({ durum: "tamam", kod: "123456", dakika: 15, universite: "Selçuk Üniversitesi", tur: "ogrenci" });
bekle("istemci yanıtında KOD YOK", !JSON.stringify(yanit).includes("123456") && !("kod" in yanit));
bekle("istemci yanıtı: üniversite ve süre", yanit.universite === "Selçuk Üniversitesi" && yanit.dakika === 15);
bekle("bilinmeyen durum → hata", istemciYaniti({ durum: "sql hatası: tablo" }).durum === "hata");
bekle("bekle: saniye iletilir", istemciYaniti({ durum: "bekle", saniye: 42 }).saniye === 42);
bekle("gövde değilse → hata", istemciYaniti(null).durum === "hata");

console.log(`\n${adet - hata}/${adet} geçti`);
process.exit(hata ? 1 : 0);
