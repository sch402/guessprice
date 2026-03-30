-- Guess the Price AU - MVP schema (Postgres / Supabase)
-- 运行方式：复制本文件内容到 Supabase SQL Editor 执行。

-- 1) Listings（房源）
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',
  source_url text,
  title text not null,
  address text,
  suburb text,
  state text,
  postcode text,
  latitude double precision,
  longitude double precision,
  auction_at timestamptz,
  cover_image_url text,
  realestate_id text,
  domain_id text,
  suggest_price integer,
  created_by uuid references auth.users (id) on delete set null,
  status text not null default 'upcoming',
  -- 拍卖结束后回填的真实成交价与售出时间（可为空）
  sold_price integer,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_auction_at_idx on public.listings (auction_at desc);
create unique index if not exists listings_source_url_uniq on public.listings (source_url);
create unique index if not exists listings_realestate_id_uniq on public.listings (realestate_id) where realestate_id is not null;
create unique index if not exists listings_domain_id_uniq on public.listings (domain_id) where domain_id is not null;

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

-- 2) Votes（每用户每房源一票，可更新）
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  user_id uuid not null,
  will_sell boolean not null,
  sold_price_aud integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint votes_sold_price_non_negative check (sold_price_aud is null or sold_price_aud >= 0),
  constraint votes_user_listing_unique unique (listing_id, user_id)
);

create index if not exists votes_listing_id_idx on public.votes (listing_id);
create index if not exists votes_user_id_idx on public.votes (user_id);
create index if not exists votes_updated_at_desc_idx on public.votes (updated_at desc);

-- 2b) Profiles（公开展示名与头像，同步自 Auth；供 Feed 等匿名读取，避免占位符 ID）
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  avatar_url text,
  updated_at timestamptz not null default now()
);

create index if not exists profiles_updated_at_idx on public.profiles (updated_at desc);

-- 3) Outcomes（拍卖真实结果）
create table if not exists public.auction_outcomes (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  sold boolean not null,
  sold_price_aud integer,
  source_url text,
  updated_at timestamptz not null default now(),
  constraint outcomes_sold_price_non_negative check (sold_price_aud is null or sold_price_aud >= 0)
);

