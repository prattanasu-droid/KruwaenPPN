-- สำหรับโปรเจกต์ใหม่: รันใน Supabase SQL Editor
-- ไม่เก็บรหัสผ่านในตารางนี้ ใช้ Supabase Authentication
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
grant select on public.admin_users to authenticated;
drop policy if exists "Read own admin membership" on public.admin_users;
create policy "Read own admin membership" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 150),
  type text not null check (type in ('ใบงาน','สไลด์การสอน','เกมการเรียนรู้','วิดีโอ','สื่อสร้างสรรค์')),
  subject text not null check (subject in ('ภาษาไทย','คณิตศาสตร์','วิทยาศาสตร์','ภาษาอังกฤษ','สังคมศึกษา','ศิลปะ','การงานอาชีพ','สุขศึกษา','ประวัติศาสตร์','หน้าที่พลเมือง')),
  grade text not null check (grade in ('อนุบาล 1','อนุบาล 2','อนุบาล 3','ป.1','ป.2','ป.3','ป.4','ป.5','ป.6','ม.1','ม.2','ม.3','ม.4','ม.5','ม.6')),
  description text not null check (char_length(trim(description)) between 1 and 2000),
  image text not null check (image ~* '^https?://[^[:space:]]+$'),
  url text not null check (char_length(url) <= 2048 and url ~* '^https?://[^[:space:]]+$'),
  featured boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists media_subject_grade_idx on public.media (subject,grade);
create index if not exists media_type_idx on public.media (type);
create index if not exists media_created_at_idx on public.media (created_at desc);
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists media_set_updated_at on public.media;
create trigger media_set_updated_at before update on public.media
  for each row execute function public.set_updated_at();

alter table public.media enable row level security;
grant select on public.media to anon,authenticated;
grant insert,update,delete on public.media to authenticated;
drop policy if exists "Visitors can read media" on public.media;
create policy "Visitors can read media" on public.media
  for select to anon,authenticated using (true);
drop policy if exists "Admins can insert media" on public.media;
create policy "Admins can insert media" on public.media for insert to authenticated
  with check (created_by=(select auth.uid()) and exists (select 1 from public.admin_users where user_id=(select auth.uid())));
drop policy if exists "Admins can update media" on public.media;
create policy "Admins can update media" on public.media for update to authenticated
  using (exists (select 1 from public.admin_users where user_id=(select auth.uid())))
  with check (exists (select 1 from public.admin_users where user_id=(select auth.uid())));
drop policy if exists "Admins can delete media" on public.media;
create policy "Admins can delete media" on public.media for delete to authenticated
  using (exists (select 1 from public.admin_users where user_id=(select auth.uid())));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('media-covers','media-covers',true,20971520,array['image/jpeg'])
on conflict (id) do update set public=excluded.public,
  file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Visitors can read covers" on storage.objects;
create policy "Visitors can read covers" on storage.objects
  for select to anon,authenticated using (bucket_id='media-covers');
drop policy if exists "Admins can upload JPG covers" on storage.objects;
create policy "Admins can upload JPG covers" on storage.objects for insert to authenticated
  with check (bucket_id='media-covers' and name ~* '\.jpe?g$'
    and exists (select 1 from public.admin_users where user_id=(select auth.uid())));
drop policy if exists "Admins can update JPG covers" on storage.objects;
create policy "Admins can update JPG covers" on storage.objects for update to authenticated
  using (bucket_id='media-covers' and exists (select 1 from public.admin_users where user_id=(select auth.uid())))
  with check (bucket_id='media-covers' and name ~* '\.jpe?g$'
    and exists (select 1 from public.admin_users where user_id=(select auth.uid())));
drop policy if exists "Admins can delete covers" on storage.objects;
create policy "Admins can delete covers" on storage.objects for delete to authenticated
  using (bucket_id='media-covers' and exists (select 1 from public.admin_users where user_id=(select auth.uid())));

-- เปิด Supabase → SQL Editor → New query แล้วรันไฟล์นี้ทั้งไฟล์
-- เพิ่มสถิติการเข้าใช้ โดยไม่แก้ไขรายการสื่อ ภาพ หรือลิงก์เดิม
-- รันซ้ำได้โดยยอดที่นับไว้แล้วไม่ถูกล้าง
begin;

create table if not exists public.media_usage (
  media_id uuid primary key references public.media(id) on delete cascade,
  click_count bigint not null default 0 check (click_count >= 0),
  last_clicked_at timestamptz
);

alter table public.media_usage enable row level security;
revoke all on table public.media_usage from public, anon, authenticated;
grant select on table public.media_usage to anon, authenticated;

drop policy if exists "Visitors can read media usage" on public.media_usage;
create policy "Visitors can read media usage" on public.media_usage
  for select to anon, authenticated using (true);

-- เพิ่มยอดในฐานข้อมูลโดยตรง ป้องกันยอดหายเมื่อมีคนกดพร้อมกัน
-- ผู้ชมเรียกได้เฉพาะการเพิ่มทีละ 1 ไม่สามารถตั้งค่า ล้าง หรือลดยอดเอง
create or replace function public.record_media_click(p_media_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_count bigint;
begin
  insert into public.media_usage (media_id, click_count, last_clicked_at)
    select id, 1, now() from public.media where id = p_media_id
  on conflict (media_id) do update
    set click_count = public.media_usage.click_count + 1,
        last_clicked_at = excluded.last_clicked_at
  returning click_count into new_count;

  if new_count is null then
    raise exception 'Media not found' using errcode = 'P0002';
  end if;
  return new_count;
end;
$$;

revoke all on function public.record_media_click(uuid) from public;
grant execute on function public.record_media_click(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
