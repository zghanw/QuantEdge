import os
import asyncio
import pandas as pd
import ta
from google import genai
from dotenv import load_dotenv
from typing import Dict, List
from polygon import RESTClient, WebSocketClient
from fastapi import WebSocket

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

class MarketEngine:
    def __init__(self):
        self.historical_data: Dict[str, pd.DataFrame] = {}
        self.fetching_data: set = set()
        
        # Configure Gemini
        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key:
            self.gemini_client = genai.Client(api_key=gemini_key)
        else:
            self.gemini_client = None
        
    def fetch_historical(self, ticker: str):
        from datetime import datetime, timedelta
        
        # Fetch 15 days of 5-minute candles to ensure enough data for 200 SMA
        end_date = datetime.now()
        start_date = end_date - timedelta(days=15)
        
        print(f"Fetching historical data for {ticker}...")
        try:
            aggs = []
            for a in rest_client.list_aggs(
                ticker, 5, "minute",
                start_date.strftime("%Y-%m-%d"),
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
                print(f"Loaded {len(df)} historical candles for {ticker}")
        except Exception as e:
            print(f"Error fetching historical data for {ticker}: {e}")

    def calculate_indicators(self, ticker: str) -> dict:
        if ticker not in self.historical_data or self.historical_data[ticker].empty:
            return {"signal": "Waiting for data", "rsi": None, "macd": None, "sma_50": None, "sma_200": None}
            
        df = self.historical_data[ticker].copy()
        
        try:
            # RSI
            rsi = ta.momentum.RSIIndicator(close=df['close'], window=14)
            df['rsi'] = rsi.rsi()
            
            # MACD
            macd = ta.trend.MACD(close=df['close'])
            df['macd'] = macd.macd()
            df['macd_diff'] = macd.macd_diff()
            
            # SMAs
            sma_50 = ta.trend.SMAIndicator(close=df['close'], window=50)
            df['sma_50'] = sma_50.sma_indicator()
            
            sma_200 = ta.trend.SMAIndicator(close=df['close'], window=200)
            df['sma_200'] = sma_200.sma_indicator()
            
            latest = df.iloc[-1]
            
            signal = "Hold"
            score = 0
            
            if pd.notna(latest['rsi']):
                if latest['rsi'] < 30: score += 2
                elif latest['rsi'] < 40: score += 1
                elif latest['rsi'] > 70: score -= 2
                    
            if pd.notna(latest['macd_diff']):
                if latest['macd_diff'] > 0 and len(df) > 1 and df.iloc[-2]['macd_diff'] < 0:
                    score += 2 # Crossover
                elif latest['macd_diff'] > 0:
                    score += 1
                    
            if pd.notna(latest['sma_50']) and pd.notna(latest['sma_200']):
                if latest['sma_50'] > latest['sma_200']: score += 1
                    
            if score >= 3: signal = "Strong Buy"
            elif score >= 1: signal = "Accumulate"
            elif score <= -2: signal = "Strong Sell"
            elif score <= -1: signal = "Reduce"
                
            return {
                "signal": signal,
                "rsi": round(latest['rsi'], 2) if pd.notna(latest['rsi']) else None,
                "macd": round(latest['macd'], 2) if pd.notna(latest['macd']) else None,
                "sma_50": round(latest['sma_50'], 2) if pd.notna(latest['sma_50']) else None,
                "sma_200": round(latest['sma_200'], 2) if pd.notna(latest['sma_200']) else None,
                "current_price": latest['close'],
                "timestamp": int(latest.name.timestamp() * 1000) if hasattr(latest, 'name') and pd.notna(latest.name) else None
            }
        except Exception as e:
            print(f"Error calculating indicators: {e}")
            return {"signal": "Error", "rsi": None, "macd": None, "sma_50": None, "sma_200": None}

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
            
        prompt = f"""
        You are a quantitative ETF analyst. Provide a strict 2-sentence mathematical technical analysis for the ticker {ticker}.
        Do NOT include any general macroeconomic context. Only interpret the following mathematical indicators:
        Current Price: ${indicators.get('current_price')}
        RSI (14): {indicators.get('rsi')}
        MACD: {indicators.get('macd')}
        SMA (50): ${indicators.get('sma_50')}
        SMA (200): ${indicators.get('sma_200')}
        Current Signal: {indicators.get('signal')}
        
        Focus strictly on what these numbers mean mathematically (e.g. overbought/oversold, momentum direction, crossover status).
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
        
    def add_live_tick(self, ticker: str, price: float):
        if ticker in self.historical_data and not self.historical_data[ticker].empty:
            df = self.historical_data[ticker]
            latest_idx = df.index[-1]
            df.at[latest_idx, 'close'] = price

engine = MarketEngine()

# We will initialize this in main.py
ws_client = None
main_loop = None

def handle_msg(msgs):
    for m in msgs:
        if m.event_type in ['AM', 'A', 'T']:
            # AM = per minute agg, A = per second agg, T = trade
            ticker = m.sym
            price = m.close if hasattr(m, 'close') else m.price
            ts = m.end_timestamp if hasattr(m, 'end_timestamp') else m.timestamp
            
            engine.add_live_tick(ticker, price)
            indicators = engine.calculate_indicators(ticker)
            
            payload = {
                "ticker": ticker,
                "price": price,
                "timestamp": ts,
                **indicators
            }
            
            if main_loop and manager.active_connections.get(ticker):
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast(ticker, payload),
                    main_loop
                )

def start_polygon_ws():
    global ws_client, main_loop
    main_loop = asyncio.get_running_loop()
    
    # Delayed feed is the only one available for stocks on free tier
    ws_client = WebSocketClient(
        api_key=POLYGON_API_KEY, 
        feed="delayed.polygon.io", 
        market="stocks",
        subscriptions=["AM.*"] # Subscribe to all Minute Aggregates
    )
    # The client runs in a separate thread
    ws_client.run(handle_msg=handle_msg)
