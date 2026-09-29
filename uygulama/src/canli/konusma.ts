// ═══════════════════════════════════════════════════════════════════
// Sesli yanıt — metinle eşzamanlı
// ═══════════════════════════════════════════════════════════════════
// ESKİ SORUN: metin ekrana hemen düşüyor, ses iki üç saniye sonra
// başlıyordu; kullanıcı okumayı bitirmişken asistan yeni konuşmaya
// başlıyordu.
//
// ŞİMDİ
//   1. Cevap cümle sınırlarından en fazla üç parçaya bölünür (parcala.ts);
//      hepsi AYNI ANDA seslendirilmeye gönderilir. İlk parça kısa olduğu
//      için çabuk hazır olur.
//   2. Metin ilk ses gelene kadar gösterilmez (küre "düşünüyor"). Ses
//      başlayınca metin, okunduğu yere kadar sözcük sözcük belirir.
//   3. Parçalar Web Audio ile arka arkaya, boşluksuz çalar; hangi saniyede
//      olunduğu bağlamın saatinden kesin okunur. Bağlam açılamadıysa (ekran
//      dokunuşsuz açıldı) <audio> ile, yine eşzamanlı çalar.
//   4. Ses belirli bir sürede gelmezse metin beklemeden tamamen gösterilir;
//      ses gelirse yine çalar.
// ═══════════════════════════════════════════════════════════════════

import { kaynagiBirak, yanitCikisi } from "./olcer";
import { gorunenUzunluk, sesParcalari, type SesParcasi } from "./parcala";

export type Sentezci = (metin: string) => Promise<Blob | null>;

export type KonusmaOlaylari = {
  /** Ekranda gösterilecek karakter sayısı değişti. */
  gorunen: (n: number) => void;
  /** Ses çalmaya başladı (true) ya da beklenmeden metin gösterildi (false). */
  basladi: (sesli: boolean) => void;
  /** Konuşma bitti ya da durduruldu; metin tamamen görünür. */
  bitti: () => void;
};

/** İlk ses bu sürede gelmezse metin beklemeden gösterilir. */
export const ILK_SES_BEKLEME_MS = 6000;

type Plan = { parca: SesParcasi; bas: number; sure: number };

/**
 * Görünen metnin tazelenme aralığı. requestAnimationFrame DEĞİL: sayfa
 * görünmezken (başka sekme, küçültülmüş pencere) kare döngüsü durur, ses
 * sürer ve metin donardı. Sözcük düzeyinde ilerlemek için 80 ms bol.
 */
const TAZELEME_MS = 80;

export class Konusma {
  private durdu = false;
  private kare: ReturnType<typeof setInterval> | undefined;
  private sonGorunen = -1;
  private basladiMi = false;
  private kaynaklar: AudioScheduledSourceNode[] = [];
  private eleman: HTMLAudioElement | null = null;
  private adresler: string[] = [];

  constructor(
    private readonly metin: string,
    private readonly sentezle: Sentezci,
    private readonly olay: KonusmaOlaylari,
    private readonly ilkBeklemeMs = ILK_SES_BEKLEME_MS,
  ) {}

  async baslat() {
    const parcalar = sesParcalari(this.metin);
    if (!parcalar.length) { this.bitir(); return; }
    // Hepsi birden istenir; sıra çalarken korunur.
    const istekler = parcalar.map((p) => this.sentezle(p.metin).catch(() => null));

    // İlk ses gelmezse metin beklemesin.
    const zaman = setTimeout(() => {
      if (!this.basladiMi && !this.durdu) { this.basladiMi = true; this.goster(this.metin.length); this.olay.basladi(false); }
    }, this.ilkBeklemeMs);

    try {
      const cikis = yanitCikisi();
      if (cikis) await this.webAudioIle(cikis, parcalar, istekler);
      else await this.elemanIle(parcalar, istekler);
    } finally {
      clearTimeout(zaman);
    }
  }

  /** Kullanıcı durdurdu, yeni soru geldi ya da ekrandan çıkıldı. */
  durdur() {
    if (this.durdu) return;
    this.bitir();
  }

  // ── Web Audio: kesin saat, boşluksuz geçiş ──

