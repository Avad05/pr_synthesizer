import { Routes, Route, Link } from 'react-router-dom';
import ReviewList from './components/ReviewList';
import ReviewDetail from './components/ReviewDetail';
import { Toaster } from 'react-hot-toast';

export default function App() {
  return (
    <div className="app">
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--surface-raised)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
          },
          duration: 5000,
        }}
      />
      <header className="app-header">
        <Link to="/" className="logo">
          <span className="logo-mark">▣</span>
          PR Synthesizer
        </Link>
        <span className="tagline">Mission Control</span>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<ReviewList />} />
          <Route path="/reviews/:id" element={<ReviewDetail />} />
        </Routes>
      </main>
    </div>
  );
}
