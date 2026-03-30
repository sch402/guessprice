import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from './supabaseClient';
import { syncPublicProfileFromSession } from './syncPublicProfile';

/**
 * 获取当前登录会话（浏览器侧）。
 * - 若未配置 Supabase（缺少环境变量），返回 `{ supabase: null }`
 * - 若已配置，返回 supabase client 与 session
 */
export function useSupabaseSession() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  /**
   * 登录后将展示名/头像同步到 `public.profiles`，供 Feed 读取（需已在 Supabase 执行 profiles 迁移）。
   */
  useEffect(() => {
    if (!supabase || !session?.user) return;
    void syncPublicProfileFromSession(supabase, session.user);
  }, [supabase, session?.user?.id, session?.user?.user_metadata]);

  return { supabase, session };
}

