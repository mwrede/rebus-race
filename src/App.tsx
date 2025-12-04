import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Today from './pages/Today';
import Leaderboard from './pages/Leaderboard';
import Archive from './pages/Archive';
import ArchiveDetail from './pages/ArchiveDetail';
import { getWins } from './lib/stats';
import { getUsername, hasUsername } from './lib/username';
import UsernamePrompt from './components/UsernamePrompt';

function App() {
  const [wins, setWins] = useState(0);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const isConfigured = supabaseUrl && supabaseAnonKey && supabaseUrl !== 'your_supabase_project_url';

  useEffect(() => {
    // Check if user has username
    if (!hasUsername()) {
      setShowUsernamePrompt(true);
    } else {
      setUsername(getUsername());
    }

    // Load wins from localStorage
    setWins(getWins());

    // Listen for custom win update event
    const handleWinUpdate = () => {
      setWins(getWins());
    };
    window.addEventListener('rebusWinUpdated', handleWinUpdate);

    // Listen for storage changes (in case wins are updated in another tab)
    const handleStorageChange = () => {
      setWins(getWins());
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('rebusWinUpdated', handleWinUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Configuration Required</h1>
          <p className="text-gray-600 mb-4">
            Please configure your Supabase credentials in the <code className="bg-gray-100 px-2 py-1 rounded">.env</code> file.
          </p>
          <div className="bg-gray-50 rounded p-4 text-sm">
            <p className="font-semibold mb-2">Required variables:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              <li>VITE_SUPABASE_URL</li>
              <li>VITE_SUPABASE_ANON_KEY</li>
            </ul>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            After updating, restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  const handleUsernameComplete = (newUsername: string) => {
    setUsername(newUsername);
    setShowUsernamePrompt(false);
  };

  return (
    <BrowserRouter>
      {showUsernamePrompt && (
        <UsernamePrompt onComplete={handleUsernameComplete} />
      )}
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
            <div className="flex justify-between items-center h-12 sm:h-14 md:h-16">
              <Link
                to="/today"
                className="inline-flex items-center px-1 sm:px-2 md:px-4 py-1 text-base sm:text-lg md:text-xl font-bold text-gray-900"
              >
                🧩 <span className="hidden sm:inline ml-1">Rebus Race</span>
              </Link>
              <div className="flex items-center space-x-0.5 sm:space-x-1 md:space-x-2">
                {username && (
                  <div className="text-[10px] sm:text-xs md:text-sm font-semibold text-blue-600 px-0.5 sm:px-1 md:px-2 hidden md:block truncate max-w-[60px] sm:max-w-none">
                    {username}
                  </div>
                )}
                <div className="text-[10px] sm:text-xs md:text-sm font-semibold text-blue-600 px-0.5 sm:px-1 md:px-2">
                  🏆 {wins}
                </div>
                <Link
                  to="/today"
                  className="inline-flex items-center px-1 sm:px-2 md:px-3 py-1 text-[10px] sm:text-xs md:text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Today
                </Link>
                <Link
                  to="/leaderboard"
                  className="inline-flex items-center px-1 sm:px-2 md:px-3 py-1 text-[10px] sm:text-xs md:text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Leaderboard
                </Link>
                <Link
                  to="/archive"
                  className="inline-flex items-center px-1 sm:px-2 md:px-3 py-1 text-[10px] sm:text-xs md:text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Archive
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-2 sm:py-4 md:py-6 lg:py-8">
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/today" element={<Today />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/archive/:id" element={<ArchiveDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;