  private async webAudioIle(
    cikis: { baglam: AudioContext; giris: AudioNode },
    parcalar: SesParcasi[],
    istekler: Promise<Blob | null>[],
  ) {
    const { baglam, giris } = cikis;
    const plan: Plan[] = [];
    let sonraki = 0;

    const dongu = () => {
      if (this.durdu) return;
      this.goster(this.okunanKonum(plan, baglam.currentTime, parcalar.length));
    };

    for (let i = 0; i < parcalar.length; i++) {
      const blob = await istekler[i];
      if (this.durdu) return;
      let tampon: AudioBuffer | null = null;
      if (blob) {
        try { tampon = await baglam.decodeAudioData(await blob.arrayBuffer()); } catch { tampon = null; }
      }
      if (this.durdu) return;
      const simdi = baglam.currentTime;
      if (!tampon) {
        // Bu parçanın sesi yok: önceki bitince metni bir anda görünür.
        plan.push({ parca: parcalar[i], bas: Math.max(sonraki, simdi), sure: 0 });
        continue;
      }
      const kaynak = baglam.createBufferSource();
      kaynak.buffer = tampon;
      kaynak.connect(giris);
      const bas = Math.max(sonraki, simdi + 0.03);
      kaynak.start(bas);
      this.kaynaklar.push(kaynak);
      plan.push({ parca: parcalar[i], bas, sure: tampon.duration });
      sonraki = bas + tampon.duration;
      if (!this.basladiMi) {
        this.basladiMi = true;
        this.olay.basladi(true);
        this.kare = setInterval(dongu, TAZELEME_MS);
      }
    }

    if (!this.kaynaklar.length) { this.bitir(); return; }
    // Son parça bitince konuşma biter (bağlamın saati esas).
    const kalan = Math.max(0, sonraki - baglam.currentTime);
    await new Promise((c) => setTimeout(c, kalan * 1000 + 80));
    if (!this.durdu) this.bitir();
  }

  /** Bağlamın saatine göre okunan karakter konumu. */
  private okunanKonum(plan: Plan[], t: number, toplam: number): number {
    let konum = 0;
    for (const p of plan) {
      if (t < p.bas) break;
      const oran = p.sure > 0 ? Math.min(1, (t - p.bas) / p.sure) : 1;
      konum = p.parca.bas + Math.round(p.parca.metin.length * oran);
      if (oran < 1) return konum;
    }
    // Hepsi okunduysa ve tüm parçalar planlandıysa metnin tamamı.
    return plan.length === toplam && plan.length ? this.metin.length : konum;
  }

  // ── <audio>: bağlam yoksa ──

  private async elemanIle(parcalar: SesParcasi[], istekler: Promise<Blob | null>[]) {
    for (let i = 0; i < parcalar.length; i++) {
      const blob = await istekler[i];
      if (this.durdu) return;
      const p = parcalar[i];
      if (!blob) { this.goster(p.bas + p.metin.length); continue; }
      const adres = URL.createObjectURL(blob);
      this.adresler.push(adres);
      const ses = new Audio(adres);
      this.eleman = ses;
      const bitti = new Promise<void>((c) => { ses.onended = () => c(); ses.onerror = () => c(); });
      try {
        await ses.play();
      } catch {
        // Tarayıcı dokunuşsuz sesi engelledi: metin beklemesin.
        this.bitir();
        return;
      }
      if (!this.basladiMi) { this.basladiMi = true; this.olay.basladi(true); }
      const dongu = () => {
        if (this.durdu || this.eleman !== ses) return;
        const oran = ses.duration > 0 && Number.isFinite(ses.duration) ? Math.min(1, ses.currentTime / ses.duration) : 0;
        this.goster(p.bas + Math.round(p.metin.length * oran));
      };
      this.kare = setInterval(dongu, TAZELEME_MS);
      await bitti;
      clearInterval(this.kare);
      if (this.durdu) return;
      this.goster(p.bas + p.metin.length);
    }
    this.bitir();
  }

  // ── Ortak ──

  private goster(konum: number) {
    const n = gorunenUzunluk(this.metin, konum);
    if (n === this.sonGorunen) return;   // sözcük değişmediyse yeniden çizme
    this.sonGorunen = n;
    this.olay.gorunen(n);
  }

  private bitir() {
    const ilkKez = !this.durdu;
    this.durdu = true;
    clearInterval(this.kare);
    for (const k of this.kaynaklar) { try { k.stop(); } catch { /* başlamamış */ } }
    this.kaynaklar = [];
    if (this.eleman) { this.eleman.pause(); this.eleman = null; }
    this.adresler.forEach((a) => URL.revokeObjectURL(a));
    this.adresler = [];
    kaynagiBirak();
    if (!ilkKez) return;
    if (!this.basladiMi) { this.basladiMi = true; this.olay.basladi(false); }
    this.goster(this.metin.length);
    this.olay.bitti();
  }
}
