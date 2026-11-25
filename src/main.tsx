import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';

// Placeholder while the course is migrated to React. The original course stays available at legacy.html.
function App() {
  return (
    <main className="p-8">
      <h1>SQL &amp; Databases · Harbourline</h1>
      <p>The React version is being built. <a href={`legacy.html${location.hash}`}>Open the current course</a>.</p>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
