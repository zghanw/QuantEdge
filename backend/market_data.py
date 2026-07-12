import os
import time
import asyncio
import pandas as pd
import ta
from google import genai
from dotenv import load_dotenv
from typing import Dict, List, Optional
from polygon import RESTClient, WebSocketClient
from fastapi import WebSocket

from news import get_headlines
import notify

load_dotenv()
POLYGON_API_KEY = os.getenv("POLYGON_API_KEY")

rest_client = RESTClient(api_key=POLYGON_API_KEY)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, ticker: str):
        await websocket.accept()
        if ticker not in self.active_connections:
            self.active_connections[ticker] = []
        self.active_connections[ticker].append(websocket)
        print(f"Client connected to {ticker}. Total: {len(self.active_connections[ticker])}")

    def disconnect(self, websocket: WebSocket, ticker: str):
        if ticker in self.active_connections:
            if websocket in self.active_connections[ticker]:
                self.active_connections[ticker].remove(websocket)
            if not self.active_connections[ticker]:
                del self.active_connections[ticker]
                print(f"No more clients for {ticker}")

    async def broadcast(self, ticker: str, message: dict):
        if ticker in self.active_connections:
            for connection in self.active_connections[ticker]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()


def score_signal(rsi, macd_diff, prev_macd_diff, sma_50, sma_200):
    """Pure scoring rule, shared by the live engine and backtest.py.

    RSI/MACD are intraday momentum (5-min bars); SMA 50/200 is the daily
    golden/death cross regime. Death cross now subtracts symmetrically.
    """
    score = 0
    if rsi is not None and pd.notna(rsi):
        if rsi < 30: score += 2
        elif rsi < 40: score += 1
        elif rsi > 70: score -= 2

    if macd_diff is not None and pd.notna(macd_diff):
        if macd_diff > 0 and prev_macd_diff is not None and pd.notna(prev_macd_diff) and prev_macd_diff < 0:
            score += 2  # bullish crossover
        elif macd_diff > 0:
            score += 1

    if (sma_50 is not None and sma_200 is not None
            and pd.notna(sma_50) and pd.notna(sma_200)):
        score += 1 if sma_50 > sma_200 else -1

    if score >= 3: signal = "Strong Buy"
    elif score >= 1: signal = "Accumulate"
    elif score <= -2: signal = "Strong Sell"
    elif score <= -1: signal = "Reduce"
    else: signal = "Hold"
    return score, signal


