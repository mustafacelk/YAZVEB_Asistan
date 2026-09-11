import { createClient } from "@supabase/supabase-js";

/**
 * Supabase bağlantısı.
 *
 * Buradaki anahtar "anon key"dir ve HERKESE AÇIKTIR — mobil uygulamanın
 * içinden de çıkarılabilir, öyle olması beklenir. Güvenliği sağlayan şey bu
 * anahtarın gizliliği değil, veritabanındaki satır düzeyi kurallardır
 * (bkz. veritabani/02_yetkiler.sql). Anahtar tek başına hiçbir kapı açmaz.
 *
 * Gizli kalması gereken servis anahtarı (service_role) bu uygulamada HİÇ
 * kullanılmaz ve asla buraya konmamalıdır.
 */
const adres = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anahtar = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/**
 * Yapılandırmayı sessizce kabul etmek yerine denetler.
 *
 * En sık yapılan hata iki değerin yer değiştirmesi: Supabase panelinde
 * "Project URL" ile "Publishable key" yan yana duruyor ve anahtar yanlışlıkla
 * URL kutusuna yapıştırılıyor. Bu durumda uygulama açılır ama her istek
 * sessizce başarısız olur — en can sıkıcı hata türü. Burada erkenden yakalanıp
 * ne yapılacağı söyleniyor.
 */
function yapilandirmaSorunu(): string | null {
  if (!adres && !anahtar) return "eksik";
  if (!adres) return "URL yazılmamış.";
  if (!anahtar) return "Anahtar yazılmamış.";
  if (adres.startsWith("sb_") || !/^https?:\/\//.test(adres)) {
    return "VITE_SUPABASE_URL bir adres olmalı (https://xxxx.supabase.co). " +
           "Oraya anahtar yapıştırılmış olabilir.";
  }
  if (/^https?:\/\//.test(anahtar)) {
    return "VITE_SUPABASE_ANON_KEY bir adres değil, anahtar olmalı. " +
           "İki değer yer değiştirmiş olabilir.";
  }
  // Hem eski (JWT, "eyJ...") hem yeni (sb_publishable_...) biçim geçerli.
  if (!anahtar.startsWith("sb_publishable_") && !anahtar.startsWith("eyJ")) {
    return "Anahtar tanınmadı. Supabase panelinde Project Settings → API " +
           "altındaki Publishable key değerini kopyala.";
  }
  if (anahtar.startsWith("sb_secret_") || anahtar.includes("service_role")) {
    return "BU ANAHTAR GİZLİ (secret/service_role) — uygulamaya konmamalı. " +
           "Publishable key kullan.";
  }
  return null;
}

export const sorun = yapilandirmaSorunu();
export const yapilandirildi = sorun === null;

/*
 * Yapılandırma bozuksa bile createClient GEÇERLİ değerlerle çağrılır.
 * Boş bir adres verilirse kütüphane modül yüklenirken hata fırlatır ve
 * uygulama bembeyaz açılır — kullanıcı ne olduğunu anlamaz. Oysa asıl
 * istediğimiz, sorunu anlatan ekranın görünmesi. İstemci kurulur ama
 * kullanılmaz: `yapilandirildi` false iken arayüz zaten oraya gitmez.
 */
export const supabase = createClient(
  yapilandirildi ? adres : "https://yapilandirilmadi.supabase.co",
  yapilandirildi ? anahtar : "yapilandirilmadi",
  {
    auth: {
      // Oturum cihazda saklanır ve sessizce yenilenir: kullanıcı uygulamayı
      // her açtığında yeniden giriş yapmak zorunda kalmaz.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 8 } },
  },
);

// ── Ortak tipler ────────────────────────────────────────────────────
export type Rol = "uye" | "yonetici" | "baskan";

export type Profil = {
  id: string;
  kullanici_adi: string;
  ad_soyad: string | null;
  rol: Rol;
  olusturuldu: string;
};

export type Mesaj = {
  id: number;
  yazar: string;
  icerik: string;
  olusturuldu: string;
};

export type Etkinlik = {
  id: number;
  baslik: string;
  aciklama: string | null;
  yer: string | null;
  baslangic: string;
  bitis: string | null;
  ekleyen: string;
  baskan_kilidi: boolean;
  olusturuldu: string;
  guncellendi: string;
};

export const ROL_ADI: Record<Rol, string> = {
  baskan: "Başkan",
  yonetici: "Yönetici",
  uye: "Üye",
};
