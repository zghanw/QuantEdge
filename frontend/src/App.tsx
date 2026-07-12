import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';

// three.js is heavy — keep the globe off the dashboard's critical path
const WorldMap = lazy(() => import('./pages/WorldMap'));

function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Loading world map…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/map" element={<WorldMap />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
