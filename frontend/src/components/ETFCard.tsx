import React, { useState } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { Sparkles, ChevronDown } from 'lucide-react';
import { useMarketData } from '../hooks/useMarketData';
import './ETFCard.css';

interface ETFCardProps {
    ticker: string;
    onRemove: (ticker: string) => void;
    regimeVerdict: string | null;
}

const formatAge = (seconds: number) =>
    seconds < 90 ? `${Math.round(seconds)}s` : `${Math.round(seconds / 60)}m`;

export const ETFCard: React.FC<ETFCardProps> = ({ ticker, onRemove, regimeVerdict }) => {
    const data = useMarketData(ticker);
    const [aiOpen, setAiOpen] = useState(false);

    // First open requests an analysis; after that the button only toggles.
    // Regenerate inside the panel is the explicit way to spend more tokens.
    const toggleAI = () => {
        const opening = !aiOpen;
        setAiOpen(opening);
        if (opening && !data.aiAnalysis && !data.aiLoading) {
            data.requestAIRefresh?.();
        }
    };

    const getSignalClass = (signal: string) => {
        if (signal === 'Strong Buy') return 'signal-strong-positive';
        if (signal.includes('Buy') || signal === 'Accumulate') return 'signal-positive';
        if (signal === 'Strong Sell') return 'signal-strong-negative';
        if (signal.includes('Sell') || signal === 'Reduce') return 'signal-negative';
        if (signal === 'Loading...' || signal === 'Waiting for data') return 'signal-loading';
        return 'signal-neutral';
    };

    const bullish = data.signal === 'Strong Buy' || data.signal === 'Accumulate';
    const bearish = data.signal === 'Strong Sell' || data.signal === 'Reduce';
    const counterRegime =
        (bullish && regimeVerdict === 'Risk-Off') || (bearish && regimeVerdict === 'Risk-On');

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
                        <p className="etf-meta">
                            <span className={`confidence-chip confidence-${data.confidence ?? 'low'}`}>
                                {data.confidence ?? '--'} confidence
                            </span>
                            <span className="feed-note">
                                15-min delayed
                                {data.dataAgeSeconds != null ? ` · tick ${formatAge(data.dataAgeSeconds)} ago` : ''}
                            </span>
                        </p>
                    </div>
                    <div className="etf-signal-stack">
                        <div className={`etf-signal ${getSignalClass(data.signal)}`}>
                            {data.signal}
                        </div>
                        {counterRegime && (
                            <div
                                className="counter-regime-badge"
                                title={`This ${bullish ? 'bullish' : 'bearish'} signal runs against the current ${regimeVerdict} market regime — size conviction accordingly.`}
                            >
                                ⚠ counter-regime
                            </div>
                        )}
                    </div>
                </div>

                <div className="etf-chart">
                    {data.history.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.history}>
                                <YAxis domain={['auto', 'auto']} hide />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#111111', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '8px', color: '#fafafa', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
                                    itemStyle={{ color: '#4ade80' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="price"
                                    stroke="#4ade80"
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
                        <span className="metric-label">RSI (14 · 5m)</span>
                        <span className={`metric-value ${data.rsi && data.rsi < 30 ? 'text-positive' : data.rsi && data.rsi > 70 ? 'text-negative' : ''}`}>
                            {data.rsi !== null ? data.rsi.toFixed(2) : '--'}
                        </span>
                    </div>
                    <div className="metric-box">
                        <span className="metric-label">MACD (5m)</span>
                        <span className={`metric-value ${data.macd && data.macd > 0 ? 'text-positive' : 'text-negative'}`}>
                            {data.macd !== null ? data.macd.toFixed(2) : '--'}
                        </span>
                    </div>
                    <div className="metric-box">
                        <span className="metric-label">SMA (50 · 1D)</span>
                        <span className="metric-value">
                            {data.sma_50 !== null ? `$${data.sma_50.toFixed(2)}` : '--'}
                        </span>
                    </div>
                    <div className="metric-box">
                        <span className="metric-label">SMA (200 · 1D)</span>
                        <span className="metric-value">
                            {data.sma_200 !== null ? `$${data.sma_200.toFixed(2)}` : '--'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="etf-col etf-col-intel">
                <h3 className="intel-title">Market Intel</h3>
                {data.headlines.length > 0 ? (
                    <div className="headlines">
                        {data.headlines.slice(0, 4).map((h, i) => (
                            <a
                                key={i}
                                href={h.link || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="headline-link"
                            >
                                {h.title}
                            </a>
                        ))}
                    </div>
                ) : (
                    <p className="intel-empty">No recent headlines.</p>
                )}
                <button className="ai-toggle" onClick={toggleAI} aria-expanded={aiOpen}>
                    <Sparkles size={14} aria-hidden="true" />
                    AI Analysis
                    <ChevronDown size={14} aria-hidden="true" className={`chev ${aiOpen ? 'open' : ''}`} />
                </button>
            </div>

            {aiOpen && (
                <div className="ai-expand">
                    <div className="ai-expand-head">
                        <span className="ai-expand-label">Gemini analyst note</span>
                        <button
                            className="refresh-ai-btn"
                            onClick={() => data.requestAIRefresh?.()}
                            disabled={data.aiLoading}
                        >
                            {data.aiLoading ? 'Generating…' : 'Regenerate'}
                        </button>
                    </div>
                    {data.aiAnalysis ? (
                        <p className="ai-text">{data.aiAnalysis}</p>
                    ) : (
                        <div className="ai-skeleton" aria-label="Generating analysis">
                            <div className="skeleton-line" style={{ width: '92%' }} />
                            <div className="skeleton-line" style={{ width: '80%' }} />
                            <div className="skeleton-line" style={{ width: '86%' }} />
                            <div className="skeleton-line" style={{ width: '55%' }} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
