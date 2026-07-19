import { useState, useEffect, useRef } from 'react';

export interface Headline {
    title: string;
    link: string;
    published?: string;
}

export interface MarketData {
    ticker: string;
    price: number | null;
    timestamp: number | null;
    signal: string;
    score: number | null;
    rsi: number | null;
    macd: number | null;
    sma_50: number | null;
    sma_200: number | null;
    confidence: string | null;
    feedMode: 'live' | 'eod' | null;
    dataAgeSeconds: number | null;
    history: Array<{ timestamp: string, price: number }>;
    headlines: Headline[];
    aiAnalysis: string | null;
    aiLoading: boolean;
    requestAIRefresh?: () => void;
}

export function useMarketData(ticker: string) {
    const [data, setData] = useState<MarketData>({
        ticker,
        price: null,
        timestamp: null,
        signal: 'Loading...',
        score: null,
        rsi: null,
        macd: null,
        sma_50: null,
        sma_200: null,
        confidence: null,
        feedMode: null,
        dataAgeSeconds: null,
        history: [],
        headlines: [],
        aiAnalysis: null,
        aiLoading: false
    });

    const wsRef = useRef<WebSocket | null>(null);

    const requestAIRefresh = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            setData(prev => ({ ...prev, aiLoading: true }));
            wsRef.current.send(JSON.stringify({ action: "refresh_ai" }));
        }
    };

    useEffect(() => {
        if (!ticker) return;

        let cancelled = false;
        let retry = 0;

        const connect = () => {
            const ws = new WebSocket(`ws://localhost:8000/ws/${ticker}`);
            wsRef.current = ws;

            ws.onopen = () => { retry = 0; };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);

                if (message.type === 'ai_insight') {
                    setData(prev => ({
                        ...prev,
                        aiAnalysis: message.analysis,
                        aiLoading: false,
                        headlines: message.headlines ?? prev.headlines
                    }));
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
                        score: message.score !== undefined ? message.score : prevData.score,
                        rsi: message.rsi !== undefined ? message.rsi : prevData.rsi,
                        macd: message.macd !== undefined ? message.macd : prevData.macd,
                        sma_50: message.sma_50 !== undefined ? message.sma_50 : prevData.sma_50,
                        sma_200: message.sma_200 !== undefined ? message.sma_200 : prevData.sma_200,
                        confidence: message.confidence ?? prevData.confidence,
                        feedMode: message.feed_mode ?? prevData.feedMode,
                        dataAgeSeconds: message.data_age_seconds !== undefined ? message.data_age_seconds : prevData.dataAgeSeconds,
                        headlines: message.headlines ?? prevData.headlines,
                        history: newHistory
                    };
                });
            };

            // Auto-reconnect with backoff when the backend restarts or the socket drops
            ws.onclose = () => {
                if (cancelled) return;
                retry += 1;
                setTimeout(connect, Math.min(30000, 2000 * retry));
            };
        };

        connect();

        return () => {
            cancelled = true;
            wsRef.current?.close();
        };
    }, [ticker]);

    return { ...data, requestAIRefresh };
}
