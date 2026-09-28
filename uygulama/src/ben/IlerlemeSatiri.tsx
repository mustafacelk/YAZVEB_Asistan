import type { CSSProperties } from "react";
import Simge from "../tasarim/Simge";
import { sayi, seviyeIlerlemesi, sonrakiAdim, type Profil } from "../veri/odul";
import { useSayac } from "../veri/sayac";

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

/** Tek satırlık ilerleme: sayı, seviye, çubuk, bir sonraki somut adım. */
export default function IlerlemeSatiri({ profil, onAc }: { profil: Profil; onAc: () => void }) {
  const xp = useSayac(profil.xp);
  const adim = sonrakiAdim(profil);
  return (
    <button className="ilerleme-satiri-dunya gir" style={kademe(2)} onClick={onAc} aria-label={`${profil.xp} XP, ${profil.seviye.ad} seviyesi. Ayrıntılar`}>
      <span className="ilerleme-ust-satir">
        <span className="ilerleme-xp rakam">{sayi(xp)}<small>XP</small></span>
        <span className="rozet">{profil.seviye.ad}</span>
        {profil.ayarlar.seri_acik && profil.seri > 1 && (
          <span className="seri-cipi" title="Üst üste katıldığın etkinlik sayısı"><Simge ad="alev" boyut={14} /> <span className="rakam">×{profil.seri}</span></span>
        )}
        <Simge ad="ileri" boyut={16} />
      </span>
      <span className="ilerleme-cubugu ince" style={{ ["--oran" as string]: seviyeIlerlemesi(profil.xp, profil.seviye) }} aria-hidden="true"><i /></span>
      <span className="ilerleme-adim">{adim.ana}</span>
    </button>
  );
}
