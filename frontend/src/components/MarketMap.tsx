import { useEffect, useMemo, useState } from 'react';
import { EXCHANGES, type Exchange } from '../config/exchanges';
import { fmtDuration, type MarketStatus } from '../lib/marketHours';
import './MarketMap.css';

// Vercel-style dotted 2D world map: plain SVG, no map library.
// Land dots come from /world-dots.json ([lon, lat][]), markers share the
// same fitted spherical-mercator projection so they always line up.

const W = 980;
const H = 500;
const PAD = 14;

const TIER_R: Record<Exchange['tier'], number> = { mega: 5.5, major: 4.5, regional: 3.5 };
const STATUS_COLOR: Record<MarketStatus['state'], string> = {
    open: '#4ade80',
    lunch: '#fbbf24',
    closed: '#525252',
};

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

const labelPos = (orient: Exchange['labelOrient'], x: number, y: number, r: number) => {
    switch (orient) {
        case 'top': return { x, y: y - r - 5, anchor: 'middle' as const };
        case 'left': return { x: x - r - 5, y: y + 3, anchor: 'end' as const };
        case 'right': return { x: x + r + 5, y: y + 3, anchor: 'start' as const };
        default: return { x, y: y + r + 11, anchor: 'middle' as const };
    }
};

export interface WorldEvent {
    lat: number;
    lng: number;
    kind: string;   // quake | wildfire | volcano | storm
    label: string;
    severity: number; // 1-3
}

interface Props {
    statuses: Record<string, MarketStatus>;
    tracked: string[];
    signals: Record<string, any>;
    selectedId: string | null;
    onSelect: (ex: Exchange) => void;
    worldEvents: WorldEvent[];
}

export const MarketMap = ({ statuses, tracked, signals, selectedId, onSelect, worldEvents }: Props) => {
    const [dots, setDots] = useState<[number, number][]>([]);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [hoveredEvent, setHoveredEvent] = useState<number | null>(null);

    useEffect(() => {
        fetch('/world-dots.json')
            .then(r => r.json())
            .then(setDots)
            .catch(() => {}); // markers still render on a blank background
    }, []);

    // Fit the projection to the dot data's bounds (falls back to world bounds)
    const project = useMemo(() => {
        const lons = dots.length ? dots.map(d => d[0]) : [-180, 180];
        const lats = dots.length ? dots.map(d => d[1]) : [-55, 78];
        const minLon = Math.min(...lons), maxLon = Math.max(...lons);
        const minY = mercY(Math.min(...lats)), maxY = mercY(Math.max(...lats));
        return (lon: number, lat: number): [number, number] => [
            PAD + ((lon - minLon) / (maxLon - minLon)) * (W - PAD * 2),
            PAD + ((maxY - mercY(lat)) / (maxY - minY)) * (H - PAD * 2),
        ];
    }, [dots]);

    const markers = useMemo(() => EXCHANGES.map(ex => {
        const [px, py] = project(ex.lng, ex.lat);
        return { ex, x: px + (ex.mapOffset?.[0] ?? 0), y: py + (ex.mapOffset?.[1] ?? 0) };
    }), [project]);

    const events = useMemo(() => worldEvents.map((ev, i) => {
        const [x, y] = project(ev.lng, ev.lat);
        return { ...ev, x, y, i };
    }), [project, worldEvents]);

    const hovered = markers.find(m => m.ex.id === hoveredId) ?? null;
    const hoveredStatus = hovered ? statuses[hovered.ex.id] : null;
    const hoveredSignal = hovered?.ex.etf && tracked.includes(hovered.ex.etf)
        ? signals[hovered.ex.etf] : null;
    const hoveredEv = hoveredEvent != null ? events[hoveredEvent] : null;

    return (
        <div className="market-map">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map of stock exchanges and hazard events">
                <g className="map-dots">
                    {dots.map(([lon, lat], i) => {
                        const [x, y] = project(lon, lat);
                        return <rect key={i} x={x - 1.3} y={y - 1.3} width={2.6} height={2.6} />;
                    })}
                </g>

                <g>
                    {events.map(ev => (
                        <circle
                            key={`ev-${ev.i}`}
                            className={`hazard hazard-${ev.kind} ${ev.severity >= 3 ? 'is-severe' : ''}`}
                            cx={ev.x} cy={ev.y} r={2.5 + ev.severity}
                            onMouseEnter={() => setHoveredEvent(ev.i)}
                            onMouseLeave={() => setHoveredEvent(null)}
                        >
                            <title>{ev.label}</title>
                        </circle>
                    ))}
                </g>

                <g>
                    {markers.map(({ ex, x, y }) => {
                        const st = statuses[ex.id];
                        const isTracked = !!(ex.etf && tracked.includes(ex.etf));
                        const color = isTracked ? '#3b82f6' : STATUS_COLOR[st.state];
                        const r = TIER_R[ex.tier];
                        const lp = labelPos(ex.labelOrient, x, y, r);
                        return (
                            <g key={ex.id}>
                                {ex.id === selectedId && (
                                    <circle className="marker-ring" cx={x} cy={y} r={r + 4} />
                                )}
                                <circle
                                    className={`map-marker ${st.state === 'open' ? 'is-open' : ''}`}
                                    cx={x} cy={y} r={r} fill={color}
                                    tabIndex={0} role="button"
                                    aria-label={`${ex.shortName}, ${ex.city} — ${st.state}`}
                                    onClick={() => onSelect(ex)}
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(ex); } }}
                                    onMouseEnter={() => setHoveredId(ex.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                />
                                <text className="map-label" x={lp.x} y={lp.y} textAnchor={lp.anchor}>
                                    {ex.shortName}
                                </text>
                            </g>
                        );
                    })}
                </g>
            </svg>

            {hovered && hoveredStatus && (
                <div
                    className="map-tooltip"
                    style={{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / H) * 100}%` }}
                >
                    <b>{hovered.ex.shortName}</b> · {hovered.ex.city}
                    <br />
                    {hoveredStatus.state === 'lunch' ? 'LUNCH BREAK'
                        : hoveredStatus.holiday ? 'HOLIDAY'
                        : hoveredStatus.state.toUpperCase()} · {hoveredStatus.localTime} local
                    {hoveredStatus.closesInMin != null && ` · closes in ${fmtDuration(hoveredStatus.closesInMin)}`}
                    {hoveredStatus.opensInMin != null && ` · opens in ${fmtDuration(hoveredStatus.opensInMin)}`}
                    {hoveredSignal?.signal && !['Waiting for data', 'Error'].includes(hoveredSignal.signal) && (
                        <>
                            <br />
                            <span className="tip-signal">
                                {hovered.ex.etf}: {hoveredSignal.signal}
                                {hoveredSignal.current_price != null && ` · $${Number(hoveredSignal.current_price).toFixed(2)}`}
                            </span>
                        </>
                    )}
                </div>
            )}

            {hoveredEv && !hovered && (
                <div
                    className="map-tooltip"
                    style={{ left: `${(hoveredEv.x / W) * 100}%`, top: `${(hoveredEv.y / H) * 100}%` }}
                >
                    <b>{hoveredEv.kind.toUpperCase()}</b>
                    <br />
                    {hoveredEv.label}
                </div>
            )}
        </div>
    );
};
