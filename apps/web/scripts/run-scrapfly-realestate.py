#!/usr/bin/env python3
"""
从 apps/web/.env.local 读取 SCRAPFLY_KEY，调用官方 realestatecom-scraper 的 scrape_properties。
不打印任何密钥。
"""
import asyncio
import json
import os
import sys
import time
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parent.parent
ENV_LOCAL = WEB_ROOT / ".env.local"
SCRAPER_DIR = Path("/tmp/scrapfly-scrapers-test/realestatecom-scraper")


def load_env_local():
    for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        i = t.find("=")
        if i > 0:
            os.environ[t[:i].strip()] = t[i + 1 :].strip()


async def main():
    load_env_local()
    if not os.environ.get("SCRAPFLY_KEY"):
        print("SCRAPFLY_KEY missing in .env.local", file=sys.stderr)
        sys.exit(2)

    url = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "https://www.realestate.com.au/property-house-nsw-bella+vista-150503496"
    )

    sys.path.insert(0, str(SCRAPER_DIR))
    import realestate  # noqa: E402

    realestate.BASE_CONFIG["cache"] = True
    t0 = time.perf_counter()
    data = await realestate.scrape_properties(urls=[url])
    elapsed = time.perf_counter() - t0

    out = {
        "source": "scrapfly realestatecom-scraper (official repo)",
        "elapsed_seconds": round(elapsed, 3),
        "elapsed_ms": round(elapsed * 1000),
        "result_count": len(data),
        "result": data,
    }
    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
