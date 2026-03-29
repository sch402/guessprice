import * as cheerio from 'cheerio';
import { fromZonedTime } from 'date-fns-tz';

import { auctionWallClockTimezoneFromAuState } from './auAuctionTimezone';

/**
 * Domain 页面上展示的拍卖时间为「房源所在地」本地墙钟；解析时用 {@link auctionWallClockTimezoneFromAuState} 映射到 IANA 再 `fromZonedTime` 转 UTC。
 */

export type ScrapedListingFields = {
  title: string;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  auction_at: string | null;
  cover_image_url: string | null;
  suggest_price: number | null;
  /** 页面挂牌类型：仅 `sale` 允许入库竞猜。 */
  listing_kind: 'sale' | 'rent' | 'sold' | 'unknown';
};
export type ScrapeMode = 'quick' | 'full';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
let brightDataLastError: string | null = null;
let brightDataResiLastError: string | null = null;
const FETCH_TIMEOUT_MS = {
  brightData: 12000,
  brightDataZone: 8000,
  brightDataResidential: 12000,
  firecrawl: 12000,
  directFetchAttempt: 10000,
  mapbox: 8000,
} as const;

/**
 * 从 HTML 中取出 `__NEXT_DATA__` JSON 字符串。优先 Cheerio `.text()`，为空时对原始 HTML 做正则兜底（大脚本在部分解析器下会丢文本）。
 */
