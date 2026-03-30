import type { User } from '@supabase/supabase-js';

/**
 * 从 Supabase Auth `User` 推导界面展示名（metadata、邮箱前缀）。
 */
export function displayNameFromUser(user: User | null): string {
  if (!user) return 'Anonymous';
  const m = user.user_metadata as Record<string, unknown> | undefined;
  const full = m?.['full_name'];
  const name = m?.['name'];
  const fromMeta =
    (typeof full === 'string' && full.trim()) || (typeof name === 'string' && name.trim()) || '';
  if (fromMeta) return fromMeta;
  if (user.email) return user.email.split('@')[0] ?? 'Player';
  return 'Player';
}
