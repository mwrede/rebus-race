import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Submission } from '../types';

interface LeaderboardEntry {
  anon_id: string;
  averageTime: number;
  puzzlesWon: number;
  totalTime: number;
}

function AllTimeLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllTimeLeaderboard();
  }, []);

  const loadAllTimeLeaderboard = async () => {
    try {
      // Get all correct submissions
      const { data: submissions, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('is_correct', true)
        .order('time_ms', { ascending: true });

      if (error) throw error;

      // Group by anon_id and calculate stats
      const userStats = new Map<string, { times: number[]; puzzles: Set<string> }>();

      submissions?.forEach((submission: Submission) => {
        if (!submission.anon_id) return;

        if (!userStats.has(submission.anon_id)) {
          userStats.set(submission.anon_id, {
            times: [],
            puzzles: new Set(),
          });
        }

        const stats = userStats.get(submission.anon_id)!;
        stats.times.push(submission.time_ms);
        stats.puzzles.add(submission.puzzle_id);
      });

      // Convert to leaderboard entries
      const entries: LeaderboardEntry[] = Array.from(userStats.entries())
        .map(([anon_id, stats]) => {
          const totalTime = stats.times.reduce((sum, time) => sum + time, 0);
          const averageTime = totalTime / stats.times.length;

          return {
            anon_id,
            averageTime,
            puzzlesWon: stats.puzzles.size,
            totalTime,
          };
        })
        .filter((entry) => entry.puzzlesWon >= 1) // At least 1 puzzle won
        .sort((a, b) => a.averageTime - b.averageTime); // Sort by average time (ascending)

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
    <div className="max-w-4xl mx-auto px-2 sm:px-4">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 text-center">
        All-Time Leaderboard
      </h1>
      <p className="text-center text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
        Ranked by average time across all puzzles
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
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Time
                  </th>
                  <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Won
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaderboard.map((entry, index) => (
                  <tr
                    key={entry.anon_id}
                    className={index < 3 ? 'bg-yellow-50' : ''}
                  >
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {index === 0 && <span className="text-xl sm:text-2xl mr-1 sm:mr-2">🥇</span>}
                        {index === 1 && <span className="text-xl sm:text-2xl mr-1 sm:mr-2">🥈</span>}
                        {index === 2 && <span className="text-xl sm:text-2xl mr-1 sm:mr-2">🥉</span>}
                        <span className="text-xs sm:text-sm font-medium text-gray-900">
                          #{index + 1}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <span className="text-xs sm:text-sm text-gray-900 font-semibold">
                        {(entry.averageTime / 1000).toFixed(2)}s
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <span className="text-xs sm:text-sm text-gray-900 font-semibold">
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

