import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ListingRow = {
  id: string;
  title: string;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  auction_at: string | null;
  cover_image_url: string | null;
};

type RecommendationBody = {
  contexts?: Array<{ suburb?: string | null; postcode?: string | null }>;
  excludeIds?: string[];
  limit?: number;
};

function getSupabaseKeys() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, key };
}

/**
 * PostgREST `or`：`auction_at` 未填，或拍卖时间仍晚于当前时刻（已过期的不进推荐）。
 *
 * @param isoNow 当前时刻 ISO 字符串
 */
function recommendationAuctionFilter(isoNow: string): string {
  return `auction_at.is.null,auction_at.gt."${isoNow}"`;
}

/**
 * 推荐房源：
 * - `status = upcoming`，且（`auction_at` 为空 **或** `auction_at` 晚于当前时刻）；
 * - 有上下文（suburb + postcode）时，优先返回同区域房源；
 * - 无上下文时，返回随机房源；
 * - 始终支持 excludeIds 去重，便于前端「More」增量加载。
 */
export async function POST(req: NextRequest) {
  const { url: supabaseUrl, key: anonKey } = getSupabaseKeys();
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: 'Server is not configured with Supabase environment variables.' },
      { status: 500 }
    );
  }

  let body: RecommendationBody = {};
  try {
    body = (await req.json()) as RecommendationBody;
  } catch {
    body = {};
  }

  const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(6, Number(body.limit))) : 3;
  const excludeIds = Array.isArray(body.excludeIds)
    ? body.excludeIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim())
    : [];

  const rawContexts = Array.isArray(body.contexts) ? body.contexts : [];
  const contextPairs = Array.from(
    new Set(
      rawContexts
        .map(c => {
          const suburb = (c?.suburb || '').trim();
          const postcode = (c?.postcode || '').trim();
          if (!suburb || !/^\d{4}$/.test(postcode)) return '';
          return `${suburb}||${postcode}`;
        })
        .filter(Boolean)
    )
  ).map(k => {
    const [suburb, postcode] = k.split('||');
    return { suburb, postcode };
  });

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const isoNow = new Date().toISOString();
  const baseSelect = 'id,title,suburb,state,postcode,latitude,longitude,auction_at,cover_image_url';
  const excludeSet = new Set(excludeIds);

  if (contextPairs.length > 0) {
    const suburbs = Array.from(new Set(contextPairs.map(x => x.suburb)));
    const postcodes = Array.from(new Set(contextPairs.map(x => x.postcode)));
    const pairSet = new Set(contextPairs.map(x => `${x.suburb}||${x.postcode}`));

    const { data, error } = await supabase
      .from('listings')
      .select(baseSelect)
      .eq('status', 'upcoming')
      .or(recommendationAuctionFilter(isoNow))
      .in('suburb', suburbs)
      .in('postcode', postcodes)
      .order('updated_at', { ascending: false })
      .limit(300);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const matched = ((data ?? []) as ListingRow[]).filter(row => {
      if (!row.suburb || !row.postcode) return false;
      if (excludeSet.has(row.id)) return false;
      return pairSet.has(`${row.suburb}||${row.postcode}`);
    });

    return NextResponse.json({
      mode: 'context',
      items: matched.slice(0, limit),
      hasMore: matched.length > limit,
    });
  }

  const { data, error } = await supabase
    .from('listings')
    .select(baseSelect)
    .eq('status', 'upcoming')
    .or(recommendationAuctionFilter(isoNow))
    .order('updated_at', { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const pool = ((data ?? []) as ListingRow[]).filter(row => !excludeSet.has(row.id));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return NextResponse.json({
    mode: 'random',
    items: pool.slice(0, limit),
    hasMore: pool.length > limit,
  });
}
