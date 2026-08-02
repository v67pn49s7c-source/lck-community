-- ═══════════════════════════════════════════════════════
-- 로고 관리: 사이트 설정 테이블 + 이미지 저장소 (여러 번 실행해도 안전)
-- ═══════════════════════════════════════════════════════

-- 사이트 설정 (로고 버전 등)
create table if not exists site_settings (
  key text primary key,
  value text not null default ''
);
alter table site_settings enable row level security;
drop policy if exists "read_settings" on site_settings;
drop policy if exists "admin_write_settings" on site_settings;
create policy "read_settings" on site_settings for select using (true);
create policy "admin_write_settings" on site_settings for all to authenticated using (is_admin()) with check (is_admin());

-- 로고 이미지 저장소 (공개 읽기 · 관리자만 업로드)
insert into storage.buckets (id, name, public) values ('brand', 'brand', true)
on conflict (id) do nothing;

drop policy if exists "brand_admin_insert" on storage.objects;
drop policy if exists "brand_admin_update" on storage.objects;
drop policy if exists "brand_admin_delete" on storage.objects;
create policy "brand_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand' and is_admin());
create policy "brand_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'brand' and is_admin());
create policy "brand_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'brand' and is_admin());
