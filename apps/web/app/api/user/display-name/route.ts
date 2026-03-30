import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getAvatarUrlFromUserMetadata } from '../../../../lib/oauthAvatar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_DISPLAY_NAME_LENGTH = 80;

function getSupabaseKeys() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, key };
}

/**
 * 将既有 user_metadata 与安全可序列化的补丁合并（供 GoTrue PUT /user 使用）。
 */
function buildMergedUserMetadata(prev: unknown, displayName: string): Record<string, unknown> {
  let base: Record<string, unknown> = {};
  if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
    try {
      base = JSON.parse(JSON.stringify(prev)) as Record<string, unknown>;
    } catch {
      base = {};
    }
  }
  base.full_name = displayName;
  base.name = displayName;
  return base;
}

/**
 * POST /api/user/display-name
 *
 * Body: `{ "displayName": string }` — persisted to `auth.users` `raw_user_meta_data`（`full_name` + `name`）。
 * Requires `Authorization: Bearer <access_token>`.
 *
 * 说明：服务端 `supabase.auth.updateUser` 依赖内存 session（`persistSession: false` 时会失败），故改为直接调用 GoTrue `PUT /auth/v1/user`。
 */
export async function POST(req: NextRequest) {
  const { url, key } = getSupabaseKeys();
  if (!url || !key) {
    return NextResponse.json({ error: 'Server is not configured with Supabase.' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const raw =
    typeof body === 'object' &&
    body !== null &&
    'displayName' in body &&
    typeof (body as { displayName: unknown }).displayName === 'string'
      ? (body as { displayName: string }).displayName
      : '';

  const displayName = raw.trim();
  if (!displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Display name must be 1–${MAX_DISPLAY_NAME_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const merged = buildMergedUserMetadata(userData.user.user_metadata, displayName);

  const baseUrl = url.replace(/\/$/, '');
  const userUrl = `${baseUrl}/auth/v1/user`;

  const updRes = await fetch(userUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data: merged }),
  });

  if (!updRes.ok) {
    let message = 'Could not update display name.';
    try {
      const errJson = (await updRes.json()) as {
        msg?: string;
        error_description?: string;
        error?: string;
      };
      message =
        errJson.msg || errJson.error_description || errJson.error || message;
    } catch {
      // ignore JSON parse errors
    }
    return NextResponse.json(
      { error: message },
      { status: updRes.status >= 500 ? 502 : 400 }
    );
  }

  let saved = displayName;
  let responseMetadata: Record<string, unknown> = merged;
  try {
    const okJson = (await updRes.json()) as {
      user?: { user_metadata?: { full_name?: string } };
    };
    if (typeof okJson.user?.user_metadata?.full_name === 'string') {
      saved = okJson.user.user_metadata.full_name;
    }
    if (okJson.user?.user_metadata && typeof okJson.user.user_metadata === 'object') {
      responseMetadata = okJson.user.user_metadata as Record<string, unknown>;
    }
  } catch {
    // keep saved = displayName, merged metadata
  }

  const rowClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const avatarUrl = getAvatarUrlFromUserMetadata(responseMetadata);
  const { error: profileErr } = await rowClient.from('profiles').upsert(
    {
      user_id: userData.user.id,
      display_name: saved,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (profileErr) {
    console.warn('[display-name] profiles upsert:', profileErr.message);
  }

  return NextResponse.json({ displayName: saved });
}
