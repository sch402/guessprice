import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ListingEmbed = {
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
  sold_price_aud: number | null;
  will_sell: boolean;
  updated_at: string;
  listings: ListingEmbed | ListingEmbed[] | null;
};

/**
 * Derive a display name from Supabase Auth user (metadata or email).
 */
function displayNameFromUser(user: User | null): string {
  if (!user) return 'Anonymous';
  const m = user.user_metadata as Record<string, unknown> | undefined;
  const full = m?.['full_name'];
  const name = m?.['name'];
  const fromMeta =
    (typeof full === 'string' && full.trim()) || (typeof name === 'string' && name.trim()) || '';
  if (fromMeta) return fromMeta;
  if (user.email) return user.email.split('@')[0] ?? 'Player';
  return 'Player';
}

/**
 * Public feed: latest votes with listing cards, max 10 rows.
 * User names/avatars require `SUPABASE_SERVICE_ROLE_KEY` (server-only) for `auth.admin.getUserById`.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { error: 'Server is not configured with Supabase environment variables.' },
      { status: 500 }
    );
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await supabase
    .from('votes')
    .select(
      `
      id,
      user_id,
      sold_price_aud,
      will_sell,
      updated_at,
      listings (
        id,
        title,
        suburb,
        state,
        postcode,
        cover_image_url,
        auction_at
      )
    `
    )
    .order('updated_at', { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const voteRows = (rows ?? []) as VoteRow[];
  const userIds = Array.from(new Set(voteRows.map(r => r.user_id)));
  const userMap = new Map<string, { displayName: string; avatarUrl: string | null }>();

  if (serviceKey && userIds.length > 0) {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await Promise.all(
      userIds.map(async uid => {
        const { data, error: ue } = await admin.auth.admin.getUserById(uid);
        if (ue || !data?.user) {
          userMap.set(uid, { displayName: `User ${uid.slice(0, 6)}`, avatarUrl: null });
          return;
        }
        const u = data.user;
        const m = u.user_metadata as Record<string, unknown> | undefined;
        const pic = m?.['picture'] ?? m?.['avatar_url'];
        const avatarUrl = typeof pic === 'string' && pic.startsWith('http') ? pic : null;
        userMap.set(uid, {
          displayName: displayNameFromUser(u),
          avatarUrl,
        });
      })
    );
  } else {
    for (const uid of userIds) {
      userMap.set(uid, { displayName: `User ${uid.slice(0, 8)}`, avatarUrl: null });
    }
  }

  const items = voteRows.map(v => {
    const L = v.listings;
    const listing = Array.isArray(L) ? L[0] : L;
    const u = userMap.get(v.user_id) ?? { displayName: 'Anonymous', avatarUrl: null };
    return {
      voteId: v.id,
      userId: v.user_id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
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

  return NextResponse.json(
    { items },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    }
  );
}
