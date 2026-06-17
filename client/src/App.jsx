import { Routes, Route, Link } from 'react-router-dom';
import ReviewList from './components/ReviewList';
import ReviewDetail from './components/ReviewDetail';

export default function App() {
  return (
    <div className="app">
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