class MarketEngine:
    def __init__(self):
        self.historical_data: Dict[str, pd.DataFrame] = {}   # 5-min close bars
        self.daily_data: Dict[str, pd.DataFrame] = {}        # daily close bars (SMA 50/200)
        self.last_tick_wall: Dict[str, float] = {}           # wall-clock time of last live tick
        self.fetching_data: set = set()
        self.regime: dict = {"verdict": "Unknown", "score": 0, "components": {}}
        self.ws_status: str = "starting"
        self.last_ws_msg: float = 0.0

        # Configure Gemini
        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key:
            self.gemini_client = genai.Client(api_key=gemini_key)
        else:
            self.gemini_client = None

    def fetch_historical(self, ticker: str):
        from datetime import datetime, timedelta

        end_date = datetime.now()

        # 5-minute candles, 15 days — intraday RSI/MACD
        print(f"Fetching historical data for {ticker}...")
        try:
            aggs = []
            for a in rest_client.list_aggs(
                ticker, 5, "minute",
                (end_date - timedelta(days=15)).strftime("%Y-%m-%d"),
                end_date.strftime("%Y-%m-%d"),
                limit=50000
            ):
                aggs.append({
                    "timestamp": a.timestamp,
                    "close": a.close,
                })

            if aggs:
                df = pd.DataFrame(aggs)
                df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
                df.set_index('timestamp', inplace=True)
                self.historical_data[ticker] = df
                print(f"Loaded {len(df)} 5-min candles for {ticker}")
        except Exception as e:
            print(f"Error fetching historical data for {ticker}: {e}")

        # Daily candles, ~600 calendar days — so SMA 50/200 is a true daily
        # golden/death cross, not a 5-minute-bar artifact. One extra REST call
        # per ticker (Polygon free tier allows 5/min).
        try:
            daily = []
            for a in rest_client.list_aggs(
                ticker, 1, "day",
                (end_date - timedelta(days=600)).strftime("%Y-%m-%d"),
                end_date.strftime("%Y-%m-%d"),
                limit=50000
            ):
                daily.append({"timestamp": a.timestamp, "close": a.close})

            if daily:
                df = pd.DataFrame(daily)
                df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
                df.set_index('timestamp', inplace=True)
                self.daily_data[ticker] = df
                print(f"Loaded {len(df)} daily candles for {ticker}")
        except Exception as e:
            print(f"Error fetching daily data for {ticker}: {e}")

    def calculate_indicators(self, ticker: str) -> dict:
        if ticker not in self.historical_data or self.historical_data[ticker].empty:
            return {"signal": "Waiting for data", "rsi": None, "macd": None,
                    "sma_50": None, "sma_200": None, "confidence": "low"}

        df = self.historical_data[ticker].copy()

        try:
            # Intraday momentum on 5-min bars
            df['rsi'] = ta.momentum.RSIIndicator(close=df['close'], window=14).rsi()
            macd = ta.trend.MACD(close=df['close'])
            df['macd'] = macd.macd()
            df['macd_diff'] = macd.macd_diff()
            latest = df.iloc[-1]

            # Trend from daily bars
            sma_50 = sma_200 = None
            high_20d = low_20d = None
            daily = self.daily_data.get(ticker)
            if daily is not None and len(daily) >= 200:
                closes = daily['close']
                sma_50 = closes.rolling(50).mean().iloc[-1]
                sma_200 = closes.rolling(200).mean().iloc[-1]
            if daily is not None and len(daily) >= 20:
                tail = daily['close'].tail(20)
                high_20d = round(float(tail.max()), 2)
                low_20d = round(float(tail.min()), 2)

            prev_macd_diff = df.iloc[-2]['macd_diff'] if len(df) > 1 else None
            score, signal = score_signal(latest['rsi'], latest['macd_diff'],
                                         prev_macd_diff, sma_50, sma_200)

            # Freshness + honest confidence for the UI
            age = None
            if ticker in self.last_tick_wall:
                age = round(time.time() - self.last_tick_wall[ticker], 1)
            bars_5m = len(df)
            bars_daily = len(daily) if daily is not None else 0
            if bars_5m >= 100 and bars_daily >= 200 and age is not None and age < 180:
                confidence = "high"
            elif bars_5m >= 35:
                confidence = "medium"  # enough bars for RSI/MACD, but stale or short daily history
            else:
                confidence = "low"

            return {
                "signal": signal,
                "score": score,
                "rsi": round(latest['rsi'], 2) if pd.notna(latest['rsi']) else None,
                "macd": round(latest['macd'], 2) if pd.notna(latest['macd']) else None,
                "sma_50": round(float(sma_50), 2) if sma_50 is not None and pd.notna(sma_50) else None,
                "sma_200": round(float(sma_200), 2) if sma_200 is not None and pd.notna(sma_200) else None,
                "current_price": latest['close'],
                "high_20d": high_20d,
                "low_20d": low_20d,
                "timestamp": int(latest.name.timestamp() * 1000) if pd.notna(latest.name) else None,
                "bars_5m": bars_5m,
                "bars_daily": bars_daily,
                "data_age_seconds": age,
                "confidence": confidence,
                "feed_delayed": True,  # Polygon free tier streams 15-min delayed data
            }
        except Exception as e:
            print(f"Error calculating indicators: {e}")
            return {"signal": "Error", "rsi": None, "macd": None,
                    "sma_50": None, "sma_200": None, "confidence": "low"}

    def get_historical_chart(self, ticker: str, limit: int = 50) -> list:
        if ticker not in self.historical_data or self.historical_data[ticker].empty:
            return []

        df = self.historical_data[ticker].tail(limit)
        chart_data = []
        for index, row in df.iterrows():
            if pd.notna(row['close']):
                chart_data.append({
                    "timestamp": int(index.timestamp() * 1000),
                    "price": row['close']
                })
        return chart_data

    def generate_analysis(self, ticker: str, indicators: dict) -> str:
        if not self.gemini_client:
            return "Gemini API key not configured."

        if indicators.get('signal') in ["Waiting for data", "Error"]:
            return "Waiting for sufficient data to generate AI analysis."

        headlines = get_headlines(ticker)
        headline_block = "\n        ".join(f"- {h['title']}" for h in headlines[:5]) \
            or "- (no recent headlines available)"

        regime = self.regime or {}
        component_notes = "; ".join(
            f"{name}: {c.get('detail', '')}"
            for name, c in (regime.get("components") or {}).items()
        ) or "unavailable"

        prompt = f"""
        You are a disciplined quantitative market analyst. Using ONLY the data below, write a compact research note for {ticker}.

        DATA
        - Current price: ${indicators.get('current_price')}
        - Intraday momentum (5-minute bars): RSI(14) = {indicators.get('rsi')}, MACD = {indicators.get('macd')}
        - Daily trend: SMA(50) = ${indicators.get('sma_50')}, SMA(200) = ${indicators.get('sma_200')}
        - 20-day close range: ${indicators.get('low_20d')} – ${indicators.get('high_20d')}
        - Rule-based signal: {indicators.get('signal')} (score {indicators.get('score')})
        - Data confidence: {indicators.get('confidence')} (15-minute delayed feed)
        - Market regime: {regime.get('verdict', 'Unknown')} ({component_notes})
        - Recent headlines:
        {headline_block}

        Respond as plain text (no markdown, no asterisks), 170 words maximum, with each section on its own line in EXACTLY this structure:
        Read: what the indicator math says (overbought/oversold, momentum, trend).
        Context: how the market regime and headlines support or conflict with that read.
        Levels: reference entry, stop-loss and target prices, each derived from a number given above (current price, a daily SMA, or the 20-day range) with its basis named in parentheses. If the signal is Hold, write "no actionable setup".
        Confirmation: one concrete thing that would confirm the signal.
        Invalidation: one concrete thing that would prove the signal wrong.
        Checklist: two short pre-trade checks (e.g. position size vs confidence, regime alignment, upcoming events).
        Horizon: same-day, multi-day, or longer-term.

        Rules: use only numbers given above, never invent prices, no investment advice, no preamble.
        """

        try:
            response = self.gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt
            )
            return response.text.strip()
        except Exception as e:
            print(f"Error generating Gemini analysis: {e}")
            return "Error generating AI analysis."

    def add_live_tick(self, ticker: str, price: float, ts_ms: Optional[int] = None):
        self.last_tick_wall[ticker] = time.time()
        df = self.historical_data.get(ticker)
        if df is None or df.empty:
            return

        if ts_ms is None:
            ts_ms = int(time.time() * 1000)
        bucket = pd.Timestamp(ts_ms, unit='ms').floor('5min')

        if bucket <= df.index[-1]:
            # Tick belongs to the current bar — update its close
            df.at[df.index[-1], 'close'] = price
        else:
            # New 5-minute bucket — append a fresh bar instead of mutating history
            df.loc[bucket] = price
            if len(df) > 3000:
                self.historical_data[ticker] = df.iloc[-2000:]

