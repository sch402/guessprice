import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 仅允许代理这些公开房源图片域名，避免开放代理风险。 */
const ALLOWED_HOSTS = new Set([
  'bucket-api.domain.com.au',
  'b.domainstatic.com.au',
  'rimh2.domainstatic.com.au',
  'i2.au.reastatic.net',
  'images.domain.com.au',
]);

/**
 * GET /api/image-proxy?url=<https-url>
 *
 * 将跨域图片转为同源响应，供前端快照导出（canvas）使用。
 */
export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const raw = reqUrl.searchParams.get('url');
  if (!raw) return NextResponse.json({ error: 'Missing url query parameter' }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid image url' }, { status: 400 });
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 GuessThePriceImageProxy' },
      cache: 'no-store',
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream failed: ${upstream.status}` }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Upstream is not an image' }, { status: 415 });
    }

    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Image proxy failed' }, { status: 500 });
  }
}
