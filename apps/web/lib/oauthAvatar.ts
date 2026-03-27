import type { User } from '@supabase/supabase-js';

/**
 * 从 Supabase `User` 读取 OAuth 头像 URL。
 * Google 登录时通常在 `user_metadata.picture`；部分提供商会写 `avatar_url`。
 *
 * @param user 当前会话用户
 * @returns 可展示的 HTTPS 图片地址，若无则返回 `null`
 */
export function getOAuthAvatarUrl(user: User | null): string | null {
  if (!user?.user_metadata || typeof user.user_metadata !== 'object') return null;
  const m = user.user_metadata as Record<string, unknown>;
  const picture = m['picture'];
  const avatarUrl = m['avatar_url'];
  const raw =
    (typeof picture === 'string' && picture.trim()) ||
    (typeof avatarUrl === 'string' && avatarUrl.trim()) ||
    '';
  if (!raw.startsWith('http')) return null;
  return raw;
}
