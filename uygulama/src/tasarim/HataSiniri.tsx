import { Component, type ReactNode } from "react";

/**
 * Uygulamanın en dışındaki güvenlik ağı: çizimde beklenmedik bir hata olursa
 * React bütün ağacı söker ve geriye BOŞ bir ekran kalır. Bunun yerine ne
 * olduğunu söyleyen, tek dokunuşla yenilenen bir ekran gösterilir.
 *
 * YENİ SÜRÜM YAYINLANINCA
 * ───────────────────────
 * Telefonda açık kalmış bir sekme eski sürümün kodunu çalıştırmaya devam
 * eder. Sonradan inen parçalar (Akademi, Yönetim, HUB) adlarında içerik
 * özeti taşır; yeni yayında eski adlar artık yoktur ve parça inemez. Bu
 * durumda hata göstermek yerine sayfa bir kez kendiliğinden yenilenir —
 * yenilenen sayfa yeni sürümü alır. Döngüye girmesin diye kısa bir süre
 * içinde ikinci kez yenilenmez; o zaman hata ekranı görünür.
 */
const YENILEME_ANAHTARI = "yazveb:parca-yenilendi";

export function parcaHatasiMi(hata: unknown) {
  const m = hata instanceof Error ? `${hata.name} ${hata.message}` : String(hata);
  return /dynamically imported module|module script failed|Importing a module script|ChunkLoadError|Unable to preload CSS/i.test(m);
}

/** Yeni sürüm için bir kez yenile. Yenilemeye gidildiyse true. */
export function birKezYenile(): boolean {
  try {
    const son = Number(sessionStorage.getItem(YENILEME_ANAHTARI) ?? 0);
    if (Date.now() - son < 30_000) return false;
    sessionStorage.setItem(YENILEME_ANAHTARI, String(Date.now()));
  } catch {
    return false;   // depolama kapalıysa döngü riskine girme
  }
  window.location.reload();
  return true;
}

export default class HataSiniri extends Component<{ children: ReactNode }, { hata: unknown }> {
  state: { hata: unknown } = { hata: null };

  static getDerivedStateFromError(hata: unknown) {
    return { hata: hata ?? new Error("Bilinmeyen hata") };
  }

  componentDidCatch(hata: unknown) {
    console.error("YAZVEB çizim hatası:", hata);
    if (parcaHatasiMi(hata)) birKezYenile();
  }

  render() {
    const { hata } = this.state;
    if (!hata) return this.props.children;
    const mesaj = hata instanceof Error ? hata.message : String(hata);
    return (
      <div className="acilis hata-ekrani" role="alert">
        <img src="/logo-256.webp" alt="YAZVEB" width={64} height={64} />
        <div className="hata-ekrani-metin">
          <h1>Bir şey ters gitti.</h1>
          <p>
            {parcaHatasiMi(hata)
              ? "Uygulamanın yeni bir sürümü yayınlanmış. Yenileyince düzelir."
              : "Sayfayı yenilemek çoğunlukla yeter. Tekrarlarsa aşağıdaki satırı topluluk yönetimine ilet."}
          </p>
          <code>{mesaj.slice(0, 300)}</code>
        </div>
        <button className="dugme birincil" onClick={() => window.location.reload()}>Yenile</button>
      </div>
    );
  }
}
