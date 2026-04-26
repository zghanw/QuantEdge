import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import threading

from market_data import manager, engine, start_polygon_ws

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
                        "analysis": analysis
                    })
        await asyncio.sleep(300) # 5 minutes

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start Polygon websocket client in background
    # We run it in a thread to prevent blocking
    threading.Thread(target=start_polygon_ws, daemon=True).start()
    
    # Start the Gemini analysis background loop
    asyncio.create_task(gemini_analysis_loop())
    
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "ETF Analyzer Engine Online"}

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
                    asyncio.run_coroutine_threadsafe(
                        manager.broadcast(ticker, {"ticker": ticker, "status": "initialized", "historical_chart": chart_history, **indicators}),
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
        await websocket.send_json({
            "ticker": ticker,
            "status": "connected",
            "historical_chart": chart_history,
            **indicators
        })
        
    try:
        while True:
            import json
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
                            "analysis": analysis
                        })
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, ticker)
