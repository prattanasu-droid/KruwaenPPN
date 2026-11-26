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
