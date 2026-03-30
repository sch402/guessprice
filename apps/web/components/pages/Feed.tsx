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
import { loadFeedFromSupabase, type FeedItem } from '../../lib/loadFeedFromSupabase';
import { useSupabaseSession } from '../../lib/useSupabaseSession';

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
 * 数据在浏览器内直连 Supabase：votes/listings/`profiles`（展示名与头像来自公开资料表，非 User xxxxx 占位）。
 */
export default function Feed() {
  const history = useHistory();
  const location = useLocation();
  const { supabase, session } = useSupabaseSession();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  /** 尚未执行 profiles 迁移时提示一次（列表仍可用，他人昵称暂为 Player） */
  const [profilesTableMissing, setProfilesTableMissing] = useState(false);

  /**
   * 拉取 Feed（直连 Supabase）。
   *
   * @param opts.silent 为 true 时不切换全页 Loading（供下拉刷新用）。
   */
  const loadFeed = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) {
        setLoading(true);
      }
      setErr('');
      try {
        if (!supabase) {
          setErr('Supabase is not configured.');
          setItems([]);
          setProfilesTableMissing(false);
          return;
        }
        const { items: next, error, profilesTableMissing: missingProfiles } = await loadFeedFromSupabase(
          supabase,
          session?.user ?? null
        );
        if (error) {
          setErr(error);
          setItems([]);
          setProfilesTableMissing(false);
          return;
        }
        setItems(next);
        setProfilesTableMissing(missingProfiles === true);
      } catch {
        setErr('Failed to load feed');
        setItems([]);
        setProfilesTableMissing(false);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [supabase, session?.user]
  );

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
        {!loading && profilesTableMissing ? (
          <div
            role="status"
            className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          >
            Public names need the{' '}
            <code className="rounded bg-amber-100/80 px-1 text-xs">profiles</code> table. In Supabase → SQL
            Editor, run the script in{' '}
            <code className="rounded bg-amber-100/80 px-1 text-xs">apps/web/supabase/migration_profiles.sql</code>
            , then pull to refresh.
          </div>
        ) : null}
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