function extractNextDataRawString(html: string, $: cheerio.CheerioAPI): string | null {
  const fromDom = $('#__NEXT_DATA__').first().text()?.trim();
  if (fromDom) return fromDom;
  const m = html.match(/<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  const fromRegex = m?.[1]?.trim();
  return fromRegex || null;
}

/**
 * 从已获取的 HTML 解析 listings 表字段（与 {@link scrapeListingPage} 共用）。
 */
function parseListingHtml(
  html: string,
  source: 'realestate' | 'domain',
  pageUrl: string
): ScrapedListingFields {
  const $ = cheerio.load(html);

  const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || null;
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || null;
  const titleTag = $('title').first().text().trim() || 'Listing';

  let nextData: unknown = null;
  const nextDataRaw = extractNextDataRawString(html, $);
  if (nextDataRaw) {
    try {
      nextData = JSON.parse(nextDataRaw);
    } catch {
      nextData = null;
    }
  }

  const fromNext = nextData ? extractFromNextData(nextData, source) : null;

  const rawTitle = fromNext?.title || ogTitle || titleTag;
  const title = cleanListingTitle(rawTitle);

  const fromJsonLdAddress = extractAddressPartsFromJsonLd($);
  const inferredFromText = inferAuAddressParts(
    (fromNext?.address as string | null) ?? null,
    title
  );
  const suburb = fromNext?.suburb ?? fromJsonLdAddress.suburb ?? inferredFromText.suburb;
  const state = fromNext?.state ?? fromJsonLdAddress.state ?? inferredFromText.state;
  const postcode = fromNext?.postcode ?? fromJsonLdAddress.postcode ?? inferredFromText.postcode;

  const address =
    coerceFullAddress(fromNext?.address ?? null, suburb, state, postcode) ||
    // 兜底：若标题本身像地址，则用标题（清洗后）作为完整地址
    (looksLikeAuAddress(title) ? title : null);
  const latitude = fromNext?.latitude ?? null;
  const longitude = fromNext?.longitude ?? null;
  /**
   * Domain：页面常同时有 Inspection 与 Auction，启发式遍历 `__NEXT_DATA__` / JSON-LD
   * 易把「开放参观」当作拍卖时间。此处用专用解析并禁止走通用 `auctionDate` 首条命中。
   */
  const domainAuctionTz = auctionWallClockTimezoneFromAuState(state);
  const auction_at =
    source === 'domain'
      ? extractDomainAuctionAt($, html, nextData, domainAuctionTz)
      : fromNext?.auction_at ??
        extractAuctionFromJsonLd($) ??
        extractAuctionFromText($) ??
        null;
  const cover_image_url = fromNext?.cover_image_url || ogImage;
  const suggest_price = fromNext?.suggest_price ?? null;
  const listing_kind = detectListingKind($, source, pageUrl, ogTitle, titleTag);

  return {
    title,
    address,
    suburb,
    state,
    postcode,
    latitude,
    longitude,
    auction_at,
    cover_image_url,
    suggest_price,
    listing_kind,
  };
}

/**
 * 识别页面是否为 `for sale`。用于阻止 rent/sold 链接进入竞猜库。
 */
function detectListingKind(
  $: cheerio.CheerioAPI,
  _source: 'realestate' | 'domain',
  pageUrl: string,
  ogTitle: string | null,
  titleTag: string
): 'sale' | 'rent' | 'sold' | 'unknown' {
  const u = pageUrl.toLowerCase();
  if (u.includes('/sold/')) return 'sold';
  if (u.includes('/rent/')) return 'rent';

  const ogDesc =
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    '';
  const h1 = $('h1').first().text().trim();
  const hay = `${ogTitle || ''} ${titleTag || ''} ${ogDesc} ${h1}`.toLowerCase();

  if (/\bfor rent\b/.test(hay) || /\bper week\b/.test(hay) || /\bavailable now\b/.test(hay)) {
    return 'rent';
  }
  if (
    /\bsold\b/.test(hay) &&
    (/\bsold in\b/.test(hay) || /\bsold\s*-\s*\$/.test(hay) || /\bsold\b.*\bon\b/.test(hay))
  ) {
    return 'sold';
  }
  if (/\bfor sale\b/.test(hay) || /\bauction\b/.test(hay)) return 'sale';
  return 'unknown';
}

/**
 * 抓取房源页 HTML 并尽量提取 listings 表可用字段（含隐藏指导价尝试）。
 */
export async function scrapeListingPage(
  pageUrl: string,
  source: 'realestate' | 'domain',
  mode: ScrapeMode = 'full'
): Promise<ScrapedListingFields> {
  const html = mode === 'quick' ? await getHtmlForQuickStage(pageUrl, source) : await getHtmlWithFallback(pageUrl, source);
  const parsed = parseListingHtml(html, source, pageUrl);
  if (mode === 'quick') return parsed;
  if (parsed.latitude != null && parsed.longitude != null) return parsed;

  const geocodeQuery = buildGeocodeQuery(parsed);
  if (!geocodeQuery) return parsed;
  const geo = await geocodeWithMapbox(geocodeQuery);
  if (!geo) return parsed;

  return {
    ...parsed,
    latitude: geo.latitude,
    longitude: geo.longitude,
  };
}

/**
 * 组装用于地理编码的地址查询串。优先完整地址，其次 suburb/state/postcode。
 */
function buildGeocodeQuery(fields: Pick<ScrapedListingFields, 'address' | 'suburb' | 'state' | 'postcode'>): string | null {
  const address = fields.address?.trim();
  if (address) return address;

  const fallback = [fields.suburb, fields.state, fields.postcode].filter(Boolean).join(' ').trim();
  return fallback || null;
}

/**
 * 使用 Mapbox Geocoding API 将地址转换为经纬度（仅取首个匹配）。
 */
async function geocodeWithMapbox(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const token = process.env.MAPBOX_TOKEN?.trim();
  if (!token) return null;

  const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`;
  const params = new URLSearchParams({
    access_token: token,
    country: 'AU',
    limit: '1',
    types: 'address,place,postcode',
    autocomplete: 'false',
  });

  try {
    const res = await fetchWithTimeout(
      `${endpoint}?${params.toString()}`,
      { method: 'GET' },
      FETCH_TIMEOUT_MS.mapbox
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: Array<{ center?: [number, number] }>;
    };
    const center = json.features?.[0]?.center;
    if (!Array.isArray(center) || center.length < 2) return null;

    const [longitude, latitude] = center;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
  } catch {
    return null;
  }
}

async function getHtmlWithFallback(
  pageUrl: string,
  source: 'realestate' | 'domain'
): Promise<string> {
  brightDataLastError = null;
  brightDataResiLastError = null;
  // 1) Bright Data Web Unlocker（/request API）
  const brightDataKey = process.env.BRIGHTDATA_API_KEY;
  if (brightDataKey) {
    const html = await tryBrightData(pageUrl, brightDataKey, unlockerCountryForSource(source));
    if (html) return html;
  }

  // 2) Bright Data Residential 代理（superproxy）：Unlocker 未开 Premium 域名时常需此项才能访问 realestate
  const resiHtml = await tryBrightDataResidentialProxy(pageUrl);
  if (resiHtml) return resiHtml;

  // 3) 使用 Firecrawl（由用户自行配置 Key；避免本地频繁触发限流）
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (firecrawlKey) {
    const html = await tryFirecrawl(pageUrl, firecrawlKey);
    if (html) return html;
  }

  // 4) 直接请求（带退避重试）
  try {
    const res = await fetchWithRetry(pageUrl);
    return await res.text();
  } catch (err) {
    // 5) realestate 常见 429：改走只读代理抓取原始 HTML，避免被站点限流直接打断。
    if (source === 'realestate' && isRateLimitedError(err)) {
      const mirrored = await tryJinaMirror(pageUrl);
      if (mirrored) return mirrored;
      const parts = [brightDataLastError, brightDataResiLastError].filter(Boolean);
      if (parts.length) {
        throw new Error(`Failed to fetch page: HTTP 429 (Bright Data: ${parts.join('; ')})`);
      }
    }
    throw err;
  }
}

/**
 * 快速阶段（用于“先入库再跳转”）：
 * 优先走直连短链路，失败再有限兜底，避免慢链路阻塞首跳体验。
 */
async function getHtmlForQuickStage(
  pageUrl: string,
  source: 'realestate' | 'domain'
): Promise<string> {
  brightDataLastError = null;
  brightDataResiLastError = null;
  try {
    const res = await fetchWithRetryQuick(pageUrl);
    return await res.text();
  } catch {
    // quick 阶段允许少量兜底，但不走完整慢链路。
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (firecrawlKey) {
    const html = await tryFirecrawl(pageUrl, firecrawlKey);
    if (html) return html;
  }

  if (source === 'realestate') {
    const mirrored = await tryJinaMirror(pageUrl);
    if (mirrored) return mirrored;
  }

  // 快阶段失败后再回退完整链路，保证成功率。
  return getHtmlWithFallback(pageUrl, source);
}

/**
 * realestate / domain 均为澳洲站点；Bright Data `/request` 需传 `country`（如 `au`），
 * 否则可能对 realestate 误报 「Premium permissions」（与是否开通 Premium 无关）。
 */
function unlockerCountryForSource(source: 'realestate' | 'domain'): string | undefined {
  const override = process.env.BRIGHTDATA_REQUEST_COUNTRY?.trim().toLowerCase();
  if (override) return override;
  if (source === 'realestate' || source === 'domain') return 'au';
  return undefined;
}

/**
 * 使用 Bright Data **Web Unlocker**（`/request` API）抓取原始 HTML。
 * `BRIGHTDATA_ZONE` 必须是控制台里 Web Unlocker 产品的 zone 名（如 `web_unlocker1`），
 * 不要填 Residential 代理的 zone（如 `residential_proxy1`）；二者产品不同。
 * 未设置 `BRIGHTDATA_ZONE` 时会尝试 `get_active_zones` 取首个 zone，可能与 Unlocker 不匹配，建议显式填写。
 */
async function tryBrightData(pageUrl: string, apiKey: string, country?: string): Promise<string | null> {
  const zone = process.env.BRIGHTDATA_ZONE || (await detectBrightDataZone(apiKey));
  if (!zone) {
    brightDataLastError = 'No usable zone. Set BRIGHTDATA_ZONE in .env.local.';
    return null;
  }
  const geo = country ? { country } : {};
  const payloads: Array<Record<string, unknown>> = zone
    ? [
        { zone, url: pageUrl, format: 'raw', method: 'GET', ...geo },
        { zone, url: pageUrl, format: 'json', method: 'GET', data_format: 'html', ...geo },
      ]
    : [
        { url: pageUrl, format: 'raw', method: 'GET', ...geo },
        { url: pageUrl, format: 'json', method: 'GET', data_format: 'html', ...geo },
      ];

  for (const body of payloads) {
    try {
      const res = await fetchWithTimeout(
        'https://api.brightdata.com/request',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        FETCH_TIMEOUT_MS.brightData
      );
      if (!res.ok) continue;

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const rawText = await res.text();

      if (contentType.includes('application/json')) {
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          brightDataLastError = 'Unlocker returned non-JSON';
          continue;
        }

        const statusCode = typeof json['status_code'] === 'number' ? json['status_code'] : null;
        if (statusCode != null && statusCode >= 400) {
          const hdrs = json['headers'] as Record<string, unknown> | undefined;
          const lumErr =
            hdrs && typeof hdrs['x-luminati-error'] === 'string'
              ? (hdrs['x-luminati-error'] as string)
              : null;
          brightDataLastError = lumErr || `Unlocker status_code=${statusCode}`;
          continue;
        }

        const html =
          pickString(json['raw_html']) ||
          pickString(json['rawHtml']) ||
          pickString(json['html']) ||
          pickString(json['body']) ||
          pickString(json['content']) ||
          pickString((json['data'] as Record<string, unknown> | undefined)?.['html']) ||
          pickString((json['data'] as Record<string, unknown> | undefined)?.['raw_html']) ||
          null;
        if (html && html.length > 1000) return html;
        brightDataLastError = 'No usable HTML in Unlocker JSON';
        continue;
      }

      if (
        rawText.includes('Premium permissions') ||
        rawText.includes('Premium domains') ||
        rawText.includes('x-luminati-error')
      ) {
        const line = rawText.split('\n')[0]?.slice(0, 200) || rawText.slice(0, 200);
        brightDataLastError = line;
        continue;
      }

      if (rawText && rawText.length > 1000 && rawText.includes('<html')) return rawText;
    } catch {
      // try next payload
    }
  }
  brightDataLastError = brightDataLastError || `Zone=${zone} returned no usable response`;
  return null;
}

/**
 * 通过 Bright Data Residential（`brd.superproxy.io`）发起 HTTPS GET，拿到页面 HTML。
 *
 * 环境变量（二选一）：
 * - `BRIGHTDATA_RESI_PROXY_URL`：`http://user:password@brd.superproxy.io:33335`
 * - 或 `BRIGHTDATA_RESI_USER` + `BRIGHTDATA_RESI_PASSWORD`，可选 `BRIGHTDATA_RESI_HOST` / `BRIGHTDATA_RESI_PORT`
 */
async function tryBrightDataResidentialProxy(pageUrl: string): Promise<string | null> {
  const single = process.env.BRIGHTDATA_RESI_PROXY_URL?.trim();
  const user = process.env.BRIGHTDATA_RESI_USER?.trim();
  const pass = process.env.BRIGHTDATA_RESI_PASSWORD?.trim();
  const host = process.env.BRIGHTDATA_RESI_HOST?.trim() || 'brd.superproxy.io';
  const port = process.env.BRIGHTDATA_RESI_PORT?.trim() || '33335';

  let proxyUrl: string | null = null;
  if (single) {
    proxyUrl = single;
  } else if (user && pass) {
    proxyUrl = `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  } else {
    return null;
  }

  try {
    const { fetch: undiciFetch, ProxyAgent } = await import('undici');
    const insecure = process.env.BRIGHTDATA_RESI_TLS_INSECURE === '1';
    const agent = insecure
      ? new ProxyAgent({
          uri: proxyUrl,
          proxyTls: { rejectUnauthorized: false },
          requestTls: { rejectUnauthorized: false },
        })
      : new ProxyAgent(proxyUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS.brightDataResidential);
    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      res = await undiciFetch(pageUrl, {
        dispatcher: agent,
        signal: controller.signal,
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'en-AU,en;q=0.9',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) {
      if (res.status === 429) {
        brightDataResiLastError =
          'Residential proxy still got HTTP 429 from target (often anti-bot).';
      } else {
        brightDataResiLastError = `Residential proxy HTTP ${res.status}`;
      }
      return null;
    }
    const text = await res.text();
    if (text && text.length > 1000 && (text.includes('<html') || text.includes('__NEXT_DATA__')))
      return text;
    if (text.includes('KPSDK') && text.includes('ips.js')) {
      brightDataResiLastError = 'Residential proxy returned anti-bot challenge page (KPSDK)';
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 自动探测账号可用 zone（仅取首个 active zone）。
 */
async function detectBrightDataZone(apiKey: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      'https://api.brightdata.com/zone/get_active_zones',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      FETCH_TIMEOUT_MS.brightDataZone
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Array<Record<string, unknown>>;
    const first = Array.isArray(json) ? json[0] : null;
    const name = first && typeof first.name === 'string' ? first.name.trim() : '';
    return name || null;
  } catch {
    return null;
  }
}

async function tryFirecrawl(pageUrl: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      'https://api.firecrawl.dev/v0/scrape',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: pageUrl,
          pageOptions: {
            onlyMainContent: false,
            includeHtml: true,
          },
        }),
      },
      FETCH_TIMEOUT_MS.firecrawl
    );
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const data = json?.data;
    const html = data?.rawHtml || data?.html || data?.source || data?.metadata?.rawHtml;
    return typeof html === 'string' && html.length > 1000 ? html : null;
  } catch {
    return null;
  }
}

async function fetchWithRetry(pageUrl: string): Promise<Response> {
  const attempt = async () =>
    fetchWithTimeout(
      pageUrl,
      {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'en-AU,en;q=0.9',
          Accept: 'text/html,application/xhtml+xml',
          Referer: pageUrl,
        },
        redirect: 'follow',
        cache: 'no-store',
      },
      FETCH_TIMEOUT_MS.directFetchAttempt
    );

  let res = await attempt();
  if (res.ok) return res;

  // 对 429 做短暂退避重试（MVP：最多 2 次）
  if (res.status === 429) {
    for (const ms of [800, 1500]) {
      await new Promise(r => setTimeout(r, ms));
      res = await attempt();
      if (res.ok) return res;
      if (res.status !== 429) break;
    }
  }

  throw new Error(`Failed to fetch page: HTTP ${res.status}`);
}

/**
 * 快速阶段直连重试：总预算更短，目标是尽快拿到可解析 HTML。
 */
async function fetchWithRetryQuick(pageUrl: string): Promise<Response> {
  const attempt = async () =>
    fetchWithTimeout(
      pageUrl,
      {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'en-AU,en;q=0.9',
          Accept: 'text/html,application/xhtml+xml',
          Referer: pageUrl,
        },
        redirect: 'follow',
        cache: 'no-store',
      },
      5000
    );

  let res = await attempt();
  if (res.ok) return res;

  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 400));
    res = await attempt();
    if (res.ok) return res;
  }

  throw new Error(`Failed to fetch page: HTTP ${res.status}`);
}

function isRateLimitedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes('HTTP 429') || err.message.includes('Request timed out');
}

async function tryJinaMirror(pageUrl: string): Promise<string | null> {
  try {
    const mirrorUrl = `https://r.jina.ai/http://${pageUrl.replace(/^https?:\/\//, '')}`;
    const res = await fetchWithTimeout(
      mirrorUrl,
      {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'en-AU,en;q=0.9',
        },
        cache: 'no-store',
        redirect: 'follow',
      },
      FETCH_TIMEOUT_MS.directFetchAttempt
    );
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length < 1000) return null;
    const htmlStart = text.indexOf('<!doctype');
    if (htmlStart >= 0) return text.slice(htmlStart);
    return text.includes('<html') ? text : null;
  } catch {
    return null;
  }
}

