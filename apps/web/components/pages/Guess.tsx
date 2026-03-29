import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonPage,
  IonToast,
  IonToolbar,
} from '@ionic/react';
import { faCameraRetro, faShare } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { GuessStatsVisual } from '../guess/GuessStatsVisual';
import { buildPriceHistogram } from '../../lib/guessPriceHistogram';
import type { GuessStats } from '../../lib/guessStatsTypes';
import { useSupabaseSession } from '../../lib/useSupabaseSession';

type Listing = {
  id: string;
  title: string;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  created_at?: string | null;
  /** 与 DB `listings.status` 一致，如 `upcoming` */
  status?: string | null;
  auction_at: string | null;
  cover_image_url: string | null;
  /** 拍卖成交价（AUD），未出结果时为 `null` */
  sold_price: number | null;
  /** 成交时间（ISO），可与 `sold_price` 同时回填 */
  sold_at: string | null;
  source: string;
  source_url: string | null;
  realestate_id: string | null;
  domain_id: string | null;
};

/**
 * 跳转 realestate：优先使用入库时的完整 `source_url`，否则按 `realestate_id` 拼接域名路径。
 */
function buildRealestateListingUrl(listing: Listing): string | null {
  const id = listing.realestate_id?.trim();
  if (!id) return null;
  if (listing.source === 'realestate' && listing.source_url?.startsWith('http')) {
    return listing.source_url;
  }
  return `https://www.realestate.com.au/${id}`;
}

/**
 * 跳转 domain：优先使用入库时的完整 `source_url`，否则按 `domain_id` 拼接域名路径。
 */
function buildDomainListingUrl(listing: Listing): string | null {
  const id = listing.domain_id?.trim();
  if (!id) return null;
  if (listing.source === 'domain' && listing.source_url?.startsWith('http')) {
    return listing.source_url;
  }
  return `https://www.domain.com.au/${id}`;
}

type Vote = {
  will_sell: boolean;
  sold_price_aud: number | null;
};

const RECENT_VIEWED_KEY = 'gtp_recent_viewed_listings_v1';

/**
 * 竞猜页（移动端优先）。
 * 这里将承载两题流程：是否成交 + 预测成交价。
 */
