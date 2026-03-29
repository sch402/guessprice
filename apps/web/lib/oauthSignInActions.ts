import type { SupabaseClient } from '@supabase/supabase-js';
import { signInWithAppleNative, shouldUseNativeAppleSignIn } from './appleNativeSignIn';
import { beginOAuthReturnFlow } from './oauthReturnFlow';

/**
 * 浏览器端 OAuth 回调基址（与 `Me` / `SignIn` 一致）。
 */
function authCallbackUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/auth/callback`;
}

/**
 * Google OAuth（Supabase）。
 */
export async function signInWithGoogleOAuth(supabase: SupabaseClient | null): Promise<void> {
  if (!supabase) return;
  beginOAuthReturnFlow();
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: authCallbackUrl(),
    },
  });
}

/**
 * Facebook OAuth（Supabase）。
 */
export async function signInWithFacebookOAuth(supabase: SupabaseClient | null): Promise<void> {
  if (!supabase) return;
  beginOAuthReturnFlow();
  await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: {
      redirectTo: authCallbackUrl(),
    },
  });
}

export type AppleOAuthResult = { ok: true } | { ok: false; message: string };

/**
 * Apple：Capacitor iOS 走原生；否则走 Supabase OAuth。
 */
export async function signInWithAppleOAuth(supabase: SupabaseClient | null): Promise<AppleOAuthResult> {
  if (!supabase) {
    return { ok: false, message: 'Sign-in is not configured.' };
  }
  if (shouldUseNativeAppleSignIn()) {
    return signInWithAppleNative(supabase);
  }
  beginOAuthReturnFlow();
  await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: authCallbackUrl(),
      scopes: 'name email',
    },
  });
  return { ok: true };
}