engine = MarketEngine()

# The FastAPI event loop, handed to us by main.py's lifespan
main_loop = None

def handle_msg(msgs):
    engine.last_ws_msg = time.time()
    for m in msgs:
        if m.event_type in ['AM', 'A', 'T']:
            # AM = per minute agg, A = per second agg, T = trade
            ticker = m.sym
            if ticker not in manager.active_connections:
                continue  # AM.* streams the whole market; only process tracked tickers
            price = m.close if hasattr(m, 'close') else m.price
            ts = m.end_timestamp if hasattr(m, 'end_timestamp') else m.timestamp

            engine.add_live_tick(ticker, price, ts)
            indicators = engine.calculate_indicators(ticker)
            notify.maybe_notify_signal_change(
                ticker, indicators.get("signal"), price, engine.regime.get("verdict", "Unknown"))

            payload = {
                "ticker": ticker,
                "price": price,
                "timestamp": ts,
                **indicators
            }

            if main_loop:
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast(ticker, payload),
                    main_loop
                )

def _poll_latest_bar(ticker):
    from datetime import datetime, timedelta
    end = datetime.now()
    for a in rest_client.list_aggs(
        ticker, 5, "minute",
        (end - timedelta(days=5)).strftime("%Y-%m-%d"),
        end.strftime("%Y-%m-%d"),
        limit=1, sort="desc"
    ):
        return a  # newest bar first
    return None

