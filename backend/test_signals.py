"""Self-check for candle bucketing and scoring. Run: uv run python test_signals.py"""
import pandas as pd

from market_data import MarketEngine, score_signal


def test_live_tick_buckets():
    e = MarketEngine()
    idx = pd.to_datetime(["2026-07-10 09:30", "2026-07-10 09:35"])
    e.historical_data["TEST"] = pd.DataFrame({"close": [100.0, 101.0]}, index=idx)

    # Tick inside the current 5-min bucket updates the last close
    ts = int(pd.Timestamp("2026-07-10 09:37").timestamp() * 1000)
    e.add_live_tick("TEST", 101.5, ts)
    df = e.historical_data["TEST"]
    assert len(df) == 2 and df["close"].iloc[-1] == 101.5

    # Tick in a new bucket appends a bar instead of mutating history
    ts2 = int(pd.Timestamp("2026-07-10 09:41").timestamp() * 1000)
    e.add_live_tick("TEST", 102.0, ts2)
    df = e.historical_data["TEST"]
    assert len(df) == 3
    assert df["close"].iloc[-1] == 102.0
    assert df["close"].iloc[-2] == 101.5  # previous bar untouched
    assert df.index[-1] == pd.Timestamp("2026-07-10 09:40")


def test_score_signal():
    # oversold + bullish MACD crossover + golden cross
    assert score_signal(25, 0.5, -0.1, 110, 100) == (5, "Strong Buy")
    # overbought + death cross
    assert score_signal(75, -0.5, -0.4, 90, 100) == (-3, "Strong Sell")
    # no data beyond neutral RSI
    assert score_signal(50, None, None, None, None) == (0, "Hold")


def test_notify_transitions():
    import notify
    sent = []
    notify.send_text = lambda text: (sent.append(text), True)[1]
    notify._TG_TOKEN, notify._TG_CHAT = "t", "c"  # force configured()
    notify._last_signal.clear()
    notify._last_sent.clear()

    notify.maybe_notify_signal_change("SPY", "Hold", 100.0)         # baseline: silent
    assert sent == []
    notify.maybe_notify_signal_change("SPY", "Strong Buy", 101.0)   # change: notify
    assert len(sent) == 1 and "Hold → Strong Buy" in sent[0]
    notify.maybe_notify_signal_change("SPY", "Hold", 100.5)         # within cooldown: silent
    assert len(sent) == 1
    notify.maybe_notify_signal_change("SPY", "Waiting for data")    # non-signal: ignored
    assert len(sent) == 1


if __name__ == "__main__":
    test_live_tick_buckets()
    test_score_signal()
    test_notify_transitions()
    print("All checks passed.")
