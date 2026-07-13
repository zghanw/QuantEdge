"""Replay the Quantily scoring rule over historical daily bars.

Answers: if you had held long every day the score said Accumulate/Strong Buy
(score >= 1) and stayed in cash otherwise, what would have happened?
Indicators are computed on daily bars with the same score_signal() the live
engine uses.

Usage:
    uv run python backtest.py SPY QQQ AAPL --days=730
"""
import sys
from datetime import datetime, timedelta

import pandas as pd
import ta

from market_data import rest_client, score_signal


def fetch_daily(ticker: str, days: int) -> pd.DataFrame:
    end = datetime.now()
    # +320 calendar days of warmup so SMA-200 exists from the first evaluated day
    rows = [{"timestamp": a.timestamp, "close": a.close} for a in rest_client.list_aggs(
        ticker, 1, "day",
        (end - timedelta(days=days + 320)).strftime("%Y-%m-%d"),
        end.strftime("%Y-%m-%d"), limit=50000)]
    if not rows:
        raise ValueError("no data returned (bad ticker or API limit)")
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    return df.set_index("timestamp")


def backtest(ticker: str, days: int) -> dict:
    df = fetch_daily(ticker, days)
    df["rsi"] = ta.momentum.RSIIndicator(close=df["close"], window=14).rsi()
    df["macd_diff"] = ta.trend.MACD(close=df["close"]).macd_diff()
    df["sma_50"] = df["close"].rolling(50).mean()
    df["sma_200"] = df["close"].rolling(200).mean()

    scores = []
    for i in range(len(df)):
        prev = df["macd_diff"].iloc[i - 1] if i > 0 else None
        row = df.iloc[i]
        score, _ = score_signal(row["rsi"], row["macd_diff"], prev, row["sma_50"], row["sma_200"])
        scores.append(score)
    df["score"] = scores

    df = df.dropna(subset=["sma_200"])
    if len(df) < 30:
        raise ValueError(f"only {len(df)} usable bars after warmup")

    next_ret = df["close"].pct_change().shift(-1)  # signal today -> return tomorrow
    long_mask = df["score"] >= 1
    strat_ret = next_ret.where(long_mask, 0.0).fillna(0.0)
    equity = (1 + strat_ret).cumprod()

    buy_days = int(long_mask.sum())
    wins = int(((next_ret > 0) & long_mask).sum())
    return {
        "ticker": ticker,
        "days": len(df),
        "signal_days": buy_days,
        "win_rate": round(100 * wins / buy_days, 1) if buy_days else float("nan"),
        "strategy_pct": round(100 * (equity.iloc[-1] - 1), 1),
        "buy_hold_pct": round(100 * (df["close"].iloc[-1] / df["close"].iloc[0] - 1), 1),
        "max_dd_pct": round(100 * (equity / equity.cummax() - 1).min(), 1),
    }


if __name__ == "__main__":
    days = 730
    tickers = []
    for arg in sys.argv[1:]:
        if arg.startswith("--days="):
            days = int(arg.split("=", 1)[1])
        else:
            tickers.append(arg.upper())
    tickers = tickers or ["SPY"]

    print(f"{'Ticker':<8}{'Days':>6}{'Signals':>9}{'Win%':>7}{'Strat%':>8}{'B&H%':>7}{'MaxDD%':>8}")
    for t in tickers:
        try:
            r = backtest(t, days)
            print(f"{r['ticker']:<8}{r['days']:>6}{r['signal_days']:>9}{r['win_rate']:>7}"
                  f"{r['strategy_pct']:>8}{r['buy_hold_pct']:>7}{r['max_dd_pct']:>8}")
        except Exception as e:
            print(f"{t:<8} failed: {e}")
    print("\nDaily close-to-close, no fees/slippage. Past performance guarantees nothing.")
