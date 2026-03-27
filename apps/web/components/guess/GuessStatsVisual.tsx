'use client';

import type { GuessStats } from '../../lib/guessStatsTypes';
import type { PriceBin } from '../../lib/guessPriceHistogram';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Props = {
  /** 聚合后的统计与分箱数据 */
  stats: GuessStats;
};

/** 清爽卡通配色：售出 / 流拍 */
const SELL_COLORS = {
  yes: '#2dd4bf',
  yesStroke: '#0d9488',
  no: '#fda4af',
  noStroke: '#e11d48',
};

/** 价格分布条形渐变主色 */
const BAR_FILL = '#5eead4';
const BAR_BG = '#ecfeff';

/**
 * 竞猜结果可视化：Q1 环形图（占比）+ Q2 横向条形图（价格区间 × 占比）。
 * 使用 Recharts + ResponsiveContainer，适配移动端宽度。
 */
export function GuessStatsVisual({ stats }: Props) {
  const { totalVotes, willSellYes, willSellNo, soldPriceMedian, priceHistogram } = stats;

  const pieData = [
    { name: 'YES', value: willSellYes, key: 'yes' as const },
    { name: 'NO', value: willSellNo, key: 'no' as const },
  ].filter(d => d.value > 0);

  const yesPct =
    totalVotes > 0 ? Math.round((willSellYes / totalVotes) * 1000) / 10 : 0;
  const noPct =
    totalVotes > 0 ? Math.round((willSellNo / totalVotes) * 1000) / 10 : 0;

  const pieForChart =
    totalVotes === 0
      ? [{ name: 'No votes yet', value: 1, key: 'empty' as const }]
      : pieData.length > 0
        ? pieData
        : [{ name: 'No votes yet', value: 1, key: 'empty' as const }];

  const isEmptyPie = totalVotes === 0;

  return (
    <div className="space-y-6">
      {/* 顶栏：参与人数 + 中位数 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-teal-50 to-cyan-50 px-3 py-1.5 text-sm font-semibold text-teal-900 shadow-sm ring-1 ring-teal-100/80">
          <span className="text-base" aria-hidden="true">
            👥
          </span>
          <span>Votes: {totalVotes}</span>
        </div>
        {soldPriceMedian != null ? (
          <div className="text-xs font-medium text-slate-600">
            Median guess{' '}
            <span className="text-sm font-bold text-teal-700">
              A$ {soldPriceMedian.toLocaleString()}
            </span>
          </div>
        ) : (
          <div className="text-xs text-slate-400"></div>
        )}
      </div>

      {/* Q1 环形图 */}
      <section
        className="rounded-2xl border border-white/60 bg-gradient-to-br from-white via-teal-50/40 to-rose-50/30 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
        aria-labelledby="guess-q1-heading"
      >
        <h3
          id="guess-q1-heading"
          className="mb-1 text-center text-sm font-bold tracking-wide text-slate-800"
        >
          Will this property be sold AT or PRIOR to auction?
        </h3>
        

        <div className="relative mx-auto h-[200px] w-full max-w-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieForChart}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={82}
                paddingAngle={isEmptyPie ? 0 : 2}
                stroke="#fff"
                strokeWidth={2}
                label={({ name, percent }) =>
                  isEmptyPie ? '' : `${name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={!isEmptyPie}
              >
                {pieForChart.map((entry, index) => {
                  if (entry.key === 'empty') {
                    return <Cell key={`cell-${index}`} fill="#e2e8f0" />;
                  }
                  if (entry.key === 'yes') {
                    return <Cell key={`cell-${index}`} fill={SELL_COLORS.yes} />;
                  }
                  return <Cell key={`cell-${index}`} fill={SELL_COLORS.no} />;
                })}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [
                  isEmptyPie ? '—' : `${value} `,
                  name,
                ]}
                contentStyle={{
                  borderRadius: 12,
                  border: 'none',
                  boxShadow: '0 8px 24px rgba(15,118,110,0.15)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {!isEmptyPie ? (
          <div className="mt-2 flex justify-center gap-6 text-xs">
            <div className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-full ring-2 ring-white shadow"
                style={{ background: SELL_COLORS.yes }}
              />
              <span className="text-slate-600">YES</span>
              <span className="font-bold text-teal-800">{yesPct}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-full ring-2 ring-white shadow"
                style={{ background: SELL_COLORS.no }}
              />
              <span className="text-slate-600">NO</span>
              <span className="font-bold text-rose-800">{noPct}%</span>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-center text-xs text-slate-400">No votes yet</p>
        )}
      </section>

      {/* Q2 价格分布：纵轴价格区间，横轴占比 */}
      <section
        className="rounded-2xl border border-white/60 bg-gradient-to-br from-white via-cyan-50/30 to-violet-50/20 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
        aria-labelledby="guess-q2-heading"
      >
        <h3
          id="guess-q2-heading"
          className="mb-1 text-center text-sm font-bold tracking-wide text-slate-800"
        >
          Distribution
        </h3>
        

        {priceHistogram.length === 0 ? (
          <div className="rounded-xl bg-slate-50/80 py-10 text-center text-sm text-slate-400">
            No votes yet
          </div>
        ) : (
          <div
            className="w-full max-w-full pl-0 pr-1"
            style={{
              height: Math.min(400, 96 + priceHistogram.length * 44),
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={priceHistogram}
                margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                barCategoryGap="18%"
              >
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tickFormatter={v => `${Math.round(Number(v) * 100)}%`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={108}
                  tick={{ fontSize: 10, fill: '#475569' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: BAR_BG }}
                  formatter={(value: number, _name: string, item: { payload?: PriceBin }) => {
                    const row = item?.payload;
                    const cnt = row?.count ?? 0;
                    const pct =
                      row?.ratio != null ? Math.round(row.ratio * 1000) / 10 : 0;
                    return [`${cnt} votes (${pct}%)`, 'This range'];
                  }}
                  labelFormatter={() => ''}
                  contentStyle={{
                    borderRadius: 12,
                    border: 'none',
                    boxShadow: '0 8px 24px rgba(15,118,110,0.12)',
                  }}
                />
                <Bar dataKey="ratio" radius={[0, 8, 8, 0]} barSize={14} animationDuration={600}>
                  {priceHistogram.map((_, i) => (
                    <Cell
                      key={`bar-${i}`}
                      fill={BAR_FILL}
                      stroke="#0d9488"
                      strokeOpacity={0.35}
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      
    </div>
  );
}
