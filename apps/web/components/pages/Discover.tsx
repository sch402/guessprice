import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonPage,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { gameControllerOutline, personCircleOutline, searchOutline } from 'ionicons/icons';
import Image from 'next/image';
import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { getOAuthAvatarUrl } from '../../lib/oauthAvatar';
import { EmptyStateCard, LoadingStateCard } from '../ui/AsyncStates';
import { useSupabaseSession } from '../../lib/useSupabaseSession';

type Listing = {
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

type ViewedListingBrief = {
  id: string;
  suburb: string | null;
  postcode: string | null;
};

type RecommendationResponse = {
  items?: Listing[];
  hasMore?: boolean;
  mode?: 'context' | 'random';
  error?: string;
};

const RECENT_VIEWED_KEY = 'gtp_recent_viewed_listings_v1';
const INVITE_REQUEST_TIMEOUT_MS = 45000;

/**
 * 发现页（移动端优先）。
 * 顶部搜索条为跳转入口（进入 Search 并聚焦输入框）；列表区为「猜你喜欢」推荐流。
 */
export default function Discover() {
  const history = useHistory();
  const { supabase, session } = useSupabaseSession();
  const user: User | null = session?.user ?? null;
  const profileAvatarUrl = user ? getOAuthAvatarUrl(user) : null;
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteErr, setInviteErr] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const json = await fetchRecommendations([]);
        if (cancelled) return;
        setListings(json.items ?? []);
        setHasMore(Boolean(json.hasMore));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToGuess = (listingId: string) => {
    history.push(`/guess?listingId=${encodeURIComponent(listingId)}`);
  };

  const openGuess = (listing: Listing) => {
    rememberViewedListing(listing);
    const listingId = listing.id;
    goToGuess(listingId);
  };

  /**
   * 读取最近看过的房源（最多 3 个）。
   */
  const readRecentViewed = (): ViewedListingBrief[] => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(RECENT_VIEWED_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as ViewedListingBrief[];
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(x => x && typeof x.id === 'string')
        .slice(0, 3);
    } catch {
      return [];
    }
  };

  /**
   * 记录最近看过的房源（点开 Guess 即视为看过），用于推荐同区域房源。
   */
  const rememberViewedListing = (listing: Listing) => {
    if (typeof window === 'undefined') return;
    const current = readRecentViewed();
    const next: ViewedListingBrief = {
      id: listing.id,
      suburb: listing.suburb,
      postcode: listing.postcode,
    };
    const merged = [next, ...current.filter(x => x.id !== listing.id)].slice(0, 3);
    try {
      window.localStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(merged));
    } catch {
      // ignore
    }
  };

  /**
   * 拉取推荐房源：有有效 suburb+postcode 历史则优先同区；不足条数或无命中时由接口用随机 `upcoming` 补足。
   */
  const fetchRecommendations = async (excludeIds: string[]): Promise<RecommendationResponse> => {
    const contexts = readRecentViewed().map(x => ({ suburb: x.suburb, postcode: x.postcode }));
    const res = await fetch('/api/listings/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contexts,
        excludeIds,
        limit: 3,
      }),
    });
    const json = (await res.json()) as RecommendationResponse;
    if (!res.ok) return { error: json.error || 'Failed to load recommendations' };
    return json;
  };

  /**
   * 进入全站搜索页并请求聚焦搜索框（Search 页消费 `?focusSearch=1`）。
   */
  const goToSearch = () => {
    history.push('/search?focusSearch=1');
  };

  const loadMoreRecommendations = async () => {
    setLoadingMore(true);
    try {
      const excludeIds = listings.map(x => x.id);
      const json = await fetchRecommendations(excludeIds);
      if (json.error) return;
      const incoming = json.items ?? [];
      if (!incoming.length) {
        setHasMore(false);
        return;
      }
      setListings(prev => [...prev, ...incoming]);
      setHasMore(Boolean(json.hasMore));
    } finally {
      setLoadingMore(false);
    }
  };

  /**
   * 发起竞猜 API 基址：Capacitor 静态包需指向已部署的 Next 服务（含 /api）。
   */
  const getListingApiBase = () => {
    if (typeof window === 'undefined') return '';
    const fromEnv = process.env.NEXT_PUBLIC_LISTING_API_BASE_URL?.replace(/\/$/, '');
    return fromEnv || window.location.origin;
  };

  const openInvite = () => {
    if (!session) {
      history.push('/me');
      return;
    }
    setInviteErr('');
    setInviteUrl('');
    setInviteOpen(true);
  };

  const openMe = () => {
    history.push('/me');
  };

  const submitInvite = async () => {
    if (!supabase || !session) {
      history.push('/me');
      return;
    }
    const normalizedUrl = inviteUrl.trim();
    if (isRealestateListingUrl(normalizedUrl)) {
      setInviteErr(
        'Oops! We only support domain.com.au link for now. Please paste a domain.com.au listing URL instead.'
      );
      return;
    }
    if (!isSupportedListingUrl(normalizedUrl)) {
      setInviteErr('Only domain.com.au listing links are supported.');
      return;
    }
    const intent = classifyListingUrlIntent(normalizedUrl);
    if (intent === 'rent') {
      setInviteErr('Opps! This is a for-rent listing. We only watch for-sales.');
      return;
    }
    if (intent === 'sold') {
      setInviteErr('Opps! This is a recently sold listing. We only watch for-sales.');
      return;
    }
    setInviteBusy(true);
    setInviteErr('');
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setInviteErr('Please sign in');
        return;
      }
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), INVITE_REQUEST_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(`${getListingApiBase()}/api/listings/from-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url: normalizedUrl }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string; listingId?: string };
      if (!res.ok) {
        setInviteErr(json.error || 'Request failed');
        return;
      }
      if (json.listingId) {
        setInviteOpen(false);
        setInviteUrl('');
        goToGuess(json.listingId);
      } else {
        setInviteErr('This link cannot be used to start a guess (only for-sale listings are supported).');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setInviteErr('Analysis timed out, please try again.');
        return;
      }
      setInviteErr('Network error, please try again');
    } finally {
      setInviteBusy(false);
    }
  };

  /**
   * 拍卖时间显示格式：Saturday, 21 Mar 11:00 am
   */
  const formatAuctionAt = (iso: string) => {
    const d = new Date(iso);
    const weekday = new Intl.DateTimeFormat('en-AU', { weekday: 'long' }).format(d);
    const day = new Intl.DateTimeFormat('en-AU', { day: '2-digit' }).format(d);
    const month = new Intl.DateTimeFormat('en-AU', { month: 'short' }).format(d);
    const time = new Intl.DateTimeFormat('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .format(d)
      .replace(' AM', ' am')
      .replace(' PM', ' pm');
    return `${weekday}, ${day} ${month} ${time}`;
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
        <IonTitle>Street Auction Watch</IonTitle>
          <IonButtons slot="end">
            <IonButton fill="clear" onClick={openInvite} aria-label="Start new guess" className="mx-0 h-11 min-w-[44px]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center [&_ion-icon]:h-9 [&_ion-icon]:w-9">
                <IonIcon icon={gameControllerOutline} className="text-slate-800" aria-hidden="true" />
              </span>
            </IonButton>
            <IonButton fill="clear" onClick={openMe} aria-label="My profile" className="mx-0 h-11 min-w-[44px]">
              {profileAvatarUrl ? (
                <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-slate-200">
                  <Image
                    src={profileAvatarUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="36px"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                </span>
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center [&_ion-icon]:h-9 [&_ion-icon]:w-9">
                  <IonIcon icon={personCircleOutline} className="text-slate-800" aria-hidden="true" />
                </span>
              )}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding" fullscreen>
        <div
          className="mb-4 cursor-pointer rounded-full border border-slate-200 bg-white px-4 py-3 shadow-sm"
          role="button"
          tabIndex={0}
          onClick={goToSearch}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              goToSearch();
            }
          }}
          aria-label="Open search: suburb or postcode"
        >
          <div className="pointer-events-none flex items-center gap-2">
            <IonIcon icon={searchOutline} className="text-lg text-slate-400" />
            <span className="min-w-0 flex-1 text-left text-[16px] text-slate-500">Search suburb or postcode</span>
            <span className="shrink-0 text-sm font-medium text-emerald-600">Search</span>
          </div>
        </div>

        {loading ? <LoadingStateCard label="Loading recommendations" /> : null}

        {!loading && listings.length === 0 ? (
          <EmptyStateCard title="No listings yet" description="New auctions will appear here soon." />
        ) : null}

        <IonModal
          isOpen={inviteOpen}
          backdropDismiss={!inviteBusy}
          onDidDismiss={() => setInviteOpen(false)}
        >
          <IonHeader>
            <IonToolbar>
              <IonTitle>Start a Quiz!</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setInviteOpen(false)} disabled={inviteBusy}>
                  Close
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <div className="relative min-h-full">
              <p className="text-sm text-gray-600 mb-3">
                Paste a property link from <span className="font-medium">domain.com.au</span>. 
              </p>
              <IonTextarea
                placeholder="https://www.domain.com.au/..."
                value={inviteUrl}
                onIonInput={e => {
                  setInviteUrl(String(e.detail.value ?? ''));
                  setInviteErr('');
                }}
                rows={4}
                autoGrow
              />
              {inviteErr ? (
                <div className="mt-3 text-sm text-red-600">{inviteErr}</div>
              ) : null}
              <IonButton
                expand="block"
                className="mt-4"
                disabled={inviteBusy || !inviteUrl.trim()}
                onClick={submitInvite}
              >
                {inviteBusy ? 'Searching' : 'Search'}
              </IonButton>

              {inviteBusy ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/85 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="text-3xl animate-bounce" aria-hidden="true">
                      🏠
                    </div>
                    <div className="text-sm font-medium text-gray-800">Loading Data...</div>
                    <div className="flex gap-1" aria-hidden="true">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 animate-pulse [animation-delay:150ms]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </IonContent>
        </IonModal>

        <div className="space-y-3">
        <h3 className="mb-3 text-lg font-semibold text-slate-800">Auctions you might be interested in</h3>
          {listings.map(l => (
            <IonCard key={l.id} button onClick={() => openGuess(l)}>
              {l.cover_image_url ? (
                <div className="relative w-full h-44 overflow-hidden rounded-t-xl">
                  <Image
                    src={l.cover_image_url}
                    alt={l.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 600px"
                    priority={false}
                  />
                </div>
              ) : null}
              <IonCardHeader>
                <IonCardSubtitle>
                  {l.suburb || ''} {l.state || ''} {l.postcode || ''}
                </IonCardSubtitle>
                <IonCardTitle>{l.title}</IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                {l.auction_at ? (
                  <div className="text-sm text-gray-600">
                    Auction Time: {formatAuctionAt(l.auction_at)}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">For sale</div>
                )}
                <div className="pt-3">
                  <IonButton size="small" onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    openGuess(l);
                  }}>
                    GUESS
                  </IonButton>
                </div>
              </IonCardContent>
            </IonCard>
          ))}
        </div>
        {!loading && listings.length > 0 && hasMore ? (
          <div className="pt-3">
            <IonButton expand="block" fill="outline" disabled={loadingMore} onClick={loadMoreRecommendations}>
              {loadingMore ? 'Loading...' : 'More'}
            </IonButton>
          </div>
        ) : null}
      </IonContent>
    </IonPage>
  );
}

/**
 * 用户粘贴发起竞猜：仅允许 Domain，避免 realestate 长耗时抓取影响体验。
 */
function isSupportedListingUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host === 'domain.com.au' || host === 'www.domain.com.au';
  } catch {
    return false;
  }
}

/**
 * 识别 realestate 域名，用于在请求前单独提示（与「非 Domain」错误区分）。
 */
function isRealestateListingUrl(input: string): boolean {
  try {
    const host = new URL(input).hostname.toLowerCase();
    return host === 'realestate.com.au' || host === 'www.realestate.com.au';
  } catch {
    return false;
  }
}

/**
 * 前端快速识别链接是否明显为 rent/sold，给用户即时友好提示（后端仍会二次校验）。
 */
function classifyListingUrlIntent(input: string): 'sale' | 'rent' | 'sold' | 'unknown' {
  try {
    const u = new URL(input).toString().toLowerCase();
    if (u.includes('/sold/')) return 'sold';
    if (u.includes('/rent/')) return 'rent';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
