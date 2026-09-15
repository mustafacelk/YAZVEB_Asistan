import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor: aynı web kodunu Android ve iOS kabuğuna sarar.
 *
 * Uygulama içeride `dist/` klasörünü yerelden yükler — yani ekranlar
 * internete gitmeden açılır, yalnızca veri için ağa çıkılır. Açılış hızının
 * sunucuya bağlı olmamasının sebebi bu.
 */
const config: CapacitorConfig = {
  appId: "app.yazveb.topluluk",
  appName: "YAZVEB",
  webDir: "dist",
  android: {
    // Karanlık tema: açılışta beyaz parlama olmasın.
    backgroundColor: "#08090B",
  },
  ios: {
    backgroundColor: "#08090B",
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: "#08090B",
      showSpinner: false,
    },
  },
};

export default config;
