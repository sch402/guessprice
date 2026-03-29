import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, anonKey, serviceKey };
}

/**
 * POST /api/user/delete-account
 *
 * Deletes the current authenticated user account and associated app data.
 * Requires `Authorization: Bearer <access_token>`.
 *
 * Notes:
 * - Uses Service Role key for Admin user deletion.
 * - Best-effort cleanup of `votes` by `user_id`.
 */
export async function POST(req: NextRequest) {
  const { url, anonKey, serviceKey } = getSupabaseEnv();
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Server is not configured with Supabase.' }, { status: 500 });
  }
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = userData.user.id;

  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Best-effort: remove user votes first (RLS bypass via service role).
  await adminClient.from('votes').delete().eq('user_id', userId);

  const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

