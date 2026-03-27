/**
 * 竞猜页价格分布：将离散出价聚合为区间直方图（供横向条形图使用）。
 */

export type PriceBin = {
  /** 价格区间展示标签（纵轴） */
  label: string;
  /** 该区间的票数占「全部有效出价」的比例（0~1），即横轴「比率」 */
  ratio: number;
  /** 该区间内的票数 */
  count: number;
};

/**
 * 将 AUD 金额格式化为紧凑标签（用于纵轴价格区间）。
 *
 * @param aud - 金额（澳元）
 * @returns 例如 `A$1.2M`、`A$850k`
 */
export function formatAudCompact(aud: number): string {
  if (!Number.isFinite(aud)) return '—';
  if (aud >= 1_000_000) {
    const m = aud / 1_000_000;
    return `A$${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
  }
  if (aud >= 1000) {
    return `A$${Math.round(aud / 1000)}k`;
  }
  return `A$${Math.round(aud)}`;
}

/**
 * 根据所有有效出价构建价格直方图分箱。
 *
 * @param pricesAud - 非空出价列表（澳元整数）
 * @param maxBins - 最大箱数（会随样本量自适应缩小）
 */
export function buildPriceHistogram(pricesAud: number[], maxBins = 7): PriceBin[] {
  const prices = pricesAud.filter(n => Number.isFinite(n) && n >= 0);
  const n = prices.length;
  if (n === 0) return [];

  if (n === 1) {
    const p = prices[0];
    return [{ label: formatAudCompact(p), ratio: 1, count: 1 }];
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) {
    return [{ label: formatAudCompact(min), ratio: 1, count: n }];
  }

  const binCount = Math.min(maxBins, Math.max(3, Math.ceil(Math.sqrt(n))));
  const step = (max - min) / binCount;
  const bins: { lo: number; hi: number; count: number }[] = [];

  for (let i = 0; i < binCount; i++) {
    const lo = min + i * step;
    const hi = i === binCount - 1 ? max : min + (i + 1) * step;
    const count = prices.filter(p =>
      i === binCount - 1 ? p >= lo && p <= hi : p >= lo && p < hi
    ).length;
    bins.push({ lo, hi, count });
  }

  return bins.map(b => ({
    label: `${formatAudCompact(b.lo)} – ${formatAudCompact(b.hi)}`,
    ratio: n ? b.count / n : 0,
    count: b.count,
  }));
}
