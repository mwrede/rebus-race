import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Today from './pages/Today';
import Leaderboard from './pages/Leaderboard';
import Archive from './pages/Archive';
import ArchiveDetail from './pages/ArchiveDetail';
import { getUsername, hasUsername } from './lib/username';
import UsernamePrompt from './components/UsernamePrompt';
import { supabase } from './lib/supabase';
import { Submission } from './types';

function App() {
  const [allTimeRank, setAllTimeRank] = useState<number | null>(null);
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

    // Load all-time ranking
    loadAllTimeRanking();

    // Listen for custom win update event (to refresh ranking)
    const handleWinUpdate = () => {
      loadAllTimeRanking();
    };
    window.addEventListener('rebusWinUpdated', handleWinUpdate);

    // Listen for storage changes (in case ranking is updated in another tab)
    const handleStorageChange = () => {
      loadAllTimeRanking();
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('rebusWinUpdated', handleWinUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const loadAllTimeRanking = async () => {
    try {
      const anonId = localStorage.getItem('rebus_anon_id');
      if (!anonId) {
        setAllTimeRank(null);
        return;
      }

      // Get today's date to filter out archive puzzles
      const today = new Date().toISOString().split('T')[0];

      // Get all puzzles to check which are archive (date < today)
      const { data: puzzles, error: puzzlesError } = await supabase
        .from('puzzles')
        .select('id, date');

      if (puzzlesError) throw puzzlesError;

      const archivePuzzleIds = new Set(
        puzzles?.filter((p: { date: string }) => p.date.split('T')[0] < today).map((p: { id: string }) => p.id) || []
      );

      // Get all correct submissions, excluding archive puzzles
      const { data: submissions, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('is_correct', true)
        .order('time_ms', { ascending: true });

      if (error) throw error;

      // Filter out submissions from archive puzzles
      const dailySubmissions = submissions?.filter(
        (s: Submission) => !archivePuzzleIds.has(s.puzzle_id)
      ) || [];

      // Group by anon_id and calculate stats
      const userStats = new Map<string, { username: string | null; times: number[]; puzzles: Set<string> }>();

      dailySubmissions.forEach((submission: Submission) => {
        if (!submission.anon_id) return;

        if (!userStats.has(submission.anon_id)) {
          userStats.set(submission.anon_id, {
            username: submission.username || null,
            times: [],
            puzzles: new Set(),
          });
        }

        const stats = userStats.get(submission.anon_id)!;
        stats.times.push(submission.time_ms);
        stats.puzzles.add(submission.puzzle_id);
        if (submission.username) {
          stats.username = submission.username;
        }
      });

      // Convert to leaderboard entries
      const entries = Array.from(userStats.entries())
        .map(([anon_id, stats]) => {
          const totalTime = stats.times.reduce((sum, time) => sum + time, 0);
          const averageTime = stats.times.length > 0 ? totalTime / stats.times.length : 0;

          return {
            anon_id,
            username: stats.username,
            averageTime,
            puzzlesWon: stats.puzzles.size,
          };
        })
        .filter((entry) => entry.puzzlesWon >= 1) // At least 1 puzzle won
        .sort((a, b) => {
          // Sort by average time (ascending - fastest first)
          if (a.averageTime === 0 && b.averageTime === 0) return 0;
          if (a.averageTime === 0) return 1;
          if (b.averageTime === 0) return -1;
          return a.averageTime - b.averageTime;
        });

      // Find user's rank (1-indexed)
      const userEntry = entries.findIndex((entry) => entry.anon_id === anonId);
      if (userEntry !== -1) {
        setAllTimeRank(userEntry + 1);
      } else {
        setAllTimeRank(null);
      }
    } catch (error) {
      console.error('Error loading all-time ranking:', error);
      setAllTimeRank(null);
    }
  };

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
                  🏆 {allTimeRank !== null ? `#${allTimeRank}` : '-'}
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

