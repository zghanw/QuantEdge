import React, { useEffect, useState } from 'react';
import { ETFCard } from '../components/ETFCard';
import { NavTabs } from '../components/NavTabs';
import { RegimeBanner, type Regime } from '../components/RegimeBanner';
import { loadTickers as loadStoredTickers, saveTickers } from '../lib/watchlist';
import './Dashboard.css';

const loadTickers = (): string[] => {
  const fromUrl = new URLSearchParams(window.location.search).get('tickers');
  if (fromUrl) {
    return [...new Set(fromUrl.split(',').map(t => t.trim().toUpperCase()).filter(Boolean))];
  }
  return loadStoredTickers();
};

const Dashboard: React.FC = () => {
  const [tickers, setTickers] = useState<string[]>(loadTickers);
  const [newTicker, setNewTicker] = useState('');
  const [regime, setRegime] = useState<Regime | null>(null);

  // Persist the watchlist across refreshes (localStorage + shareable URL)
  useEffect(() => {
    saveTickers(tickers);
    const url = new URL(window.location.href);
    if (tickers.length) url.searchParams.set('tickers', tickers.join(','));
    else url.searchParams.delete('tickers');
    window.history.replaceState(null, '', url);
  }, [tickers]);

  useEffect(() => {
    let cancelled = false;
    const fetchRegime = () =>
      fetch('http://localhost:8000/regime')
        .then(r => r.json())
        .then(r => { if (!cancelled) setRegime(r); })
        .catch(() => {});
    fetchRegime();
    const id = setInterval(fetchRegime, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const handleAddTicker = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTicker && !tickers.includes(newTicker.toUpperCase())) {
      setTickers([...tickers, newTicker.toUpperCase()]);
      setNewTicker('');
    }
  };

  const handleRemoveTicker = (tickerToRemove: string) => {
    setTickers(tickers.filter(t => t !== tickerToRemove));
  };

  return (
    <div className="dashboard-layout">
      <nav className="dashboard-nav glass-panel">
        <div className="container nav-content">
          <div className="nav-left">
            <div className="logo text-gradient">
              Quantily
            </div>
            <NavTabs />
          </div>
          <form onSubmit={handleAddTicker} className="search-form">
            <input
              type="text"
              placeholder="Add Ticker (e.g. SPY)"
              className="search-input"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
            />
            <button type="submit" className="search-btn">+</button>
          </form>
        </div>
      </nav>

      <main className="container dashboard-main">
        <header className="dashboard-header">
          <h2 className="dashboard-title">Live Algorithmic Market Intelligence</h2>
          <p className="dashboard-subtitle">Track real-time signals powered by Quantily.</p>
        </header>

        <RegimeBanner regime={regime} />

        <div className="etf-grid">
          {tickers.map(ticker => (
            <ETFCard
              key={ticker}
              ticker={ticker}
              onRemove={handleRemoveTicker}
              regimeVerdict={regime?.verdict ?? null}
            />
          ))}
          {tickers.length === 0 && (
             <div className="empty-state glass-panel">
               <h3>No Tickers Tracking</h3>
               <p>Search for a ticker above to begin analysis.</p>
             </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