/**
 * 为 `fetch` 提供超时控制，避免外部站点长时间悬挂导致整个分析流程无响应。
 */
async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out (>${timeoutMs}ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

type NextExtract = Partial<ScrapedListingFields> & { title?: string };

/**
 * 从 __NEXT_DATA__ 树中启发式提取字段（页面结构可能变化，多路径兜底）。
 */
function extractFromNextData(data: unknown, source: 'realestate' | 'domain'): NextExtract | null {
  const out: NextExtract = {};
  const seen = new Set<unknown>();

  const visit = (node: unknown) => {
    if (node === null || node === undefined) return;
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const o = node as Record<string, unknown>;

    if (typeof o.title === 'string' && o.title.length > 5 && !out.title) {
      out.title = o.title;
    }
    if (typeof o.name === 'string' && o.name.includes(',') && o.name.length > 8 && !out.address) {
      out.address = o.name;
    }
    if (typeof o.fullAddress === 'string' && !out.address) out.address = o.fullAddress;
    if (typeof o.displayAddress === 'string' && !out.address) out.address = o.displayAddress;
    if (typeof o.streetAddress === 'string' && !out.address) {
      const sub = typeof o.suburb === 'string' ? o.suburb : '';
      const st = typeof o.state === 'string' ? o.state : '';
      const pc = typeof o.postcode === 'string' ? o.postcode : '';
      out.address = [o.streetAddress, sub, st, pc].filter(Boolean).join(', ');
    }

    if (typeof o.suburb === 'string' && !out.suburb) out.suburb = o.suburb;
    if (typeof o.state === 'string' && /^[A-Z]{2,3}$/.test(o.state) && !out.state) out.state = o.state;
    if (typeof o.postcode === 'string' && /^\d{4}$/.test(o.postcode) && !out.postcode) {
      out.postcode = o.postcode;
    }

    if (typeof o.latitude === 'number' && !out.latitude) out.latitude = o.latitude;
    if (typeof o.longitude === 'number' && !out.longitude) out.longitude = o.longitude;

    /** Domain 的拍卖时间改由 {@link extractDomainAuctionAt} 专门解析，避免采到 inspection。 */
    if (source !== 'domain') {
      if (typeof o.auctionDate === 'string' && !out.auction_at) {
        const d = Date.parse(o.auctionDate);
        if (!Number.isNaN(d)) out.auction_at = new Date(d).toISOString();
      }
      if (typeof o.auctionTime === 'string' && o.auctionDate && !out.auction_at) {
        const d = Date.parse(`${o.auctionDate} ${o.auctionTime}`);
        if (!Number.isNaN(d)) out.auction_at = new Date(d).toISOString();
      }
    }

    if (typeof o.imageUrl === 'string' && o.imageUrl.startsWith('http') && !out.cover_image_url) {
      out.cover_image_url = o.imageUrl;
    }

    const priceCandidates = pickSuggestPrice(o);
    if (priceCandidates != null && out.suggest_price == null) {
      out.suggest_price = priceCandidates;
    }

    for (const v of Object.values(o)) {
      visit(v);
    }
  };

  visit(data);

  if (source === 'domain' && !out.title) {
    out.title = 'Domain listing';
  }
  if (source === 'realestate' && !out.title) {
    out.title = 'realestate.com.au listing';
  }

  return Object.keys(out).length ? out : null;
}

function cleanListingTitle(input: string): string {
  const s = String(input || '').trim();
  if (!s) return 'Listing';
  // 常见形态：`8 Oakdale Place, Baulkham Hills NSW 2153 | Domain`
  const pipe = s.split('|')[0]?.trim();
  // 也可能是 `... - Domain` / `... - realestate.com.au`
  const dash = pipe?.replace(/\s+-\s+(Domain|realestate\.com\.au).*$/i, '').trim();
  return dash || pipe || s;
}

function looksLikeAuAddress(title: string): boolean {
  return /,\s*.+\s+(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s+\d{4}\b/i.test(title);
}

/**
 * 从地址文本中提取 suburb/state/postcode。
 * 常见格式：
 * - `8 Oakdale Place, Baulkham Hills NSW 2153`
 * - `8 Oakdale Place Baulkham Hills NSW 2153`
 */
function inferAuAddressParts(
  address: string | null,
  title: string
): { suburb: string | null; state: string | null; postcode: string | null } {
  const candidate = (address && address.trim()) || title.trim();
  if (!candidate) return { suburb: null, state: null, postcode: null };

  const normalized = candidate
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const m = normalized.match(/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s+(\d{4})\b/i);
  if (!m) return { suburb: null, state: null, postcode: null };

  const state = m[1].toUpperCase();
  const postcode = m[2];
  const beforeState = normalized
    .slice(0, m.index)
    .replace(/[,\s]+$/g, '')
    .trim();
  const suburbRaw = beforeState.split(',').pop()?.trim() || '';
  const suburb = suburbRaw || null;

  return { suburb, state, postcode };
}

/**
 * 从 JSON-LD 的 PostalAddress 中提取 suburb/state/postcode。
 */
function extractAddressPartsFromJsonLd($: cheerio.CheerioAPI): {
  suburb: string | null;
  state: string | null;
  postcode: string | null;
} {
  const out: { suburb: string | null; state: string | null; postcode: string | null } = {
    suburb: null,
    state: null,
    postcode: null,
  };

  const scripts = $('script[type="application/ld+json"]');
  scripts.each((_i, el) => {
    if (out.suburb && out.state && out.postcode) return;
    const raw = $(el).text();
    if (!raw) return;
    try {
      const json = JSON.parse(raw);
      collectAddressPartsFromJsonLdNode(json, out);
    } catch {
      // ignore
    }
  });

  return out;
}

/**
 * 深度遍历 JSON-LD 节点并提取 PostalAddress 字段。
 */
function collectAddressPartsFromJsonLdNode(
  node: unknown,
  out: { suburb: string | null; state: string | null; postcode: string | null }
): void {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach(n => collectAddressPartsFromJsonLdNode(n, out));
    return;
  }
  if (typeof node !== 'object') return;

  const o = node as Record<string, unknown>;
  const maybeLocality = o.addressLocality;
  const maybeRegion = o.addressRegion;
  const maybePostcode = o.postalCode;

  if (!out.suburb && typeof maybeLocality === 'string' && maybeLocality.trim()) {
    out.suburb = maybeLocality.trim();
  }
  if (!out.state && typeof maybeRegion === 'string' && maybeRegion.trim()) {
    out.state = maybeRegion.trim().toUpperCase();
  }
  if (!out.postcode && typeof maybePostcode === 'string' && /^\d{4}$/.test(maybePostcode.trim())) {
    out.postcode = maybePostcode.trim();
  }

  for (const v of Object.values(o)) collectAddressPartsFromJsonLdNode(v, out);
}

function coerceFullAddress(
  address: string | null,
  suburb: string | null,
  state: string | null,
  postcode: string | null
): string | null {
  if (!address) return null;
  const a = address.replace(/\s+/g, ' ').trim();
  if (!a) return null;
  // 如果地址已包含州+邮编，直接返回
  if (/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s+\d{4}\b/i.test(a)) return a;

  // 尝试拼接 suburb/state/postcode（形态：`8 Oakdale Place, Baulkham Hills NSW 2153`）
  const sub = (suburb || '').trim();
  const st = (state || '').trim();
  const pc = (postcode || '').trim();
  const tail = [sub, st, pc].filter(Boolean).join(' ').trim();
  if (!tail) return a;

  // 若 address 已含 suburb（弱判断），则只补 state/postcode
  if (sub && a.toLowerCase().includes(sub.toLowerCase())) {
    const tail2 = [st, pc].filter(Boolean).join(' ').trim();
    return tail2 ? `${a} ${tail2}`.replace(/\s+/g, ' ').trim() : a;
  }
  return `${a}, ${tail}`.replace(/\s+/g, ' ').trim();
}

/**
 * Domain 房源页：只采用「Auction」小节或明确的拍卖 JSON，避免 Inspection 时间入库。
 *
 * @param $ Cheerio 根
 * @param html 原始 HTML（用于正则，保留结构）
 * @param nextData 已解析的 `__NEXT_DATA__`
 * @param auctionTimeZone 房源所在州对应的 IANA 时区（见 {@link auctionWallClockTimezoneFromAuState}）
 */
function extractDomainAuctionAt(
  $: cheerio.CheerioAPI,
  html: string,
  nextData: unknown,
  auctionTimeZone: string
): string | null {
  const normalized = html.replace(/\s+/g, ' ');
  /** 优先：页面「Auction」小节正则（避免父级整块含 Inspection 文本时误匹配周三） */
  const fromBlock = extractDomainAuctionFromNormalizedHtml(normalized, auctionTimeZone);
  if (fromBlock) return fromBlock;

  const fromHeading = extractDomainAuctionFromAuctionHeading($, auctionTimeZone);
  if (fromHeading) return fromHeading;

  const fromLd = extractAuctionFromJsonLdDomain($, auctionTimeZone);
  if (fromLd) return fromLd;

  return extractDomainAuctionFromNextData(nextData, auctionTimeZone);
}

/**
 * 匹配 Domain「### Auction」或「Auction On Site」后的日期时间（HTML 折叠后）。
 * 禁止以「Inspection & Auction times」起算：该段内先出现的是 Inspection 的周三，会误匹配。
 * 兼容 `Saturday, 28 Mar12:30pm`（日期与时间之间可能无空格）。
 */
function extractDomainAuctionFromNormalizedHtml(normalized: string, auctionTimeZone: string): string | null {
  const patterns: RegExp[] = [
    /(?:###\s*Auction|##\s*Auction)\b[\s\S]{0,500}?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(\d{1,2}\s+[A-Za-z]{3,})\s*(\d{1,2}:\d{2}\s*(?:am|pm))/i,
    /\bAuction\s+On\s+Site\b[\s\S]{0,120}?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(\d{1,2}\s+[A-Za-z]{3,})\s*(\d{1,2}:\d{2}\s*(?:am|pm))/i,
    /\bAuction\b\s*(?:Unless Sold Prior)?\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(\d{1,2}\s+[A-Za-z]{3,})\s*(\d{1,2}:\d{2}\s*(?:am|pm))/i,
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (!m) continue;
    const iso = parseDomainDayMonthTimeToIso(m[2].trim(), m[3].trim(), auctionTimeZone);
    if (iso) return iso;
  }
  return null;
}

/**
 * 从纯「Auction」标题后的兄弟节点取文本，不包含上一段 Inspections。
 */
function extractDomainAuctionFromAuctionHeading($: cheerio.CheerioAPI, auctionTimeZone: string): string | null {
  const $h = $('h1, h2, h3, h4, h5, h6').filter((_i, el) => /^Auction$/i.test($(el).text().trim()));
  if (!$h.length) return null;
  let tail = '';
  $h
    .first()
    .nextUntil('h1, h2, h3, h4, h5, h6')
    .each((_, el) => {
      tail += $(el).text();
    });
  const chunk = `${$h.first().text()}${tail}`.replace(/\s+/g, ' ').trim();
  const m = chunk.match(
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(\d{1,2}\s+[A-Za-z]{3,})\s*(\d{1,2}:\d{2}\s*(?:am|pm))/i
  );
  if (!m) return null;
  return parseDomainDayMonthTimeToIso(m[2].trim(), m[3].trim(), auctionTimeZone);
}

const DOMAIN_MONTH: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseDomainMonthToken(tok: string): number | null {
  const k = tok.trim().toLowerCase().slice(0, 3);
  return DOMAIN_MONTH[k] ?? null;
}

/**
 * 解析 `6:00pm` / `12:30pm` 为 24h 制小时与分钟。
 */
function parseDomain12hClock(timePart: string): { hour: number; minute: number } | null {
  const m = timePart.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ap = m[3].toLowerCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  if (ap === 'pm' && hour < 12) hour += 12;
  if (ap === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;
  return { hour, minute };
}

/**
 * `__NEXT_DATA__` 中部分 ISO 以 `Z` 结尾但实际为房源本地墙钟；按 `auctionTimeZone` 转 UTC。
 * 若已带非 Z 的显式偏移（如 `+10:00`），仍用 `Date.parse`。
 *
 * @param auctionTimeZone 见 {@link auctionWallClockTimezoneFromAuState}
 */
function parseDomainIsoDateTimeToUtcMs(s: string, auctionTimeZone: string): number | null {
  const t = s.trim();
  if (/[+-]\d{2}:\d{2}$/.test(t) && !/Z$/i.test(t)) {
    const ms = Date.parse(t);
    return Number.isNaN(ms) ? null : ms;
  }
  const zulu = t.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z$/i
  );
  if (zulu) {
    const y = Number(zulu[1]);
    const mo = Number(zulu[2]) - 1;
    const d = Number(zulu[3]);
    const h = Number(zulu[4]);
    const mi = Number(zulu[5]);
    const sec = zulu[6] ? Number(zulu[6]) : 0;
    if ([y, mo, d, h, mi, sec].some(n => Number.isNaN(n))) return null;
    return fromZonedTime(new Date(y, mo, d, h, mi, sec), auctionTimeZone).getTime();
  }
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * 将 `28 Mar` + `12:30pm` 转为 ISO（UTC），自动补年份（拍卖一般在当年或次年）。
 * 墙钟按 `auctionTimeZone`（房源所在州）解释。
 *
 * @param auctionTimeZone 见 {@link auctionWallClockTimezoneFromAuState}
 */
function parseDomainDayMonthTimeToIso(
  dayMonth: string,
  timePart: string,
  auctionTimeZone: string
): string | null {
  const dm = dayMonth.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})/);
  if (!dm) return null;
  const day = Number(dm[1]);
  const monthIndex = parseDomainMonthToken(dm[2]);
  if (monthIndex === null || !Number.isFinite(day)) return null;
  const clock = parseDomain12hClock(timePart);
  if (!clock) return null;

  const year = new Date().getFullYear();
  const toIso = (y: number) =>
    fromZonedTime(new Date(y, monthIndex, day, clock.hour, clock.minute, 0), auctionTimeZone).toISOString();

  let iso = toIso(year);
  const tMs = Date.parse(iso);
  if (Number.isNaN(tMs)) return null;
  const now = Date.now();
  if (tMs < now - 86400000 * 370) {
    iso = toIso(year + 1);
  }
  return iso;
}

