import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 禁止任何层缓存本 API 响应（供仍使用本路由的客户端）。**Feed 页面已直连 Supabase，默认不再依赖本路径。**
 */
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
} as const;

type ListingRow = {
  id: string;
  title: string;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  cover_image_url: string | null;
  auction_at: string | null;
};

type VoteRow = {
  id: string;
  user_id: string;
  listing_id: string;
  sold_price_aud: number | null;
  will_sell: boolean;
  updated_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
};

/**
 * 组装 Feed JSON（调试/第三方）；逻辑与 `lib/loadFeedFromSupabase.ts` 对齐，数据源为 Supabase。
 */
async function buildFeedResponse(): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { error: 'Server is not configured with Supabase environment variables.' },
      { status: 500, headers: { ...NO_STORE_HEADERS } }
    );
  }

  const dbKey = serviceKey ?? anonKey;
  const db = createClient(url, dbKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: voteRows, error: voteError } = await db
    .from('votes')
    .select('id, user_id, listing_id, sold_price_aud, will_sell, updated_at')
    .order('updated_at', { ascending: false })
    .limit(10);

  if (voteError) {
    return NextResponse.json({ error: voteError.message }, { status: 400, headers: { ...NO_STORE_HEADERS } });
  }

  const votes = (voteRows ?? []) as VoteRow[];
  const listingIds = Array.from(new Set(votes.map(v => v.listing_id).filter(Boolean)));

  const listingById = new Map<string, ListingRow>();
  if (listingIds.length > 0) {
    const { data: listingRows, error: listingError } = await db
      .from('listings')
      .select('id, title, suburb, state, postcode, cover_image_url, auction_at')
      .in('id', listingIds);

    if (listingError) {
      return NextResponse.json({ error: listingError.message }, { status: 400, headers: { ...NO_STORE_HEADERS } });
    }

    for (const row of (listingRows ?? []) as ListingRow[]) {
      listingById.set(row.id, row);
    }
  }

  const userIds = Array.from(new Set(votes.map(v => v.user_id)));
  const profileByUserId = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data: profileRows, error: profileError } = await db
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds);
    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 400, headers: { ...NO_STORE_HEADERS } }
      );
    }
    for (const row of (profileRows ?? []) as ProfileRow[]) {
      profileByUserId.set(row.user_id, row);
    }
  }

  const items = votes.map(v => {
    const listing = listingById.get(v.listing_id) ?? null;
    const prof = profileByUserId.get(v.user_id);
    const displayName =
      typeof prof?.display_name === 'string' && prof.display_name.trim()
        ? prof.display_name.trim()
        : 'Player';
    const avatarUrl =
      typeof prof?.avatar_url === 'string' && prof.avatar_url.startsWith('http')
        ? prof.avatar_url
        : null;
    return {
      voteId: v.id,
      userId: v.user_id,
      displayName,
      avatarUrl,
      soldPriceAud: v.sold_price_aud,
      willSell: v.will_sell,
      updatedAt: v.updated_at,
      listing: listing
        ? {
            id: listing.id,
            title: listing.title,
            suburb: listing.suburb,
            state: listing.state,
            postcode: listing.postcode,
            coverImageUrl: listing.cover_image_url,
            auctionAt: listing.auction_at,
          }
        : null,
    };
  });

  return NextResponse.json({ items }, { headers: { ...NO_STORE_HEADERS } });
}

/**
 * 兼容直接访问 / 调试；生产环境 Feed 页请使用 POST，避免 GET 被 CDN 缓存。
 */
export async function GET() {
  return buildFeedResponse();
}

/**
 * Feed 拉取（推荐）：与 GET 相同逻辑，但通常不会被边缘网络按 URL 缓存。
 */
export async function POST() {
  return buildFeedResponse();
}
