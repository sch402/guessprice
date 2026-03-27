/**
 * 对比：当前 Next 内 `scrapeListingPage`（realestate）耗时与关键字段。
 * 从 `apps/web/.env.local` 加载环境变量，不打印密钥。
 *
 * 用法：`npx tsx scripts/compare-realestate-scrape.ts <realestate-url>`
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { scrapeListingPage } from '../lib/listingPageScrape';

const appsWebRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal() {
  const envPath = join(appsWebRoot, '.env.local');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const url =
  process.argv[2] ||
  'https://www.realestate.com.au/property-house-nsw-bella+vista-150503496';

async function main() {
  loadEnvLocal();

  const t0 = performance.now();
  const r = await scrapeListingPage(url, 'realestate', 'quick');
  const ms = Math.round(performance.now() - t0);

  const summary = {
    source: 'apps/web listingPageScrape (quick)',
    elapsed_ms: ms,
    listing_kind: r.listing_kind,
    address: r.address,
    cover_image_url: r.cover_image_url,
    auction_at: r.auction_at,
    suburb: r.suburb,
    state: r.state,
    postcode: r.postcode,
    latitude: r.latitude,
    longitude: r.longitude,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
