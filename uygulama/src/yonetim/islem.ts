import { useCallback, useState } from "react";
import { OdulHatasi } from "../veri/odul";

// Yönetim ekranlarında işlem durumu: bekliyor + hata/bilgi mesajı.

/** Hata/bilgi mesajı taşıyan ortak kanca. */
export function useIslem() {
  const [mesaj, setMesaj] = useState<{ tur: "hata" | "bilgi"; metin: string } | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const calistir = useCallback(async <T,>(is: () => Promise<T>, basari?: string): Promise<T | undefined> => {
    setBekliyor(true);
    setMesaj(null);
    try {
      const r = await is();
      if (basari) setMesaj({ tur: "bilgi", metin: basari });
      return r;
    } catch (h) {
      setMesaj({ tur: "hata", metin: h instanceof OdulHatasi ? h.message : "İşlem tamamlanamadı." });
      return undefined;
    } finally {
      setBekliyor(false);
    }
  }, []);
  return { mesaj, bekliyor, calistir, setMesaj };
}
