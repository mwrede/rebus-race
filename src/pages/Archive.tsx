import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Puzzle } from '../types';

interface PuzzleWithStats extends Puzzle {
  successRate: number | null;
  averageTime: number | null;
  averageGuesses: number | null;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface PlayedPuzzleInfo {
  time_ms: number;
  is_correct: boolean;
  guess_count: number | null;
}

function Archive() {
  const [puzzles, setPuzzles] = useState<PuzzleWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [playedPuzzleIds, setPlayedPuzzleIds] = useState<Set<string>>(new Set());
  const [playedPuzzleData, setPlayedPuzzleData] = useState<Map<string, PlayedPuzzleInfo>>(new Map());

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

      // Get success rates, average times, and average guesses for each puzzle
      const puzzlesWithStats = await Promise.all(
        filteredPuzzles.map(async (puzzle: Puzzle) => {
          // Get all submissions for this puzzle
          const { data: submissions, error: subError } = await supabase
            .from('submissions')
            .select('is_correct, time_ms, guess_count')
            .eq('puzzle_id', puzzle.id);

          let successRate: number | null = null;
          let averageTime: number | null = null;
          let averageGuesses: number | null = null;
          if (!subError && submissions && submissions.length > 0) {
            const correctCount = submissions.filter((s: { is_correct: boolean }) => s.is_correct).length;
            successRate = (correctCount / submissions.length) * 100;
            
            // Calculate average time for correct submissions
            const correctSubmissions = submissions.filter((s: { is_correct: boolean }) => s.is_correct);
            if (correctSubmissions.length > 0) {
              const totalTime = correctSubmissions.reduce((sum: number, s: { time_ms: number }) => sum + s.time_ms, 0);
              averageTime = totalTime / correctSubmissions.length;
            }

            // Calculate average guesses (use guess_count if available, otherwise estimate)
            const submissionsWithGuesses = submissions.filter((s: { guess_count: number | null }) => s.guess_count !== null);
            if (submissionsWithGuesses.length > 0) {
              const totalGuesses = submissionsWithGuesses.reduce((sum: number, s: { guess_count: number | null }) => sum + (s.guess_count || 0), 0);
              averageGuesses = totalGuesses / submissionsWithGuesses.length;
            }
          }

          return {
            ...puzzle,
            successRate,
            averageTime,
            averageGuesses,
          };
        })
      );

      // Sort by success rate to determine difficulty tiers
      const puzzlesWithSuccessRate = puzzlesWithStats.filter(p => p.successRate !== null);
      puzzlesWithSuccessRate.sort((a, b) => (b.successRate || 0) - (a.successRate || 0));
      
      // Calculate difficulty tiers (top 1/3 = easy, middle 1/3 = medium, bottom 1/3 = hard)
      const totalWithRate = puzzlesWithSuccessRate.length;
      const thirdSize = Math.ceil(totalWithRate / 3);
      
      // Create a map of puzzle ID to difficulty
      const difficultyMap = new Map<string, 'easy' | 'medium' | 'hard'>();
      puzzlesWithSuccessRate.forEach((puzzle, index) => {
        if (index < thirdSize) {
          difficultyMap.set(puzzle.id, 'easy');
        } else if (index < thirdSize * 2) {
          difficultyMap.set(puzzle.id, 'medium');
        } else {
          difficultyMap.set(puzzle.id, 'hard');
        }
      });

      // Add difficulty to each puzzle
      const puzzlesWithDifficulty = puzzlesWithStats.map(puzzle => ({
        ...puzzle,
        difficulty: difficultyMap.get(puzzle.id) || 'medium' as 'easy' | 'medium' | 'hard',
      }));
      
      setPuzzles(puzzlesWithDifficulty);
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
        .select('puzzle_id, time_ms, is_correct, guess_count')
        .eq('anon_id', anonId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get the most recent submission for each puzzle
      const playedIds = new Set<string>();
      const playedData = new Map<string, PlayedPuzzleInfo>();
      
      data?.forEach((s: { puzzle_id: string; time_ms: number; is_correct: boolean; guess_count: number | null }) => {
        if (!playedIds.has(s.puzzle_id)) {
          playedIds.add(s.puzzle_id);
          playedData.set(s.puzzle_id, {
            time_ms: s.time_ms,
            is_correct: s.is_correct,
            guess_count: s.guess_count,
          });
        }
      });

      setPlayedPuzzleIds(playedIds);
      setPlayedPuzzleData(playedData);
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
            const playedInfo = playedPuzzleData.get(puzzle.id);
            const isWon = playedInfo?.is_correct || false;

            // Determine background color based on difficulty (if not played) or win/loss (if played)
            let bgColor = 'bg-white';
            let borderColor = 'border-blue-300';
            if (isPlayed) {
              bgColor = isWon ? 'bg-green-50' : 'bg-red-50';
              borderColor = isWon ? 'border-green-300' : 'border-red-300';
            } else {
              // Color by difficulty
              if (puzzle.difficulty === 'easy') {
                bgColor = 'bg-green-50';
                borderColor = 'border-green-300';
              } else if (puzzle.difficulty === 'medium') {
                bgColor = 'bg-yellow-50';
                borderColor = 'border-yellow-300';
              } else {
                bgColor = 'bg-red-50';
                borderColor = 'border-red-300';
              }
            }

            return (
              <Link
                key={puzzle.id}
                to={`/archive/${puzzle.id}`}
                className={`rounded-lg shadow-md border-2 transition-all p-3 sm:p-4 ${
                  isPlayed ? `${bgColor} ${borderColor} opacity-90` : `${bgColor} ${borderColor} hover:shadow-lg`
                }`}
              >
                <div className="text-center">
                  <div className={`text-sm sm:text-base font-semibold mb-2 ${isPlayed ? (isWon ? 'text-green-700' : 'text-red-700') : 'text-gray-900'}`}>
                    {dateStr}
                  </div>
                  <div className="space-y-0.5 mb-1">
                    {puzzle.averageGuesses !== null && (
                      <div className={`text-[10px] sm:text-xs font-medium ${isPlayed ? (isWon ? 'text-green-600' : 'text-red-600') : 'text-gray-600'}`}>
                        Avg {puzzle.averageGuesses.toFixed(1)} guesses
                      </div>
                    )}
                    {puzzle.averageTime !== null && (
                      <div className={`text-[10px] sm:text-xs font-medium ${isPlayed ? (isWon ? 'text-green-600' : 'text-red-600') : 'text-gray-600'}`}>
                        Avg {(puzzle.averageTime / 1000).toFixed(2)}s
                      </div>
                    )}
                    {puzzle.successRate !== null ? (
                      <div className={`text-[10px] sm:text-xs font-medium ${isPlayed ? (isWon ? 'text-green-600' : 'text-red-600') : 'text-blue-600'}`}>
                        {puzzle.successRate.toFixed(1)}% correct
                      </div>
                    ) : (
                      <div className={`text-[10px] sm:text-xs font-medium ${isPlayed ? (isWon ? 'text-green-500' : 'text-red-500') : 'text-gray-500'}`}>
                        No plays
                      </div>
                    )}
                  </div>
                  {isPlayed && playedInfo && (
                    <div className={`text-[10px] sm:text-xs font-medium ${isWon ? 'text-green-700' : 'text-red-700'} mt-1 pt-1 border-t border-gray-200`}>
                      <div>You: {playedInfo.guess_count !== null ? `${playedInfo.guess_count} guesses` : '—'} • {(playedInfo.time_ms / 1000).toFixed(2)}s</div>
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

