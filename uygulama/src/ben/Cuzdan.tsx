import { type CSSProperties } from "react";
import { useSayac } from "../veri/sayac";
import Simge, { odulIkonu } from "../tasarim/Simge";
import {
  sayi,
  seviyeIlerlemesi,
  sonKullanimEtiketi,
  sonrakiAdim,
  tarih,
  tarihSaat,
  type Donem,
  type KazanimOzeti,
  type Liderlik,
  type Profil,
} from "../veri/odul";

/**
 * Ben dünyasının cüzdan parçaları: ilerleme ayrıntısı, ödüllerim, sıralama,
 * puan geçmişi. Eskiden ayrı bir "Ödüller" sekmesiydi; artık kişinin kendi
 * alanında, ihtiyaç duyulunca açılan alt sayfalar (TASARIM.md §2).
 */

const kademe = (i: number) => ({ "--i": i }) as CSSProperties;

export function IlerlemeAyrinti({ profil }: { profil: Profil }) {
  const { seviye, xp } = profil;
  const oran = seviyeIlerlemesi(xp, seviye);
  const adim = sonrakiAdim(profil);
  const gosterilenXp = useSayac(xp);

  return (
    <section className="ilerleme-karti gir" style={kademe(2)} aria-label="İlerleme">
      <div className="ilerleme-ust">
        <div>
          <p className="xp-buyuk rakam" aria-label={`${xp} XP`}>{sayi(gosterilenXp)}<span>XP</span></p>
          <p className="seviye-adi">
            <span className="etiket rakam">Seviye {String(seviye.sira).padStart(2, "0")}</span>
            <b>{seviye.ad}</b>
          </p>
        </div>
        {profil.ayarlar.seri_acik && profil.seri > 1 && (
          <span className="seri-cipi" title="Üst üste katıldığın etkinlik sayısı">
            <Simge ad="alev" boyut={16} /> <span className="rakam">×{profil.seri}</span>
          </span>
        )}
      </div>

      <div className="ilerleme-cubugu" style={{ ["--oran" as string]: oran }} role="progressbar"
           aria-valuemin={seviye.esik} aria-valuemax={seviye.sonraki?.esik ?? xp} aria-valuenow={xp}
           aria-label="Seviye ilerlemesi"><i /></div>
      <div className="ilerleme-satiri">
        <span className="etiket rakam">{seviye.ad} · {sayi(seviye.esik)}</span>
        <span className="etiket rakam">
          {seviye.sonraki ? `${seviye.sonraki.ad} · ${sayi(seviye.sonraki.esik)}` : "En üst seviye"}
        </span>
      </div>

      {/* Uzun yol: nerede olduğun ve önünde ne var. Gelecek seviyeler
          kilitli ama görünür; hedef soyut bir sayı olarak kalmasın. */}
      <ol className="seviye-yolu" aria-label="Seviye yolu">
        {profil.seviyeler.map((s) => {
          const gecti = xp >= s.esik;
          const simdiki = s.ad === seviye.ad;
          const sonraki = s.ad === seviye.sonraki?.ad;
          return (
            <li key={s.ad} data-gecti={gecti} data-simdiki={simdiki} data-sonraki={sonraki}
                aria-label={`${s.ad}, ${sayi(s.esik)} XP, ${simdiki ? "şu anki seviyen" : gecti ? "geçildi" : "kilitli"}`}>
              <i aria-hidden="true">{gecti ? <Simge ad={simdiki ? "yildiz" : "tik"} boyut={12} /> : <Simge ad="kilit" boyut={11} />}</i>
            </li>
          );
        })}
      </ol>

      {/* XP bir sayı değil, bir yol: en yakın somut kazanç + bağlam. */}
      <div className="sonraki-adim">
        <span className="etiket">Bir sonraki adım</span>
        <p className="hedef-cumlesi">{adim.ana}</p>
        {adim.ikincil && <p className="soluk">{adim.ikincil}</p>}
      </div>

      <div className="ilerleme-ozet">
        <div><b className="rakam">{profil.etkinlik_sayisi}</b><span className="etiket">Etkinlik</span></div>
        <div><b className="rakam">{profil.acik_sponsor}/{profil.toplam_sponsor}</b><span className="etiket">Kilit açık</span></div>
        <div><b className="rakam">{profil.aktif_odul}</b><span className="etiket">Bekleyen</span></div>
      </div>

    </section>
  );
}