/**
 * 合并 Domain `auctionDate` + `auctionTime`（均为字符串）为 UTC 毫秒。
 *
 * @param auctionTimeZone 见 {@link auctionWallClockTimezoneFromAuState}
 */
function parseDomainAuctionDateAndTimeMerge(
  ad: string,
  atStr: string,
  auctionTimeZone: string
): number | null {
  const adTrim = ad.trim();
  const timeTrim = atStr.trim();
  const dm = adTrim.match(/(\d{1,2}\s+[A-Za-z]{3,})/i);
  if (dm) {
    const iso = parseDomainDayMonthTimeToIso(dm[1].trim(), timeTrim, auctionTimeZone);
    if (iso) {
      const ms = Date.parse(iso);
      return Number.isNaN(ms) ? null : ms;
    }
  }
  const isoD = adTrim.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clock = parseDomain12hClock(timeTrim);
  if (isoD && clock) {
    const y = Number(isoD[1]);
    const mo = Number(isoD[2]) - 1;
    const d = Number(isoD[3]);
    return fromZonedTime(new Date(y, mo, d, clock.hour, clock.minute, 0), auctionTimeZone).getTime();
  }
  const p = parseDomainIsoDateTimeToUtcMs(`${adTrim} ${timeTrim}`, auctionTimeZone);
  if (p != null) return p;
  const fallback = Date.parse(`${adTrim} ${timeTrim}`);
  return Number.isNaN(fallback) ? null : fallback;
}

