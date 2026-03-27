const FLOW_KEY = 'gtp_oauth_flow';

/**
 * 在跳转 `signInWithOAuth` 之前调用：生成本次 OAuth 会话 id，供 `/auth/callback`
 * 与浏览器历史中的残留回调项区分「首次落地」与「用户 goBack 再次进入」。
 */
export function beginOAuthReturnFlow(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(FLOW_KEY, crypto.randomUUID());
  } catch {
    sessionStorage.setItem(FLOW_KEY, `${Date.now()}-${Math.random()}`);
  }
}

/**
 * @param flow — {@link beginOAuthReturnFlow} 写入的值
 * @returns 该 flow 在 `gtp_oauth_done_${flow}` 下的 sessionStorage key
 */
export function getOAuthFlowDoneKey(flow: string): string {
  return `gtp_oauth_done_${flow}`;
}

/**
 * 供 AuthCallback 读取当前 OAuth flow id（无则视为直链打开回调页等边缘情况）。
 */
export function peekOAuthFlow(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(FLOW_KEY);
  } catch {
    return null;
  }
}

/**
 * 首次成功处理回调后清理 flow id，避免长期占用；done 标记保留至用户可能 goBack 到 callback 时再删。
 */
export function clearOAuthFlowId(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(FLOW_KEY);
  } catch {
    /* ignore */
  }
}
