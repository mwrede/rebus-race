import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Today from './pages/Today';
import Leaderboard from './pages/Leaderboard';
import Archive from './pages/Archive';
import ArchiveDetail from './pages/ArchiveDetail';
import { getUsername, hasUsername, isFullyAuthenticated, hasGoogleAuth } from './lib/auth';
import UsernamePrompt from './components/UsernamePrompt';
import GoogleAuthPrompt from './components/GoogleAuthPrompt';
import UserMenu from './components/UserMenu';
import { supabase } from './lib/supabase';
import { Submission } from './types';
import { TimerProvider, useTimer } from './contexts/TimerContext';

function App() {
  const [streak, setStreak] = useState<number>(0);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [showGoogleAuthPrompt, setShowGoogleAuthPrompt] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const isConfigured = supabaseUrl && supabaseAnonKey && supabaseUrl !== 'your_supabase_project_url';

  useEffect(() => {
    // Check if user is fully authenticated (has both username and Google auth)
    if (!isFullyAuthenticated()) {
      // If user has username but no Google auth, show Google auth prompt
      if (hasUsername() && !hasGoogleAuth()) {
        setShowGoogleAuthPrompt(true);
        setUsername(getUsername());
      } else {
        // Otherwise show username prompt (which will require Google auth first)
        setShowUsernamePrompt(true);
      }
    } else {
      // User is fully authenticated
      setUsername(getUsername());
    }

    // Load streak
    loadStreak();

    // Listen for custom win update event (to refresh streak)
    const handleWinUpdate = () => {
      loadStreak();
    };
    window.addEventListener('rebusWinUpdated', handleWinUpdate);

    return () => {
      window.removeEventListener('rebusWinUpdated', handleWinUpdate);
    };
  }, []);

  const loadStreak = async () => {
    try {
      const anonId = localStorage.getItem('rebus_anon_id');
      if (!anonId) {
        setStreak(0);
        return;
      }

      // Get today's date in local timezone (YYYY-MM-DD format) - same as Today.tsx
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;

      // Get all puzzles to check which are archive (date < today)
      const { data: puzzles, error: puzzlesError } = await supabase
        .from('puzzles')
        .select('id, date')
        .order('date', { ascending: false });

      if (puzzlesError) throw puzzlesError;

      const archivePuzzleIds = new Set(
        puzzles?.filter((p: { date: string }) => p.date.split('T')[0] < today).map((p: { id: string }) => p.id) || []
      );

      // Get all daily puzzles ordered by date (newest first)
      const dailyPuzzles = puzzles?.filter((p: { id: string; date: string }) => !archivePuzzleIds.has(p.id)) || [];
      dailyPuzzles.sort((a: { id: string; date: string }, b: { id: string; date: string }) => b.date.localeCompare(a.date));

      // Get all user's submissions for daily puzzles
      const { data: submissions, error: submissionsError } = await supabase
        .from('submissions')
        .select('puzzle_id, is_correct, created_at')
        .eq('anon_id', anonId)
        .order('created_at', { ascending: false });

      if (submissionsError) throw submissionsError;

      // Filter to only daily puzzles
      const dailySubmissions = (submissions || []).filter(
        (s: Submission) => !archivePuzzleIds.has(s.puzzle_id)
      );

      // Create a map of puzzle_id to submission result
      const submissionMap = new Map<string, boolean>();
      dailySubmissions.forEach((s: Submission) => {
        // Only keep the most recent submission for each puzzle
        if (!submissionMap.has(s.puzzle_id)) {
          submissionMap.set(s.puzzle_id, s.is_correct);
        }
      });

      // Calculate streak: count consecutive wins from most recent puzzle backwards
      let currentStreak = 0;
      for (const puzzle of dailyPuzzles) {
        const result = submissionMap.get(puzzle.id);
        if (result === true) {
          // Win - continue streak
          currentStreak++;
        } else if (result === false) {
          // Loss - break streak
          break;
        } else {
          // No submission for this puzzle - break streak (can't have a streak if you didn't play)
          break;
        }
      }

      setStreak(currentStreak);
    } catch (error) {
      console.error('Error loading streak:', error);
      setStreak(0);
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

  const handleGoogleAuthComplete = () => {
    setShowGoogleAuthPrompt(false);
    // Refresh to update UI
    window.location.reload();
  };

  const handleLogout = () => {
    setUsername(null);
    setShowUsernamePrompt(true);
    setShowGoogleAuthPrompt(false);
  };

  const handleChangeUsername = () => {
    setShowUsernamePrompt(true);
    setShowGoogleAuthPrompt(false);
  };

  return (
    <BrowserRouter>
      <TimerProvider>
        <AppContent
          showUsernamePrompt={showUsernamePrompt}
          showGoogleAuthPrompt={showGoogleAuthPrompt}
          handleUsernameComplete={handleUsernameComplete}
          handleGoogleAuthComplete={handleGoogleAuthComplete}
          handleLogout={handleLogout}
          handleChangeUsername={handleChangeUsername}
          username={username}
          streak={streak}
        />
      </TimerProvider>
    </BrowserRouter>
  );
}

function AppContent({
  showUsernamePrompt,
  showGoogleAuthPrompt,
  handleUsernameComplete,
  handleGoogleAuthComplete,
  handleLogout,
  handleChangeUsername,
  username,
  streak,
}: {
  showUsernamePrompt: boolean;
  showGoogleAuthPrompt: boolean;
  handleUsernameComplete: (username: string) => void;
  handleGoogleAuthComplete: () => void;
  handleLogout: () => void;
  handleChangeUsername: () => void;
  username: string | null;
  streak: number;
}) {
  const { isTimerActive } = useTimer();

  return (
    <>
      {showGoogleAuthPrompt && (
        <GoogleAuthPrompt onComplete={handleGoogleAuthComplete} />
      )}
      {showUsernamePrompt && !showGoogleAuthPrompt && (
        <UsernamePrompt onComplete={handleUsernameComplete} />
      )}
      <div className="min-h-screen bg-gray-50">
        {!isTimerActive && (
          <nav className="bg-white shadow-sm border-b sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
            <div className="flex justify-between items-center h-12 sm:h-14 md:h-16">
              <Link
                to="/today"
                className="inline-flex items-center px-1 sm:px-2 md:px-4 py-1"
              >
                <img 
                  src="/rebus_logo.png" 
                  alt="Rebus Race" 
                  className="h-6 sm:h-7 md:h-8 w-auto"
                />
              </Link>
              <div className="flex items-center space-x-0.5 sm:space-x-1 md:space-x-2">
                <Link
                  to="/today"
                  className="inline-flex items-center px-1 sm:px-2 md:px-3 py-1 text-[10px] sm:text-xs md:text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Today
                </Link>
                {username && (
                  <UserMenu
                    username={username}
                    onLogout={handleLogout}
                    onChangeUsername={handleChangeUsername}
                  />
                )}
                {streak > 0 && (
                  <div className="text-[10px] sm:text-xs md:text-sm font-semibold text-orange-600 px-0.5 sm:px-1 md:px-2">
                    🔥 {streak}
                  </div>
                )}
                <Link
                  to="/leaderboard"
                  className="inline-flex items-center justify-center px-1 sm:px-2 md:px-3 py-1 text-lg sm:text-xl md:text-2xl text-gray-700 hover:text-gray-900"
                  title="Leaderboard"
                >
                  🏆
                </Link>
                <Link
                  to="/archive"
                  className="inline-flex items-center justify-center px-1 sm:px-2 md:px-3 py-1 text-lg sm:text-xl md:text-2xl text-gray-700 hover:text-gray-900"
                  title="Archive"
                >
                  📚
                </Link>
              </div>
            </div>
          </div>
        </nav>
        )}

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
    </>
  );
}

export default App;