/**
 * JSON-LD：只收集显式 `auctionDate` 字段，避免 Event.startDate（多为 open inspection）误作拍卖时间。
 *
 * @param auctionTimeZone 见 {@link auctionWallClockTimezoneFromAuState}
 */
function extractAuctionFromJsonLdDomain($: cheerio.CheerioAPI, auctionTimeZone: string): string | null {
  const dates: string[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).text();
    if (!raw) return;
    try {
      collectJsonLdAuctionDateFields(JSON.parse(raw), dates);
    } catch {
      // ignore
    }
  });
  const parsed = dates
    .map(d => parseDomainIsoDateTimeToUtcMs(d, auctionTimeZone))
    .filter((t): t is number => t != null && !Number.isNaN(t));
  if (!parsed.length) return null;
  return new Date(Math.max(...parsed)).toISOString();
}

/**
 * 深度遍历 JSON-LD，仅收集 `auctionDate` 字符串。
 */
function collectJsonLdAuctionDateFields(node: unknown, dates: string[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach(n => collectJsonLdAuctionDateFields(n, dates));
    return;
  }
  if (typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  if (typeof o.auctionDate === 'string' && o.auctionDate.length >= 8) {
    dates.push(o.auctionDate);
  }
  for (const v of Object.values(o)) collectJsonLdAuctionDateFields(v, dates);
}

/**
 * 解析 Domain GraphQL/页面 JSON 中的日期时间字段（字符串 ISO 或 `{ isoDate }`）。
 *
 * @param v `openingDateTime` 等
 * @param auctionTimeZone 见 {@link auctionWallClockTimezoneFromAuState}
 * @returns 可解析为毫秒时间戳，否则 `null`
 */
function parseDomainIsoDateTimeField(v: unknown, auctionTimeZone: string): number | null {
  if (typeof v === 'string') {
    return parseDomainIsoDateTimeToUtcMs(v, auctionTimeZone);
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const inner = (v as Record<string, unknown>).isoDate;
    if (typeof inner === 'string') {
      return parseDomainIsoDateTimeToUtcMs(inner, auctionTimeZone);
    }
  }
  return null;
}

/**
 * 从 `__NEXT_DATA__` 取拍卖时间。Domain 常见形态：
 * - `inspection.auctionTime.openingDateTime`（字符串 ISO，非 `auctionDate`+`auctionTime` 双字符串）
 * - `auctionDetails.auctionSchedule.openingDateTime`（常为 `{ isoDate }`）
 * - 同对象上 `auctionDate`（字符串）+ `auctionTime`（字符串）合并解析
 *
 * 多候选时取最大时间戳（单房源页通常一致；列表 map 多房源时偏保守取最晚场次）。
 *
 * @param auctionTimeZone 见 {@link auctionWallClockTimezoneFromAuState}
 */
function extractDomainAuctionFromNextData(data: unknown, auctionTimeZone: string): string | null {
  let bestTs: number | null = null;
  const seen = new Set<unknown>();

  const bump = (ts: number) => {
    if (bestTs == null || ts > bestTs) bestTs = ts;
  };

  const visit = (node: unknown) => {
    if (node === null || node === undefined) return;
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const o = node as Record<string, unknown>;

    const auctionTimeVal = o.auctionTime;
    if (auctionTimeVal && typeof auctionTimeVal === 'object' && !Array.isArray(auctionTimeVal)) {
      const au = auctionTimeVal as Record<string, unknown>;
      const ts = parseDomainIsoDateTimeField(au.openingDateTime, auctionTimeZone);
      if (ts != null) bump(ts);
    }

    const schedule = o.auctionSchedule;
    if (schedule && typeof schedule === 'object' && !Array.isArray(schedule)) {
      const ts = parseDomainIsoDateTimeField((schedule as Record<string, unknown>).openingDateTime, auctionTimeZone);
      if (ts != null) bump(ts);
    }

    const ad = o.auctionDate;
    const atStr = o.auctionTime;
    if (typeof ad === 'string' && typeof atStr === 'string' && atStr.trim()) {
      const d = parseDomainAuctionDateAndTimeMerge(ad, atStr, auctionTimeZone);
      if (d != null) bump(d);
    }

    for (const v of Object.values(o)) visit(v);
  };

  visit(data);
  return bestTs != null ? new Date(bestTs).toISOString() : null;
}

function extractAuctionFromJsonLd($: cheerio.CheerioAPI): string | null {
  const scripts = $('script[type="application/ld+json"]');
  const dates: string[] = [];
  scripts.each((_i, el) => {
    const raw = $(el).text();
    if (!raw) return;
    try {
      const json = JSON.parse(raw);
      collectLdDates(json, dates);
    } catch {
      // ignore
    }
  });
  // 选一个看起来像 ISO 的 startDate
  const iso = dates.find(d => !Number.isNaN(Date.parse(d)));
  return iso ? new Date(Date.parse(iso)).toISOString() : null;
}

function collectLdDates(node: unknown, dates: string[]) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach(n => collectLdDates(n, dates));
    return;
  }
  if (typeof node !== 'object') return;
  const o = node as Record<string, unknown>;

  // 常见字段：startDate / auctionDate / date
  for (const k of ['startDate', 'auctionDate', 'date']) {
    const v = o[k];
    if (typeof v === 'string' && v.length >= 8) dates.push(v);
  }
  // 递归
  for (const v of Object.values(o)) collectLdDates(v, dates);
}

