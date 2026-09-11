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
    backgroundColor: "#05070C",
  },
  ios: {
    backgroundColor: "#05070C",
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: "#05070C",
      showSpinner: false,
    },
  },
};

export default config;
