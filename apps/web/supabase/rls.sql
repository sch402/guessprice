-- Guess the Price AU - MVP RLS policies
-- 运行方式：复制本文件内容到 Supabase SQL Editor 执行（在 schema.sql 之后）。

-- Enable RLS
alter table public.listings enable row level security;
alter table public.votes enable row level security;
alter table public.auction_outcomes enable row level security;
alter table public.profiles enable row level security;

-- Public read access (MVP)
drop policy if exists "listings_read_all" on public.listings;
create policy "listings_read_all"
on public.listings
for select
to anon, authenticated
using (true);

drop policy if exists "outcomes_read_all" on public.auction_outcomes;
create policy "outcomes_read_all"
on public.auction_outcomes
for select
to anon, authenticated
using (true);

drop policy if exists "votes_read_all" on public.votes;
create policy "votes_read_all"
on public.votes
for select
to anon, authenticated
using (true);

-- Profiles：公开展示信息，全员可读；仅本人可插入/更新（客户端同步会话）
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all"
on public.profiles
for select
to anon, authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Votes write: only authenticated users, only their own rows
drop policy if exists "votes_insert_own" on public.votes;
create policy "votes_insert_own"
on public.votes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "votes_update_own" on public.votes;
create policy "votes_update_own"
on public.votes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Listings：已登录用户可插入自己发起的房源（发起竞猜）
drop policy if exists "listings_insert_creator" on public.listings;
create policy "listings_insert_creator"
on public.listings
for insert
to authenticated
with check (created_by is not null and auth.uid() = created_by);

