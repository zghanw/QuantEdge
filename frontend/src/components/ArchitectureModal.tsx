import React from 'react';
import './ArchitectureModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ArchitectureModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel animate-fade-in-up" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        
        <h2 className="modal-title">System <span className="text-gradient">Architecture</span></h2>
        
        <div className="arch-diagram">
          <div className="arch-node backend">
            <h3>FastAPI Core</h3>
            <p>Python Engine</p>
          </div>
          
          <div className="arch-arrows">
            <div className="arrow left">⟵ WebSockets ⟶</div>
            <div className="arrow right">⟵ REST/WSS ⟶</div>
          </div>
          
          <div className="arch-node frontend">
            <h3>React Dashboard</h3>
            <p>Glassmorphism UI</p>
          </div>
          
          <div className="arch-node external">
            <h3>External APIs</h3>
            <p>Polygon.io & Gemini</p>
          </div>
        </div>

        <div className="tech-stack">
          <div className="tech-item">
            <h4>⚡ Real-Time Pipeline</h4>
            <p>Multiplexed WebSocket manager built with FastAPI streams millisecond tick data directly from Polygon.io, bypassing free-tier rate limits.</p>
          </div>
          <div className="tech-item">
            <h4>🧠 Quantitative Engine</h4>
            <p>Pandas and TA (Technical Analysis) libraries calculate moving average crossovers (50/200), MACD momentum, and RSI oscillators on the fly.</p>
          </div>
          <div className="tech-item">
            <h4>✨ Generative AI Loop</h4>
            <p>An asynchronous background thread pings the Google Gemini 2.5 Flash API every 5 minutes to generate human-readable algorithmic interpretations.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArchitectureModal;
