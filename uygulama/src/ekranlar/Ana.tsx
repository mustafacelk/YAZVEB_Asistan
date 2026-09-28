import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase, type Etkinlik } from "../veri/supabase";
import { useGorunum, useOturum } from "../veri/oturum";
import { ODUL_DEGISTI, useGezinme } from "../veri/gezinme";
import { selamAdi } from "../veri/bicim";
import { odul, sayi, sonKullanimEtiketi, type EtkinlikOzeti, type KazanimOzeti, type Profil } from "../veri/odul";
import { pano, type PanoOzeti } from "../veri/pano";
import { sinavMetni } from "../veri/pano_bicim";
import { bugunListesi, durumCumlesi, type BugunOgesi } from "../veri/bugun";
import Simge from "../tasarim/Simge";
import AlintiKarti from "../tasarim/AlintiKarti";
import { Bolum, Satir, SatirIskeleti, Satirlar } from "../tasarim/Dunya";
import IlerlemeSatiri from "../ben/IlerlemeSatiri";

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Ana — YAZVEB dünyasında yön verir; her özelliği göstermez (TASARIM.md §2).
 *
 *   1. Amaç     Merhaba + bugünün tek cümlelik özeti
 *   2. Eylem    Asistan'a sor (ya da canlı etkinlikte QR)
 *   3. Bugün    şu an önemli olan EN FAZLA üç şey
 *   4. İkincil  tek satır ilerleme, 3D HUB'a geçit
 *
 * Takvimin tamamı, sponsorlar, sıralama, notlar burada YOK: her biri kendi
 * dünyasında. Burada yalnızca "bugün" olanlar.
 */
export default function Ana() {
  const { profil: hesap, yetkiliMi } = useOturum();
  const { uyari, gorunumSec } = useGorunum();
  const { git, tara, hubAc } = useGezinme();
  // "Yönetici" seçip üye hesabıyla girildiyse: bir kez söylenir, seçim üyeye çekilir.
  const [kipUyarisi, setKipUyarisi] = useState(uyari);
  useEffect(() => { if (uyari) gorunumSec("uye"); }, [uyari, gorunumSec]);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [bugun, setBugun] = useState<BugunOgesi[] | null>(null);
  const [soru, setSoru] = useState("");

  const yukle = useCallback(async () => {
    const [p, liste, oz, cz, not] = await Promise.all([
      odul.profil().catch(() => null),
      supabase
        .from("etkinlikler")
        .select("*")
        // Birkaç saat önce başlamış olan da gelsin: "şu an sürüyor" olabilir.
        .gte("baslangic", new Date(Date.now() - 12 * 3_600_000).toISOString())
        .lte("baslangic", new Date(Date.now() + 8 * 86_400_000).toISOString())
        .order("baslangic", { ascending: true })
        .limit(10),
      odul.etkinlikOzeti().catch((): EtkinlikOzeti[] => []),
      odul.cuzdan().catch((): KazanimOzeti[] => []),
      // Notlar kurulmamışsa sessizce yok sayılır.
      pano.ozet().catch((): PanoOzeti | null => null),
    ]);
    setProfil(p);
    setBugun(bugunListesi({
      etkinlikler: (liste.data as Etkinlik[] | null) ?? [],
      ozet: oz,
      cuzdan: cz,
      sinav: not,
    }));
  }, []);

  useEffect(() => {
    yukle();
    window.addEventListener(ODUL_DEGISTI, yukle);
    return () => window.removeEventListener(ODUL_DEGISTI, yukle);
  }, [yukle]);

  const ad = selamAdi(hesap?.ad_soyad, hesap?.kullanici_adi);

  return (
    <div className="sayfa ana">
      <div className="sutun">
        <header className="ana-basi gir">
          <img src="/logo-128.webp" alt="" width={28} height={28} />
          <span className="etiket">YAZVEB</span>
          {yetkiliMi && (
            <button className="metin-dugme baglanti ana-yonetim" onClick={() => gorunumSec("yonetim")}>
              <Simge ad="ayar" boyut={14} /> Yönetim
            </button>
          )}
        </header>

        {kipUyarisi && (
          <p className="bildirim bilgi gir" role="status">
            {kipUyarisi}{" "}
            <button className="metin-dugme baglanti satir-ici" onClick={() => setKipUyarisi(null)}>Tamam</button>
          </p>
        )}

        <h1 className="ana-selam gir" style={kademe(1)}>{ad ? `Merhaba, ${ad}.` : "Merhaba."}</h1>
        <p className="ana-durum gir" style={kademe(1)} aria-live="polite">
          {bugun === null ? " " : durumCumlesi(bugun)}
        </p>

        {/* Neden buradasın: her açılışta başka bir söz — kart değil, sessiz bir satır. */}
        <AlintiKarti set="uye" yalin className="gir" style={kademe(2)} />

        {/* Asistan: bir arama çubuğu kadar yakında. Yazıp gönderince açılır ve
            soru doğrudan sorulur; boşken mikrofon Asistan'ı açar. */}
        <form
          className="asistana-sor gir"
          style={kademe(2)}
          onSubmit={(e) => {
            e.preventDefault();
            git("asistan", { soru: soru.trim() || undefined });
          }}
        >
          <Simge ad="asistan" boyut={18} />
          <input
            value={soru}
            onChange={(e) => setSoru(e.target.value)}
            placeholder="Asistana sor: etkinlik, ders notu, topluluk"
            aria-label="Asistana soru"
            enterKeyHint="send"
            maxLength={500}
          />
          <button type="submit" className="gonder-dugme" aria-label={soru.trim() ? "Gönder" : "Asistanı aç"}>
            <Simge ad={soru.trim() ? "gonder" : "mikrofon"} boyut={16} />
          </button>
        </form>

        <Bolum etiket="Bugün" sira={3}>
          {bugun === null ? <SatirIskeleti adet={2} /> : bugun.length === 0 ? (
            <p className="ana-sakin">Bugün önünde bekleyen bir şey yok. Derslerine göz at ya da Asistan'a bir şey sor.</p>
          ) : (
            <Satirlar>
              {bugun.map((o) => <BugunSatiri key={o.tur} oge={o} onTara={tara} />)}
            </Satirlar>
          )}
        </Bolum>

        {profil && (
          <Bolum etiket="İlerlemen" sira={4}>
            <IlerlemeSatiri profil={profil} onAc={() => git("ben", { bolum: "gecmis" })} />
          </Bolum>
        )}

        {/* 3D HUB: bir kart değil, başka bir dünyaya geçit. */}
        <button className="hub-portal gir" style={kademe(5)} onClick={hubAc}>
          <span className="hub-portal-sahne" aria-hidden="true">
            <svg viewBox="0 0 120 90">
              <g className="hub-portal-kup">
                <path d="M60 10 98 32v44L60 98 22 76V32z" />
                <path d="M22 32 60 54l38-22M60 54v44" />
                <path className="hub-portal-kat" d="M22 54 60 76l38-22" />
              </g>
            </svg>
          </span>
          <span className="hub-portal-metin">
            <span className="etiket">Başka bir dünya</span>
            <b>YAZVEB HUB</b>
            <span>Karakterin, odan, arkadaşlarının odaları ve sponsor çarşısı. 3B.</span>
          </span>
          <span className="hub-portal-gir">Gir <Simge ad="ileri" boyut={16} /></span>
        </button>
      </div>
    </div>
  );
}

