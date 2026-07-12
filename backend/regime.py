"""Market regime composite — a worldmonitor-style "is the tape risk-on or risk-off?" check.

Five components, each voting -1 / 0 / +1. All sources are free and keyless
(Polygon is already required by the app):
  trend     SPY daily close vs its 200-day average (Polygon)
  breadth   % of tracked tickers above their 50-day average (in-memory)
  vix       CBOE VIX level (Yahoo Finance public chart API)
  rates     10Y-2Y Treasury spread (FRED public CSV, no key)
  sentiment CNN Fear & Greed index

Components that fail to fetch are simply omitted — the composite degrades
gracefully. Thresholds are deliberately simple heuristics; sanity-check any
change against backtest.py before trusting it.
"""
import csv
import io
import json
import time
import urllib.request

import pandas as pd

# CNN's endpoint 418s on non-browser user agents, so look like a browser everywhere
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}
_spy_cache = {"ts": 0.0, "df": None}


def _get(url: str, timeout: int = 10, extra_headers: dict = None) -> bytes:
    req = urllib.request.Request(url, headers={**UA, **(extra_headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _vix_level():
    data = json.loads(_get("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1mo&interval=1d"))
    closes = data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
    closes = [c for c in closes if c is not None]
    return closes[-1] if closes else None


def _yield_spread():
    text = _get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=T10Y2Y").decode()
    rows = list(csv.reader(io.StringIO(text)))
    for row in reversed(rows[1:]):
        if len(row) == 2 and row[1] not in (".", ""):
            return float(row[1])
    return None


def _fear_greed():
    data = json.loads(_get(
        "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
        extra_headers={"Referer": "https://edition.cnn.com/markets/fear-and-greed"},
    ))
    return float(data["fear_and_greed"]["score"])


def _spy_trend(rest_client):
    from datetime import datetime, timedelta

    if _spy_cache["df"] is not None and time.time() - _spy_cache["ts"] < 3600:
        df = _spy_cache["df"]
    else:
        end = datetime.now()
        rows = [{"close": a.close} for a in rest_client.list_aggs(
            "SPY", 1, "day",
            (end - timedelta(days=450)).strftime("%Y-%m-%d"),
            end.strftime("%Y-%m-%d"), limit=50000)]
        df = pd.DataFrame(rows)
        _spy_cache.update(ts=time.time(), df=df)
    if len(df) < 200:
        return None, None
    return df["close"].iloc[-1], df["close"].rolling(200).mean().iloc[-1]


def compute_regime(engine, manager, rest_client) -> dict:
    def trend():
        close, sma200 = _spy_trend(rest_client)
        if close is None:
            return None
        vote = 1 if close > sma200 else -1
        return {"vote": vote, "detail": f"SPY {'above' if vote > 0 else 'below'} its 200-day average"}

    def vix():
        level = _vix_level()
        if level is None:
            return None
        vote = 1 if level < 15 else (-1 if level > 25 else 0)
        return {"vote": vote, "detail": f"VIX {level:.1f}"}

    def rates():
        spread = _yield_spread()
        if spread is None:
            return None
        vote = 1 if spread > 0 else -1
        return {"vote": vote, "detail": f"10Y-2Y spread {spread:+.2f}% ({'normal' if vote > 0 else 'inverted'})"}

    def sentiment():
        score = _fear_greed()
        vote = 1 if score > 60 else (-1 if score < 40 else 0)
        return {"vote": vote, "detail": f"Fear & Greed {score:.0f}/100"}

    def breadth():
        above = counted = 0
        for t in list(manager.active_connections):
            df = engine.daily_data.get(t)
            if df is None or len(df) < 50:
                continue
            counted += 1
            if df["close"].iloc[-1] > df["close"].rolling(50).mean().iloc[-1]:
                above += 1
        if counted < 3:
            return None  # too few tickers for breadth to mean anything
        pct = 100 * above / counted
        vote = 1 if pct > 60 else (-1 if pct < 40 else 0)
        return {"vote": vote, "detail": f"{pct:.0f}% of tracked tickers above 50-day average"}

    components = {}
    for name, fn in [("trend", trend), ("vix", vix), ("rates", rates),
                     ("sentiment", sentiment), ("breadth", breadth)]:
        try:
            result = fn()
            if result is not None:
                components[name] = result
        except Exception as e:
            print(f"Regime component '{name}' unavailable: {e}")

    total = sum(c["vote"] for c in components.values())
    if not components:
        verdict = "Unknown"
    elif total >= 2:
        verdict = "Risk-On"
    elif total <= -2:
        verdict = "Risk-Off"
    else:
        verdict = "Neutral"

    return {
        "verdict": verdict,
        "score": total,
        "components": components,
        "updated": int(time.time() * 1000),
    }