function extractAuctionFromText($: cheerio.CheerioAPI): string | null {
  // Domain 页面一般会有 “AUCTION” 区块；这里做一个简单、保守的文本解析兜底
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  if (!bodyText) return null;

  // 捕捉形态：`Saturday, 28 Mar 3:15pm` 或 `Saturday 28 Mar 3:15pm`
  const m = bodyText.match(
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(\d{1,2}\s+[A-Za-z]{3,}\b)\s+(\d{1,2}:\d{2}\s*(?:am|pm))\b/i
  );
  if (!m) return null;
  const dateText = `${m[2]} ${new Date().getFullYear()} ${m[3]}`;
  const ts = Date.parse(dateText);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toISOString();
}

/**
 * 从单个对象上尝试读取指导价/估价（隐藏价常见嵌套在 priceGuide / valuation）。
 */
function pickSuggestPrice(o: Record<string, unknown>): number | null {
  const pg = o.priceGuide;
  if (pg && typeof pg === 'object') {
    const p = pg as Record<string, unknown>;
    const mid = numOrNull(p.mid);
    const low = numOrNull(p.min);
    const high = numOrNull(p.max);
    if (mid != null) return Math.round(mid);
    if (low != null && high != null) return Math.round((low + high) / 2);
    if (low != null) return Math.round(low);
    if (high != null) return Math.round(high);
  }

  const val = o.valuation;
  if (val && typeof val === 'object') {
    const v = val as Record<string, unknown>;
    const est = numOrNull(v.estimatedValue ?? v.displayValue ?? v.value);
    if (est != null) return Math.round(est);
  }

  const display = o.displayPrice;
  if (typeof display === 'object' && display !== null) {
    const d = display as Record<string, unknown>;
    const n = numOrNull(d.value ?? d.amount);
    if (n != null) return Math.round(n);
  }

  const pv = o.price;
  if (typeof pv === 'object' && pv !== null) {
    const p = pv as Record<string, unknown>;
    const n = numOrNull(p.value ?? p.display);
    if (n != null) return Math.round(n);
  }

  for (const key of ['guidePrice', 'searchPrice', 'fromPrice', 'toPrice']) {
    const n = numOrNull(o[key]);
    if (n != null) return Math.round(n);
  }

  return null;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function pickString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

/** 用于全树扫描：键名疑似地理、价格、房型等。 */
const DEBUG_INTERESTING_KEY =
  /latitude|longitude|geocode|geo|coord|lng|lat\b|center|centre|postcode|suburb|state\b|country|address|price|auction|listing|property|imageUrl|cover|bed|bath|car|garage|land|area|floor|building|valuation|guide|domain|realestate/i;

/**
 * 调试输出：一次抓取后返回页面上能结构化提取的尽量全量信息（供人工对照 JSON 树）。
 */
export type ListingPageDebugDump = {
  url: string;
  source: 'realestate' | 'domain';
  fetchedAtIso: string;
  htmlLength: number;
  brightData: { unlockerLastError: string | null; residentialLastError: string | null };
  /** 当前正式入库用的规范化字段 */
  scrapedFields: ScrapedListingFields;
  /** `extractFromNextData` 未做地址拼接前的原始合并结果 */
  extractFromNextDataRaw: NextExtract | null;
  meta: Array<{ property?: string; name?: string; content?: string }>;
  linkCanonical: string | null;
  titleTag: string;
  jsonLdBlocks: Array<{ rawLength: number; parsed: unknown }>;
  nextDataSummary: {
    parseOk: boolean;
    scriptTextLength: number;
    topLevelKeys: string[];
    buildId: unknown;
    page: unknown;
    query: unknown;
    pagePropsKeyCount: number | null;
    pagePropsTopKeys: string[] | null;
  };
  /** 从 `__NEXT_DATA__` 递归摘出的「值得关注」叶子（路径 → 值） */
  interestingLeavesFromNextData: Record<string, unknown>;
  /** 完整的 `__NEXT_DATA__` 解析结果（体积可能很大） */
  nextDataFull: unknown;
  /** 原始 HTML 中是否存在 `__NEXT_DATA__` 字面量（ Bright Data 可能返回裁剪版 HTML） */
  nextDataProbe: { hasSubstring: boolean; occurrenceCount: number; sample: string | null };
  /** 页面中带 `id` 的 script 标签 id 列表（排查数据是否在其它脚本桶） */
  scriptElementIds: string[];
};

/**
 * 抓取并输出调试快照（含完整 `__NEXT_DATA__`）。仅用于本地排障与分析。
 *
 * @param pageUrl 房源页 URL
 * @param source 站点类型
 */
export async function debugDumpListingPage(
  pageUrl: string,
  source: 'realestate' | 'domain'
): Promise<ListingPageDebugDump> {
  const html = await getHtmlWithFallback(pageUrl, source);
  const $ = cheerio.load(html);

  const scrapedFields = parseListingHtml(html, source, pageUrl);

  const meta: ListingPageDebugDump['meta'] = [];
  $('meta').each((_i, el) => {
    const $el = $(el);
    const property = $el.attr('property')?.trim();
    const name = $el.attr('name')?.trim();
    const content = $el.attr('content')?.trim();
    if (content != null && content !== '') {
      meta.push({
        ...(property ? { property } : {}),
        ...(name ? { name } : {}),
        content,
      });
    }
  });

  const linkCanonical = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const titleTag = $('title').first().text().trim() || '';

  const jsonLdBlocks: ListingPageDebugDump['jsonLdBlocks'] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      jsonLdBlocks.push({ rawLength: raw.length, parsed: JSON.parse(raw) });
    } catch {
      jsonLdBlocks.push({ rawLength: raw.length, parsed: { _parseError: true, rawSnippet: raw.slice(0, 500) } });
    }
  });

  let nextDataFull: unknown = null;
  const nextDataRaw = extractNextDataRawString(html, $);
  const scriptTextLength = nextDataRaw?.length ?? 0;
  if (nextDataRaw) {
    try {
      nextDataFull = JSON.parse(nextDataRaw);
    } catch {
      nextDataFull = { _parseError: true, rawSnippet: nextDataRaw.slice(0, 2000) };
    }
  }

  const nd = nextDataFull && typeof nextDataFull === 'object' ? (nextDataFull as Record<string, unknown>) : null;
  const props = nd?.['props'] as Record<string, unknown> | undefined;
  const pageProps = props?.['pageProps'] as Record<string, unknown> | null | undefined;
  const pagePropsKeys = pageProps && typeof pageProps === 'object' ? Object.keys(pageProps) : null;

  const interestingLeavesFromNextData: Record<string, unknown> = {};
  if (nextDataFull && typeof nextDataFull === 'object') {
    collectInterestingLeavesDeep(nextDataFull, 'nextData', interestingLeavesFromNextData, new WeakSet<object>(), 0, 500);
  }

  const idx = html.indexOf('__NEXT_DATA__');
  const nextDataProbe = {
    hasSubstring: idx >= 0,
    occurrenceCount: (html.match(/__NEXT_DATA__/g) || []).length,
    sample: idx >= 0 ? html.slice(Math.max(0, idx - 80), Math.min(html.length, idx + 400)) : null,
  };

  const extractFromNextDataRaw =
    nextDataFull && typeof nextDataFull === 'object'
      ? extractFromNextData(nextDataFull, source)
      : null;

  const scriptElementIds: string[] = [];
  $('script[id]').each((_i, el) => {
    const id = $(el).attr('id')?.trim();
    if (id) scriptElementIds.push(id);
  });

  return {
    url: pageUrl,
    source,
    fetchedAtIso: new Date().toISOString(),
    htmlLength: html.length,
    brightData: {
      unlockerLastError: brightDataLastError,
      residentialLastError: brightDataResiLastError,
    },
    scrapedFields,
    extractFromNextDataRaw,
    meta,
    linkCanonical,
    titleTag,
    jsonLdBlocks,
    nextDataSummary: {
      parseOk: nextDataFull != null && !('_parseError' in (nextDataFull as object)),
      scriptTextLength,
      topLevelKeys: nd ? Object.keys(nd) : [],
      buildId: nd?.['buildId'],
      page: nd?.['page'],
      query: nd?.['query'],
      pagePropsKeyCount: pagePropsKeys ? pagePropsKeys.length : null,
      pagePropsTopKeys: pagePropsKeys ? pagePropsKeys.slice(0, 80) : null,
    },
    interestingLeavesFromNextData,
    nextDataFull,
    nextDataProbe,
    scriptElementIds,
  };
}

