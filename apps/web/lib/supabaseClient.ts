import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 创建浏览器侧 Supabase 客户端（仅用于前端）。
 * 需要在 `.env.local` 中配置：
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY（旧命名）
 * - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY（Supabase 新命名，推荐）
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