function BugunSatiri({ oge: o, onTara }: { oge: BugunOgesi; onTara: () => void }) {
  const { git } = useGezinme();

  if (o.tur === "etkinlik") {
    const t = new Date(o.etkinlik.baslangic);
    const bugun = t.toDateString() === new Date().toDateString();
    const zaman = o.canli ? "Şu an" :
      `${bugun ? "Bugün" : t.toLocaleDateString("tr-TR", { weekday: "long" })} ${t.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
    const qrGerek = o.canli && o.puan > 0 && !o.katildi;
    return (
      <Satir
        simge="etkinlik"
        canli={o.canli}
        baslik={o.etkinlik.baslik}
        aciklama={<span className="rakam">{zaman}{o.etkinlik.yer ? ` · ${o.etkinlik.yer}` : ""}</span>}
        deger={!qrGerek && (o.katildi
          ? <span className="xp-cipi katildi"><Simge ad="tik" boyut={14} /> Katıldın</span>
          : o.puan > 0 ? <span className="xp-cipi rakam">+{sayi(o.puan)} XP</span> : undefined)}
        onClick={() => git("etkinlik")}
        eylem={qrGerek ? (
          <button className="dugme birincil" onClick={onTara}>
            <Simge ad="tara" boyut={16} /> QR okut
          </button>
        ) : undefined}
      />
    );
  }

  if (o.tur === "odul") {
    const ilk = o.aktif[0];
    return (
      <Satir
        simge="hediye"
        baslik={o.aktif.length === 1 ? `${ilk.sponsor}: ${ilk.baslik}` : `${o.aktif.length} ödülün kullanılmayı bekliyor`}
        aciklama={sonKullanimEtiketi(ilk.son_kullanma) ?? "İşletmede göstererek kullanabilirsin."}
        onClick={() => git("ben", { bolum: "oduller" })}
      />
    );
  }

  return (
    <Satir
      simge="kitap"
      baslik={sinavMetni(o.sinav)}
      aciklama={o.notSayisi ? `${o.bolum}: ${o.notSayisi} not seni bekliyor.` : "Bölümünün notlarına bak, sen de paylaş."}
      onClick={() => git("akademi")}
    />
  );
}
