import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 是否在 Capacitor iOS 壳内走系统原生「通过 Apple 登录」（非浏览器 OAuth）。
 */
export function shouldUseNativeAppleSignIn(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/**
 * 生成用于 OIDC nonce 的原始随机串（UTF-8 后做 SHA-256 再交给 Apple；Supabase 侧传原文）。
 */
function generateRawNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 与 Supabase Flutter 文档一致：`sha256(utf8(rawNonce))` 的十六进制小写字符串，用于 `ASAuthorizationAppleIDRequest`。
 */
async function sha256HexOfUtf8(plain: string): Promise<string> {
  const buf = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export type AppleNativeSignInResult = { ok: true } | { ok: false; message: string };

/**
 * iOS 原生 Sign in with Apple：`identityToken` + `signInWithIdToken`。
 * - Apple 请求体传 **哈希后** nonce（见 Supabase Apple 原生说明）。
 * - `signInWithIdToken` 传 **原始** nonce 供服务端校验 JWT。
 *
 * @param supabase — 浏览器侧 Supabase 客户端
 */
export async function signInWithAppleNative(supabase: SupabaseClient): Promise<AppleNativeSignInResult> {
  const rawNonce = generateRawNonce();
  const hashedNonce = await sha256HexOfUtf8(rawNonce);

  const clientId =
    process.env.NEXT_PUBLIC_APPLE_IOS_CLIENT_ID?.trim() || 'com.example.app';

  const redirectURI =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : 'https://localhost/auth/callback';

  let identityToken: string;
  try {
    const res = await SignInWithApple.authorize({
      clientId,
      redirectURI,
      scopes: 'email name',
      nonce: hashedNonce,
    });
    identityToken = res.response.identityToken;
    if (!identityToken?.trim()) {
      return { ok: false, message: 'Apple did not return an identity token.' };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg.trim() || 'Apple Sign In was cancelled or failed.' };
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
    nonce: rawNonce,
  });

  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}
