import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Plus, Check } from 'lucide-react';
import { NavTabs } from '../components/NavTabs';
import { MarketMap, type WorldEvent } from '../components/MarketMap';
import { EXCHANGES, type Exchange, type Region } from '../config/exchanges';
import { fmtDuration, getMarketStatus, type MarketStatus } from '../lib/marketHours';
import { loadTickers, addTicker } from '../lib/watchlist';
import './Dashboard.css';
import './WorldMap.css';

const API = 'http://localhost:8000';

// Backdrop glow follows the dashboard's market-regime verdict; neutral is a soft blue
const REGIME_TINT: Record<string, string> = { 'Risk-On': '#4ade80', 'Risk-Off': '#f87171' };
const GLOW_DEFAULT = '#3b82f6';

// Follows the sun: Asia-Pacific opens first, the Americas close the day
const REGIONS: { key: Region; label: string }[] = [
    { key: 'APAC', label: 'Asia-Pacific' },
    { key: 'EMEA', label: 'Europe · MEA' },
    { key: 'AMER', label: 'Americas' },
];

const signalTone = (s: string) =>
    s.includes('Buy') || s === 'Accumulate' ? 'sig-pos'
        : s.includes('Sell') || s === 'Reduce' ? 'sig-neg' : 'sig-flat';

