import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * İçerik Güvenlik Politikası (CSP) — derlemede sayfaya gömülür.
 *
 * NEDEN META ETİKETİ
 * ──────────────────
 * Aynı `dist/` hem sitede hem telefon uygulamasında açılıyor. Vercel'in
 * yanıt başlıkları uygulamanın içine gitmez; meta etiketi ikisinde de
 * geçerli. Meta etiketinin taşıyamadığı `frame-ancestors` ise vercel.json'da.
 *
 * NEDEN YALNIZCA DERLEMEDE
 * ────────────────────────
 * Vite'ın geliştirme sunucusu hızlı yenileme için satır içi betik ekliyor;
 * bu politika onu engeller. Geliştirmede CSP yok, üretimde tam.
 *
 * KAYNAKLAR (hepsi ölçülerek çıkarıldı)
 *   script / style  yalnızca kendi dosyalarımız — satır içi yok, eval yok
 *   img             data: (arka plan greni SVG'si)
 *   media           blob: (seslendirilen yanıt MP3'ü)
 *   connect         Supabase REST + Realtime WebSocket, seslendirme ucu
 */
function icerikPolitikasi(ortam: Record<string, string>): Plugin {
  return {
    name: "yazveb-csp",
    apply: "build",
    transformIndexHtml(html) {
      const supabase = (ortam.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
      const site = (ortam.VITE_SITE_URL || "https://yazveb-asistan.vercel.app").replace(/\/+$/, "");
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabase)) {
        // Adres yoksa uygulama zaten yapılandırma ekranı gösterir; CSP'yi
        // bozuk bir adresle yazmak yerine bağlantıyı tümden kapat.
        console.warn("[csp] VITE_SUPABASE_URL geçersiz; connect-src yalnızca 'self'");
      }
      const ws = supabase.replace(/^https:/, "wss:");
      const baglanti = ["'self'", supabase, ws, site].filter((k) => k && k !== "wss:").join(" ");

      const politika = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "media-src 'self' blob:",
        `connect-src ${baglanti}`,
        "worker-src 'self'",
        "manifest-src 'self'",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ");

      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${politika}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const ortam = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [react(), icerikPolitikasi(ortam)],
    build: {
      // Kaynak haritası üretilmez: kaynak kodu ve dosya yolları tarayıcıya gitmesin.
      sourcemap: false,
    },
    server: {
      // Geliştirme sunucusu yalnızca bu bilgisayardan erişilebilir.
      host: "127.0.0.1",
    },
    preview: {
      host: "127.0.0.1",
    },
  };
});