export function Cuzdan({ liste, onGoster, onKesfet }: {
  liste: KazanimOzeti[] | null;
  onGoster: (id: string) => void;
  onKesfet: () => void;
}) {
  if (liste === null) return null;
  if (liste.length === 0) {
    return (
      <div className="bos gir">
        <Simge ad="hediye" boyut={28} />
        <b>Henüz ödülün yok.</b>
        <span>Kilidini açtığın bir sponsorun işletmesindeki QR'yi okuttuğunda ödülün burada belirir.</span>
        <button className="dugme cizgili" onClick={onKesfet}>Sponsorlara bak</button>
      </div>
    );
  }
  const gruplar: { ad: string; durum: KazanimOzeti["durum"][] }[] = [
    { ad: "Aktif", durum: ["aktif"] },
    { ad: "Kullanılmış", durum: ["kullanildi"] },
    { ad: "Süresi dolan", durum: ["suresi_doldu", "iptal"] },
  ];
  return (
    <>
      {gruplar.map((g) => {
        const ogeler = liste.filter((z) => g.durum.includes(z.durum));
        if (!ogeler.length) return null;
        return (
          <section key={g.ad}>
            <div className="bolum-basi"><span className="etiket">{g.ad}</span><span className="etiket rakam">{ogeler.length}</span></div>
            <ul className="cuzdan-listesi">
              {ogeler.map((z, i) => (
                <li key={z.id} className="cuzdan-ogesi gir" data-durum={z.durum} style={kademe(Math.min(i, 8))}>
                  <span className="cuzdan-ikon"><Simge ad={odulIkonu(z.ikon)} boyut={22} /></span>
                  <div className="cuzdan-bilgi">
                    <span className="etiket">{z.sponsor}</span>
                    <b>{z.baslik}</b>
                    {z.durum === "aktif" && sonKullanimEtiketi(z.son_kullanma) && (
                      <span className="son-kullanim rakam">{sonKullanimEtiketi(z.son_kullanma)}</span>
                    )}
                    <span className="soluk rakam">
                      Kazanıldı {tarih(z.zaman)}
                      {z.durum === "aktif" ? ` · Son kullanım ${tarih(z.son_kullanma)}` : ""}
                      {z.durum === "kullanildi" && z.kullanildi ? ` · Kullanıldı ${tarihSaat(z.kullanildi)}` : ""}
                    </span>
                  </div>
                  {z.durum === "aktif" ? (
                    <button className="dugme birincil" onClick={() => onGoster(z.id)}>Göster</button>
                  ) : (
                    <span className="etiket soluk">{z.durum === "kullanildi" ? "Kullanıldı" : "Süresi doldu"}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

export function Siralama({ veri, donem, onDonem, gizli, onGizlilik }: {
  veri: Liderlik | null;
  donem: Donem;
  onDonem: (d: Donem) => void;
  gizli: boolean;
  onGizlilik: (g: boolean) => void;
}) {
  if (!veri) return null;
  if (!veri.acik) {
    return <div className="bos gir"><Simge ad="grafik" boyut={28} /><b>Sıralama şu an kapalı.</b></div>;
  }
  // Eski veritabanı dönem bilmez: seçici gösterilmez, tablo tüm zamanlardır.
  const donemli = veri.donem !== undefined;
  const haftalik = donemli && veri.donem === "hafta";

  return (
    <section>
      {donemli && (
        <div className="secici donem-secici" role="tablist" aria-label="Sıralama dönemi"
             style={{ ["--secim" as string]: donem === "hafta" ? 0 : 1, ["--adet" as string]: 2 }}>
          <span className="secici-gosterge" aria-hidden="true" />
          <button type="button" role="tab" aria-selected={donem === "hafta"} onClick={() => onDonem("hafta")}>Bu hafta</button>
          <button type="button" role="tab" aria-selected={donem === "tum"} onClick={() => onDonem("tum")}>Tüm zamanlar</button>
        </div>
      )}

      {haftalik && (
        <p className="siralama-baglam soluk">
          {veri.topluluk && veri.topluluk.uye > 0 && (
            <>Bu hafta <b className="rakam">{veri.topluluk.uye}</b> üye toplam <b className="rakam">{sayi(veri.topluluk.xp)} XP</b> kazandı. </>
          )}
          Sıralama her pazartesi sıfırlanır.
        </p>
      )}

      {veri.liste.length === 0 ? (
        <div className="bos">
          <b>{haftalik ? "Bu hafta henüz puan kazanan yok." : "Sıralama henüz boş."}</b>
          <span>{haftalik ? "Haftanın ilk etkinliğinde QR'yi okutan listeye girer." : "İlk puanı alan listeye girer."}</span>
        </div>
      ) : (
        <ol className="siralama-listesi">
          {veri.liste.map((s) => (
            <li key={s.ad + s.sira} data-ben={s.ben} data-ilk={s.sira <= 3}>
              <span className="siralama-no rakam">{String(s.sira).padStart(2, "0")}</span>
              <span className="siralama-ad">@{s.ad}</span>
              <span className="etiket">{s.seviye}</span>
              <span className="rakam siralama-xp">{sayi(s.xp)} XP</span>
            </li>
          ))}
        </ol>
      )}
      {veri.ben.sira && !veri.liste.some((s) => s.ben) && (
        <p className="soluk siralama-ben">
          {veri.ben.gizli ? "Profilin gizli; bu bilgiyi yalnızca sen görüyorsun. " : ""}
          {haftalik ? "Bu haftaki sıran" : "Sıran"}: <b className="rakam">{veri.ben.sira}</b> · {sayi(veri.ben.xp)} XP
        </p>
      )}

      <label className="gizlilik-anahtari">
        <input type="checkbox" checked={gizli} onChange={(e) => onGizlilik(e.target.checked)} />
        <span>
          <b>Gizli profil</b>
          <span className="soluk">Açıkken adın sıralamada görünmez. Puanın ve ödüllerin etkilenmez.</span>
        </span>
      </label>
    </section>
  );
}

export function Gecmis({ profil }: { profil: Profil }) {
  if (profil.islemler.length === 0) {
    return <div className="bos gir"><Simge ad="liste" boyut={28} /><b>Macera burada başlıyor.</b><span>Kazandığın her puan burada listelenir.</span></div>;
  }
  return (
    <ul className="gecmis-listesi">
      {profil.islemler.map((i, n) => (
        <li key={n} className="gir" style={kademe(Math.min(n, 8))}>
          <span className="gecmis-tur" data-tur={i.tur}>
            <Simge ad={i.tur === "seri_bonusu" ? "alev" : i.tur === "yonetici" ? "kalkan" : i.tur === "not" ? "kitap" : "qr"} boyut={16} />
          </span>
          <div>
            <b>{i.aciklama}</b>
            <span className="soluk rakam">{tarihSaat(i.zaman)}{i.tur === "yonetici" ? " · yönetim" : ""}</span>
          </div>
          <span className={"rakam gecmis-miktar" + (i.miktar < 0 ? " eksi" : "")}>
            {i.miktar > 0 ? "+" : ""}{sayi(i.miktar)}
          </span>
        </li>
      ))}
    </ul>
  );
}
