import type { PriceBin } from './guessPriceHistogram';

/**
 * 竞猜页顶部聚合统计（Q1/Q2），供列表与图表共用。
 */
export type GuessStats = {
  totalVotes: number;
  willSellYes: number;
  willSellNo: number;
  soldPriceMedian: number | null;
  /** Q2：价格直方图分箱（有效出价人数为分母） */
  priceHistogram: PriceBin[];
};
