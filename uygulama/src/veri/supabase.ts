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
const adres = import.meta.env.VITE_SUPABASE_URL;
const anahtar = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const yapilandirildi = Boolean(adres && anahtar);

export const supabase = createClient(
  adres ?? "http://localhost:54321",
  anahtar ?? "yapilandirilmadi",
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
