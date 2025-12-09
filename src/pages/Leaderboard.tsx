import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Puzzle, Submission } from '../types';

interface AllTimeEntry {
  username: string | null;
  averageTime: number;
  averageGuesses: number;
  puzzlesWon: number;
  anon_id: string;
  streak: number;
}

function Leaderboard() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [incorrectSubmissions, setIncorrectSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [averageTime, setAverageTime] = useState<number | null>(null);
  const [correctPercentage, setCorrectPercentage] = useState<number | null>(null);
  const [allTimeLeaderboard, setAllTimeLeaderboard] = useState<AllTimeEntry[]>([]);
  const [loadingAllTime, setLoadingAllTime] = useState(true);
  const [currentAnonId, setCurrentAnonId] = useState<string>('');

  useEffect(() => {
    // Get current user's anon_id
    const anonId = localStorage.getItem('rebus_anon_id') || '';
    setCurrentAnonId(anonId);
    
    loadLeaderboard();
    loadAllTimeLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      // Get today's date in local timezone (YYYY-MM-DD format) - same as Today.tsx
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;
      
      console.log('Leaderboard: Looking for puzzle with date:', today);
      
      // Get today's puzzle
      const { data: puzzleData, error: puzzleError } = await supabase
        .from('puzzles')
        .select('*')
        .eq('date', today)
        .single();

      if (puzzleError && puzzleError.code !== 'PGRST116') {
        console.error('Error fetching today\'s puzzle:', puzzleError);
        // Don't throw - continue to show all-time leaderboard
      }

      if (puzzleData) {
        console.log('Leaderboard: Found puzzle:', puzzleData.id, puzzleData.date);
        setPuzzle(puzzleData);

        // Get all submissions for today's puzzle (both correct and incorrect)
        const { data: allSubmissionsData, error: allSubmissionsError } = await supabase
          .from('submissions')
          .select('*')
          .eq('puzzle_id', puzzleData.id);

        if (allSubmissionsError) {
          console.error('Error fetching submissions:', allSubmissionsError);
          throw allSubmissionsError;
        }

        console.log('Today\'s puzzle submissions:', allSubmissionsData?.length || 0);

        // Get correct submissions
        const correctSubmissions = (allSubmissionsData || []).filter((s: Submission) => s.is_correct);
        
        // Sort by time (fastest first)
        const sortedByTime = [...correctSubmissions].sort((a: Submission, b: Submission) => a.time_ms - b.time_ms);
        setSubmissions(sortedByTime.slice(0, 100));

        // Get incorrect submissions (ordered by submission time, most recent first)
        const incorrectSubs = (allSubmissionsData || []).filter((s: Submission) => !s.is_correct);
        incorrectSubs.sort((a: Submission, b: Submission) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setIncorrectSubmissions(incorrectSubs);

        // Calculate average time for correct submissions
        if (correctSubmissions.length > 0) {
          const totalTime = correctSubmissions.reduce((sum: number, s: Submission) => sum + s.time_ms, 0);
          const avgTime = totalTime / correctSubmissions.length;
          setAverageTime(avgTime);
        }

        // Calculate percentage that got it right
        const totalSubmissions = allSubmissionsData?.length || 0;
        const correctCount = correctSubmissions.length;
        if (totalSubmissions > 0) {
          const percentage = (correctCount / totalSubmissions) * 100;
          setCorrectPercentage(percentage);
        }
      } else {
        // No puzzle today - clear today's leaderboard data
        setPuzzle(null);
        setSubmissions([]);
        setIncorrectSubmissions([]);
        setAverageTime(null);
        setCorrectPercentage(null);
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllTimeLeaderboard = async () => {
    try {
      setLoadingAllTime(true);
      // Get today's date in local timezone (YYYY-MM-DD format) - same as Today.tsx
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;

      // Get all puzzles to check which are archive (date < today) for streak calculation
      const { data: puzzles, error: puzzlesError } = await supabase
        .from('puzzles')
        .select('id, date');

      if (puzzlesError) {
        console.error('Error fetching puzzles:', puzzlesError);
        throw puzzlesError;
      }

      console.log('Total puzzles:', puzzles?.length || 0);

      const archivePuzzleIds = new Set(
        puzzles?.filter((p: { date: string }) => p.date.split('T')[0] < today).map((p: { id: string }) => p.id) || []
      );

      console.log('Archive puzzle IDs:', archivePuzzleIds.size);

      // Get ALL correct submissions (including archive puzzles for all-time leaderboard)
      const { data: submissions, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('is_correct', true)
        .order('time_ms', { ascending: true });

      if (error) {
        console.error('Error fetching submissions:', error);
        throw error;
      }

      console.log('Total correct submissions:', submissions?.length || 0);

      // Use ALL submissions for all-time leaderboard (don't filter out archive puzzles)
      const allTimeSubmissions = submissions || [];

      console.log('All submissions for all-time leaderboard:', allTimeSubmissions.length);

      // Group by anon_id and calculate stats
      const userStats = new Map<string, { username: string | null; times: number[]; guesses: number[]; puzzles: Set<string> }>();

      allTimeSubmissions.forEach((submission: Submission) => {
        if (!submission.anon_id) {
          console.warn('Submission without anon_id:', submission.id);
          return;
        }

        if (!userStats.has(submission.anon_id)) {
          userStats.set(submission.anon_id, {
            username: submission.username || null,
            times: [],
            guesses: [],
            puzzles: new Set(),
          });
        }

        const stats = userStats.get(submission.anon_id)!;
        stats.times.push(submission.time_ms);
        if (submission.guess_count !== null && submission.guess_count !== undefined) {
          stats.guesses.push(submission.guess_count);
        }
        stats.puzzles.add(submission.puzzle_id);
        // Update username if available
        if (submission.username) {
          stats.username = submission.username;
        }
      });

      // Get all daily puzzles ordered by date (newest first) for streak calculation
      const dailyPuzzles = puzzles?.filter((p: { id: string; date: string }) => !archivePuzzleIds.has(p.id)) || [];
      dailyPuzzles.sort((a: { id: string; date: string }, b: { id: string; date: string }) => b.date.localeCompare(a.date));

      // Get all submissions (both correct and incorrect) for daily puzzles to calculate streaks
      const { data: allSubmissions, error: allSubmissionsError } = await supabase
        .from('submissions')
        .select('anon_id, puzzle_id, is_correct, username, created_at')
        .order('created_at', { ascending: false });

      if (allSubmissionsError) throw allSubmissionsError;

      // Filter to only daily puzzles
      const dailyAllSubmissions = (allSubmissions || []).filter(
        (s: Submission) => !archivePuzzleIds.has(s.puzzle_id)
      );

      // Group submissions by (anon_id, puzzle_id) to get the most recent submission for each puzzle per user
      // Since we ordered by created_at DESC, the first submission we see for each (anon_id, puzzle_id) is the most recent
      const submissionKeyMap = new Map<string, { anon_id: string; puzzle_id: string; is_correct: boolean; username: string | null }>();
      
      dailyAllSubmissions.forEach((s: Submission) => {
        if (!s.anon_id) return;
        
        const key = `${s.anon_id}:${s.puzzle_id}`;
        // Only keep the first (most recent) submission for each (anon_id, puzzle_id) pair
        if (!submissionKeyMap.has(key)) {
          submissionKeyMap.set(key, {
            anon_id: s.anon_id,
            puzzle_id: s.puzzle_id,
            is_correct: s.is_correct,
            username: s.username || null,
          });
        }
      });

      // Group by anon_id for streak calculation
      const userSubmissionsForStreak = new Map<string, { username: string | null; submissions: Map<string, boolean> }>();
      
      submissionKeyMap.forEach((submission) => {
        if (!userSubmissionsForStreak.has(submission.anon_id)) {
          userSubmissionsForStreak.set(submission.anon_id, {
            username: submission.username,
            submissions: new Map(),
          });
        }
        
        const userData = userSubmissionsForStreak.get(submission.anon_id)!;
        userData.submissions.set(submission.puzzle_id, submission.is_correct);
        // Update username if available
        if (submission.username) {
          userData.username = submission.username;
        }
      });

      // Calculate streaks for each user
      const streakMap = new Map<string, number>();
      
      // Initialize streak map for all users in userStats (set to 0 by default)
      userStats.forEach((_, anon_id) => {
        streakMap.set(anon_id, 0);
      });
      
      // Also initialize streaks for users with daily puzzle submissions (even if not in userStats)
      userSubmissionsForStreak.forEach((_, anon_id) => {
        if (!streakMap.has(anon_id)) {
          streakMap.set(anon_id, 0);
        }
      });
      
      // Calculate actual streaks for users with daily puzzle submissions
      userSubmissionsForStreak.forEach((userData, anon_id) => {
        let currentStreak = 0;
        
        // Count consecutive wins from most recent puzzle backwards
        // dailyPuzzles is already sorted newest first (b.date.localeCompare(a.date))
        for (const puzzle of dailyPuzzles) {
          const result = userData.submissions.get(puzzle.id);
          if (result === true) {
            // Win - continue streak
            currentStreak++;
          } else if (result === false) {
            // Loss - break streak
            break;
          } else {
            // No submission for this puzzle - break streak
            break;
          }
        }
        
        streakMap.set(anon_id, currentStreak);
        console.log(`Streak for ${anon_id}: ${currentStreak}, username: ${userData.username}`);
      });
      
      console.log('Streak map size:', streakMap.size, 'User stats size:', userStats.size);

      // Convert to leaderboard entries with streaks
      const entries: AllTimeEntry[] = Array.from(userStats.entries())
        .map(([anon_id, stats]) => {
          const totalTime = stats.times.reduce((sum, time) => sum + time, 0);
          const averageTime = stats.times.length > 0 ? totalTime / stats.times.length : 0;
          const totalGuesses = stats.guesses.reduce((sum, guess) => sum + guess, 0);
          const averageGuesses = stats.guesses.length > 0 ? totalGuesses / stats.guesses.length : 0;
          const streak = streakMap.get(anon_id);
          const finalStreak = streak !== undefined ? streak : 0;
          
          console.log(`Entry for ${anon_id} (${stats.username}): streak=${finalStreak}, wins=${stats.puzzles.size}, streakMap has: ${streakMap.has(anon_id)}`);

          return {
            anon_id,
            username: stats.username,
            averageTime,
            averageGuesses,
            puzzlesWon: stats.puzzles.size,
            streak: finalStreak,
          };
        })
        .filter((entry) => entry.puzzlesWon >= 1); // At least 1 puzzle won

      // Sort by number of wins first (descending - most wins first), then by average time (ascending - fastest first)
      const sorted = [...entries].sort((a, b) => {
        // First sort by number of wins (descending)
        if (a.puzzlesWon !== b.puzzlesWon) {
          return b.puzzlesWon - a.puzzlesWon;
        }
        // If wins are equal, sort by average time (ascending - fastest first)
        if (a.averageTime === 0 && b.averageTime === 0) return 0;
        if (a.averageTime === 0) return 1;
        if (b.averageTime === 0) return -1;
        return a.averageTime - b.averageTime;
      });
      
      console.log('All-time leaderboard entries:', sorted.length);
      console.log('Sample entries with streaks:', sorted.slice(0, 5).map(e => ({ username: e.username, streak: e.streak, wins: e.puzzlesWon })));
      setAllTimeLeaderboard(sorted);
    } catch (error) {
      console.error('Error loading all-time leaderboard:', error);
      // Set empty array on error so UI doesn't show loading forever
      setAllTimeLeaderboard([]);
    } finally {
      setLoadingAllTime(false);
    }
  };


  if (loading && loadingAllTime) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-gray-600">Loading leaderboard...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4 pb-4">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6 text-center">
        Leaderboard
      </h1>

      {!puzzle && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 mb-4 text-center">
          <p className="text-sm text-yellow-800">No puzzle today, so there's no today's leaderboard yet.</p>
        </div>
      )}

      {puzzle && (
        <>
          {(averageTime !== null || correctPercentage !== null) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 mb-3 sm:mb-4 md:mb-6">
              <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                {averageTime !== null && (
                  <div className="font-semibold text-gray-900">
                    Avg Time: <span className="text-blue-700">{(averageTime / 1000).toFixed(2)}s</span>
                  </div>
                )}
                {correctPercentage !== null && (
                  <div className="font-semibold text-gray-900">
                    Success Rate: <span className="text-blue-700">{correctPercentage.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {submissions.length === 0 && incorrectSubmissions.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center mb-6">
              <p className="text-gray-600">No submissions yet. Be the first!</p>
            </div>
          ) : (
            <>
              {/* Today's Leaderboard */}
              <div className="mb-6 sm:mb-8">
                <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 mb-2 sm:mb-3 text-center">
                  Today's Leaderboard
                </h2>
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Rank
                          </th>
                          <th className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Username
                          </th>
                          <th className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Time
                          </th>
                          <th className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Guesses
                          </th>
                        </tr>
                      </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {submissions.map((submission, index) => {
                      const isCurrentUser = submission.anon_id === currentAnonId;
                      return (
                      <tr
                        key={submission.id}
                        className={`${index < 3 ? 'bg-yellow-50' : ''} ${isCurrentUser ? 'ring-2 ring-blue-500 bg-blue-100' : ''}`}
                      >
                        <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {index === 0 && <span className="text-lg sm:text-xl md:text-2xl mr-0.5 sm:mr-1 md:mr-2">🥇</span>}
                            {index === 1 && <span className="text-lg sm:text-xl md:text-2xl mr-0.5 sm:mr-1 md:mr-2">🥈</span>}
                            {index === 2 && <span className="text-lg sm:text-xl md:text-2xl mr-0.5 sm:mr-1 md:mr-2">🥉</span>}
                            <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900">
                              #{index + 1}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                          <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900 truncate max-w-[100px] sm:max-w-none">
                            {submission.username || 'Anonymous'}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                          <span className="text-[10px] sm:text-xs md:text-sm text-gray-900 font-semibold">
                            {(submission.time_ms / 1000).toFixed(2)}s
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                          <span className="text-[10px] sm:text-xs md:text-sm text-gray-900 font-semibold">
                            {submission.guess_count || '—'}
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                    {incorrectSubmissions.map((submission) => {
                      const isCurrentUser = submission.anon_id === currentAnonId;
                      return (
                      <tr
                        key={submission.id}
                        className={`bg-red-50 ${isCurrentUser ? 'ring-2 ring-blue-500 bg-red-200' : ''}`}
                      >
                        <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                          <span className="text-[10px] sm:text-xs md:text-sm font-medium text-red-600">
                            —
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                          <span className="text-[10px] sm:text-xs md:text-sm font-medium text-red-600 truncate max-w-[100px] sm:max-w-none">
                            {submission.username || 'Anonymous'}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                          <span className="text-[10px] sm:text-xs md:text-sm text-red-600 font-semibold">
                            —
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                          <span className="text-[10px] sm:text-xs md:text-sm text-red-600 font-semibold">
                            —
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* All-Time Leaderboard */}
      <div className="mt-6 sm:mt-8 md:mt-12">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-2 sm:mb-3 md:mb-4 text-center">
          All-Time Leaderboard
        </h2>

        {loadingAllTime ? (
          <div className="flex justify-center items-center min-h-[200px]">
            <div className="text-gray-600 text-sm">Loading all-time leaderboard...</div>
          </div>
        ) : allTimeLeaderboard.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-6 sm:p-8 text-center">
            <p className="text-gray-600 text-sm">No all-time submissions yet. Be the first to play!</p>
          </div>
        ) : (
          <>
            {/* All-Time Leaderboard */}
            <div className="mb-6 sm:mb-8">
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Rank
                        </th>
                        <th className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Username
                        </th>
                        <th className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Avg Time
                        </th>
                        <th className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Avg Guesses
                        </th>
                        <th className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Games Won
                        </th>
                        <th className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Streak
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {allTimeLeaderboard.map((entry, index) => {
                        const isCurrentUser = entry.anon_id === currentAnonId;
                        return (
                        <tr
                          key={entry.anon_id}
                          className={`${index < 3 ? 'bg-yellow-50' : ''} ${isCurrentUser ? 'ring-2 ring-blue-500 bg-blue-100' : ''}`}
                        >
                          <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {index === 0 && <span className="text-lg sm:text-xl md:text-2xl mr-0.5 sm:mr-1 md:mr-2">🥇</span>}
                              {index === 1 && <span className="text-lg sm:text-xl md:text-2xl mr-0.5 sm:mr-1 md:mr-2">🥈</span>}
                              {index === 2 && <span className="text-lg sm:text-xl md:text-2xl mr-0.5 sm:mr-1 md:mr-2">🥉</span>}
                              <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900">
                                #{index + 1}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                            <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900 truncate max-w-[100px] sm:max-w-none">
                              {entry.username || 'Anonymous'}
                            </span>
                          </td>
                          <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                            <span className="text-[10px] sm:text-xs md:text-sm text-gray-900 font-semibold">
                              {(entry.averageTime / 1000).toFixed(2)}s
                            </span>
                          </td>
                          <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                            <span className="text-[10px] sm:text-xs md:text-sm text-gray-900 font-semibold">
                              {entry.averageGuesses > 0 ? entry.averageGuesses.toFixed(1) : '—'}
                            </span>
                          </td>
                          <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                            <span className="text-[10px] sm:text-xs md:text-sm text-gray-900 font-semibold">
                              {entry.puzzlesWon}
                            </span>
                          </td>
                          <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                            <span className="text-[10px] sm:text-xs md:text-sm text-orange-600 font-semibold">
                              {entry.streak > 0 ? `🔥 ${entry.streak}` : entry.streak === 0 ? '0' : '—'}
                            </span>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}

export default Leaderboard;
