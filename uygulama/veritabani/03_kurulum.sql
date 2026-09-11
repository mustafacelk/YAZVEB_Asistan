-- ═══════════════════════════════════════════════════════════════════
-- İLK BAŞKANI ATA
-- ═══════════════════════════════════════════════════════════════════
-- Bir kez, Supabase SQL editöründe çalıştırılır. Editör sunucu tarafında
-- çalıştığı için rol denetimi bu tek durumda atlanır (bkz. 01_sema.sql →
-- rol_degisimi_denetle). Web ve mobil istemciden bu yol KAPALIDIR.
--
-- Aşağıdaki e-postayı kendi hesabınla değiştir, sonra çalıştır.
-- Önce uygulamadan normal şekilde kayıt olman gerekir.
-- ═══════════════════════════════════════════════════════════════════

update public.profiller
set rol = 'baskan'
where id = (select id from auth.users where email = 'mustafacelk042@gmail.com');

-- Kontrol: kim hangi rolde?
select kullanici_adi, ad_soyad, rol from public.profiller order by rol, kullanici_adi;
