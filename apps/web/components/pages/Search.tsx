import {
  IonBackButton,
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
  IonPage,
  IonToolbar,
} from '@ionic/react';
import { searchOutline } from 'ionicons/icons';
import Image from 'next/image';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSupabaseSession } from '../../lib/useSupabaseSession';
import { EmptyStateCard, LoadingStateCard } from '../ui/AsyncStates';

/**
 * 搜索页水平内边距：顶栏各 `IonToolbar` 与正文内容区共用，保证左右对齐。
 */
const SEARCH_PAGE_GUTTER = 'px-4';

/**
 * 底部 Tab + 安全区留白，避免「Show Surrounding Suburbs」等按钮被 `IonTabBar` 遮挡。
 */
const SEARCH_PAGE_BOTTOM_PAD =
  'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]';

/** 拍卖时间范围：未来拍卖 vs 其余（含已结束、时间已过等） */
type AuctionTimeFilter = 'future' | 'recent';

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
  status: string;
  sold_price: number | null;
  sold_at: string | null;
};

/**
 * PostgREST `or`：未设拍卖时间，或拍卖时间仍晚于当前时刻（与 `/api/listings/recommendations` 一致）。
 *
 * @param isoNow 当前时刻 ISO 字符串
 */
function futureUpcomingAuctionFilter(isoNow: string): string {
  return `auction_at.is.null,auction_at.gt."${isoNow}"`;
}

/**
 * Future 列表项：`upcoming` 且（无 `auction_at` 或拍卖时间未到）。
 */
function isFutureAuctionListing(l: Listing): boolean {
  if (l.status !== 'upcoming') return false;
  if (!l.auction_at) return true;
  return new Date(l.auction_at) > new Date();
}

/**
 * 构建 Recent 条件：与 Future 互斥。
 * - `status != upcoming`，或
 * - `upcoming` 且 `auction_at <= now`（`auction_at` 为空不会匹配该行，故与 Future 中的「仅在售无拍卖时间」不重叠）。
 *
 * @param isoNow 当前时刻 ISO 字符串，与查询一致
 */
function recentAuctionsOrFilter(isoNow: string): string {
  return `status.neq.upcoming,and(status.eq.upcoming,auction_at.lte."${isoNow}")`;
}

/**
 * 判断 listing 是否具备可用经纬度（用于周边搜索锚点）。
 */
function hasListingCoords(l: Listing): boolean {
  return (
    typeof l.latitude === 'number' &&
    Number.isFinite(l.latitude) &&
    typeof l.longitude === 'number' &&
    Number.isFinite(l.longitude)
  );
}

/**
 * 非数据库行：仅经纬度，用于 `neq` 与距离；id 不会与真实 listing 冲突。
 */
const SEARCH_MAP_ANCHOR_ID = '__gtp_map_anchor__';

/**
 * Mapbox 地理编码得到的合成锚点（无 listing 行对应）。
 */
function syntheticMapAnchor(keyword: string, latitude: number, longitude: number): Listing {
  const t = keyword.trim();
  const isPostcode = /^\d{1,4}$/.test(t);
  return {
    id: SEARCH_MAP_ANCHOR_ID,
    title: '',
    suburb: null,
    state: null,
    postcode: isPostcode ? t : null,
    latitude,
    longitude,
    auction_at: null,
    cover_image_url: null,
    status: 'upcoming',
    sold_price: null,
    sold_at: null,
  };
}

/**
 * 当库内无任何带坐标房源时，调用服务端 Mapbox 取搜索区域中心点。
 */