def start_rest_polling(loop):
    """Fallback when the Polygon plan has no websocket access: round-robin the
    tracked tickers, one REST snapshot every ~15s (free tier allows 5 req/min).
    ponytail: a plan with websocket access makes this loop unnecessary."""
    global main_loop
    main_loop = loop
    engine.ws_status = "rest-polling (plan has no websocket access)"
    while True:
        tickers = [t for t in list(manager.active_connections) if t in engine.historical_data]
        if not tickers:
            time.sleep(5)
            continue
        for ticker in tickers:
            try:
                bar = _poll_latest_bar(ticker)
                if bar is not None:
                    engine.last_ws_msg = time.time()
                    engine.add_live_tick(ticker, bar.close, bar.timestamp)
                    indicators = engine.calculate_indicators(ticker)
                    notify.maybe_notify_signal_change(
                        ticker, indicators.get("signal"), bar.close, engine.regime.get("verdict", "Unknown"))
                    payload = {"ticker": ticker, "price": bar.close, "timestamp": bar.timestamp, **indicators}
                    if main_loop and manager.active_connections.get(ticker):
                        asyncio.run_coroutine_threadsafe(manager.broadcast(ticker, payload), main_loop)
            except Exception as e:
                print(f"REST poll failed for {ticker}: {e}")
            time.sleep(15)

def start_polygon_ws(loop):
    """Runs in a plain thread. `loop` is the FastAPI event loop, captured by the
    caller — asyncio.get_running_loop() inside this thread would raise, silently
    killing the feed. Reconnects with exponential backoff when the socket drops;
    if the plan has no websocket access at all, switches to REST polling.
    """
    global main_loop
    main_loop = loop
    delay = 5
    while True:
        started = time.time()
        try:
            engine.ws_status = "connecting"
            # Delayed feed is the only one available for stocks on free tier
            client = WebSocketClient(
                api_key=POLYGON_API_KEY,
                feed="delayed.polygon.io",
                market="stocks",
                # ponytail: whole-market minute aggs; switch to per-ticker subscribe if bandwidth matters
                subscriptions=["AM.*"]
            )
            engine.ws_status = "connected"
            client.run(handle_msg=handle_msg)  # blocks until the connection drops
            engine.ws_status = "disconnected"
        except Exception as e:
            engine.ws_status = "disconnected"
            print(f"Polygon WS dropped: {e}")
            if "websocket access" in str(e).lower():
                print("Polygon plan has no websocket access — falling back to REST polling.")
                start_rest_polling(loop)
                return  # polling loop never returns
        if time.time() - started > 120:
            delay = 5  # connection held for a while — reset backoff
        print(f"Reconnecting Polygon WS in {delay}s...")
        time.sleep(delay)
        delay = min(delay * 2, 60)
