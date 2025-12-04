import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Puzzle, Submission } from '../types';

function Leaderboard() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

        // Get correct submissions for today's puzzle, ordered by time (fastest first)
        const { data: submissionsData, error: submissionsError } = await supabase
          .from('submissions')
          .select('*')
          .eq('puzzle_id', puzzleData.id)
          .eq('is_correct', true)
          .order('time_ms', { ascending: true })
          .limit(100);

        if (submissionsError) throw submissionsError;
        setSubmissions(submissionsData || []);
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
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6 text-center">
        Today's Leaderboard
      </h1>
      <p className="text-center text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
        Fastest correct submissions for today's puzzle
      </p>

      {submissions.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600">No correct submissions yet. Be the first!</p>
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
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Leaderboard;
