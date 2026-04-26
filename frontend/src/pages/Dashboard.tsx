import React, { useState } from 'react';
import { ETFCard } from '../components/ETFCard';
import ArchitectureModal from '../components/ArchitectureModal';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const [tickers, setTickers] = useState<string[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [isArchOpen, setIsArchOpen] = useState(false);

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
          <div className="logo text-gradient">
            QuantEdge Analyst
          </div>
          <div className="nav-actions">
            <button 
              className="arch-btn" 
              onClick={() => setIsArchOpen(true)}
            >
              View Architecture
            </button>
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
        </div>
      </nav>

      <main className="container dashboard-main">
        <header className="dashboard-header">
          <h2 className="dashboard-title">Live Algorithmic Market Intelligence</h2>
          <p className="dashboard-subtitle">Track real-time signals powered by QuantEdge.</p>
        </header>

        <div className="etf-grid">
          {tickers.map(ticker => (
            <ETFCard 
              key={ticker} 
              ticker={ticker} 
              onRemove={handleRemoveTicker}
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
      
      <ArchitectureModal isOpen={isArchOpen} onClose={() => setIsArchOpen(false)} />
    </div>
  );
};

export default Dashboard;
