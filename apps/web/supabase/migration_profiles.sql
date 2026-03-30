-- Profiles 公开展示（Feed 昵称/头像）— 已在库中的项目请在本文件上一次性执行（Dashboard SQL Editor）。
-- 新环境可继续用 schema.sql + rls.sql；本文件含 auth 触发器与历史用户回填。

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  avatar_url text,
  updated_at timestamptz not null default now()
);

create index if not exists profiles_updated_at_idx on public.profiles (updated_at desc);

alter table public.profiles enable row level security;

drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all"
on public.profiles for select to anon, authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 新用户注册时写入 profiles（security definer，绕过 RLS）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Player'
    ),
    nullif(trim(coalesce(
      new.raw_user_meta_data->>'picture',
      new.raw_user_meta_data->>'avatar_url'
    )), '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
-- Postgres 11+ 若报错可改为：for each row execute function public.handle_new_user();
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 可选：把已有 auth 用户回填到 profiles（执行一次即可）
insert into public.profiles (user_id, display_name, avatar_url)
select
  id,
  coalesce(
    nullif(trim(raw_user_meta_data->>'full_name'), ''),
    nullif(trim(raw_user_meta_data->>'name'), ''),
    nullif(split_part(email, '@', 1), ''),
    'Player'
  ),
  nullif(trim(coalesce(
    raw_user_meta_data->>'picture',
    raw_user_meta_data->>'avatar_url'
  )), '')
from auth.users
on conflict (user_id) do nothing;
