import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Puzzle, Submission } from '../types';

interface UserStats {
  anon_id: string;
  username: string | null;
  todayRank: number | null;
  todayTime: number | null;
  averageTime: number;
  puzzlesWon: number;
  allTimeRank: number;
}

function Leaderboard() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [leaderboard, setLeaderboard] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserAnonId, setCurrentUserAnonId] = useState<string | null>(null);

  useEffect(() => {
    // Get current user's anon_id
    const anonId = localStorage.getItem('rebus_anon_id');
    setCurrentUserAnonId(anonId);

    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get today's puzzle
      const { data: puzzleData, error: puzzleError } = await supabase
        .from('puzzles')
        .select('*')
        .eq('date', today)
        .single();

      if (puzzleError && puzzleError.code !== 'PGRST116') {
        throw puzzleError;
      }

      if (puzzleData) {
        setPuzzle(puzzleData);

        // Get all correct submissions for today's puzzle, ordered by time
        const { data: todaySubmissions, error: todayError } = await supabase
          .from('submissions')
          .select('*')
          .eq('puzzle_id', puzzleData.id)
          .eq('is_correct', true)
          .order('time_ms', { ascending: true });

        if (todayError) throw todayError;

        // Get all correct submissions for all-time stats
        const { data: allSubmissions, error: allError } = await supabase
          .from('submissions')
          .select('*')
          .eq('is_correct', true)
          .order('time_ms', { ascending: true });

        if (allError) throw allError;

        // Group by anon_id for all-time stats
        const userStatsMap = new Map<string, {
          username: string | null;
          times: number[];
          puzzles: Set<string>;
          todayTime: number | null;
          todayRank: number | null;
        }>();

        // Process today's submissions
        todaySubmissions?.forEach((submission: Submission, index: number) => {
          if (!submission.anon_id) return;

          if (!userStatsMap.has(submission.anon_id)) {
            userStatsMap.set(submission.anon_id, {
              username: submission.username,
              times: [],
              puzzles: new Set(),
              todayTime: null,
              todayRank: null,
            });
          }

          const stats = userStatsMap.get(submission.anon_id)!;
          // Only take the best time for today
          if (!stats.todayTime || submission.time_ms < stats.todayTime) {
            stats.todayTime = submission.time_ms;
            stats.todayRank = index + 1;
          }
          // Update username if available
          if (submission.username) {
            stats.username = submission.username;
          }
        });

        // Process all-time submissions
        allSubmissions?.forEach((submission: Submission) => {
          if (!submission.anon_id) return;

          if (!userStatsMap.has(submission.anon_id)) {
            userStatsMap.set(submission.anon_id, {
              username: submission.username,
              times: [],
              puzzles: new Set(),
              todayTime: null,
              todayRank: null,
            });
          }

          const stats = userStatsMap.get(submission.anon_id)!;
          stats.times.push(submission.time_ms);
          stats.puzzles.add(submission.puzzle_id);
          // Update username if available
          if (submission.username) {
            stats.username = submission.username;
          }
        });

        // Convert to leaderboard entries with all-time ranking
        const entries: UserStats[] = Array.from(userStatsMap.entries())
          .map(([anon_id, stats]) => {
            const totalTime = stats.times.reduce((sum, time) => sum + time, 0);
            const averageTime = stats.times.length > 0 ? totalTime / stats.times.length : 0;

            return {
              anon_id,
              username: stats.username,
              todayRank: stats.todayRank,
              todayTime: stats.todayTime,
              averageTime,
              puzzlesWon: stats.puzzles.size,
              allTimeRank: 0, // Will be set after sorting
            };
          })
          .filter((entry) => entry.puzzlesWon >= 1 || entry.todayRank !== null)
          .sort((a, b) => {
            // Sort by average time (ascending), but put users with no average at the end
            if (a.averageTime === 0 && b.averageTime === 0) return 0;
            if (a.averageTime === 0) return 1;
            if (b.averageTime === 0) return -1;
            return a.averageTime - b.averageTime;
          });

        // Set all-time ranks
        entries.forEach((entry, index) => {
          entry.allTimeRank = index + 1;
        });

        setLeaderboard(entries);
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-gray-600">Loading leaderboard...</div>
      </div>
    );
  }

  if (!puzzle) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">No Puzzle Today</h1>
        <p className="text-gray-600">There's no puzzle today, so there's no leaderboard yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4 pb-4">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-2 sm:mb-4 md:mb-6 text-center">
        Leaderboard
      </h1>

      {leaderboard.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600">No submissions yet. Be the first to play!</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 sm:px-3 md:px-6 py-1.5 sm:py-2 md:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-2 sm:px-3 md:px-6 py-1.5 sm:py-2 md:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-2 sm:px-3 md:px-6 py-1.5 sm:py-2 md:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Today
                  </th>
                  <th className="px-2 sm:px-3 md:px-6 py-1.5 sm:py-2 md:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    Avg
                  </th>
                  <th className="px-2 sm:px-3 md:px-6 py-1.5 sm:py-2 md:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Won
                  </th>
                  <th className="px-2 sm:px-3 md:px-6 py-1.5 sm:py-2 md:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    All-Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaderboard.map((entry, index) => {
                  const isCurrentUser = entry.anon_id === currentUserAnonId;
                  return (
                    <tr
                      key={entry.anon_id}
                      className={`${index < 3 ? 'bg-yellow-50' : ''} ${isCurrentUser ? 'ring-2 ring-blue-500' : ''}`}
                    >
                    <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {index === 0 && <span className="text-lg sm:text-xl md:text-2xl mr-0.5 sm:mr-1 md:mr-2">🥇</span>}
                        {index === 1 && <span className="text-lg sm:text-xl md:text-2xl mr-0.5 sm:mr-1 md:mr-2">🥈</span>}
                        {index === 2 && <span className="text-lg sm:text-xl md:text-2xl mr-0.5 sm:mr-1 md:mr-2">🥉</span>}
                        <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-900">
                          #{entry.allTimeRank}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                        <span className={`text-[10px] sm:text-xs md:text-sm font-medium ${isCurrentUser ? 'text-blue-600 font-bold' : 'text-gray-900'} truncate max-w-[80px] sm:max-w-none`}>
                          {entry.username || 'Anonymous'}
                        </span>
                      </td>
                      <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                        {entry.todayRank ? (
                          <span className="text-[10px] sm:text-xs md:text-sm text-gray-900 font-semibold">
                            #{entry.todayRank}<span className="hidden sm:inline"> ({(entry.todayTime! / 1000).toFixed(2)}s)</span>
                          </span>
                        ) : (
                          <span className="text-[10px] sm:text-xs md:text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap hidden sm:table-cell">
                        {entry.averageTime > 0 ? (
                          <span className="text-[10px] sm:text-xs md:text-sm text-gray-900 font-semibold">
                            {(entry.averageTime / 1000).toFixed(2)}s
                          </span>
                        ) : (
                          <span className="text-[10px] sm:text-xs md:text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                        <span className="text-[10px] sm:text-xs md:text-sm text-gray-900 font-semibold">
                          {entry.puzzlesWon}
                        </span>
                      </td>
                      <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap hidden md:table-cell">
                        <span className="text-[10px] sm:text-xs md:text-sm text-gray-500">
                          #{entry.allTimeRank}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Leaderboard;
