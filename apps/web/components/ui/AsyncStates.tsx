type LoadingStateProps = {
  label?: string;
};

type EmptyStateProps = {
  title: string;
  description?: string;
  className?: string;
};

/**
 * 卡片式加载状态（轻动画），用于替代纯文本 Loading。
 */
export function LoadingStateCard({ label = 'Loading listings' }: LoadingStateProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative p-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_15%_0%,rgba(16,185,129,0.10),transparent_45%),radial-gradient(120%_80%_at_85%_100%,rgba(59,130,246,0.10),transparent_45%)]" />
        <div className="relative flex items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-bounce" />
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:120ms]" />
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:240ms]" />
          </div>
          <div className="min-w-0">
            <p className="m-0 text-sm font-semibold text-slate-800">{label}</p>
            <p className="m-0 text-xs text-slate-500">Fetching fresh auctions...</p>
          </div>
        </div>
      </div>
      <div className="space-y-2.5 border-t border-slate-100 p-4" aria-hidden="true">
        <div className="h-3.5 w-3/4 animate-pulse rounded-md bg-slate-200" />
        <div className="h-3.5 w-1/2 animate-pulse rounded-md bg-slate-200 [animation-delay:120ms]" />
      </div>
    </div>
  );
}

/**
 * 无结果状态（简约插画 + 文案），用于替代 No listings。
 */
export function EmptyStateCard({ title, description, className }: EmptyStateProps) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm ${className || ''}`}>
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 via-cyan-100 to-indigo-100">
        <div className="relative h-7 w-7">
          <span className="absolute left-0 top-0 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full bg-indigo-500" />
        </div>
      </div>
      <p className="m-0 text-base font-semibold text-slate-800">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}
