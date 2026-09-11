import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, ROL_ADI, type Mesaj, type Profil } from "../veri/supabase";
import { useOturum } from "../veri/oturum";

const SAYFA = 60;

/**
 * Genel sohbet — topluluğun tek ortak odası.
 *
 * Mesajlar iki yoldan gelir: açılışta son N tanesi tek sorguyla, sonrası
 * gerçek zamanlı yayından. Yayın da satır kurallarına uyar; kullanıcı
 * yalnızca görmeye yetkili olduğu satırları alır.
 */
export default function Sohbet() {
  const { profil, yetkiliMi } = useOturum();
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [kisiler, setKisiler] = useState<Record<string, Profil>>({});
  const [taslak, setTaslak] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const dipRef = useRef<HTMLDivElement | null>(null);
  const listeRef = useRef<HTMLDivElement | null>(null);

  // Kullanıcı yukarı kaydırdıysa yeni mesaj gelince zorla aşağı atma;
  // okuduğu yerden koparmak en can sıkıcı sohbet hatasıdır.
  const dipteMi = useRef(true);

  const kaydir = useCallback((zorla = false) => {
    if (!zorla && !dipteMi.current) return;
    dipRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    let gecerli = true;

    (async () => {
      const [mesajSonuc, kisiSonuc] = await Promise.all([
        supabase
          .from("mesajlar")
          .select("*")
          .order("olusturuldu", { ascending: false })
          .limit(SAYFA),
        supabase.from("profiller").select("*"),
      ]);

      if (!gecerli) return;
      if (mesajSonuc.error) {
        setHata("Sohbet yüklenemedi.");
      } else {
        setMesajlar((mesajSonuc.data as Mesaj[]).slice().reverse());
      }
      if (kisiSonuc.data) {
        const harita: Record<string, Profil> = {};
        for (const k of kisiSonuc.data as Profil[]) harita[k.id] = k;
        setKisiler(harita);
      }
      setYukleniyor(false);
      requestAnimationFrame(() => kaydir(true));
    })();

    const kanal = supabase
      .channel("genel-sohbet")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mesajlar" },
        (yuk) => {
          const yeni = yuk.new as Mesaj;
          setMesajlar((onceki) =>
            onceki.some((m) => m.id === yeni.id) ? onceki : [...onceki, yeni],
          );
          requestAnimationFrame(() => kaydir());
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "mesajlar" },
        (yuk) => {
          const giden = yuk.old as { id: number };
          setMesajlar((onceki) => onceki.filter((m) => m.id !== giden.id));
        },
      )
      .subscribe();

    return () => {
      gecerli = false;
      supabase.removeChannel(kanal);
    };
  }, [kaydir]);

  async function gonder() {
    const metin = taslak.trim();
    if (!metin || !profil) return;
    setTaslak("");
    dipteMi.current = true;

    const { error } = await supabase.from("mesajlar").insert({
      icerik: metin,
      yazar: profil.id,   // tetikleyici zaten zorluyor; şema uyumu için
    });
    if (error) {
      setHata("Mesaj gönderilemedi.");
      setTaslak(metin);   // yazdığını kaybetme
    }
  }

  async function sil(id: number) {
    const { error } = await supabase.from("mesajlar").delete().eq("id", id);
    if (error) setHata("Mesaj silinemedi.");
    else setMesajlar((o) => o.filter((m) => m.id !== id));
  }

  const gruplar = useMemo(() => grupla(mesajlar), [mesajlar]);

  return (
    <div className="sohbet">
      <div
        className="sohbet-liste"
        ref={listeRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          dipteMi.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {yukleniyor && <p className="sessiz">Sohbet yükleniyor…</p>}
        {!yukleniyor && mesajlar.length === 0 && (
          <p className="sessiz">Henüz mesaj yok. İlk yazan sen ol.</p>
        )}

        {gruplar.map((grup) => {
          const kisi = kisiler[grup.yazar];
          const benimMi = grup.yazar === profil?.id;
          return (
            <div
              key={grup.anahtar}
              className={"balon-grup" + (benimMi ? " benim" : "")}
            >
              {!benimMi && (
                <div className="balon-basi">
                  <b>{kisi?.kullanici_adi ?? "üye"}</b>
                  {kisi && kisi.rol !== "uye" && (
                    <span className={"rozet rol-" + kisi.rol}>
                      {ROL_ADI[kisi.rol]}
                    </span>
                  )}
                </div>
              )}
              {grup.mesajlar.map((m) => (
                <div key={m.id} className="balon">
                  <p>{m.icerik}</p>
                  <time>{saat(m.olusturuldu)}</time>
                  {(benimMi || yetkiliMi) && (
                    <button
                      className="balon-sil"
                      onClick={() => sil(m.id)}
                      aria-label="Mesajı sil"
                      title="Sil"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        <div ref={dipRef} />
      </div>

      {hata && <p className="uyari cubuk" role="alert">{hata}</p>}

      <form
        className="yazma"
        onSubmit={(e) => {
          e.preventDefault();
          gonder();
        }}
      >
        <input
          value={taslak}
          onChange={(e) => setTaslak(e.target.value)}
          placeholder="Mesaj yaz…"
          maxLength={2000}
          aria-label="Mesaj"
        />
        <button type="submit" disabled={!taslak.trim()} aria-label="Gönder">
          ↑
        </button>
      </form>
    </div>
  );
}

// ── Yardımcılar ────────────────────────────────────────────────────

/** Aynı kişinin arka arkaya mesajları tek balon grubunda toplanır. */
function grupla(mesajlar: Mesaj[]) {
  const gruplar: { anahtar: string; yazar: string; mesajlar: Mesaj[] }[] = [];
  for (const m of mesajlar) {
    const son = gruplar[gruplar.length - 1];
    const yakin =
      son &&
      son.yazar === m.yazar &&
      new Date(m.olusturuldu).getTime() -
        new Date(son.mesajlar[son.mesajlar.length - 1].olusturuldu).getTime() <
        5 * 60 * 1000;
    if (yakin) son.mesajlar.push(m);
    else gruplar.push({ anahtar: `${m.yazar}-${m.id}`, yazar: m.yazar, mesajlar: [m] });
  }
  return gruplar;
}

function saat(zaman: string) {
  return new Date(zaman).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
