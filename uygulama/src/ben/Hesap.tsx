import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "../veri/supabase";
import { useGorunum, useOturum } from "../veri/oturum";
import Simge from "../tasarim/Simge";

/**
 * Ben dünyasının hesap parçaları: görünen ad, açılış görünümü (yetkili),
 * verilerin nasıl kullanıldığı. Eskiden Topluluk'ta açılan bir penceredeydi.
 */

/** Görünen ad: serbest metin; benzersiz kullanıcı adı her yerde yanında gösterilir. */
export function ProfilFormu() {
  const { profil, profiliTazele } = useOturum();
  const [adSoyad, setAdSoyad] = useState(profil?.ad_soyad ?? "");
  const [kaydedildi, setKaydedildi] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => { setAdSoyad(profil?.ad_soyad ?? ""); }, [profil?.ad_soyad]);

  async function kaydet() {
    if (!profil) return;
    setHata(null);
    const { error } = await supabase.from("profiller").update({ ad_soyad: adSoyad.trim() || null }).eq("id", profil.id);
    if (error) {
      setHata(error.code === "23514"
        ? "Görünen ad desteklenmeyen karakter içeriyor (60 karakter, görünmez karakter yok)."
        : "Kaydedilemedi.");
      return;
    }
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 2000);
    await profiliTazele();
  }

  const degisti = (adSoyad.trim() || null) !== (profil?.ad_soyad ?? null);
  return (
    <form className="yigin" onSubmit={(e) => { e.preventDefault(); kaydet(); }}>
      <label className="alan">
        <span className="etiket">Görünen ad</span>
        <input className="girdi" value={adSoyad} onChange={(e) => setAdSoyad(e.target.value)}
               maxLength={60} placeholder="Ad soyad" autoComplete="name" />
      </label>
      <p className="soluk kucuk-metin">Kullanıcı adın <b>@{profil?.kullanici_adi}</b> değişmez; sohbette ve sıralamada adının yanında görünür.</p>
      {hata && <p className="bildirim" role="alert">{hata}</p>}
      <div>
        <button type="submit" className="dugme birincil" disabled={!degisti && !kaydedildi}>
          {kaydedildi ? "Kaydedildi" : "Kaydet"}
        </button>
      </div>
    </form>
  );
}

/** Yetkiliye: uygulama üye mi yönetim mi görünümüyle açılsın. Yetki değişmez. */
export function GorunumSecici() {
  const { gorunum, gorunumSec } = useGorunum();
  return (
    <div className="alan">
      <span className="etiket">Açılış görünümü</span>
      <div className="secici" role="tablist" aria-label="Görünüm"
           style={{ "--secim": gorunum === "yonetim" ? 1 : 0 } as CSSProperties}>
        <span className="secici-gosterge" aria-hidden="true" />
        <button type="button" role="tab" aria-selected={gorunum === "uye"} onClick={() => gorunumSec("uye")}>Üye</button>
        <button type="button" role="tab" aria-selected={gorunum === "yonetim"} onClick={() => gorunumSec("yonetim")}>Yönetim</button>
      </div>
      <span className="soluk kucuk-metin">Yetkin değişmez; yalnızca hangi ekranların önce geleceği.</span>
    </div>
  );
}

/**
 * Verilerin nerede ve ne için — hukuk metni değil, düz cümleler.
 *
 * Buradaki her cümle koda karşı doğrulandı: kamera görüntüsü cihazda
 * çözülür (odul/qr.ts), konum yalnızca karşılaştırılır ve yazılmaz
 * (odul_gorev_tamamla), IP yalnızca kısaltılmış özet olarak ve hız sınırı
 * için tutulur (istek_ip_ozeti, 24 saat / 30 gün), asistan soruları
 * saklanmaz. Kod değişirse bu metin de değişmeli.
 */
export function VeriOzeti({ acik = false }: { acik?: boolean }) {
  return (
    <details className="veri-ozeti" open={acik}>
      <summary>
        <Simge ad="kalkan" boyut={16} />
        <span>Verilerin nasıl kullanılıyor?</span>
      </summary>
      <ul>
        <li><b>Hesap:</b> kullanıcı adı, e-posta ve istersen görünen adın. Başka kişisel bilgi istemiyoruz.</li>
        <li><b>Kamera:</b> QR kodu telefonunda okunur. Görüntü kaydedilmez, hiçbir yere gönderilmez.</li>
        <li><b>Konum:</b> yalnızca konum şartlı bir görevde, o an etkinlik alanında olup olmadığını kontrol etmek için kullanılır. Kaydedilmez.</li>
        <li><b>Puan ve ödüller:</b> kazandığın her puan ve ödül hesabında kayıtlı; Ben › İlerleme ve puan geçmişi'nde hepsini görebilirsin. Ödülü onaylayan işletme çalışanı yalnızca ödülün kodunu ve adını görür; adın ve hesabın ona gösterilmez.</li>
        <li><b>Sıralama:</b> yalnızca kullanıcı adın görünür. Gizli profili açarak tamamen çıkabilirsin.</li>
        <li><b>Asistan:</b> sorun, yanıt üretmek için yapay zekâ servisine gönderilir; YAZVEB soruları saklamaz. Etkinlik sorarsan uygulamadaki yaklaşan etkinlikler, puanını sorarsan yalnızca puanın ve seviyen yanıta eklenir; adın ve e-postan gönderilmez. Sesli yanıt açıksa yanıt metni seslendirme servisine gider.</li>
        <li><b>Sohbet:</b> genel sohbetteki mesajlar topluluk üyelerine görünür ve saklanır. Kendi mesajını silebilirsin. Birkaç üye şikayet ederse mesaj yönetim inceleyene kadar gizlenir.</li>
        <li><b>Öğrenci doğrulama:</b> üniversite e-postan yalnızca kodu göndermek için kullanılır ve saklanmaz. Hesabında kalan: üniversiten (alan adından), doğrulama tarihi ve adresin geri çevrilemeyen bir özeti (aynı adres iki hesabı doğrulamasın diye). Bölüm ve sınıf senin beyanın. Ben › Öğrenci kimliği'nden doğrulamayı kaldırabilirsin.</li>
        <li><b>Notlar:</b> paylaştığın dosya, künyesi ve kullanıcı adın (gizli profilde adsız) diğer üyelere görünür; dosyayı yalnızca doğrulanmış öğrenciler açabilir. Kimin hangi notu açtığı başkasına gösterilmez; yalnızca toplam sayı. Notunu kaldırınca dosya da silinir.</li>
        <li><b>Güvenlik:</b> kötüye kullanımı sınırlamak için IP adresinin geri çevrilemeyen kısa bir özeti en fazla 30 gün tutulur.</li>
      </ul>
      <p className="soluk">Verilerini satmıyoruz, reklam için kullanmıyoruz. Hesabının silinmesini istersen YAZVEB yönetimine yaz.</p>
    </details>
  );
}
