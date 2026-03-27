import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/geocode/search-center?q=<keyword>
 *
 * Returns a rough map center for the Search page “Show Surrounding Suburbs” anchor when no listing
 * in the DB has coordinates for that suburb/postcode. Uses Mapbox Geocoding (server-side token).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ error: 'Missing q' }, { status: 400 });
  }

  const token = process.env.MAPBOX_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ error: 'Geocoding is not configured' }, { status: 503 });
  }

  const query = `${q} Australia`;

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
  );
  url.searchParams.set('access_token', token);
  url.searchParams.set('country', 'AU');
  url.searchParams.set('limit', '1');

  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: 'Geocoding request failed' }, { status: 502 });
    }
    const json = (await res.json()) as {
      features?: Array<{ center?: [number, number]; place_name?: string }>;
    };
    const center = json?.features?.[0]?.center;
    if (!Array.isArray(center) || center.length < 2) {
      return NextResponse.json({ error: 'No geocoding results' }, { status: 404 });
    }
    const [longitude, latitude] = center;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 404 });
    }
    return NextResponse.json({
      latitude,
      longitude,
      label: json.features?.[0]?.place_name ?? query,
    });
  } catch {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500 });
  }
}
