import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import { feature } from 'topojson-client';
import { Link } from 'react-router-dom';
import { X, Plus, Check } from 'lucide-react';
import { NavTabs } from '../components/NavTabs';
import { EXCHANGES, type Exchange, type Region } from '../config/exchanges';
import { getMarketStatus, type MarketStatus } from '../lib/marketHours';
import { loadTickers, addTicker } from '../lib/watchlist';
import './Dashboard.css';
import './WorldMap.css';

const API = 'http://localhost:8000';

const STATUS_COLOR: Record<MarketStatus['state'], string> = {
    open: '#4ade80',
    lunch: '#fbbf24',
    closed: '#525252',
};
const TIER_ALT: Record<Exchange['tier'], number> = { mega: 0.10, major: 0.07, regional: 0.045 };
const TIER_RADIUS: Record<Exchange['tier'], number> = { mega: 0.55, major: 0.42, regional: 0.32 };

// Atmosphere follows the dashboard's market-regime verdict; neutral is a soft blue
const REGIME_TINT: Record<string, string> = { 'Risk-On': '#4ade80', 'Risk-Off': '#f87171' };
const ATMOSPHERE_DEFAULT = '#3b82f6';

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
    const globeRef = useRef<any>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const [countries, setCountries] = useState<any[]>([]);
    const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight - 70 });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tracked, setTracked] = useState<string[]>(loadTickers);
    const [tick, setTick] = useState(0);
    const [regime, setRegime] = useState<{ verdict?: string } | null>(null);
    const [signals, setSignals] = useState<Record<string, any>>({});

    const reducedMotion = useMemo(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

    // Land hexes from public-domain Natural Earth topology (served from /public)
    useEffect(() => {
        fetch('/countries-110m.json')
            .then(r => r.json())
            .then(topo => {
                const features = (feature(topo, topo.objects.countries) as any).features;
                setCountries(features.filter((f: any) => f.properties?.name !== 'Antarctica'));
            })
            .catch(() => {}); // globe still renders without land hexes
    }, []);

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
        };
        load();
        const id = setInterval(load, 5 * 60_000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    // Globe fills the stage
    useEffect(() => {
        const el = stageRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const statuses = useMemo(() => {
        const m: Record<string, MarketStatus> = {};
        for (const ex of EXCHANGES) m[ex.id] = getMarketStatus(ex);
        return m;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]);

    const openCount = Object.values(statuses).filter(s => s.state !== 'closed').length;
    const selected = EXCHANGES.find(e => e.id === selectedId) ?? null;

    const rings = useMemo(
        () => (reducedMotion ? [] : EXCHANGES.filter(ex => statuses[ex.id].state === 'open')),
        [statuses, reducedMotion]);

    const megaLabels = useMemo(() => EXCHANGES.filter(e => e.tier === 'mega'), []);

    const handleSelect = useCallback((ex: Exchange) => {
        setSelectedId(ex.id);
        const controls = globeRef.current?.controls?.();
        if (controls) controls.autoRotate = false;
        globeRef.current?.pointOfView({ lat: ex.lat, lng: ex.lng, altitude: 1.7 }, reducedMotion ? 0 : 800);
    }, [reducedMotion]);

    const closePanel = useCallback(() => {
        setSelectedId(null);
        const controls = globeRef.current?.controls?.();
        if (controls && !reducedMotion) controls.autoRotate = true;
    }, [reducedMotion]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [closePanel]);

    const onGlobeReady = useCallback(() => {
        const controls = globeRef.current?.controls?.();
        if (controls) {
            controls.autoRotate = !reducedMotion;
            controls.autoRotateSpeed = 0.4;
        }
        globeRef.current?.pointOfView({ lat: 25, lng: 10, altitude: 2.2 }, 0);
    }, [reducedMotion]);

    const pointColor = useCallback((ex: any) => {
        if (ex.etf && tracked.includes(ex.etf)) return '#3b82f6';
        return STATUS_COLOR[statuses[ex.id].state];
    }, [statuses, tracked]);

    const pointTip = useCallback((ex: any) => {
        const st = statuses[ex.id];
        const label = st.state === 'lunch' ? 'LUNCH BREAK'
            : st.holiday ? 'HOLIDAY' : st.state.toUpperCase();
        let signalRow = '';
        const sig = ex.etf && tracked.includes(ex.etf) ? signals[ex.etf] : null;
        if (sig?.signal && !['Waiting for data', 'Error'].includes(sig.signal)) {
            const price = sig.current_price != null ? ` · $${Number(sig.current_price).toFixed(2)}` : '';
            signalRow = `<br/><span class="tip-signal">${ex.etf}: ${sig.signal}${price}</span>`;
        }
        return `<div class="globe-tip"><b>${ex.shortName}</b> · ${ex.city}<br/>${label} · ${st.localTime} local${signalRow}</div>`;
    }, [statuses, tracked, signals]);

    const selectedStatus = selected ? statuses[selected.id] : null;
    const selectedTracked = !!(selected?.etf && tracked.includes(selected.etf));

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

            <div className="map-stage" ref={stageRef}>
                <Globe
                    ref={globeRef}
                    width={dims.w}
                    height={dims.h}
                    backgroundColor="rgba(0,0,0,0)"
                    showAtmosphere
                    atmosphereColor={REGIME_TINT[regime?.verdict ?? ''] ?? ATMOSPHERE_DEFAULT}
                    atmosphereAltitude={0.13}
                    hexPolygonsData={countries}
                    hexPolygonResolution={3}
                    hexPolygonMargin={0.65}
                    hexPolygonColor={() => 'rgba(163, 163, 163, 0.28)'}
                    pointsData={EXCHANGES as any[]}
                    pointColor={pointColor}
                    pointAltitude={(d: any) => TIER_ALT[d.tier as Exchange['tier']]}
                    pointRadius={(d: any) => TIER_RADIUS[d.tier as Exchange['tier']]}
                    pointLabel={pointTip}
                    onPointClick={(d: any) => handleSelect(d as Exchange)}
                    ringsData={rings as any[]}
                    ringColor={() => (t: number) => `rgba(74, 222, 128, ${Math.max(0, 0.65 * (1 - t))})`}
                    ringMaxRadius={3.5}
                    ringPropagationSpeed={1.6}
                    ringRepeatPeriod={1300}
                    labelsData={megaLabels as any[]}
                    labelText={(d: any) => d.shortName}
                    labelSize={1.0}
                    labelColor={() => 'rgba(248, 250, 252, 0.8)'}
                    labelAltitude={0.012}
                    labelDotOrientation={(d: any) => d.labelOrient ?? 'bottom'}
                    onGlobeReady={onGlobeReady}
                />

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