async function fetchGeocodeSurroundAnchor(keyword: string): Promise<Listing | null> {
  try {
    const res = await fetch(`/api/geocode/search-center?q=${encodeURIComponent(keyword.trim())}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { latitude?: number; longitude?: number };
    if (typeof j.latitude !== 'number' || typeof j.longitude !== 'number') return null;
    if (!Number.isFinite(j.latitude) || !Number.isFinite(j.longitude)) return null;
    return syntheticMapAnchor(keyword, j.latitude, j.longitude);
  } catch {
    return null;
  }
}

/**
 * 当主搜索结果为空或结果均无坐标时，在同一 suburb/postcode 条件下任取一条带坐标的 listing 作为周边搜索锚点（不加 Future/Recent 过滤）。
 */
async function fetchFallbackSurroundAnchor(
  supabase: SupabaseClient,
  keywordRaw: string
): Promise<Listing | null> {
  const keyword = keywordRaw.trim();
  if (!keyword) return null;
  const escaped = keyword.replace(/[%_,]/g, ' ');
  const isPostcode = /^\d{1,4}$/.test(keyword);
  const postcodeExpr = isPostcode ? `postcode.ilike.${escaped}%` : `postcode.eq.${escaped}`;
  const suburbExpr = `suburb.ilike.%${escaped}%`;

  const { data, error } = await supabase
    .from('listings')
    .select(
      'id,title,suburb,state,postcode,latitude,longitude,auction_at,cover_image_url,status,sold_price,sold_at'
    )
    .or(`${suburbExpr},${postcodeExpr}`)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .limit(1);

  if (error) return null;
  const row = (data ?? [])[0] as Listing | undefined;
  return row && hasListingCoords(row) ? row : null;
}

/**
 * 搜索页（精简版）：顶部固定搜索栏 + Future/Recent 筛选 + 搜索结果列表 + Surrounding Suburbs 扩展。
 * 不含个人入口、新建竞猜与「猜你喜欢」推荐流。
 */
export default function Search() {
  const history = useHistory();
  const location = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { supabase } = useSupabaseSession();
  const [auctionTimeFilter, setAuctionTimeFilter] = useState<AuctionTimeFilter>('future');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [surroundingLoading, setSurroundingLoading] = useState(false);
  const [surroundingListings, setSurroundingListings] = useState<Listing[]>([]);
  /** 仅在实际发起搜索且请求成功后写入；用于区分「正在输入」与「该关键词无结果」。 */
  const [lastSubmittedKeyword, setLastSubmittedKeyword] = useState<string | null>(null);
  /**
   * 周边搜索锚点：优先主结果中第一条带坐标的 listing；主结果为空或无坐标时由 {@link fetchFallbackSurroundAnchor} 得到。
   */
  const [surroundAnchor, setSurroundAnchor] = useState<Listing | null>(null);

  /**
   * 从 Discover 等页带 `?focusSearch=1` 进入时聚焦搜索框并清理 query，避免重复触发。
   */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('focusSearch') !== '1') return;
    const id = window.setTimeout(() => {
      searchInputRef.current?.focus();
      params.delete('focusSearch');
      const q = params.toString();
      history.replace(q ? `/search?${q}` : '/search');
    }, 50);
    return () => window.clearTimeout(id);
  }, [location.search, history]);

  const canQuery = !!supabase;

  const goToGuess = (listingId: string) => {
    history.push(`/guess?listingId=${encodeURIComponent(listingId)}`);
  };

  const openGuess = (listing: Listing) => {
    goToGuess(listing.id);
  };

  /**
   * 按 suburb / postcode 搜索；Future = upcoming 且（无拍卖时间或拍卖未开始）；Recent = 与 Future 互斥的其余房源。
   */
  const searchListings = useCallback(
    async (keywordRaw: string, timeFilter: AuctionTimeFilter) => {
      if (!supabase) return;
      const keyword = keywordRaw.trim();
      if (!keyword) {
        setSearching(false);
        setListings([]);
        setSurroundingListings([]);
        setLastSubmittedKeyword(null);
        setSurroundAnchor(null);
        return;
      }

      setSearching(true);
      setLoading(true);
      try {
        const isoNow = new Date().toISOString();
        const escaped = keyword.replace(/[%_,]/g, ' ');
        const isPostcode = /^\d{1,4}$/.test(keyword);
        const postcodeExpr = isPostcode ? `postcode.ilike.${escaped}%` : `postcode.eq.${escaped}`;
        const suburbExpr = `suburb.ilike.%${escaped}%`;

        let q = supabase
          .from('listings')
          .select(
            'id,title,suburb,state,postcode,latitude,longitude,auction_at,cover_image_url,status,sold_price,sold_at'
          )
          .or(`${suburbExpr},${postcodeExpr}`)
          .limit(200);

        if (timeFilter === 'future') {
          q = q
            .eq('status', 'upcoming')
            .or(futureUpcomingAuctionFilter(isoNow))
            .order('auction_at', { ascending: true, nullsFirst: true });
        } else {
          q = q.or(recentAuctionsOrFilter(isoNow)).order('sold_at', { ascending: false, nullsFirst: false }).order('updated_at', {
            ascending: false,
          });
        }

        const { data, error } = await q;

        if (error) {
          setListings([]);
          setLastSubmittedKeyword(null);
          setSurroundAnchor(null);
          return;
        }
        const rows = (data ?? []) as Listing[];
        setListings(rows);
        setSurroundingListings([]);
        setLastSubmittedKeyword(keyword);
        const fromResults = rows.find(hasListingCoords) ?? null;
        if (fromResults) {
          setSurroundAnchor(fromResults);
        } else {
          let anchor = await fetchFallbackSurroundAnchor(supabase, keyword);
          if (!anchor) {
            anchor = await fetchGeocodeSurroundAnchor(keyword);
          }
          setSurroundAnchor(anchor);
        }
      } finally {
        setLoading(false);
        setSearching(false);
      }
    },
    [supabase]
  );

  /**
   * 以 `surroundAnchor` 为中心在 10km 内按 suburb 去重取房源；时间与排序与主列表一致（Future / Recent）。
   */
  const loadSurroundingSuburbs = async () => {
    if (!supabase || !surroundAnchor || !hasListingCoords(surroundAnchor)) return;
    const mapAnchorPostcode =
      surroundAnchor.id === SEARCH_MAP_ANCHOR_ID && lastSubmittedKeyword
        ? lastSubmittedKeyword.trim()
        : null;
    const excludePostcode =
      mapAnchorPostcode && /^\d{1,4}$/.test(mapAnchorPostcode) ? mapAnchorPostcode : null;

    setSurroundingLoading(true);
    try {
      const isoNow = new Date().toISOString();
      let q = supabase
        .from('listings')
        .select(
          'id,title,suburb,state,postcode,latitude,longitude,auction_at,cover_image_url,status,sold_price,sold_at'
        )
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      /**
       * `id` 列为 UUID 时，不能对合成锚点 id 使用 `neq`（非 UUID 会触发 PostgREST 400）。
       * 合成锚点无对应行，无需排除 id。
       */
      if (surroundAnchor.id !== SEARCH_MAP_ANCHOR_ID) {
        q = q.neq('id', surroundAnchor.id);
      }

      if (auctionTimeFilter === 'future') {
        q = q
          .eq('status', 'upcoming')
          .or(futureUpcomingAuctionFilter(isoNow))
          .order('auction_at', { ascending: true, nullsFirst: true });
      } else {
        q = q
          .or(recentAuctionsOrFilter(isoNow))
          .order('sold_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false });
      }

      const { data, error } = await q.limit(800);

      if (error) {
        setSurroundingListings([]);
        return;
      }

      const existingIds = new Set(listings.map(x => x.id));
      const uniqueBySuburb = new Map<string, Listing>();
      for (const row of (data ?? []) as Listing[]) {
        if (!row.suburb || row.latitude == null || row.longitude == null) continue;
        if (existingIds.has(row.id)) continue;
        if (surroundAnchor.suburb && row.suburb === surroundAnchor.suburb) continue;
        if (excludePostcode && row.postcode === excludePostcode) continue;
        const dist = distanceKm(
          surroundAnchor.latitude!,
          surroundAnchor.longitude!,
          row.latitude,
          row.longitude
        );
        if (dist > 10) continue;
        if (!uniqueBySuburb.has(row.suburb)) uniqueBySuburb.set(row.suburb, row);
      }
      setSurroundingListings(Array.from(uniqueBySuburb.values()));
    } finally {
      setSurroundingLoading(false);
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

  /** 售出价展示（AUD）。 */
  const formatSoldPriceAud = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: 0,
    }).format(Number(value));
  };

  /** 售出时间展示。 */
  const formatSoldAt = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  };

  /**
   * 列表底部：仅 Future 房源显示 GUESS；否则展示结果字段或「result to be updated」。
   */
  const renderListingFooter = (l: Listing) => {
    if (isFutureAuctionListing(l)) {
      return (
        <div className="pt-3">
          <IonButton
            size="small"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              openGuess(l);
            }}
          >
            GUESS
          </IonButton>
        </div>
      );
    }
    if (auctionTimeFilter === 'recent' && l.status === 'upcoming') {
      return (
        <div className="pt-3 text-sm font-medium leading-snug text-amber-800 dark:text-amber-200/90">
          result to be updated
        </div>
      );
    }
    return (
      <div className="space-y-1 pt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        <div>
          
          <span className="font-medium text-slate-900 dark:text-slate-100">{l.status}</span>
        </div>
        <div>
          
          <span className="font-medium">{formatSoldPriceAud(l.sold_price)}</span>
        </div>
        <div>
         
          <span className="font-medium">{formatSoldAt(l.sold_at)}</span>
        </div>
      </div>
    );
  };

  /**
   * 切换 Future / Recent：有搜索词则重搜，否则清空列表。
   */
  const handleAuctionTimeFilterChange = (next: AuctionTimeFilter) => {
    setAuctionTimeFilter(next);
    setSurroundingListings([]);
    if (searchText.trim()) {
      void searchListings(searchText, next);
    } else {
      setListings([]);
    }
  };

  return (
    <IonPage>
      <IonHeader className="ion-no-border border-b border-slate-200/80">
        <IonToolbar className={`${SEARCH_PAGE_GUTTER} [--min-height:48px]`}>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/discover" text="" aria-label="Back" />
          </IonButtons>
        </IonToolbar>
        <IonToolbar className={`${SEARCH_PAGE_GUTTER} pt-0 pb-2`}>
          <div className="flex w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-slate-600 dark:bg-slate-900 sm:px-4">
            <IonIcon icon={searchOutline} className="shrink-0 text-lg text-slate-400" />
            <input
              ref={searchInputRef}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void searchListings(searchText, auctionTimeFilter);
              }}
              placeholder="Search suburb or postcode"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-slate-800 outline-none dark:text-slate-100"
              disabled={!canQuery}
              autoComplete="off"
              enterKeyHint="search"
            />
            <IonButton
              size="small"
              fill="clear"
              onClick={() => void searchListings(searchText, auctionTimeFilter)}
              disabled={loading || !canQuery}
            >
              Search
            </IonButton>
          </div>
        </IonToolbar>
        <IonToolbar className={`${SEARCH_PAGE_GUTTER} pt-0 pb-3`}>
          <fieldset className="m-0 w-full min-w-0 border-0 p-0">
            <legend className="sr-only">Filter by auction time</legend>
            <div className="flex w-full flex-row items-center justify-between gap-3 sm:gap-6">
              <label className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2.5 text-[15px] leading-tight text-slate-800 dark:text-slate-100">
                <input
                  type="radio"
                  name="auction-time-filter"
                  className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-emerald-600"
                  checked={auctionTimeFilter === 'future'}
                  onChange={() => handleAuctionTimeFilterChange('future')}
                />
                <span className="text-center text-[13px] font-semibold leading-tight text-slate-800 dark:text-slate-100 sm:text-[15px]">
                  Future auctions/For sale
                </span>
              </label>
              <label className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2.5 text-[15px] leading-tight text-slate-800 dark:text-slate-100">
                <input
                  type="radio"
                  name="auction-time-filter"
                  className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-emerald-600"
                  checked={auctionTimeFilter === 'recent'}
                  onChange={() => handleAuctionTimeFilterChange('recent')}
                />
                <span className="text-center text-[13px] font-semibold leading-tight text-slate-800 dark:text-slate-100 sm:text-[15px]">
                  Recent auctions/Sold
                </span>
              </label>
            </div>
          </fieldset>
        </IonToolbar>
      </IonHeader>
      {/* 勿对 IonContent 设 `--padding-top:0`，否则首屏内容会被固定顶栏遮挡 */}
      <IonContent
        fullscreen
        className="[--padding-start:0] [--padding-end:0]"
      >
        <div
          className={`box-border min-h-full w-full max-w-full ${SEARCH_PAGE_GUTTER} pt-6 ${SEARCH_PAGE_BOTTOM_PAD}`}
        >
          <div className="flex flex-col gap-5">
            {loading ? (
              <LoadingStateCard label={searching ? 'Searching listings' : 'Loading listings'} />
            ) : null}

            {!loading &&
            listings.length === 0 &&
            surroundingListings.length === 0 &&
            !surroundingLoading &&
            (!canQuery ||
              (lastSubmittedKeyword !== null &&
                lastSubmittedKeyword === searchText.trim())) ? (
              <EmptyStateCard
                className="border-0"
                title={!canQuery ? 'Supabase is not configured' : 'No matches'}
                description={
                  !canQuery
                    ? 'Add your Supabase env settings, then search again.'
                    : 'Try search a nearby suburb'
                }
              />
            ) : null}

            {listings.length > 0 ? (
              <div className="flex flex-col gap-4">
                {listings.map(l => (
                  <IonCard
                    key={l.id}
                    className="m-0 w-full overflow-hidden shadow-md"
                    button
                    onClick={() => openGuess(l)}
                  >
                {l.cover_image_url ? (
                  <div className="relative h-44 w-full overflow-hidden rounded-t-xl">
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
                  {renderListingFooter(l)}
                </IonCardContent>
                  </IonCard>
                ))}
              </div>
            ) : null}

            {!loading &&
            surroundingListings.length === 0 &&
            canQuery &&
            lastSubmittedKeyword !== null &&
            lastSubmittedKeyword === searchText.trim() ? (
              <IonButton
                expand="block"
                fill="outline"
                className="m-0"
                disabled={surroundingLoading || !surroundAnchor}
                onClick={loadSurroundingSuburbs}
              >
                {surroundingLoading ? 'Loading...' : 'Show Surrounding Suburbs'}
              </IonButton>
            ) : null}

            {surroundingListings.length > 0 ? (
              <div className="flex flex-col gap-4">
                <h3 className="m-0 text-lg font-semibold leading-tight text-slate-800">Surrounding Suburbs</h3>
                {surroundingListings.map(l => (
                  <IonCard
                    key={`surrounding-${l.id}`}
                    className="m-0 w-full overflow-hidden shadow-md"
                    button
                    onClick={() => openGuess(l)}
                  >
                  {l.cover_image_url ? (
                    <div className="relative h-44 w-full overflow-hidden rounded-t-xl">
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
                    {renderListingFooter(l)}
                  </IonCardContent>
                  </IonCard>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}

/**
 * 两点经纬度的大圆距离（公里）。
 */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}
