export type ParsedListingUrl =
  | { source: 'realestate'; listingId: string | null; canonicalUrl: string }
  | { source: 'domain'; listingId: string | null; canonicalUrl: string };

/**
 * 规范化外部房源链接，并解析 realestate / Domain 的外部 ID。
 */
export function parseListingUrl(raw: string): ParsedListingUrl | null {
  const trimmed = raw.trim().replace(/[)\],.]+$/g, '');
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // 允许用户只粘贴 `www.xxx.com/...`（无协议）
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const canonicalUrl = url.toString();

  if (host.includes('realestate.com.au')) {
    const id =
      extractRealestateNumericId(url.pathname) ||
      extractRealestateNumericId(canonicalUrl) ||
      extractAnyLongNumericId(canonicalUrl);
    return { source: 'realestate', listingId: id, canonicalUrl };
  }

  if (host.includes('domain.com.au')) {
    const id = extractDomainNumericId(url.pathname) || extractAnyLongNumericId(canonicalUrl);
    return { source: 'domain', listingId: id, canonicalUrl };
  }

  return null;
}

/**
 * realestate 路径常见形态：.../property-house-nsw-castle+hill-150430832
 */
function extractRealestateNumericId(pathname: string): string | null {
  // 1) 结尾数字（最常见）
  const end = pathname.match(/-(\d{6,})(?:\/|$)/);
  if (end?.[1]) return end[1];

  // 2) 兜底：从整段字符串中找 `/property-...-<id>` 或 `-<id>`（避免误匹配，要求前面有 property-）
  const fallback = pathname.match(/property-[^/?#]+-(\d{6,})(?:[/?#]|$)/);
  return fallback?.[1] ?? null;
}

/**
 * Domain 路径常见形态：/12345678-11-street-name-suburb-nsw-2154/
 */
function extractDomainNumericId(pathname: string): string | null {
  const m = pathname.match(/^\/(\d{6,})(?:-|$)/);
  return m?.[1] ?? null;
}

function extractAnyLongNumericId(text: string): string | null {
  // 兜底：从整段文本中取最后一个 >=6 位的数字串
  const matches = text.match(/\d{6,}/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1] ?? null;
}

/**
 * 规范化地址用于与数据库比对（去首尾空白、合并连续空格、小写）。
 */
export function normalizeAddressForMatch(address: string): string {
  return address
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ', ')
    .trim();
}
