import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getOAuthAvatarUrl } from './oauthAvatar';
import { displayNameFromUser } from './userDisplay';

export type FeedListing = {
  id: string;
  title: string;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  coverImageUrl: string | null;
  auctionAt: string | null;
};

export type FeedItem = {
  voteId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  soldPriceAud: number | null;
  willSell: boolean;
  updatedAt: string;
  listing: FeedListing | null;
};

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
 * PostgREST：表未暴露或尚未建表时的典型报错（避免 Feed 整页失败）。
 */
export function isMissingProfilesTableError(e: { message?: string; code?: string }): boolean {
  const msg = e.message ?? '';
  return (
    e.code === 'PGRST205' ||
    (msg.includes('profiles') && msg.includes('schema cache')) ||
    (msg.includes('Could not find the table') && msg.includes('profiles'))
  );
}

export type LoadFeedResult = {
  items: FeedItem[];
  error: string | null;
  /**
   * 为 true 表示库里还没有 `public.profiles`：他人昵称暂为 Player；请在 Supabase SQL Editor 执行 `supabase/migration_profiles.sql`。
   */
  profilesTableMissing?: boolean;
};

/**
 * 在浏览器内直连 Supabase 拉取 Feed：votes → listings → `public.profiles`（展示名/头像）。
 * 不经过 Next `/api/feed`，避免托管 CDN 误缓存；用户信息以 `profiles` 为准（与常见社交 App 一致）。
 *
 * @param supabase 浏览器 Supabase 客户端（anon；依赖 RLS）
 * @param sessionUser 当前用户；当某行尚未写入 `profiles` 时用会话兜底自己的昵称/头像
 */
export async function loadFeedFromSupabase(
  supabase: SupabaseClient,
  sessionUser: User | null
): Promise<LoadFeedResult> {
  const { data: voteRows, error: voteError } = await supabase
    .from('votes')
    .select('id, user_id, listing_id, sold_price_aud, will_sell, updated_at')
    .order('updated_at', { ascending: false })
    .limit(10);

  if (voteError) {
    return { items: [], error: voteError.message };
  }

  const votes = (voteRows ?? []) as VoteRow[];
  const listingIds = Array.from(new Set(votes.map(v => v.listing_id).filter(Boolean)));
  const voterIds = Array.from(new Set(votes.map(v => v.user_id)));

  const listingById = new Map<string, ListingRow>();
  if (listingIds.length > 0) {
    const { data: listingRows, error: listingError } = await supabase
      .from('listings')
      .select('id, title, suburb, state, postcode, cover_image_url, auction_at')
      .in('id', listingIds);

    if (listingError) {
      return { items: [], error: listingError.message };
    }

    for (const row of (listingRows ?? []) as ListingRow[]) {
      listingById.set(row.id, row);
    }
  }

  let profilesTableMissing = false;
  const profileByUserId = new Map<string, ProfileRow>();
  if (voterIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', voterIds);

    if (profileError) {
      if (isMissingProfilesTableError(profileError)) {
        profilesTableMissing = true;
      } else {
        return { items: [], error: profileError.message };
      }
    } else {
      for (const row of (profileRows ?? []) as ProfileRow[]) {
        profileByUserId.set(row.user_id, row);
      }
    }
  }

  const items: FeedItem[] = votes.map(v => {
    const listing = listingById.get(v.listing_id) ?? null;
    const prof = profileByUserId.get(v.user_id);
    const isSelf = sessionUser != null && sessionUser.id === v.user_id;

    let displayName = typeof prof?.display_name === 'string' ? prof.display_name.trim() : '';
    let avatarUrl =
      typeof prof?.avatar_url === 'string' && prof.avatar_url.startsWith('http') ? prof.avatar_url : null;

    if (!displayName) {
      displayName = isSelf && sessionUser ? displayNameFromUser(sessionUser) : 'Player';
    }
    if (avatarUrl == null && isSelf && sessionUser) {
      avatarUrl = getOAuthAvatarUrl(sessionUser);
    }

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

  return {
    items,
    error: null,
    ...(profilesTableMissing ? { profilesTableMissing: true } : {}),
  };
}
