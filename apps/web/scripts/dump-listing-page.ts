/**
 * 本地排障：抓取单页并写出完整 `ListingPageDebugDump` JSON。
 *
 * 用法：`npx tsx scripts/dump-listing-page.ts <url> [realestate|domain]`
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { debugDumpListingPage } from '../lib/listingPageScrape';

const appsWebRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function loadEnvLocal() {
  const envPath = join(appsWebRoot, '.env.local');
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {
    // ignore
  }
}

async function main() {
  loadEnvLocal();
  const url =
    process.argv[2] || 'https://www.realestate.com.au/property-house-nsw-baulkham+hills-150391484';
  const source = (process.argv[3] === 'domain' ? 'domain' : 'realestate') as 'realestate' | 'domain';

  const dump = await debugDumpListingPage(url, source);
  const outDir = join(appsWebRoot, 'tmp');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'listing-debug-dump.json');
  writeFileSync(outFile, JSON.stringify(dump, null, 2), 'utf8');
  console.log('Written:', outFile);
  console.log('htmlLength', dump.htmlLength, 'meta count', dump.meta.length, 'jsonLd', dump.jsonLdBlocks.length);
  console.log('pageProps keys (sample)', dump.nextDataSummary.pagePropsTopKeys?.slice(0, 20));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
