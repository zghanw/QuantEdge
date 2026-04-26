import { useState, useEffect, useRef } from 'react';

export interface MarketData {
    ticker: string;
    price: number | null;
    timestamp: number | null;
    signal: string;
    rsi: number | null;
    macd: number | null;
    sma_50: number | null;
    sma_200: number | null;
    history: Array<{ timestamp: string, price: number }>;
    aiAnalysis: string | null;
    requestAIRefresh?: () => void;
}

export function useMarketData(ticker: string) {
    const [data, setData] = useState<MarketData>({
        ticker,
        price: null,
        timestamp: null,
        signal: 'Loading...',
        rsi: null,
        macd: null,
        sma_50: null,
        sma_200: null,
        history: [],
        aiAnalysis: null
    });
    
    const wsRef = useRef<WebSocket | null>(null);

    const requestAIRefresh = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: "refresh_ai" }));
        }
    };

    useEffect(() => {
        if (!ticker) return;
        
        const ws = new WebSocket(`ws://localhost:8000/ws/${ticker}`);
        wsRef.current = ws;
        
        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            
            if (message.type === 'ai_insight') {
                setData(prev => ({ ...prev, aiAnalysis: message.analysis }));
                return;
            }
            
            setData(prevData => {
                let newHistory = [...prevData.history];
                
                if (message.historical_chart && message.historical_chart.length > 0) {
                    newHistory = message.historical_chart.map((point: any) => ({
                        timestamp: new Date(point.timestamp).toLocaleTimeString(),
                        price: point.price
                    }));
                } else if ((message.price || message.current_price) && message.timestamp) {
                     const timeStr = new Date(message.timestamp).toLocaleTimeString();
                     newHistory.push({ timestamp: timeStr, price: message.price || message.current_price });
                     if (newHistory.length > 50) newHistory.shift();
                }
                
                return {
                    ...prevData,
                    price: message.price || message.current_price || prevData.price,
                    timestamp: message.timestamp || prevData.timestamp,
                    signal: message.signal || prevData.signal,
                    rsi: message.rsi !== undefined ? message.rsi : prevData.rsi,
                    macd: message.macd !== undefined ? message.macd : prevData.macd,
                    sma_50: message.sma_50 !== undefined ? message.sma_50 : prevData.sma_50,
                    sma_200: message.sma_200 !== undefined ? message.sma_200 : prevData.sma_200,
                    history: newHistory
                };
            });
        };
        
        return () => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.close();
            }
        };
    }, [ticker]);

    return { ...data, requestAIRefresh };
}
