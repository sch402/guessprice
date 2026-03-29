import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { formatAuctionWallClockEnAu } from '../../lib/auAuctionTimezone';

type FeedListing = {
  id: string;
  title: string;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  coverImageUrl: string | null;
  auctionAt: string | null;
};

type FeedItem = {
  voteId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  soldPriceAud: number | null;
  willSell: boolean;
  updatedAt: string;
  listing: FeedListing | null;
};

type FeedResponse = {
  items?: FeedItem[];
  error?: string;
};

/**
 * Feed API 完整 URL。未配置 `NEXT_PUBLIC_LISTING_API_BASE_URL` 时使用同源 `/api/feed`，避免误指向其它部署。
 * 查询参数用于绕过浏览器或中间层对 GET 的缓存。
 */
function getFeedApiUrl(): string {
  const base = process.env.NEXT_PUBLIC_LISTING_API_BASE_URL?.replace(/\/$/, '');
  const qs = new URLSearchParams({ _: String(Date.now()) }).toString();
  if (base) return `${base}/api/feed?${qs}`;
  return `/api/feed?${qs}`;
}

/**
 * AUD 整数货币格式（与竞猜存储一致）。
 */
function formatAud(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

/**
 * 拍卖时间：与 Domain 一致，按房源州本地墙钟。
 */
function formatFeedAuctionAt(iso: string | null, state: string | null): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return formatAuctionWallClockEnAu(iso, state);
}

/**
 * 相对时间（社交媒体风格）。
 */
function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(d);
}

/**
 * Feed 流：基于 `votes` 的最新活动，卡片式布局（类社交媒体信息流）。
 */
export default function Feed() {
  const history = useHistory();
  const location = useLocation();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  /**
   * 拉取 Feed。
   * `useIonViewWillEnter` 在 Ionic + React Router 下从 `/guess` 等页切回 `/feed` 时**不一定**触发，
   * 导致新投票后不刷新；改为在路由 `pathname === '/feed'` 时 `useEffect` 拉取，保证每次进入 Feed 都请求最新数据。
   *
   * @param opts.silent 为 true 时不切换全页 Loading（供下拉刷新用）。
   */
  const loadFeed = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
    }
    setErr('');
    try {
      const res = await fetch(getFeedApiUrl(), {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const json = (await res.json()) as FeedResponse;
      if (!res.ok) {
        setErr(json.error || 'Failed to load feed');
        setItems([]);
        return;
      }
      setItems(json.items ?? []);
    } catch {
      setErr('Network error');
      setItems([]);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (location.pathname !== '/feed') return;
    void loadFeed();
  }, [location.pathname, loadFeed]);

  const openGuess = (listingId: string) => {
    history.push(`/guess?listingId=${encodeURIComponent(listingId)}`);
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border border-b border-slate-200/80">
        <IonToolbar>
          <IonTitle>Feed</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="bg-[#f0f2f5] ion-padding" fullscreen>
        <IonRefresher
          slot="fixed"
          onIonRefresh={async e => {
            await loadFeed({ silent: true });
            e.detail.complete();
          }}
        >
          <IonRefresherContent />
        </IonRefresher>
        {loading ? (
          <div className="py-8 text-center text-slate-600">Loading feed…</div>
        ) : null}

        {!loading && err ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
        ) : null}

        {!loading && !err && items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-600 shadow-sm">
            No predictions yet. Be the first to guess on a listing.
          </div>
        ) : null}

        <div className="space-y-3">
          {items.map(item => (
            <article
              key={item.voteId}
              className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm"
            >
              <div className="flex gap-3 border-b border-slate-100 px-3 py-3">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-200/80">
                  {item.avatarUrl ? (
                    <Image
                      src={item.avatarUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="40px"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-600">
                      {item.displayName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-slate-900">{item.displayName}</span>
                    <span className="text-xs text-slate-500">{formatRelativeTime(item.updatedAt)}</span>
                  </div>
                  <p className="mt-1 text-[15px] leading-snug text-slate-800">
                    has made a prediction of{' '}
                    <span className="font-semibold text-slate-900">{formatAud(item.soldPriceAud)}</span> on this
                    property:
                  </p>
                </div>
              </div>

              {item.listing ? (
                <IonCard className="m-0 shadow-none" button onClick={() => openGuess(item.listing!.id)}>
                  {item.listing.coverImageUrl ? (
                    <div className="relative h-44 w-full overflow-hidden">
                      <Image
                        src={item.listing.coverImageUrl}
                        alt={item.listing.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 600px"
                        priority={false}
                      />
                    </div>
                  ) : null}
                  <IonCardHeader className="pb-1">
                    <IonCardSubtitle className="text-xs uppercase tracking-wide text-slate-500">
                      {[item.listing.suburb, item.listing.state, item.listing.postcode].filter(Boolean).join(' ')}
                    </IonCardSubtitle>
                    <IonCardTitle className="text-lg">{item.listing.title}</IonCardTitle>
                  </IonCardHeader>
                  <IonCardContent className="pt-0 text-sm text-slate-600">
                    Auction: {formatFeedAuctionAt(item.listing.auctionAt, item.listing.state)}
                  </IonCardContent>
                </IonCard>
              ) : (
                <div className="px-3 py-4 text-sm text-slate-500">This property is no longer available.</div>
              )}
            </article>
          ))}
        </div>
      </IonContent>
    </IonPage>
  );
}
