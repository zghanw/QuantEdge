import asyncio
import json
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from market_data import manager, engine, rest_client, start_polygon_ws
from news import get_headlines
from regime import compute_regime

async def gemini_analysis_loop():
    while True:
        active_tickers = list(manager.active_connections.keys())
        for ticker in active_tickers:
            if ticker in engine.historical_data:
                indicators = engine.calculate_indicators(ticker)
                # Run blocking generate_analysis in a thread
                analysis = await asyncio.to_thread(engine.generate_analysis, ticker, indicators)

                if analysis:
                    await manager.broadcast(ticker, {
                        "ticker": ticker,
                        "type": "ai_insight",
                        "analysis": analysis,
                        "headlines": await asyncio.to_thread(get_headlines, ticker)
                    })
        await asyncio.sleep(300) # 5 minutes

async def regime_loop():
    while True:
        try:
            engine.regime = await asyncio.to_thread(compute_regime, engine, manager, rest_client)
            print(f"Regime updated: {engine.regime['verdict']} (score {engine.regime['score']})")
        except Exception as e:
            print(f"Regime update failed: {e}")
        await asyncio.sleep(600) # 10 minutes

@asynccontextmanager
async def lifespan(app: FastAPI):
    # The Polygon client runs in a plain thread — hand it this event loop
    # explicitly (get_running_loop() inside the thread would raise).
    threading.Thread(target=start_polygon_ws, args=(asyncio.get_running_loop(),), daemon=True).start()

    # Background loops: Gemini analysis + market regime refresh
    asyncio.create_task(gemini_analysis_loop())
    asyncio.create_task(regime_loop())

    yield

app = FastAPI(lifespan=lifespan)

# The Vite dev server runs on another port; REST endpoints need CORS (WS does not).
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Quantily Engine Online"}

@app.get("/regime")
def get_regime():
    return engine.regime

@app.get("/signals")
def get_signals():
    # Current indicator snapshot for every loaded ticker (world map markers)
    return {t: engine.calculate_indicators(t) for t in list(engine.historical_data.keys())}

@app.get("/health")
def health():
    now = time.time()
    tickers = {}
    for ticker, conns in manager.active_connections.items():
        bars_5m = len(engine.historical_data.get(ticker, []))
        last_tick = engine.last_tick_wall.get(ticker)
        age = round(now - last_tick, 1) if last_tick else None
        if bars_5m == 0:
            status = "EMPTY"
        elif age is None or age > 900:
            status = "STALE"  # no live tick in 15 min (or none yet) — market closed or feed issue
        else:
            status = "OK"
        tickers[ticker] = {
            "status": status,
            "bars_5m": bars_5m,
            "bars_daily": len(engine.daily_data.get(ticker, [])),
            "last_tick_age_seconds": age,
            "clients": len(conns),
        }
    return {
        "polygon_ws": {
            "status": engine.ws_status,
            "last_message_age_seconds": round(now - engine.last_ws_msg, 1) if engine.last_ws_msg else None,
        },
        "gemini_configured": engine.gemini_client is not None,
        "regime": {
            "verdict": engine.regime.get("verdict"),
            "components": list((engine.regime.get("components") or {}).keys()),
        },
        "tickers": tickers,
    }

fetching_tickers = set()

@app.websocket("/ws/{ticker}")
async def websocket_endpoint(websocket: WebSocket, ticker: str):
    ticker = ticker.upper()
    await manager.connect(websocket, ticker)

    loop = asyncio.get_running_loop()

    if ticker not in engine.historical_data:
        if ticker not in fetching_tickers:
            fetching_tickers.add(ticker)
            def fetch_task(loop_obj):
                try:
                    engine.fetch_historical(ticker)
                    indicators = engine.calculate_indicators(ticker)
                    chart_history = engine.get_historical_chart(ticker)
                    headlines = get_headlines(ticker)
                    asyncio.run_coroutine_threadsafe(
                        manager.broadcast(ticker, {"ticker": ticker, "status": "initialized", "historical_chart": chart_history, "headlines": headlines, **indicators}),
                        loop_obj
                    )

                    # Fetch initial AI insight
                    analysis = engine.generate_analysis(ticker, indicators)
                    if analysis:
                        asyncio.run_coroutine_threadsafe(
                            manager.broadcast(ticker, {"ticker": ticker, "type": "ai_insight", "analysis": analysis}),
                            loop_obj
                        )
                except Exception as e:
                    print(f"Fetch task error: {e}")
                finally:
                    if ticker in fetching_tickers:
                        fetching_tickers.remove(ticker)
            threading.Thread(target=fetch_task, args=(loop,), daemon=True).start()
    else:
        # Send an immediate snapshot
        indicators = engine.calculate_indicators(ticker)
        chart_history = engine.get_historical_chart(ticker)
        headlines = await asyncio.to_thread(get_headlines, ticker)
        await websocket.send_json({
            "ticker": ticker,
            "status": "connected",
            "historical_chart": chart_history,
            "headlines": headlines,
            **indicators
        })

    try:
        while True:
            data_str = await websocket.receive_text()
            try:
                msg = json.loads(data_str)
                if msg.get("action") == "refresh_ai":
                    ind = engine.calculate_indicators(ticker)
                    analysis = await asyncio.to_thread(engine.generate_analysis, ticker, ind)
                    if analysis:
                        await websocket.send_json({
                            "ticker": ticker,
                            "type": "ai_insight",
                            "analysis": analysis,
                            "headlines": await asyncio.to_thread(get_headlines, ticker)
                        })
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, ticker)
