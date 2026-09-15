// Konuşma tanıma birleştirme testleri:  npm run test:transkript
// Android aynı cümleyi birikimli yolladığında kelimeler tekrar etmemeli.
import { birlestir, oturumMetni } from "../src/veri/transkript.ts";
let hata = 0;
const esit = (ad: string, g: string, b: string) => { const ok = g === b; if (!ok) hata++; console.log(ok ? "✓" : "✗", ad, "→", JSON.stringify(g), ok ? "" : "beklenen " + JSON.stringify(b)); };
const F = (t: string) => ({ isFinal: true, 0: { transcript: t } });
const I = (t: string) => ({ isFinal: false, 0: { transcript: t } });

esit("masaüstü ardışık", oturumMetni([F("merhaba"), F("nasılsın")]).kesin, "merhaba nasılsın");
esit("android birikimli", oturumMetni([F("merhaba"), F("merhaba nasılsın"), F("merhaba nasılsın bugün")]).kesin, "merhaba nasılsın bugün");
esit("android büyük harf farkı", oturumMetni([F("Yazveb"), F("yazveb nedir")]).kesin, "Yazveb nedir");
esit("yeniden başlatma tekrarı", birlestir("topluluğa nasıl katılırım", "katılırım"), "topluluğa nasıl katılırım");
esit("kısmi örtüşme", birlestir("etkinlikler ne", "ne zaman"), "etkinlikler ne zaman");
esit("üçlü tekrar seyreltilir", birlestir("", "yazveb yazveb yazveb yazveb nedir"), "yazveb yazveb nedir");
esit("doğal ikili korunur", birlestir("", "yavaş yavaş anlat"), "yavaş yavaş anlat");
esit("ortadaki meşru tekrar", birlestir("ne ne zaman", "ne"), "ne ne zaman ne");
esit("ara sonuç", oturumMetni([F("merhaba"), I("nası"), I("nasılsın")]).ara, "nasılsın");
esit("boş parça", birlestir("merhaba", "  "), "merhaba");
esit("noktalama farkı", birlestir("merhaba.", "Merhaba nasılsın"), "merhaba. nasılsın");
esit("kesinde gerçek iki kelime", birlestir("bu", "bugün"), "bu bugün");
process.exit(hata ? 1 : 0);