/**
 * 深度优先收集：键名命中 {@link DEBUG_INTERESTING_KEY} 时记录叶子；对象继续下钻（有深度与条数上限）。
 */
function collectInterestingLeavesDeep(
  node: unknown,
  path: string,
  out: Record<string, unknown>,
  seen: WeakSet<object>,
  depth: number,
  maxLeaves: number
): void {
  if (Object.keys(out).length >= maxLeaves || depth > 40) return;
  if (node === null || node === undefined) return;

  if (typeof node !== 'object') {
    const seg = path.split('.').pop() || path;
    if (DEBUG_INTERESTING_KEY.test(seg)) {
      out[path] = node;
    }
    return;
  }

  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    const cap = Math.min(node.length, 40);
    for (let i = 0; i < cap; i++) {
      collectInterestingLeavesDeep(node[i], `${path}[${i}]`, out, seen, depth + 1, maxLeaves);
      if (Object.keys(out).length >= maxLeaves) return;
    }
    return;
  }

  const o = node as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    const nextPath = `${path}.${key}`;
    const v = o[key];
    if (DEBUG_INTERESTING_KEY.test(key)) {
      if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out[nextPath] = v;
      } else if (typeof v === 'object') {
        out[nextPath] = v;
        collectInterestingLeavesDeep(v, nextPath, out, seen, depth + 1, maxLeaves);
      }
    } else if (typeof v === 'object' && v !== null) {
      collectInterestingLeavesDeep(v, nextPath, out, seen, depth + 1, maxLeaves);
    }
    if (Object.keys(out).length >= maxLeaves) return;
  }
}
