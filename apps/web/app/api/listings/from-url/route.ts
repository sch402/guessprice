import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeAddressForMatch,
  parseListingUrl,
} from '../../../../lib/listingUrlParser';
import { scrapeListingPage } from '../../../../lib/listingPageScrape';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * URL 级快速判断：明显的 rent/sold 链接直接拒绝（减少无意义抓取）。
 */
function classifyUrlIntent(url: string): 'sale' | 'rent' | 'sold' | 'unknown' {
  const u = url.toLowerCase();
  if (u.includes('/sold/')) return 'sold';
  if (u.includes('/rent/')) return 'rent';
  return 'unknown';
}

function getSupabaseKeys() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, key };
}

const QUICK_SCRAPE_TIMEOUT_MS = 30000;
const MAPBOX_TIMEOUT_MS = 8000;

/**
 * 已登录用户粘贴 realestate / Domain 链接：查重、必要时抓取并新建 listing。
 */
export async function POST(req: NextRequest) {
  const { url: supabaseUrl, key: anonKey } = getSupabaseKeys();
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: 'Server is not configured with Supabase environment variables.' },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 });
  }
  const userId = userData.user.id;

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) {
    return NextResponse.json({ error: 'Please paste a listing URL.' }, { status: 400 });
  }

  const parsed = parseListingUrl(rawUrl);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          'Invalid URL. Paste a listing page link from realestate.com.au or domain.com.au.',
      },
      { status: 400 }
    );
  }

  const urlIntent = classifyUrlIntent(parsed.canonicalUrl);
  if (urlIntent === 'rent') {
    return NextResponse.json(
      {
        error:
          'This link is a for-rent listing. Only for-sale listings can be used to start a quiz.',
      },
      { status: 422 }
    );
  }
  if (urlIntent === 'sold') {
    return NextResponse.json(
      {
        error: 'This link is a sold listing. Only for-sale listings can be used to start a quiz.',
      },
      { status: 422 }
    );
  }

  // 先按外部 ID 查重：已存在则直接跳转，避免重复抓取导致前端等待。
  if (parsed.source === 'realestate' && parsed.listingId) {
    const { data: existing } = await supabase
      .from('listings')
      .select('id')
      .eq('realestate_id', parsed.listingId)
      .maybeSingle();
    if (existing?.id) {
      return NextResponse.json({
        ok: true,
        action: 'existing',
        reason: 'realestate_id',
        listingId: existing.id,
      });
    }
  }

  if (parsed.source === 'domain' && parsed.listingId) {
    const { data: existing } = await supabase
      .from('listings')
      .select('id')
      .eq('domain_id', parsed.listingId)
      .maybeSingle();
    if (existing?.id) {
      return NextResponse.json({
        ok: true,
        action: 'existing',
        reason: 'domain_id',
        listingId: existing.id,
      });
    }
  }

  let scraped;
  try {
    scraped = await withTimeout(
      scrapeListingPage(parsed.canonicalUrl, parsed.source, 'quick'),
      QUICK_SCRAPE_TIMEOUT_MS,
      'Listing analysis timed out. Please try again.'
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Scrape failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (scraped.listing_kind === 'rent') {
    return NextResponse.json(
      {
        error:
          'This link is a for-rent listing. Only for-sale listings can be used to start a quiz.',
      },
      { status: 422 }
    );
  }
  if (scraped.listing_kind === 'sold') {
    return NextResponse.json(
      {
        error: 'This link is a sold listing. Only for-sale listings can be used to start a quiz.',
      },
      { status: 422 }
    );
  }
  if (scraped.listing_kind !== 'sale') {
    return NextResponse.json(
      {
        error:
          'Could not confirm this link is a for-sale listing. Only for-sale listings are supported.',
      },
      { status: 422 }
    );
  }
  if (!scraped.address || !scraped.address.trim()) {
    return NextResponse.json(
      {
        error: 'Could not extract the address for this sale listing. Please try again later.',
      },
      { status: 422 }
    );
  }

  const normalized = normalizeAddressForMatch(scraped.address);
  const { data: matchId, error: rpcErr } = await supabase.rpc('match_listing_address', {
    p_address: normalized,
  });
  if (!rpcErr && matchId) {
    return NextResponse.json({
      ok: true,
      action: 'existing',
      reason: 'address',
      listingId: matchId as string,
    });
  }

  const parsedAddress = parseAuAddressParts(scraped.address);
  const suburb = scraped.suburb ?? parsedAddress.suburb;
  const state = scraped.state ?? parsedAddress.state;
  const postcode = scraped.postcode ?? parsedAddress.postcode;
  const geo =
    scraped.latitude != null && scraped.longitude != null
      ? { latitude: scraped.latitude, longitude: scraped.longitude }
      : await geocodeByAddress(scraped.address);

  const row: Record<string, unknown> = {
    source: parsed.source,
    source_url: parsed.canonicalUrl,
    title: scraped.title || 'New listing',
    address: scraped.address,
    suburb,
    state,
    postcode,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    auction_at: scraped.auction_at,
    cover_image_url: scraped.cover_image_url,
    suggest_price: scraped.suggest_price,
    status: 'upcoming',
    created_by: userId,
    updated_at: new Date().toISOString(),
  };

  if (parsed.source === 'realestate' && parsed.listingId) row.realestate_id = parsed.listingId;
  if (parsed.source === 'domain' && parsed.listingId) row.domain_id = parsed.listingId;

  const { data: inserted, error: insErr } = await supabase
    .from('listings')
    .insert(row)
    .select('id')
    .single();

  if (insErr) {
    if (insErr.code === '23505') {
      if (parsed.source === 'realestate' && parsed.listingId) {
        const { data: again } = await supabase
          .from('listings')
          .select('id')
          .eq('realestate_id', parsed.listingId)
          .maybeSingle();
        if (again?.id) {
          return NextResponse.json({
            ok: true,
            action: 'existing',
            reason: 'realestate_id_race',
            listingId: again.id,
          });
        }
      } else if (parsed.source === 'domain' && parsed.listingId) {
        const { data: again } = await supabase
          .from('listings')
          .select('id')
          .eq('domain_id', parsed.listingId)
          .maybeSingle();
        if (again?.id) {
          return NextResponse.json({
            ok: true,
            action: 'existing',
            reason: 'domain_id_race',
            listingId: again.id,
          });
        }
      }
    }
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    action: 'created',
    listingId: inserted.id,
  });
}

