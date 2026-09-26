-- ═══════════════════════════════════════════════════════════════════
-- YAZVEB COMMUNITY REWARDS — ödülün işletme tarafında doğrulanması
-- ═══════════════════════════════════════════════════════════════════
-- 05_oduller.sql'den SONRA çalıştırılır. Tekrar çalıştırmak zararsızdır.
--
-- NEDEN
-- ─────
-- Önceki akışta çalışan PIN'ini ÖĞRENCİNİN telefonuna giriyor, "Kullanıldı"
-- yazısını da yine o telefonda görüyordu. O ekran öğrencinin elindeki
-- cihazda çiziliyor: sunucuya hiç sormayan sahte bir sayfa aynı görüntüyü
-- verebilir, aynı ödül defalarca alınabilirdi. Dönen doğrulama kodu da
-- çalışanın kendi başına denetleyebileceği bir şey değildi.
--
-- Artık onay ÇALIŞANIN cihazında: <site>/isletme sayfası öğrencinin
-- ekranındaki ödül kodunu (QR ya da yazarak) ve işletme PIN'ini alır,
-- sonucu doğrudan sunucudan gösterir. Öğrencinin ekranında ne yazdığının
-- önemi kalmaz.
--
-- Çalışanın hesabı yok; fonksiyon anonim çağrılır. Bu yüzden:
--   - kod ya da PIN yanlışsa cevap aynıdır ("gecersiz"): hangisinin yanlış
--     olduğu, kodun var olup olmadığı söylenmez
--   - kod yoksa da bir bcrypt yapılır: süreden varlık okunmaz
--   - hatalı deneme sınırı (15 dakikada): kaynak IP başına 10, ödül kodu
--     başına 5, sponsor başına 30 — PIN'i birçok koda dağıtarak denemeye karşı
--   - başarılı doğrulamalar sayılmaz: yoğun kasada çalışan kilitlenmez
--   - ödül başka sponsora aitse o sponsorun PIN'i gerekir; Coffee Lab
--     çalışanı Kitapçı'nın ödülünü kullanılmış işaretleyemez
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.isletme_odul_dogrula(
  p_kod text, p_pin text, p_kullan boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, odul, extensions
as $$
declare
  v_kod      text := upper(regexp_replace(coalesce(p_kod, ''), '[^A-Za-z0-9]', '', 'g'));
  v_ip       text := public.istek_ip_ozeti();
  v_z        odul.kazanimlar;
  v_sponsor  uuid;
  v_ozet     text;
  v_adres    text;
  v_ip_hata  integer;
  v_kod_hata integer;
  v_sp_hata  integer;
  -- Var olmayan kod için sabit bir bcrypt özeti (hiçbir PIN'le eşleşmez).
  sahte constant text := '$2a$10$Vq3ZPpF5f1cY0T4Qv9nH6uQe7yH0f1cY0T4Qv9nH6uQe7yH0f1cYa';
begin
  -- Öğrencinin QR'si "YAZVEB:K:ABCD-EFG"; elle "abcd efg", "ABCD-EFG" yazılabilir.
  if v_kod like 'YAZVEBK%' then v_kod := substr(v_kod, 8); end if;
  if v_kod !~ '^[A-Z0-9]{7}$' or p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    return jsonb_build_object('durum', 'gecersiz');
  end if;
  v_kod := left(v_kod, 4) || '-' || right(v_kod, 3);

  select count(*) filter (where anahtar = 'isletme_ip:' || v_ip),
         count(*) filter (where anahtar = 'isletme_kod:' || v_kod)
    into v_ip_hata, v_kod_hata
  from public.giris_denemeleri
  where anahtar in ('isletme_ip:' || v_ip, 'isletme_kod:' || v_kod)
    and zaman > now() - interval '15 minutes';
  if v_ip_hata >= 10 or v_kod_hata >= 5 then
    perform public.olay_yaz('isletme_kilidi', null, jsonb_build_object(
      'ip', v_ip, 'neden', case when v_kod_hata >= 5 then 'kod' else 'ip' end));
    return jsonb_build_object('durum', 'sinir');
  end if;

  -- Satır kilidi: aynı ödül iki kasada aynı anda onaylanamaz.
  select * into v_z from odul.kazanimlar where kod = v_kod for update;
  if found then
    select s.id, s.pin_ozet, s.adres into v_sponsor, v_ozet, v_adres
    from odul.kampanyalar k join odul.sponsorlar s on s.id = k.sponsor_id
    where k.id = v_z.kampanya_id;

    select count(*) into v_sp_hata from public.giris_denemeleri
    where anahtar = 'isletme_sponsor:' || v_sponsor and zaman > now() - interval '15 minutes';
    if v_sp_hata >= 30 then
      perform public.olay_yaz('isletme_kilidi', null, jsonb_build_object('ip', v_ip, 'neden', 'sponsor'));
      return jsonb_build_object('durum', 'sinir');
    end if;
  end if;

  if v_ozet is null then
    perform extensions.crypt(p_pin, sahte);            -- zamanlamayı eşitle
  end if;
  if v_ozet is null or extensions.crypt(p_pin, v_ozet) <> v_ozet then
    insert into public.giris_denemeleri (anahtar)
    values ('isletme_ip:' || v_ip), ('isletme_kod:' || v_kod);
    if v_sponsor is not null then
      insert into public.giris_denemeleri (anahtar) values ('isletme_sponsor:' || v_sponsor);
    end if;
    perform public.olay_yaz('isletme_basarisiz', null, jsonb_build_object('ip', v_ip));
    return jsonb_build_object('durum', 'gecersiz');
  end if;

  -- Kod ve PIN doğru: bu noktadan sonra ayrıntı vermek güvenli.
  if v_z.iptal is not null then
    return jsonb_build_object('durum', 'iptal', 'kod', v_kod, 'sponsor', v_z.sponsor_ad,
                              'baslik', v_z.odul_baslik, 'ikon', v_z.odul_ikon);
  end if;
  if v_z.kullanildi is not null then
    return jsonb_build_object('durum', 'zaten_kullanildi', 'zaman', v_z.kullanildi, 'kod', v_kod,
                              'sponsor', v_z.sponsor_ad, 'baslik', v_z.odul_baslik, 'ikon', v_z.odul_ikon);
  end if;
  if v_z.son_kullanma <= now() then
    return jsonb_build_object('durum', 'suresi_doldu', 'son_kullanma', v_z.son_kullanma, 'kod', v_kod,
                              'sponsor', v_z.sponsor_ad, 'baslik', v_z.odul_baslik, 'ikon', v_z.odul_ikon);
  end if;

  if coalesce(p_kullan, false) then
    update odul.kazanimlar set kullanildi = now() where id = v_z.id returning * into v_z;
    insert into odul.denetim (yapan, islem, hedef, ayrinti)
    values (null, 'odul_isletmede_kullanildi', 'kazanim:' || v_z.id, jsonb_build_object('ip', v_ip));
    return jsonb_build_object('durum', 'kullanildi', 'zaman', v_z.kullanildi, 'kod', v_kod,
                              'sponsor', v_z.sponsor_ad, 'baslik', v_z.odul_baslik,
                              'aciklama', v_z.odul_aciklama, 'ikon', v_z.odul_ikon);
  end if;

  return jsonb_build_object(
    'durum', 'gecerli', 'kod', v_kod,
    'sponsor', v_z.sponsor_ad, 'baslik', v_z.odul_baslik, 'aciklama', v_z.odul_aciklama,
    'tur', v_z.odul_tur, 'ikon', v_z.odul_ikon, 'zaman', v_z.zaman,
    'son_kullanma', v_z.son_kullanma, 'adres', v_adres);
end $$;

-- Çalışanın hesabı olmadığı için anonim çağrılabilir; kararın tamamı yukarıda.
revoke all on function public.isletme_odul_dogrula(text, text, boolean) from public;
grant execute on function public.isletme_odul_dogrula(text, text, boolean) to anon, authenticated;
