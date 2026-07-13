"""Per-ticker headlines from Yahoo Finance's free RSS feed (no key), cached 15 minutes."""
import time
import urllib.request
import xml.etree.ElementTree as ET

UA = {"User-Agent": "Mozilla/5.0 (Quantily personal research dashboard)"}
TTL_SECONDS = 900
_cache: dict = {}  # ticker -> (fetched_at, [{title, link, published}])


def get_headlines(ticker: str, limit: int = 5) -> list:
    now = time.time()
    cached = _cache.get(ticker)
    if cached and now - cached[0] < TTL_SECONDS:
        return cached[1]

    url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=8) as resp:
            root = ET.fromstring(resp.read())
        items = []
        for item in root.findall(".//item")[:limit]:
            title = item.findtext("title")
            if not title:
                continue
            items.append({
                "title": title.strip(),
                "link": (item.findtext("link") or "").strip(),
                "published": (item.findtext("pubDate") or "").strip(),
            })
        _cache[ticker] = (now, items)
    except Exception as e:
        print(f"Headline fetch failed for {ticker}: {e}")
        _cache[ticker] = (now, cached[1] if cached else [])
    return _cache[ticker][1]
