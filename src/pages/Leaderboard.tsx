import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Puzzle, Submission } from '../types';

interface AllTimeEntry {
  username: string | null;
  averageTime: number;
  puzzlesWon: number;
  anon_id: string;
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

  useEffect(() => {
    loadLeaderboard();
    loadAllTimeLeaderboard();
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

        // Get all submissions for today's puzzle (both correct and incorrect)
        const { data: allSubmissionsData, error: allSubmissionsError } = await supabase
          .from('submissions')
          .select('*')
          .eq('puzzle_id', puzzleData.id);

        if (allSubmissionsError) throw allSubmissionsError;

        // Get correct submissions, ordered by time (fastest first)
        const correctSubmissions = (allSubmissionsData || []).filter((s: Submission) => s.is_correct);
        correctSubmissions.sort((a: Submission, b: Submission) => a.time_ms - b.time_ms);
        setSubmissions(correctSubmissions.slice(0, 100));

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
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllTimeLeaderboard = async () => {
    try {
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
        // Update username if available
        if (submission.username) {
          stats.username = submission.username;
        }
      });

      // Convert to leaderboard entries
      const entries: AllTimeEntry[] = Array.from(userStats.entries())
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

      setAllTimeLeaderboard(entries);
    } catch (error) {
      console.error('Error loading all-time leaderboard:', error);
    } finally {
      setLoadingAllTime(false);
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
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6 text-center">
        Today's Leaderboard
      </h1>
      <p className="text-center text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">
        Fastest correct submissions for today's puzzle
      </p>

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
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600">No submissions yet. Be the first!</p>
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
                    Time
                  </th>
                  <th className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    Submitted At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {submissions.map((submission, index) => (
                  <tr
                    key={submission.id}
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
                        {submission.username || 'Anonymous'}
                      </span>
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap">
                      <span className="text-[10px] sm:text-xs md:text-sm text-gray-900 font-semibold">
                        {(submission.time_ms / 1000).toFixed(2)}s
                      </span>
                    </td>
                    <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap hidden sm:table-cell">
                      <span className="text-[10px] sm:text-xs md:text-sm text-gray-500">
                        {new Date(submission.created_at).toLocaleTimeString()}
                      </span>
                    </td>
                  </tr>
                ))}
                {incorrectSubmissions.map((submission, index) => (
                  <tr
                    key={submission.id}
                    className="bg-red-50"
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
                    <td className="px-2 sm:px-3 md:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap hidden sm:table-cell">
                      <span className="text-[10px] sm:text-xs md:text-sm text-red-500">
                        {new Date(submission.created_at).toLocaleTimeString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All-Time Leaderboard */}
      <div className="mt-6 sm:mt-8 md:mt-12">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-2 sm:mb-3 md:mb-4 text-center">
          All-Time Leaderboard
        </h2>
        <p className="text-center text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
          Ranked by lowest average response time
        </p>

        {loadingAllTime ? (
          <div className="flex justify-center items-center min-h-[200px]">
            <div className="text-gray-600 text-sm">Loading all-time leaderboard...</div>
          </div>
        ) : allTimeLeaderboard.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-6 sm:p-8 text-center">
            <p className="text-gray-600 text-sm">No all-time submissions yet. Be the first to play!</p>
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
                  {allTimeLeaderboard.map((entry, index) => (
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
    </div>
  );
}

export default Leaderboard;
