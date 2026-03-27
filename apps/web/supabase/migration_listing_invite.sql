-- 发起竞猜：listings 扩展字段 + 插入策略 + 按地址匹配
-- 在 Supabase SQL Editor 执行（已有库可重复执行）

alter table public.listings
  add column if not exists realestate_id text,
  add column if not exists domain_id text,
  add column if not exists suggest_price integer,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

create index if not exists listings_realestate_id_idx on public.listings (realestate_id) where realestate_id is not null;
create index if not exists listings_domain_id_idx on public.listings (domain_id) where domain_id is not null;
create index if not exists listings_created_by_idx on public.listings (created_by) where created_by is not null;

create unique index if not exists listings_realestate_id_uniq on public.listings (realestate_id) where realestate_id is not null;
create unique index if not exists listings_domain_id_uniq on public.listings (domain_id) where domain_id is not null;

comment on column public.listings.realestate_id is 'realestate.com.au 房源数字 ID，如 URL 末尾 150430832';
comment on column public.listings.domain_id is 'domain.com.au 路径前缀数字 ID';
comment on column public.listings.suggest_price is '爬取到的指导价/隐藏价提示（AUD，整数）';
comment on column public.listings.created_by is '发起竞猜的用户（auth.users.id）';

-- 按规范化地址匹配一条 listing（供 API 使用）
create or replace function public.match_listing_address(p_address text)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select l.id
  from public.listings l
  where l.address is not null
    and length(trim(p_address)) > 0
    and regexp_replace(lower(trim(l.address)), '\s+', ' ', 'g')
      = regexp_replace(lower(trim(p_address)), '\s+', ' ', 'g')
  limit 1;
$$;

grant execute on function public.match_listing_address(text) to anon, authenticated;

-- 允许已登录用户插入自己发起的房源
drop policy if exists "listings_insert_creator" on public.listings;
create policy "listings_insert_creator"
on public.listings
for insert
to authenticated
with check (created_by is not null and auth.uid() = created_by);
