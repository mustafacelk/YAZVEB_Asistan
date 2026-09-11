-- ═══════════════════════════════════════════════════════════════════
-- YAZVEB Topluluk — satır düzeyi güvenlik (RLS)
-- ═══════════════════════════════════════════════════════════════════
--
-- Buradaki kurallar uygulamanın GERÇEK yetki sistemidir. Arayüzdeki
-- "düğmeyi gizle" kontrolleri yalnızca görgü kuralıdır; asıl kapı burası.
--
-- Her tabloda RLS AÇIK. Politika yoksa erişim yok — varsayılan reddir.
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiller   enable row level security;
alter table public.mesajlar    enable row level security;
alter table public.etkinlikler enable row level security;


-- ── PROFİLLER ──────────────────────────────────────────────────────
-- Herkes birbirinin adını ve rolünü görebilir (sohbette kim kim belli olsun).
drop policy if exists profil_oku on public.profiller;
create policy profil_oku on public.profiller
  for select to authenticated
  using (true);

-- Kendi profilini düzenleyebilir. Rol değişimi ayrıca tetikleyiciyle
-- engellenir; başkan başkasının profilini de güncelleyebilsin diye
-- politika iki durumu da kapsar.
drop policy if exists profil_guncelle on public.profiller;
create policy profil_guncelle on public.profiller
  for update to authenticated
  using (id = auth.uid() or public.baskan_mi())
  with check (id = auth.uid() or public.baskan_mi());

-- Profil ekleme yalnızca tetikleyiciyle (security definer) olur; istemciden
-- doğrudan profil yaratılamaz. Silme de yok: hesap silinince zincirleme gider.


-- ── SOHBET ─────────────────────────────────────────────────────────
-- Genel grup: giriş yapan herkes okur.
drop policy if exists mesaj_oku on public.mesajlar;
create policy mesaj_oku on public.mesajlar
  for select to authenticated
  using (true);

-- Herkes yazabilir. Yazar alanı tetikleyicide zorlanır; buradaki koşul
-- ikinci bir emniyet.
drop policy if exists mesaj_yaz on public.mesajlar;
create policy mesaj_yaz on public.mesajlar
  for insert to authenticated
  with check (yazar = auth.uid());

-- Kendi mesajını herkes silebilir; başkasınınkini yalnızca yetkililer.
drop policy if exists mesaj_sil on public.mesajlar;
create policy mesaj_sil on public.mesajlar
  for delete to authenticated
  using (yazar = auth.uid() or public.yetkili_mi());

-- Mesaj düzenleme yok: sohbette geçmişi değiştirmek kötüye kullanıma açık.


-- ── ETKİNLİKLER ────────────────────────────────────────────────────
-- Takvimi herkes görür.
drop policy if exists etkinlik_oku on public.etkinlikler;
create policy etkinlik_oku on public.etkinlikler
  for select to authenticated
  using (true);

-- Yalnızca yönetici ve başkan etkinlik ekler.
drop policy if exists etkinlik_ekle on public.etkinlikler;
create policy etkinlik_ekle on public.etkinlikler
  for insert to authenticated
  with check (public.yetkili_mi());

-- İSTENEN KURALIN KALBİ:
-- Başkan her etkinliği düzenler. Yönetici yalnızca başkanın DOKUNMADIĞI
-- etkinlikleri düzenleyebilir. baskan_kilidi alanını istemci ayarlayamaz
-- (tetikleyici yönetir), dolayısıyla yönetici kilidi kaldırıp kaydı ele
-- geçiremez.
drop policy if exists etkinlik_duzenle on public.etkinlikler;
create policy etkinlik_duzenle on public.etkinlikler
  for update to authenticated
  using (public.baskan_mi() or (public.yetkili_mi() and not baskan_kilidi))
  with check (public.baskan_mi() or (public.yetkili_mi() and not baskan_kilidi));

drop policy if exists etkinlik_sil on public.etkinlikler;
create policy etkinlik_sil on public.etkinlikler
  for delete to authenticated
  using (public.baskan_mi() or (public.yetkili_mi() and not baskan_kilidi));


-- ── GERÇEK ZAMANLI YAYIN ───────────────────────────────────────────
-- Sohbetin anlık akması için tablo yayına eklenir. Realtime da RLS'e
-- uyar: kullanıcı yalnızca görmeye yetkili olduğu satırları alır.
do $$ begin
  alter publication supabase_realtime add table public.mesajlar;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.etkinlikler;
exception when duplicate_object then null;
end $$;


-- ── Şema ayrıcalıkları ─────────────────────────────────────────────
-- Supabase bunları yeni tablolar için zaten varsayılan olarak verir; yine de
-- açıkça yazılır. RLS bunların üstünde çalışır: ayrıcalık "tabloya
-- bakabilirsin", politika "hangi satırı" der. İkisi birlikte gerekir.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiller   to authenticated;
grant select, insert, delete                on public.mesajlar    to authenticated;
grant select, insert, update, delete on public.etkinlikler to authenticated;
grant usage, select on all sequences in schema public to authenticated;
