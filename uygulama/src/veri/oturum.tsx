import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Profil, type Rol } from "./supabase";

/**
 * Oturum katmanı: kim giriş yapmış, rolü ne.
 *
 * Buradaki `baskanMi` / `yetkiliMi` bayrakları YALNIZCA ARAYÜZ İÇİNDİR —
 * hangi düğmenin görüneceğine karar verirler. Gerçek yetki denetimi
 * veritabanındaki satır kurallarındadır. Bu dosyadaki bir hata en fazla
 * çalışmayan bir düğme gösterir; veri sızdırmaz.
 */

type OturumDurumu = {
  oturum: Session | null;
  profil: Profil | null;
  yukleniyor: boolean;
  rol: Rol | null;
  baskanMi: boolean;
  yetkiliMi: boolean;
  profiliTazele: () => Promise<void>;
  cikis: () => Promise<void>;
};

const Baglam = createContext<OturumDurumu | null>(null);

export function OturumSaglayici({ children }: { children: ReactNode }) {
  const [oturum, setOturum] = useState<Session | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const profiliGetir = useCallback(async (kimlik: string | undefined) => {
    if (!kimlik) {
      setProfil(null);
      return;
    }
    const { data, error } = await supabase
      .from("profiller")
      .select("*")
      .eq("id", kimlik)
      .maybeSingle();
    if (error) {
      console.warn("[oturum] profil okunamadı:", error.message);
      setProfil(null);
      return;
    }
    setProfil(data as Profil | null);
  }, []);

  useEffect(() => {
    let gecerli = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!gecerli) return;
      setOturum(data.session);
      await profiliGetir(data.session?.user.id);
      if (gecerli) setYukleniyor(false);
    });

    // Giriş, çıkış ve jeton yenileme aynı yerden akar; ekranlar bunu
    // dinlemek zorunda kalmaz.
    const { data: abone } = supabase.auth.onAuthStateChange(
      async (_olay, yeni) => {
        if (!gecerli) return;
        setOturum(yeni);
        await profiliGetir(yeni?.user.id);
        if (gecerli) setYukleniyor(false);
      },
    );

    return () => {
      gecerli = false;
      abone.subscription.unsubscribe();
    };
  }, [profiliGetir]);

  const deger = useMemo<OturumDurumu>(() => {
    const rol = profil?.rol ?? null;
    return {
      oturum,
      profil,
      yukleniyor,
      rol,
      baskanMi: rol === "baskan",
      yetkiliMi: rol === "baskan" || rol === "yonetici",
      profiliTazele: () => profiliGetir(oturum?.user.id),
      cikis: async () => {
        await supabase.auth.signOut();
        setProfil(null);
      },
    };
  }, [oturum, profil, yukleniyor, profiliGetir]);

  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}

export function useOturum(): OturumDurumu {
  const deger = useContext(Baglam);
  if (!deger) throw new Error("useOturum, OturumSaglayici içinde kullanılmalı");
  return deger;
}