const WorldMap = () => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tracked, setTracked] = useState<string[]>(loadTickers);
    const [tick, setTick] = useState(0);
    const [regime, setRegime] = useState<{ verdict?: string } | null>(null);
    const [signals, setSignals] = useState<Record<string, any>>({});
    const [worldEvents, setWorldEvents] = useState<WorldEvent[]>([]);
    const [showHazards, setShowHazards] = useState(() => localStorage.getItem('quantily.map.hazards') !== 'off');

    const toggleHazards = () => setShowHazards(s => {
        localStorage.setItem('quantily.map.hazards', s ? 'off' : 'on');
        return !s;
    });

    // Recompute open/closed statuses every 30s
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 30_000);
        return () => clearInterval(id);
    }, []);

    // Regime verdict + live signals from the backend; the map degrades
    // gracefully to pure session data when it isn't running
    useEffect(() => {
        let cancelled = false;
        const load = () => {
            fetch(`${API}/regime`).then(r => r.json())
                .then(d => { if (!cancelled) setRegime(d); }).catch(() => {});
            fetch(`${API}/signals`).then(r => r.json())
                .then(d => { if (!cancelled) setSignals(d); }).catch(() => {});
            fetch(`${API}/worldstate`).then(r => r.json())
                .then(d => { if (!cancelled) setWorldEvents(d.events ?? []); }).catch(() => {});
        };
        load();
        const id = setInterval(load, 5 * 60_000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    const statuses = useMemo(() => {
        const m: Record<string, MarketStatus> = {};
        for (const ex of EXCHANGES) m[ex.id] = getMarketStatus(ex);
        return m;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]);

    const openCount = Object.values(statuses).filter(s => s.state !== 'closed').length;
    const selected = EXCHANGES.find(e => e.id === selectedId) ?? null;

    const handleSelect = useCallback((ex: Exchange) => setSelectedId(ex.id), []);
    const closePanel = useCallback(() => setSelectedId(null), []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [closePanel]);

    const selectedStatus = selected ? statuses[selected.id] : null;
    const selectedTracked = !!(selected?.etf && tracked.includes(selected.etf));
    const glow = REGIME_TINT[regime?.verdict ?? ''] ?? GLOW_DEFAULT;

    return (
        <div className="map-page">
            <nav className="dashboard-nav glass-panel">
                <div className="container nav-content">
                    <div className="nav-left">
                        <Link to="/" className="logo text-gradient">Quantily</Link>
                        <NavTabs />
                    </div>
                    <div className="nav-actions">
                        <select
                            className="exchange-select"
                            aria-label="Find an exchange"
                            value={selectedId ?? ''}
                            onChange={e => {
                                const ex = EXCHANGES.find(x => x.id === e.target.value);
                                if (ex) handleSelect(ex);
                            }}
                        >
                            <option value="" disabled>Find exchange…</option>
                            {[...EXCHANGES].sort((a, b) => a.shortName.localeCompare(b.shortName)).map(ex => (
                                <option key={ex.id} value={ex.id}>{ex.shortName} — {ex.city}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </nav>

            <div className="map-stage">
                <div
                    className="map-glow"
                    aria-hidden="true"
                    style={{ background: `radial-gradient(ellipse 60% 55% at 50% 45%, ${glow}14, transparent 70%)` }}
                />

                <div className="map-frame">
                    <MarketMap
                        statuses={statuses}
                        tracked={tracked}
                        signals={signals}
                        selectedId={selectedId}
                        onSelect={handleSelect}
                        worldEvents={showHazards ? worldEvents : []}
                    />
                </div>

                <div className="map-summary glass-panel" role="status">
                    <span className="summary-count">{openCount}</span> of {EXCHANGES.length} markets open now
                    {regime?.verdict && regime.verdict !== 'Unknown' && (
                        <span className={`summary-regime regime-${regime.verdict.toLowerCase().replace('-', '')}`}>
                            · {regime.verdict}
                        </span>
                    )}
                </div>

                <div className="session-ribbon glass-panel" aria-label="Trading sessions by region">
                    {REGIONS.map(({ key, label }) => {
                        const list = EXCHANGES.filter(e => e.region === key);
                        const open = list.filter(e => statuses[e.id].state !== 'closed').length;
                        return (
                            <span key={key} className={`ribbon-seg ${open > 0 ? 'seg-open' : ''}`}>
                                <i className={`dot ${open > 0 ? 'dot-open' : 'dot-closed'}`} aria-hidden="true" />
                                {label} {open}/{list.length}
                            </span>
                        );
                    })}
                </div>

                <div className="map-legend glass-panel" aria-label="Map legend">
                    <span><i className="dot dot-open" aria-hidden="true" /> Open</span>
                    <span><i className="dot dot-lunch" aria-hidden="true" /> Lunch break</span>
                    <span><i className="dot dot-closed" aria-hidden="true" /> Closed</span>
                    <span><i className="dot dot-tracked" aria-hidden="true" /> On watchlist</span>
                    <button
                        className={`legend-toggle ${showHazards ? '' : 'is-off'}`}
                        onClick={toggleHazards}
                        aria-pressed={showHazards}
                        title="Earthquakes, wildfires, volcanoes and storms (USGS + NASA EONET)"
                    >
                        <i className="dot dot-hazard" aria-hidden="true" /> World events
                    </button>
                </div>

                {selected && selectedStatus && (
                    <aside className="exchange-panel glass-panel" role="dialog" aria-label={`${selected.name} details`}>
                        <button className="panel-close" onClick={closePanel} aria-label="Close exchange details">
                            <X size={16} aria-hidden="true" />
                        </button>
                        <h2 className="panel-title">{selected.shortName}</h2>
                        <p className="panel-sub">{selected.name}</p>
                        <p className="panel-sub muted">{selected.city}, {selected.country}</p>

                        <div className={`status-chip status-${selectedStatus.state}`}>
                            {selectedStatus.state === 'lunch' ? 'Lunch break'
                                : selectedStatus.state === 'open' ? 'Open'
                                : selectedStatus.holiday ? 'Closed · Holiday' : 'Closed'}
                        </div>

                        <dl className="panel-facts">
                            <div><dt>Local time</dt><dd>{selectedStatus.localTime} · {selectedStatus.localDay}</dd></div>
                            {selectedStatus.closesInMin != null && (
                                <div><dt>Closes in</dt><dd>{fmtDuration(selectedStatus.closesInMin)}</dd></div>
                            )}
                            {selectedStatus.opensInMin != null && (
                                <div><dt>Opens in</dt><dd>{fmtDuration(selectedStatus.opensInMin)}</dd></div>
                            )}
                            <div>
                                <dt>Session</dt>
                                <dd>
                                    {selected.open} – {selectedStatus.closeToday ?? selected.close}
                                    {selectedStatus.closeToday && ' (early close)'}
                                </dd>
                            </div>
                            {selected.lunch && (
                                <div><dt>Midday break</dt><dd>{selected.lunch[0]} – {selected.lunch[1]}</dd></div>
                            )}
                            {selected.days && (
                                <div><dt>Trading days</dt><dd>Sun – Thu</dd></div>
                            )}
                        </dl>

                        {selected.etf && (
                            <div className="etf-block">
                                <span className="etf-block-label">Trade it via US-listed ETF</span>
                                <div className="etf-row">
                                    <span className="etf-block-ticker">{selected.etf}</span>
                                    <span className="etf-block-name">{selected.etfName}</span>
                                </div>
                                {selectedTracked && signals[selected.etf]?.signal
                                    && !['Waiting for data', 'Error'].includes(signals[selected.etf].signal) && (
                                    <div className="etf-live-signal">
                                        Live signal:{' '}
                                        <b className={signalTone(signals[selected.etf].signal)}>
                                            {signals[selected.etf].signal}
                                        </b>
                                        {signals[selected.etf].current_price != null && (
                                            <> · ${Number(signals[selected.etf].current_price).toFixed(2)}</>
                                        )}
                                    </div>
                                )}
                                {selectedTracked ? (
                                    <Link to="/" className="track-btn is-tracked">
                                        <Check size={15} aria-hidden="true" /> On watchlist — open dashboard
                                    </Link>
                                ) : (
                                    <button className="track-btn" onClick={() => setTracked(addTicker(selected.etf!))}>
                                        <Plus size={15} aria-hidden="true" /> Track {selected.etf}
                                    </button>
                                )}
                            </div>
                        )}

                        <p className="panel-note">
                            US market holidays modeled through 2027; other markets show regular sessions only.
                            US-listed ETFs trade on US market hours.
                        </p>
                    </aside>
                )}
            </div>
        </div>
    );
};

export default WorldMap;
