import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Submission } from '../types';

interface LeaderboardEntry {
  username: string | null;
  averageTime: number;
  puzzlesWon: number;
  totalTime: number;
  anon_id: string;
}

function AllTimeLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllTimeLeaderboard();
  }, []);

  const loadAllTimeLeaderboard = async () => {
    try {
      // Get today's date in local timezone (YYYY-MM-DD format) - same as Today.tsx
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;

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
        // Update username if available
        if (submission.username) {
          stats.username = submission.username;
        }
      });

      // Convert to leaderboard entries
      const entries: LeaderboardEntry[] = Array.from(userStats.entries())
        .map(([anon_id, stats]) => {
          const totalTime = stats.times.reduce((sum, time) => sum + time, 0);
          const averageTime = stats.times.length > 0 ? totalTime / stats.times.length : 0;

          return {
            anon_id,
            username: stats.username,
            averageTime,
            puzzlesWon: stats.puzzles.size,
            totalTime,
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

      setLeaderboard(entries);
    } catch (error) {
      console.error('Error loading all-time leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-gray-600">Loading all-time leaderboard...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4 pb-4">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 text-center">
        All-Time Leaderboard
      </h1>
      <p className="text-center text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
        Ranked by lowest average response time
      </p>

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
                    Games Won
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaderboard.map((entry, index) => (
                  <tr
                    key={entry.anon_id}
                    className={index < 3 ? 'bg-yellow-50' : ''}
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
                        {entry.puzzlesWon}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default AllTimeLeaderboard;
