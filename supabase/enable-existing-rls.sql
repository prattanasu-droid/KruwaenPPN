-- สำหรับฐานข้อมูลเดิมที่มีนโยบายสิทธิ์ตาม schema.sql อยู่แล้ว
-- ผู้ใช้อนุญาตให้เปิด RLS ตามนโยบายเดิมเมื่อ 26 พฤศจิกายน 2569
-- ไม่แก้ไขหรือลบรายการสื่อและบัญชีแอดมิน
begin;
alter table public.admin_users enable row level security;
alter table public.media enable row level security;
commit;
