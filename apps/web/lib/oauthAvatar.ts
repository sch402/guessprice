import type { User } from '@supabase/supabase-js';

/**
 * 从 `user_metadata` 对象读取 OAuth 头像 URL（与服务端写入的 metadata 兼容）。
 *
 * @param meta `user_metadata` 或合并后的 data 对象
 */
export function getAvatarUrlFromUserMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  const picture = m['picture'];
  const avatarUrl = m['avatar_url'];
  const raw =
    (typeof picture === 'string' && picture.trim()) ||
    (typeof avatarUrl === 'string' && avatarUrl.trim()) ||
    '';
  if (!raw.startsWith('http')) return null;
  return raw;
}

/**
 * 从 Supabase `User` 读取 OAuth 头像 URL。
 * Google 登录时通常在 `user_metadata.picture`；部分提供商会写 `avatar_url`。
 *
 * @param user 当前会话用户
 * @returns 可展示的 HTTPS 图片地址，若无则返回 `null`
 */
export function getOAuthAvatarUrl(user: User | null): string | null {
  return getAvatarUrlFromUserMetadata(user?.user_metadata ?? null);
}
