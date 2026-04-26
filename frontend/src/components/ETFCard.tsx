import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { useMarketData } from '../hooks/useMarketData';
import './ETFCard.css';

interface ETFCardProps {
    ticker: string;
    onRemove: (ticker: string) => void;
}

export const ETFCard: React.FC<ETFCardProps> = ({ ticker, onRemove }) => {
    const data = useMarketData(ticker);

    const getSignalClass = (signal: string) => {
        if (signal === 'Strong Buy') return 'signal-strong-positive';
        if (signal.includes('Buy') || signal === 'Accumulate') return 'signal-positive';
        if (signal === 'Strong Sell') return 'signal-strong-negative';
        if (signal.includes('Sell') || signal === 'Reduce') return 'signal-negative';
        if (signal === 'Loading...' || signal === 'Waiting for data') return 'signal-loading';
        return 'signal-neutral';
    };

    return (
        <div className="etf-card glass-panel horizontal">
            <button
                onClick={() => onRemove(ticker)}
                className="remove-btn"
            >
                ✕
            </button>

            <div className="etf-col etf-col-chart">
                <div className="etf-header">
                    <div>
                        <h2 className="etf-ticker">{ticker}</h2>
                        <p className="etf-price">
                            {data.price ? `$${data.price.toFixed(2)}` : '---'}
                        </p>
                    </div>
                    <div className={`etf-signal ${getSignalClass(data.signal)}`}>
                        {data.signal}
                    </div>
                </div>

                <div className="etf-chart">
                    {data.history.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.history}>
                                <YAxis domain={['auto', 'auto']} hide />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1a1d2d', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: '#00f0ff' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="price"
                                    stroke="#00f0ff"
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="chart-loading">
                            <span className="pulse-dot"></span> Loading Feed...
                        </div>
                    )}
                </div>
            </div>

            <div className="etf-col etf-col-metrics">
                <div className="etf-metrics">
                    <div className="metric-box">
                        <span className="metric-label">RSI (14)</span>
                        <span className={`metric-value ${data.rsi && data.rsi < 30 ? 'text-positive' : data.rsi && data.rsi > 70 ? 'text-negative' : ''}`}>
                            {data.rsi !== null ? data.rsi.toFixed(2) : '--'}
                        </span>
                    </div>
                    <div className="metric-box">
                        <span className="metric-label">MACD</span>
                        <span className={`metric-value ${data.macd && data.macd > 0 ? 'text-positive' : 'text-negative'}`}>
                            {data.macd !== null ? data.macd.toFixed(2) : '--'}
                        </span>
                    </div>
                    <div className="metric-box">
                        <span className="metric-label">SMA (50)</span>
                        <span className="metric-value">
                            {data.sma_50 !== null ? `$${data.sma_50.toFixed(2)}` : '--'}
                        </span>
                    </div>
                    <div className="metric-box">
                        <span className="metric-label">SMA (200)</span>
                        <span className="metric-value">
                            {data.sma_200 !== null ? `$${data.sma_200.toFixed(2)}` : '--'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="etf-col etf-col-ai">
                <div className="ai-analyst-header">
                    <h3>AI Technical Analyst</h3>
                    <button className="refresh-ai-btn glass-panel" onClick={data.requestAIRefresh}>
                        Refresh
                    </button>
                </div>
                <div className="ai-content">
                    {data.aiAnalysis ? (
                        <p className="ai-text">{data.aiAnalysis}</p>
                    ) : (
                        <div className="ai-loading">
                            <span className="pulse-dot"></span>
                            <span>Generating analysis...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
