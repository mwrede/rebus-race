import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Puzzle } from '../types';

interface PuzzleWithStats extends Puzzle {
  successRate: number | null;
}

function Archive() {
  const [puzzles, setPuzzles] = useState<PuzzleWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [playedPuzzleIds, setPlayedPuzzleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadArchive();
    loadPlayedPuzzles();
  }, []);

  const loadArchive = async () => {
    try {
      // Get today's date in YYYY-MM-DD format (local timezone, no time component)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      
      // Get all puzzles
      const { data, error } = await supabase
        .from('puzzles')
        .select('*')
        .order('date', { ascending: false })
        .limit(100);

      if (error) throw error;
      
      // Filter to only show puzzles with dates strictly before today
      const filteredPuzzles = (data || []).filter((puzzle: Puzzle) => {
        const puzzleDateStr = puzzle.date.split('T')[0];
        return puzzleDateStr < todayStr;
      });

      // Get success rates for each puzzle
      const puzzlesWithStats = await Promise.all(
        filteredPuzzles.map(async (puzzle: Puzzle) => {
          // Get all submissions for this puzzle
          const { data: submissions, error: subError } = await supabase
            .from('submissions')
            .select('is_correct')
            .eq('puzzle_id', puzzle.id);

          let successRate: number | null = null;
          if (!subError && submissions && submissions.length > 0) {
            const correctCount = submissions.filter((s: { is_correct: boolean }) => s.is_correct).length;
            successRate = (correctCount / submissions.length) * 100;
          }

          return {
            ...puzzle,
            successRate,
          };
        })
      );
      
      setPuzzles(puzzlesWithStats);
    } catch (error) {
      console.error('Error loading archive:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayedPuzzles = async () => {
    try {
      const anonId = localStorage.getItem('rebus_anon_id');
      if (!anonId) return;

      const { data, error } = await supabase
        .from('submissions')
        .select('puzzle_id')
        .eq('anon_id', anonId);

      if (error) throw error;

      const playedIds = new Set<string>(data?.map((s: { puzzle_id: string }) => s.puzzle_id) || []);
      setPlayedPuzzleIds(playedIds);
    } catch (error) {
      console.error('Error loading played puzzles:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-gray-600">Loading archive...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4 pb-4">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6 text-center">
        Puzzle Archive
      </h1>

      {puzzles.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600">No puzzles in the archive yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {puzzles.map((puzzle) => {
            // Parse date string directly to avoid timezone issues
            const dateParts = puzzle.date.split('T')[0].split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1; // 0-indexed
            const day = parseInt(dateParts[2]);
            const puzzleDate = new Date(year, month, day);
            const dateStr = puzzleDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            const isPlayed = playedPuzzleIds.has(puzzle.id);

            return (
              <Link
                key={puzzle.id}
                to={`/archive/${puzzle.id}`}
                className={`bg-white rounded-lg shadow-md border-2 transition-all p-3 sm:p-4 ${
                  isPlayed
                    ? 'border-gray-300 opacity-60'
                    : 'border-blue-300 hover:shadow-lg'
                }`}
              >
                <div className="text-center">
                  <div className={`text-sm sm:text-base font-semibold mb-2 ${isPlayed ? 'text-gray-500' : 'text-gray-900'}`}>
                    {dateStr}
                  </div>
                  {puzzle.successRate !== null ? (
                    <div className={`text-xs sm:text-sm font-medium ${isPlayed ? 'text-gray-400' : 'text-blue-600'}`}>
                      {puzzle.successRate.toFixed(1)}% correct
                    </div>
                  ) : (
                    <div className={`text-xs sm:text-sm font-medium ${isPlayed ? 'text-gray-400' : 'text-gray-500'}`}>
                      No plays
                    </div>
                  )}
                  {isPlayed && (
                    <div className="text-[10px] sm:text-xs font-medium text-gray-500 mt-1">
                      ✓ Played
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Archive;