export default function Guess() {
  const history = useHistory();
  const location = useLocation();
  const listingId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('listingId');
  }, [location.search]);
  const { supabase, session } = useSupabaseSession();
  const userId = session?.user?.id ?? null;

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [priceErr, setPriceErr] = useState<string>('');
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const [willSell, setWillSell] = useState<'sold' | 'passed' | null>('sold');
  // 成交价输入采用“万 AUD”为单位（1 单位 = 10,000 AUD）
  const [soldPrice10k, setSoldPrice10k] = useState<string>('');

  const [stats, setStats] = useState<GuessStats | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotForceNoImage, setSnapshotForceNoImage] = useState(false);
  const snapshotRef = useRef<HTMLDivElement | null>(null);

  /** 用于在拍卖开始前/结束后切换 UI（跨点刷新） */
  const [nowMs, setNowMs] = useState(() => Date.now());

  const canQuery = !!supabase && !!listingId;

  /**
   * 进入 Guess 页即记录“最近浏览房源”，保证从任意入口（Discover/Search/粘贴链接）都会更新推荐上下文。
   */
  const rememberViewedListing = (item: Pick<Listing, 'id' | 'suburb' | 'postcode'>) => {
    if (typeof window === 'undefined') return;
    // 分段入库期间，若关键地域字段缺失，先不落 localStorage，避免写入无效上下文。
    if (!item.suburb && !item.postcode) return;
    try {
      const raw = window.localStorage.getItem(RECENT_VIEWED_KEY);
      const current = raw ? (JSON.parse(raw) as Array<{ id: string; suburb: string | null; postcode: string | null }>) : [];
      const next = { id: item.id, suburb: item.suburb, postcode: item.postcode };
      const merged = [next, ...current.filter(x => x && x.id !== item.id)].slice(0, 3);
      window.localStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(merged));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  /**
   * 是否仍开放问卷：`upcoming` 且（无 `auction_at` / 解析失败视为无截止时间，仍开放；有 `auction_at` 则仅当当前时刻早于拍卖时间时开放）。
   */
  const showVotingQuestionnaire = useMemo(() => {
    if (!listing) return false;
    const st = listing.status || 'upcoming';
    if (st !== 'upcoming') return false;
    if (!listing.auction_at) return true;
    const t = Date.parse(listing.auction_at);
    if (Number.isNaN(t)) return true;
    return nowMs < t;
  }, [listing, nowMs]);

  /**
   * 是否展示「Auction Result」：已非 upcoming，或已到/已过拍卖时间。
   */
  const showAuctionResultBlock = useMemo(() => {
    if (!listing) return false;
    const st = listing.status || 'upcoming';
    if (st !== 'upcoming') return true;
    if (!listing.auction_at) return false;
    const t = Date.parse(listing.auction_at);
    if (Number.isNaN(t)) return false;
    return nowMs >= t;
  }, [listing, nowMs]);

  useEffect(() => {
    if (!supabase || !listingId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('listings')
          .select(
            'id,title,suburb,state,postcode,created_at,status,auction_at,cover_image_url,sold_price,sold_at,source,source_url,realestate_id,domain_id'
          )
          .eq('id', listingId)
          .single();
        if (cancelled) return;
        if (error) {
          setListing(null);
          return;
        }
        setListing(data as Listing);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, listingId]);

  useEffect(() => {
    if (!listing?.id) return;
    rememberViewedListing({ id: listing.id, suburb: listing.suburb, postcode: listing.postcode });
  }, [listing?.id, listing?.suburb, listing?.postcode]);

  // Load my vote (if logged in)
  useEffect(() => {
    if (!supabase || !listingId || !userId) return;
    supabase
      .from('votes')
      .select('will_sell,sold_price_aud')
      .eq('listing_id', listingId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setHasVoted(!!data);
        if (!data) return;
        const v = data as Vote;
        setWillSell(v.will_sell ? 'sold' : 'passed');
        if (v.sold_price_aud == null) {
          setSoldPrice10k('');
          return;
        }
        const n = Number(v.sold_price_aud);
        setSoldPrice10k(Number.isFinite(n) ? String(Math.round(n / 10000)) : '');
      });
  }, [supabase, listingId, userId]);

  const refreshStats = async () => {
    if (!supabase || !listingId) return;
    const { data, error } = await supabase
      .from('votes')
      .select('will_sell,sold_price_aud')
      .eq('listing_id', listingId);
    if (error) return;
    const votes = (data ?? []) as Vote[];
    const total = votes.length;
    const yes = votes.filter(v => v.will_sell).length;
    const no = total - yes;
    const soldPrices = votes
      .filter(v => v.will_sell && v.sold_price_aud != null)
      .map(v => Number(v.sold_price_aud))
      .filter(n => Number.isFinite(n))
      .sort((a, b) => a - b);
    const median =
      soldPrices.length === 0
        ? null
        : soldPrices.length % 2 === 1
          ? soldPrices[(soldPrices.length - 1) / 2]
          : Math.round(
              (soldPrices[soldPrices.length / 2 - 1] + soldPrices[soldPrices.length / 2]) /
                2
            );
    const priceVotes = votes
      .filter(v => v.sold_price_aud != null)
      .map(v => Number(v.sold_price_aud))
      .filter(n => Number.isFinite(n));
    const priceHistogram = buildPriceHistogram(priceVotes);
    setStats({
      totalVotes: total,
      willSellYes: yes,
      willSellNo: no,
      soldPriceMedian: median,
      priceHistogram,
    });
  };

  useEffect(() => {
    if (!supabase || !listingId) return;
    refreshStats();
    // 简单轮询（MVP）：后续可用 Supabase Realtime 替换
    const t = window.setInterval(() => refreshStats(), 5000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, listingId]);

  /** Q2：万澳元单位的整数；非法或空白时返回 `null`（与「必须两题都答」一致）。 */
  const computedPriceAud = useMemo(() => {
    const s = soldPrice10k.trim();
    if (!s) return null;
    const u = Number(String(s).replaceAll(',', ''));
    if (!Number.isFinite(u) || u < 0) return null;
    if (!Number.isInteger(u)) return null;
    return u * 10000;
  }, [soldPrice10k]);

  /**
   * Q1 已选且 Q2 已填写合法整数（万 AUD）时，表单可用于提交（登录后写入 votes）。
   * 注意：`computedPriceAud` 为 0 时表示 0 万澳元，仍为有效答案（`0 !== null`）。
   */
  const formCompleteForVote = Boolean(willSell && computedPriceAud !== null && !saving);

  /**
   * VOTE 按钮：未登录时可点击以跳转登录页；已登录时仅在表单完整且非提交中时可点。
   */
  const voteButtonDisabled = userId ? !formCompleteForVote : false;

  const saveVote = async () => {
    if (!supabase || !listingId || !userId) return;
    if (!willSell) return;
    if (computedPriceAud === null) {
      if (!soldPrice10k.trim()) {
        setPriceErr('Please fill in the sold price prediction (Q2).');
      } else {
        setPriceErr('Please enter a valid integer (in units of 10,000 AUD).');
      }
      return;
    }
    setPriceErr('');
    const willSellBool = willSell === 'sold';
    const priceAud = computedPriceAud;
    setSaving(true);
    const { error } = await supabase.from('votes').upsert(
      {
        listing_id: listingId,
        user_id: userId,
        will_sell: willSellBool,
        sold_price_aud: priceAud,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'listing_id,user_id' }
    );
    setSaving(false);
    if (!error) {
      setHasVoted(true);
      refreshStats();
    }
  };

  const onVoteButtonClick = () => {
    if (!userId) {
      history.push('/sign-in');
      return;
    }
    void saveVote();
  };

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
      .replace(' AM', 'am')
      .replace(' PM', 'pm');
    return `${weekday}, ${day} ${month} ${time}`;
  };

  /**
   * 格式化为 `Saturday, 28 Mar`（不含时间），用于 Q1 目标日期文案。
   */
  const formatAuctionDateOnly = (iso: string) => {
    const d = new Date(iso);
    const weekday = new Intl.DateTimeFormat('en-AU', { weekday: 'long' }).format(d);
    const day = new Intl.DateTimeFormat('en-AU', { day: '2-digit' }).format(d);
    const month = new Intl.DateTimeFormat('en-AU', { month: 'short' }).format(d);
    return `${weekday}, ${day} ${month}`;
  };

  /**
   * Q1 截止日期：优先 `auction_at`；否则 `created_at + 4 weeks`。
   */
  const q1TargetDateLabel = useMemo(() => {
    if (!listing) return 'target date';
    if (listing.auction_at) {
      const t = Date.parse(listing.auction_at);
      if (!Number.isNaN(t)) return formatAuctionDateOnly(listing.auction_at);
    }
    if (listing.created_at) {
      const t = Date.parse(listing.created_at);
      if (!Number.isNaN(t)) {
        const plus4Weeks = new Date(t + 28 * 24 * 60 * 60 * 1000).toISOString();
        return formatAuctionDateOnly(plus4Weeks);
      }
    }
    return 'target date';
  }, [listing]);

  /** 当前 Q1 选择的人类可读文本。 */
  const q1ChoiceLabel = willSell === 'passed' ? 'NO' : 'YES';

  /** 当前 Q2 输入的人类可读文本（Million AUD）。 */
  const q2ValueLabel = computedPriceAud != null ? `${(computedPriceAud / 1000000).toFixed(2)}M` : '—';
  const snapshotShowsQuiz = showVotingQuestionnaire && !hasVoted;
  const snapshotYesRateLabel =
    stats && stats.totalVotes > 0 ? `${Math.round((stats.willSellYes / stats.totalVotes) * 100)}%` : '—';
  const snapshotNoRateLabel =
    stats && stats.totalVotes > 0 ? `${Math.round((stats.willSellNo / stats.totalVotes) * 100)}%` : '—';
  const snapshotMedianLabel =
    stats?.soldPriceMedian != null ? `A$ ${(stats.soldPriceMedian / 1000000).toFixed(2)}M` : '—';
  const snapshotCoverImageUrl = useMemo(() => {
    if (!listing?.cover_image_url) return null;
    return `/api/image-proxy?url=${encodeURIComponent(listing.cover_image_url)}`;
  }, [listing?.cover_image_url]);

  /**
   * 拉起系统分享面板（移动端浏览器支持 Web Share API）。
   * 不支持时降级复制链接到剪贴板。
   */
  const shareListing = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = listing?.title ? `Price Guess: ${listing.title}` : 'Price Guess';
    const text = listing?.title
      ? `Make a price guess on this property: ${listing.title}`
      : 'Make a price guess on this property';

    try {
      // Web Share API（iOS/Android 浏览器会拉起底部分享区）
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await (navigator as Navigator & { share: (data: any) => Promise<void> }).share({
          title,
          text,
          url,
        });
        return;
      }
    } catch {
      // 用户取消分享也会抛错，这里忽略并走提示
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setToastMsg('Link copied to clipboard');
        setToastOpen(true);
        return;
      }
    } catch {}

    
  };

  /**
   * 生成本地快照（PNG）并触发下载，便于用户手动分享到中文社媒。
   */
  const generateSnapshot = async () => {
    if (!snapshotRef.current || !listing || snapshotBusy) return;
    setSnapshotBusy(true);
    setSnapshotForceNoImage(false);
    try {
      const { toPng } = await import('html-to-image');
      if (typeof document !== 'undefined' && 'fonts' in document) {
        await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
      }

      const waitSnapshotImageReady = async (url: string): Promise<boolean> => {
        return new Promise(resolve => {
          const img = new window.Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = url;
        });
      };

      if (snapshotCoverImageUrl) {
        const ok = await waitSnapshotImageReady(snapshotCoverImageUrl);
        if (!ok) {
          setSnapshotForceNoImage(true);
          await new Promise<void>(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
        }
      }

      const dataUrl = await toPng(snapshotRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `guess-snapshot-${listing.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setToastMsg('Snapshot saved. Please share it from your gallery.');
      setToastOpen(true);
    } catch {
      setToastMsg('Snapshot generation failed. Please try again.');
      setToastOpen(true);
    } finally {
      setSnapshotForceNoImage(false);
      setSnapshotBusy(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/discover" text="" aria-label="Back" />
          </IonButtons>
          <IonButtons slot="end">
            <IonButton
              fill="clear"
              aria-label="Generate snapshot"
              className="mx-0 h-11 min-w-[44px]"
              disabled={snapshotBusy}
              onClick={() => {
                void generateSnapshot();
              }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-600">
                <FontAwesomeIcon icon={faCameraRetro} className="text-[1.1rem]" aria-hidden />
              </span>
            </IonButton>
            <IonButton
              fill="clear"
              aria-label="Share"
              className="mx-0 h-11 min-w-[44px]"
              onClick={() => {
                void shareListing();
              }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-600">
                <FontAwesomeIcon icon={faShare} className="text-[1.25rem]" aria-hidden />
              </span>
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding" fullscreen>
        <IonToast
          isOpen={toastOpen}
          message={toastMsg}
          duration={1600}
          onDidDismiss={() => setToastOpen(false)}
        />
        

        {loading ? <div className="text-gray-600">Loading…</div> : null}

        {listing ? (
          <IonCard>
            <IonCardContent className="p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
                <div className="mx-auto w-full shrink-0 md:mx-0 md:w-[min(320px,42%)]">
                  {listing.cover_image_url ? (
                    <div className="relative aspect-[4/3] w-full max-w-[600px] overflow-hidden rounded-xl bg-slate-100 md:max-w-none">
                      <Image
                        src={listing.cover_image_url}
                        alt={listing.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 320px"
                        priority={false}
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-[4/3] w-full max-w-[600px] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-400 md:max-w-none">
                      No cover image
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3 text-left">
                  <h2 className="text-lg font-semibold leading-snug text-gray-900">{listing.title}</h2>
                  {listing.auction_at ? (
                    <div className="text-base font-semibold text-gray-900">
                      Auction At:{' '}
                      <span className="ml-1 font-semibold">{formatAuctionAt(listing.auction_at)}</span>
                    </div>
                  ) : (
                    <div className="text-base font-semibold text-gray-900">For sale</div>
                  )}
                  <div className="mt-1 flex flex-col gap-2">
                    {buildRealestateListingUrl(listing) ? (
                      <IonButton
                        fill="outline"
                        expand="block"
                        className="m-0 justify-start normal-case"
                        href={buildRealestateListingUrl(listing)!}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="https://www.realestate.com.au/favicon.ico"
                          alt=""
                          className="mr-2 h-5 w-5 shrink-0"
                          width={20}
                          height={20}
                        />
                        open in Realestate
                      </IonButton>
                    ) : null}
                    {buildDomainListingUrl(listing) ? (
                      <IonButton
                        fill="outline"
                        expand="block"
                        className="m-0 justify-start normal-case"
                        href={buildDomainListingUrl(listing)!}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="https://www.domain.com.au/favicon.ico"
                          alt=""
                          className="mr-2 h-5 w-5 shrink-0"
                          width={20}
                          height={20}
                        />
                        open in Domain
                      </IonButton>
                    ) : null}
                    <IonButton
                      fill="solid"
                      color="light"
                      expand="block"
                      className="m-0 justify-start normal-case"
                      disabled={snapshotBusy}
                      onClick={() => {
                        void generateSnapshot();
                      }}
                    >
                      <span className="mr-2 inline-flex items-center text-slate-700">
                        <FontAwesomeIcon icon={faCameraRetro} aria-hidden />
                      </span>
                      {snapshotBusy ? 'Generating snapshot...' : 'Generate Snapshot'}
                    </IonButton>
                  </div>
                </div>
              </div>
            </IonCardContent>
          </IonCard>
        ) : null}

        {canQuery ? (
          <div className="space-y-4">
            {showVotingQuestionnaire && !hasVoted ? (
              <>
                <IonCard>
                  <IonCardHeader>
                    <IonCardTitle>{`Q1: Will this property be sold by end of ${q1TargetDateLabel} ?`}</IonCardTitle>
                  </IonCardHeader>
                  <IonCardContent>
                    <fieldset className="m-0 w-full min-w-0 border-0 p-0">
                      <legend className="sr-only">{`Will this property be sold by end of ${q1TargetDateLabel} ?`}</legend>
                      <div className="pl-10 mt-2 flex w-full flex-row items-center justify-between gap-3 sm:gap-6">
                        <label className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2.5 text-[15px] leading-tight text-slate-800">
                          <input
                            type="radio"
                            name="guess-q1-will-sell"
                            className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-emerald-600"
                            checked={willSell === 'sold'}
                            onChange={() => setWillSell('sold')}
                          />
                          <span className="text-center text-[13px] font-semibold leading-tight text-slate-800 sm:text-[15px]">
                            YES
                          </span>
                        </label>
                        <label className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2.5 text-[15px] leading-tight text-slate-800">
                          <input
                            type="radio"
                            name="guess-q1-will-sell"
                            className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-emerald-600"
                            checked={willSell === 'passed'}
                            onChange={() => setWillSell('passed')}
                          />
                          <span className="text-center text-[13px] font-semibold leading-tight text-slate-800 sm:text-[15px]">
                            NO
                          </span>
                        </label>
                      </div>
                    </fieldset>
                  </IonCardContent>
                
                  <IonCardHeader>
                    <IonCardTitle>
                      Q2: If it&apos;s gonna be sold, what&apos;s the estimated price?
                    </IonCardTitle>
                  </IonCardHeader>
                  <IonCardContent>
                    <IonItem lines="none">
                      
                      <div className="w-full">
                        <div className="inline-flex items-baseline" style={{ columnGap: 5 }}>
                          <span className="ml-8 text-base font-semibold text-gray-800 leading-none select-none">
                            A$
                          </span>
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={soldPrice10k}
                            onChange={e => {
                              // 仅保留数字，避免粘贴空格/逗号影响展示
                              const next = e.target.value.replace(/[^\d]/g, '');
                              setSoldPrice10k(next);
                              setPriceErr('');
                            }}
                            style={{
                              width: `${Math.max(6, (soldPrice10k || '').length)}ch`,
                            }}
                            className="m-0 border-0 border-b-2 border-slate-300 bg-transparent p-0 text-xl font-semibold leading-none text-gray-900 outline-none transition-colors duration-150 focus:border-emerald-500"
                          />
                          <span className="text-base font-normal text-gray-700 leading-none select-none">
                            0,000
                          </span>
                        </div>
                      </div>
                    </IonItem>
                    <div className="mt-2 text-xs text-gray-500">
                      {computedPriceAud != null ? (
                        <span className="ml-2 text-gray-700">
                          Your input: {(computedPriceAud / 1000000).toFixed(2)} Million
                        </span>
                      ) : null}
                    </div>
                    {priceErr ? <div className="mt-2 text-sm text-red-600">{priceErr}</div> : null}

                    <div className="pt-3">
                      <IonButton expand="block" disabled={voteButtonDisabled} onClick={onVoteButtonClick}>
                        {saving ? 'Submitting...' : 'VOTE'}
                      </IonButton>
                    </div>
                    <div className="pt-2">
                      <IonButton fill="clear" expand="block" onClick={shareListing}>
                        Share the Quiz
                      </IonButton>
                    </div>
                  </IonCardContent>
                </IonCard>
              </>
            ) : null}

            {showVotingQuestionnaire && !hasVoted ? (
              <IonCard>
                <IonCardContent>
                  <div className="text-sm text-gray-600">Results will be displayed after you vote</div>
                </IonCardContent>
              </IonCard>
            ) : (
              <IonCard className="overflow-hidden shadow-none">
                <IonCardHeader className="pb-0">
                  <IonCardTitle className="text-base">Statistics</IonCardTitle>
                  <p className="mt-1 text-xs font-normal text-slate-500">For entertainment only</p>
                </IonCardHeader>
                <IonCardContent className="pt-2">
                  {stats ? (
                    <GuessStatsVisual stats={stats} />
                  ) : (
                    <div className="py-8 text-center text-sm text-slate-500">Loading</div>
                  )}
                </IonCardContent>
              </IonCard>
            )}
          </div>
        ) : null}

        {listing && showAuctionResultBlock ? (
          <IonCard className="mt-4">
            <IonCardHeader>
              <IonCardTitle className="text-base">Auction Result</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              {listing.sold_price == null ? (
                <p className="text-sm text-gray-600">to be updated</p>
              ) : (
                <div className="space-y-2 text-sm text-gray-800">
                  <div>
                    
                    <span className="font-semibold text-gray-900">
                      A${' '}
                      {Number(listing.sold_price).toLocaleString('en-AU')}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-900">{listing.status || 'upcoming'}</span>
                  </div>
                  <div>
                  
                    <span className="font-medium">
                      {listing.sold_at ? formatAuctionDateOnly(listing.sold_at) : '—'}
                    </span>
                  </div>
                </div>
              )}
            </IonCardContent>
          </IonCard>
        ) : null}

        {/* Off-screen snapshot card (A方案：前端本地生成图片) */}
        {listing ? (
          <div className="pointer-events-none fixed -left-[9999px] top-0 opacity-100">
            <div
              ref={snapshotRef}
              className="box-border w-[1080px] rounded-[36px] border border-slate-200 bg-white p-12 text-slate-900"
            >
              <div className="mb-8 flex items-center justify-between">
                <div className="text-4xl font-black tracking-tight">Guess Price - street auction watch</div>
                <div className="rounded-full bg-emerald-100 px-5 py-2 text-xl font-bold text-emerald-700">SNAPSHOT</div>
              </div>
              {snapshotCoverImageUrl && !snapshotForceNoImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={snapshotCoverImageUrl}
                  alt=""
                  className="mb-8 h-[480px] w-full rounded-3xl object-cover"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="mb-8 flex h-[480px] w-full items-center justify-center rounded-3xl bg-slate-100 text-3xl text-slate-400">
                  No cover image
                </div>
              )}
              <div className="mb-4 text-[42px] font-bold leading-tight">{listing.title}</div>
              {snapshotShowsQuiz ? (
                <div className="space-y-4 rounded-3xl bg-slate-50 p-8">
                  <div className="text-[34px] font-semibold">Q1: Sold by end of {q1TargetDateLabel}?</div>
                  <div className="text-[52px] font-black text-emerald-700">{q1ChoiceLabel}</div>
                  <div className="pt-3 text-[34px] font-semibold">Q2: Estimated sold price</div>
                  <div className="text-[52px] font-black text-indigo-700">A$ {q2ValueLabel}</div>
                </div>
              ) : (
                <div className="space-y-6 rounded-3xl bg-slate-50 p-8">
                  <div className="text-[38px] font-black text-slate-900">Statistics</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-white p-5">
                      <div className="text-xl text-slate-500">YES votes</div>
                      <div className="mt-2 text-[44px] font-black text-emerald-700">{snapshotYesRateLabel}</div>
                    </div>
                    <div className="rounded-2xl bg-white p-5">
                      <div className="text-xl text-slate-500">NO votes</div>
                      <div className="mt-2 text-[44px] font-black text-rose-600">{snapshotNoRateLabel}</div>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-5">
                    <div className="text-xl text-slate-500">Median guessed sold price</div>
                    <div className="mt-2 text-[44px] font-black text-indigo-700">{snapshotMedianLabel}</div>
                  </div>
                  {showAuctionResultBlock ? (
                    <div className="rounded-2xl bg-white p-5">
                      <div className="text-xl text-slate-500">Auction Result</div>
                      <div className="mt-2 text-[36px] font-black text-slate-900">
                        {listing.sold_price == null
                          ? 'to be updated'
                          : `A$ ${Number(listing.sold_price).toLocaleString('en-AU')}`}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </IonContent>
    </IonPage>
  );
}

