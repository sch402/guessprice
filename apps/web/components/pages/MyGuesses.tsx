import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useSupabaseSession } from '../../lib/useSupabaseSession';

type ListingJoin = {
  id: string;
  title: string;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  sold_price: number | null;
  sold_at: string | null;
};

type VoteRow = {
  listing_id: string;
  sold_price_aud: number | null;
  updated_at: string;
  listings: ListingJoin | ListingJoin[] | null;
};

/**
 * 将房源展示为「地址」：优先 `address`，否则郊区/州/邮编，再退回标题。
 */
function formatListingAddress(l: ListingJoin): string {
  const addr = l.address?.trim();
  if (addr) return addr;
  const loc = [l.suburb, l.state, l.postcode].filter(Boolean).join(' ');
  return loc ? `${l.title} · ${loc}` : l.title;
}

/** AUD 整数格式（与竞猜页存储一致）。 */
function formatAudOrDash(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

/**
 * 售出日期（仅日期、英文 en-AU，不含时间）；无效或缺失时返回 `-`。
 */
function formatSoldAt(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
  }).format(d);
}

/**
 * 我的竞猜：列出当前用户已提交的投票及对应房源成交价/售出时间（来自 listings）。
 */
export default function MyGuesses() {
  const history = useHistory();
  const { supabase, session } = useSupabaseSession();
  const userId = session?.user?.id ?? null;

  const [rows, setRows] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr('');
      const { data, error } = await supabase
        .from('votes')
        .select(
          `
          listing_id,
          sold_price_aud,
          updated_at,
          listings (
            id,
            title,
            address,
            suburb,
            state,
            postcode,
            sold_price,
            sold_at
          )
        `
        )
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setErr(error.message || 'Loading failed');
        setRows([]);
        return;
      }
      setRows((data ?? []) as VoteRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const unwrapListing = (row: VoteRow): ListingJoin | null => {
    const raw = row.listings;
    if (raw == null) return null;
    return Array.isArray(raw) ? raw[0] ?? null : raw;
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/me" />
          </IonButtons>
          <IonTitle>My Predictions</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding" fullscreen>
        

        {!userId ? (
          <div className="text-sm text-gray-600">Please sign in</div>
        ) : null}

        {userId && loading ? <div className="text-gray-600">Loading…</div> : null}

        {err ? <div className="text-sm text-red-600">{err}</div> : null}

        {userId && !loading && !err && rows.length === 0 ? (
          <div className="text-sm text-gray-600">Nothing to show here</div>
        ) : null}

        <div className="space-y-3 mt-2">
          {rows.map(row => {
            const listing = unwrapListing(row);
            const title = listing ? formatListingAddress(listing) : '(Data Missing)';
            return (
              <IonCard
                key={row.listing_id}
                button
                onClick={() =>
                  history.push(`/guess?listingId=${encodeURIComponent(row.listing_id)}`)
                }
              >
                <IonCardHeader className="pb-1">
                  <IonCardTitle className="text-base leading-snug">{title}</IonCardTitle>
                </IonCardHeader>
                <IonCardContent className="pt-0 space-y-1 text-sm text-gray-700">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">My Prediction</span>
                    <span className="font-medium text-right">{formatAudOrDash(row.sold_price_aud)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">Actual Price</span>
                    <span className="font-medium text-right">
                      {listing ? formatAudOrDash(listing.sold_price) : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">Sold At</span>
                    <span className="font-medium text-right text-xs sm:text-sm">
                      {listing ? formatSoldAt(listing.sold_at) : '-'}
                    </span>
                  </div>
                </IonCardContent>
              </IonCard>
            );
          })}
        </div>
      </IonContent>
    </IonPage>
  );
}
