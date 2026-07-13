"""Daily watchlist digest — a scheduled memo with no server, DSA-style.

Fetches daily bars for each watchlist ticker, scores them with the same
score_signal() the live engine uses, computes the market regime, and pushes
one compact message to the configured notify channel (Telegram/Discord).
Inspired by ZhuLinsen/daily_stock_analysis (MIT).

Usage (locally or from GitHub Actions cron):
    WATCHLIST=SPY,QQQ,EWJ uv run python daily_digest.py
    uv run python daily_digest.py SPY QQQ --force   # ignore the trading-day check

Requires POLYGON_API_KEY. GEMINI_API_KEY (one summary call) and a notify
channel are optional — without them the digest just prints to stdout.
"""
import os
import sys
from datetime import datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pandas as pd
import ta

import notify
from market_data import engine, rest_client, score_signal
from news import get_headlines
from regime import compute_regime


def fetch_daily(ticker: str, days: int = 420) -> pd.DataFrame:
    end = datetime.now()
    rows = [{"timestamp": a.timestamp, "close": a.close} for a in rest_client.list_aggs(
        ticker, 1, "day",
        (end - timedelta(days=days)).strftime("%Y-%m-%d"),
        end.strftime("%Y-%m-%d"), limit=50000)]
    if not rows:
        raise ValueError("no data returned")
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    return df.set_index("timestamp")


def analyze(ticker: str) -> dict:
    df = fetch_daily(ticker)
    engine.daily_data[ticker] = df[["close"]]  # lets regime breadth see the watchlist
    rsi = ta.momentum.RSIIndicator(close=df["close"], window=14).rsi()
    macd_diff = ta.trend.MACD(close=df["close"]).macd_diff()
    sma_50 = df["close"].rolling(50).mean()
    sma_200 = df["close"].rolling(200).mean()
    prev_diff = macd_diff.iloc[-2] if len(df) > 1 else None
    score, signal = score_signal(rsi.iloc[-1], macd_diff.iloc[-1], prev_diff,
                                 sma_50.iloc[-1], sma_200.iloc[-1])
    return {
        "ticker": ticker,
        "price": float(df["close"].iloc[-1]),
        "signal": signal,
        "score": score,
        "rsi": float(rsi.iloc[-1]),
        "last_bar": df.index[-1].date(),
    }


def ai_summary(rows: list, regime: dict) -> str | None:
    if not engine.gemini_client:
        return None
    lines = []
    for r in rows:
        if "error" in r:
            continue
        headline = (get_headlines(r["ticker"]) or [{}])[0].get("title", "none")
        lines.append(f"- {r['ticker']}: {r['signal']} (score {r['score']}), "
                     f"${r['price']:.2f}, daily RSI {r['rsi']:.0f}, top headline: {headline}")
    prompt = f"""
    You are a disciplined market analyst writing the closing line of a daily watchlist digest.
    Market regime: {regime.get('verdict')} (score {regime.get('score')}).
    Watchlist:
    {chr(10).join(lines)}

    In at most 70 words of plain text: name the single most notable ticker today and why,
    note whether the watchlist leans with or against the regime, and give one thing to watch
    tomorrow. Use only the data above, no invented numbers, no investment advice.
    """
    try:
        resp = engine.gemini_client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        return resp.text.strip()
    except Exception as e:
        print(f"AI summary failed: {e}")
        return None


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows cp1252 console
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    raw = os.getenv("WATCHLIST") or ",".join(args) or "SPY"
    tickers = [t.strip().upper() for t in raw.replace(" ", ",").split(",") if t.strip()]

    rows = []
    for t in tickers:
        try:
            rows.append(analyze(t))
        except Exception as e:
            rows.append({"ticker": t, "error": str(e)})
            print(f"{t}: analysis failed: {e}")

    valid = [r for r in rows if "error" not in r]
    today_et = datetime.now(ZoneInfo("America/New_York")).date()
    if not force and valid and max(r["last_bar"] for r in valid) < today_et:
        print(f"No fresh bars for {today_et} — market closed; skipping digest (use --force to override).")
        return

    fake_manager = SimpleNamespace(active_connections={t: [] for t in tickers})
    regime = compute_regime(engine, fake_manager, rest_client)

    lines = [
        f"📊 Quantily Daily Digest — {today_et}",
        f"Regime: {regime['verdict']} (score {regime['score']})",
        "",
    ]
    for r in rows:
        if "error" in r:
            lines.append(f"{r['ticker']}: data unavailable")
        else:
            lines.append(f"{r['ticker']}: {r['signal']} (score {r['score']}) "
                         f"@ ${r['price']:.2f} · RSI {r['rsi']:.0f}")

    summary = ai_summary(rows, regime)
    if summary:
        lines += ["", summary]
    lines += ["", "Research context only — not investment advice."]

    text = "\n".join(lines)
    print(text)
    if notify.configured():
        print(f"\nNotification sent: {notify.send_text(text)}")
    else:
        print("\nNo notify channel configured (TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID or DISCORD_WEBHOOK_URL).")


if __name__ == "__main__":
    main()
