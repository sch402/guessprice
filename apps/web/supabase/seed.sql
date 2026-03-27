-- Guess the Price AU - Seed data (2 real upcoming auctions)
-- 运行方式：复制本文件内容到 Supabase SQL Editor 执行。

-- 0) 兼容已创建但缺列的情况（安全：只在缺失时添加）
alter table public.listings
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- 1) 插入两条真实房源（如重复执行，会按 source_url 去重更新）
insert into public.listings (
  source,
  source_url,
  title,
  address,
  suburb,
  state,
  postcode,
  latitude,
  longitude,
  auction_at,
  cover_image_url,
  status,
  updated_at
)
values
(
  'realestate',
  'https://www.realestate.com.au/property-house-nsw-castle+hill-150354896',
  '3 Wren Court, Castle Hill NSW 2154',
  '3 Wren Court, Castle Hill, NSW 2154',
  'Castle Hill',
  'NSW',
  '2154',
  -33.72108907317204,
  151.02987825452627,
  '2026-03-21 11:00:00+11',
  'https://i2.au.reastatic.net/1000x750-format=webp/258f51b8f4afb5708dab3e115df24a37da848686bf73bb64526441d99b64adc4/image.jpg',
  'upcoming',
  now()
),
(
  'realestate',
  'https://www.realestate.com.au/property-house-nsw-killara-150427448',
  '6 Norfolk Street, Killara NSW 2071',
  '6 Norfolk Street, Killara, NSW 2071',
  'Killara',
  'NSW',
  '2071',
  -33.76797947326012,
  151.15227825468878,
  '2026-03-28 15:00:00+11',
  'https://i2.au.reastatic.net/1000x750-format=webp/6804be535bbe4bb67241ff23dfdd3128a72a99bac0ad171d395e38bff7205041/image.jpg',
  'upcoming',
  now()
)
on conflict (source_url)
do update set
  title = excluded.title,
  address = excluded.address,
  suburb = excluded.suburb,
  state = excluded.state,
  postcode = excluded.postcode,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  auction_at = excluded.auction_at,
  cover_image_url = excluded.cover_image_url,
  status = excluded.status,
  updated_at = now();

