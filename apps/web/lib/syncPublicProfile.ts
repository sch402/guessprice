import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getOAuthAvatarUrl } from './oauthAvatar';
import { isMissingProfilesTableError } from './loadFeedFromSupabase';
import { displayNameFromUser } from './userDisplay';

/**
 * 将会话用户的展示名与头像写入 `public.profiles`，供 Feed 等场景匿名读取（RLS 下全员可读）。
 * 在登录态变化时调用，保证信息流展示与「我的」设置一致。
 *
 * @param supabase 浏览器 Supabase 客户端
 * @param user 当前用户
 */
export async function syncPublicProfileFromSession(supabase: SupabaseClient, user: User): Promise<void> {
  const displayName = displayNameFromUser(user);
  const avatarUrl = getOAuthAvatarUrl(user);
  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: user.id,
      display_name: displayName,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error && !isMissingProfilesTableError(error)) {
    console.warn('[syncPublicProfileFromSession]', error.message);
  }
}