/**
 * Promise 超时包装：用于快速阶段，避免长时间等待。
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return (await Promise.race([promise, timeout])) as T;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * 从澳洲地址文本中解析 suburb/state/postcode。
 */
function parseAuAddressParts(address: string): {
  suburb: string | null;
  state: string | null;
  postcode: string | null;
} {
  const s = address.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = s.match(/\b(.+?)\s+(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s+(\d{4})\b/i);
  if (!m) return { suburb: null, state: null, postcode: null };
  const before = m[1].trim();
  const suburb = before.split(',').pop()?.trim() || null;
  return {
    suburb,
    state: m[2].toUpperCase(),
    postcode: m[3],
  };
}

/**
 * 用地址做 geocode，补充经纬度。
 */
async function geocodeByAddress(
  address: string
): Promise<{ latitude: number; longitude: number } | null> {
  const token = process.env.MAPBOX_TOKEN?.trim();
  if (!token) return null;

  const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`;
  const params = new URLSearchParams({
    access_token: token,
    country: 'AU',
    limit: '1',
    types: 'address,place,postcode',
    autocomplete: 'false',
  });

  try {
    const json = await withTimeout(
      fetch(`${endpoint}?${params.toString()}`, { method: 'GET' }).then(r => r.json() as Promise<any>),
      MAPBOX_TIMEOUT_MS,
      'Geocoding timed out'
    );
    const center = json?.features?.[0]?.center;
    if (!Array.isArray(center) || center.length < 2) return null;
    const [longitude, latitude] = center;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}
