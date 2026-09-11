-- ═══════════════════════════════════════════════════════════════════
-- İLK BAŞKANI ATA  +  KURULUM DURUMU SORGUSU
-- ═══════════════════════════════════════════════════════════════════
-- Supabase SQL editöründe bir kez çalıştırılır. Editör sunucu tarafında
-- çalıştığı için rol denetimi bu tek durumda atlanır (bkz. 01_sema.sql →
-- rol_degisimi_denetle). Web ve mobil istemciden bu yol KAPALIDIR.
--
-- Tekrar çalıştırmak zararsızdır.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. Başkanı ata ─────────────────────────────────────────────────
-- KULLANICI ADIYLA eşleştirir, e-postayla değil.
--
-- Neden: e-posta yazmak kolayca yanlış gidiyor. Kayıt olurken kullanılan
-- adres ile buraya yazılan adres farklı olursa UPDATE hiçbir satırı bulmaz
-- ve SESSİZCE hiçbir şey yapmaz — kullanıcı başkan olduğunu sanır, değildir.
-- Kullanıcı adı uygulamada gözünün önünde durduğu için bu hata olmaz.
-- Aşağıdaki satırda kendi kullanıcı adını yaz:

do $$
declare
  hedef_kullanici constant text := 'baskan';   -- ← kendi kullanıcı adın
  bulundu integer;
begin
  update public.profiller
  set rol = 'baskan'
  where kullanici_adi = lower(trim(hedef_kullanici));

  get diagnostics bulundu = row_count;

  if bulundu = 0 then
    raise exception
      'Kullanıcı bulunamadı: "%". Önce uygulamadan kayıt ol, sonra bu betiği '
      'çalıştır. Kayıtlı kullanıcı adlarını görmek için: '
      'select kullanici_adi from public.profiller;', hedef_kullanici;
  end if;

  raise notice 'Başkan atandı: %', hedef_kullanici;
end $$;


-- ── 2. Kurulum durumu sorgusu ──────────────────────────────────────
-- Kurulumun tamam olup olmadığını DIŞARIDAN anlamanın güvenli yolu.
-- Yalnızca SAYI döndürür: isim, e-posta, rol eşleşmesi vermez. Bu yüzden
-- anonim erişime açık olması sakıncasız; karşılığında kurulum sorunları
-- tahmin etmeden görülebiliyor.
create or replace function public.kurulum_durumu()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'uye_sayisi',      (select count(*) from public.profiller),
    'baskan_sayisi',   (select count(*) from public.profiller where rol = 'baskan'),
    'yonetici_sayisi', (select count(*) from public.profiller where rol = 'yonetici'),
    'mesaj_sayisi',    (select count(*) from public.mesajlar),
    'etkinlik_sayisi', (select count(*) from public.etkinlikler)
  );
$$;

revoke all on function public.kurulum_durumu() from public;
grant execute on function public.kurulum_durumu() to anon, authenticated;


-- ── 3. Sonucu göster ───────────────────────────────────────────────
select kullanici_adi, ad_soyad, rol, olusturuldu
from public.profiller
order by
  case rol when 'baskan' then 0 when 'yonetici' then 1 else 2 end,
  kullanici_adi;
