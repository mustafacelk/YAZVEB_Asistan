import Simge from "../tasarim/Simge";
import type { Sponsorlu } from "../veri/pano";

/**
 * Sponsorlu içerik: kademeye göre (altın → gümüş → bronz) daha dikkat
 * çekici, ama her zaman "Sponsorlu" etiketiyle ve öğrenci notlarından ayrı.
 */
const KADEME_ADI = { altin: "Altın sponsor", gumus: "Gümüş sponsor", bronz: "Sponsor" } as const;

export default function SponsorluKart({ s, onAc }: { s: Sponsorlu; onAc: () => void }) {
  return (
    <button className="sponsorlu-kart" data-kademe={s.kademe} onClick={onAc}>
      <span className="sponsorlu-ust">
        <span className="sponsorlu-etiket">Sponsorlu · {KADEME_ADI[s.kademe]}</span>
        {s.baglam === "sinav_donemi" && <span className="sponsorlu-baglam">Sınav dönemi</span>}
      </span>
      <span className="sponsorlu-govde">
        {s.logo
          ? <img className="sponsorlu-logo" src={s.logo} alt="" width={44} height={44} />
          : <span className="sponsorlu-logo harf" aria-hidden="true">{(s.sponsor ?? s.baslik).slice(0, 1).toLocaleUpperCase("tr")}</span>}
        <span className="sponsorlu-metin">
          <b>{s.baslik}</b>
          {s.metin && <span>{s.metin}</span>}
          {s.sponsor && <small>{s.sponsor}</small>}
        </span>
        <Simge ad="ileri" boyut={16} />
      </span>
    </button>
  );
}
