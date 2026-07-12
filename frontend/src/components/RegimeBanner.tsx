import React from 'react';
import './RegimeBanner.css';

export interface RegimeComponent {
    vote: number;
    detail: string;
}

export interface Regime {
    verdict: string;
    score: number;
    components: Record<string, RegimeComponent>;
    updated?: number;
}

const VERDICT_CLASS: Record<string, string> = {
    'Risk-On': 'regime-on',
    'Risk-Off': 'regime-off',
    'Neutral': 'regime-neutral',
};

export const RegimeBanner: React.FC<{ regime: Regime | null }> = ({ regime }) => {
    if (!regime || regime.verdict === 'Unknown') {
        return (
            <div className="regime-banner glass-panel regime-unknown">
                <span className="regime-verdict">Market Regime: —</span>
                <span className="regime-detail">Waiting for regime data...</span>
            </div>
        );
    }

    return (
        <div className={`regime-banner glass-panel ${VERDICT_CLASS[regime.verdict] ?? 'regime-neutral'}`}>
            <span className="regime-verdict">Market Regime: {regime.verdict}</span>
            <div className="regime-components">
                {Object.entries(regime.components).map(([name, c]) => (
                    <span
                        key={name}
                        className={`regime-chip ${c.vote > 0 ? 'chip-pos' : c.vote < 0 ? 'chip-neg' : 'chip-flat'}`}
                        title={name}
                    >
                        {c.vote > 0 ? '▲' : c.vote < 0 ? '▼' : '■'} {c.detail}
                    </span>
                ))}
            </div>
        </div>
    );
};
