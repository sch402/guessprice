/**
 * 澳洲房源拍卖时间：州 → IANA 时区。与 Domain 按地址展示的本地墙钟一致（抓取解析与前端展示共用）。
 */
const AU_LISTING_FALLBACK_TZ = 'Australia/Sydney';

/**
 * 将房源 `state`（如 NSW、SA）映射为展示/解析用的 IANA 时区。
 * 未知州时回退悉尼（东海岸占比高）。
 *
 * @param state 如 `NSW`、`SA`（大小写不敏感）
 */
export function auctionWallClockTimezoneFromAuState(state: string | null | undefined): string {
  const s = (state || '').trim().toUpperCase();
  switch (s) {
    case 'NSW':
    case 'ACT':
      return 'Australia/Sydney';
    case 'VIC':
      return 'Australia/Melbourne';
    case 'QLD':
      return 'Australia/Brisbane';
    case 'SA':
      return 'Australia/Adelaide';
    case 'WA':
      return 'Australia/Perth';
    case 'TAS':
      return 'Australia/Hobart';
    case 'NT':
      return 'Australia/Darwin';
    default:
      return AU_LISTING_FALLBACK_TZ;
  }
}

/**
 * 按房源所在州格式化为与 Domain 页一致的「星期 + 日 + 月 + 12h 时间」字符串（该州本地墙钟）。
 *
 * @param iso UTC ISO 字符串
 * @param state 房源 `state`
 */
export function formatAuctionWallClockEnAu(iso: string, state: string | null | undefined): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const tz = auctionWallClockTimezoneFromAuState(state);
  const weekday = new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: tz }).format(d);
  const day = new Intl.DateTimeFormat('en-AU', { day: '2-digit', timeZone: tz }).format(d);
  const month = new Intl.DateTimeFormat('en-AU', { month: 'short', timeZone: tz }).format(d);
  const time = new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  })
    .format(d)
    .replace(' AM', ' am')
    .replace(' PM', ' pm');
  return `${weekday}, ${day} ${month} ${time}`;
}

/**
 * 仅日期（不含时间），用于「截止某日」类文案；仍按房源州本地日历日。
 */
export function formatAuctionDateOnlyWallClockEnAu(iso: string, state: string | null | undefined): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const tz = auctionWallClockTimezoneFromAuState(state);
  const weekday = new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: tz }).format(d);
  const day = new Intl.DateTimeFormat('en-AU', { day: '2-digit', timeZone: tz }).format(d);
  const month = new Intl.DateTimeFormat('en-AU', { month: 'short', timeZone: tz }).format(d);
  return `${weekday}, ${day} ${month}`;
}
