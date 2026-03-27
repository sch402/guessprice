import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from './supabaseClient';

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

  return { supabase, session };
}

