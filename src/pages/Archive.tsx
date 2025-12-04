import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Puzzle } from '../types';

interface PuzzleWithStats extends Puzzle {
  successRate: number | null;
  averageTime: number | null;
  averageGuesses: number | null;
}

// Function to calculate gradient color based on success rate
// 0% = red (hardest), 50% = orange (medium), 100% = green (easiest)
function getDifficultyColor(successRate: number | null): string {
  if (successRate === null) return 'rgb(229, 231, 235)'; // gray for no data
  
  // Clamp between 0 and 100
  const rate = Math.max(0, Math.min(100, successRate));
  
  // Interpolate between red (0%), orange (50%), and green (100%)
  if (rate <= 50) {
    // Red to Orange: 0% = red, 50% = orange
    const ratio = rate / 50;
    const r = Math.round(255 - (255 - 249) * ratio); // 255 -> 249
    const g = Math.round(0 + (140 - 0) * ratio); // 0 -> 140
    const b = Math.round(0 + (20 - 0) * ratio); // 0 -> 20
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Orange to Green: 50% = orange, 100% = green
    const ratio = (rate - 50) / 50;
    const r = Math.round(249 - (249 - 34) * ratio); // 249 -> 34
    const g = Math.round(140 + (197 - 140) * ratio); // 140 -> 197
    const b = Math.round(20 - (20 - 94) * ratio); // 20 -> 94
    return `rgb(${r}, ${g}, ${b})`;
  }
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
  const [showPlayed, setShowPlayed] = useState(false);

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

      {/* Difficulty Legend */}
      <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 mb-3 sm:mb-4 md:mb-6">
        <div className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 text-center">
          Difficulty Scale (based on % correct)
        </div>
        <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: getDifficultyColor(0) }}></div>
            <span className="text-[10px] sm:text-xs text-gray-700 font-semibold">Hardest</span>
          </div>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ 
            background: 'linear-gradient(to right, rgb(220, 38, 38), rgb(249, 140, 20), rgb(34, 197, 94))' 
          }}></div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: getDifficultyColor(100) }}></div>
            <span className="text-[10px] sm:text-xs text-gray-700 font-semibold">Easiest</span>
          </div>
        </div>
        <div className="text-[10px] sm:text-xs text-gray-600 text-center">
          <span className="font-semibold text-red-600">Red = Hardest</span> (low % correct) • <span className="font-semibold text-green-600">Green = Easiest</span> (high % correct)
        </div>
      </div>

      {puzzles.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-600">No puzzles in the archive yet.</p>
        </div>
      ) : (
        <>
          {/* Not Played Puzzles */}
          {(() => {
            const notPlayed = puzzles.filter(p => !playedPuzzleIds.has(p.id));
            const played = puzzles.filter(p => playedPuzzleIds.has(p.id));
            
            return (
              <>
                {notPlayed.length > 0 && (
                  <div className="mb-6 sm:mb-8">
                    <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 mb-3 sm:mb-4">
                      Not Played
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      {notPlayed.map((puzzle) => {
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

                        // Get gradient color based on success rate
                        const difficultyColor = getDifficultyColor(puzzle.successRate);
                        const borderColor = 'border-gray-300';

                        return (
                          <Link
                            key={puzzle.id}
                            to={`/archive/${puzzle.id}`}
                            className={`rounded-lg shadow-md border-2 transition-all p-3 sm:p-4 relative ${borderColor} hover:shadow-lg`}
                            style={{
                              backgroundColor: `rgba(${difficultyColor.replace('rgb(', '').replace(')', '')}, 0.15)`,
                            }}
                          >
                            <div className="text-center">
                              <div className="text-sm sm:text-base font-semibold mb-2 text-gray-900">
                                {dateStr}
                              </div>
                              <div className="space-y-0.5 mb-1">
                                {puzzle.averageGuesses !== null && (
                                  <div className="text-[10px] sm:text-xs font-medium text-gray-600">
                                    Avg {puzzle.averageGuesses.toFixed(1)} guesses
                                  </div>
                                )}
                                {puzzle.averageTime !== null && (
                                  <div className="text-[10px] sm:text-xs font-medium text-gray-600">
                                    Avg {(puzzle.averageTime / 1000).toFixed(2)}s
                                  </div>
                                )}
                                {puzzle.successRate !== null ? (
                                  <div className="text-[10px] sm:text-xs font-medium text-blue-600">
                                    {puzzle.successRate.toFixed(1)}% correct
                                  </div>
                                ) : (
                                  <div className="text-[10px] sm:text-xs font-medium text-gray-500">
                                    No plays
                                  </div>
                                )}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Played Puzzles */}
                {played.length > 0 && (
                  <div className="mb-6 sm:mb-8">
                    <button
                      onClick={() => setShowPlayed(!showPlayed)}
                      className="flex items-center justify-between w-full text-left mb-3 sm:mb-4"
                    >
                      <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">
                        Played ({played.length})
                      </h2>
                      <span className={`text-lg sm:text-xl transition-transform duration-200 ${showPlayed ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>
                    {showPlayed && (
                      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {played.map((puzzle) => {
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

                          // Get gradient color based on success rate
                          const difficultyColor = getDifficultyColor(puzzle.successRate);
                          const borderColor = isPlayed 
                            ? 'border-gray-400'
                            : 'border-gray-300';

                          return (
                            <Link
                              key={puzzle.id}
                              to={`/archive/${puzzle.id}`}
                              className={`rounded-lg shadow-md border-2 transition-all p-3 sm:p-4 relative ${
                                isPlayed ? `${borderColor} opacity-90` : `${borderColor} hover:shadow-lg`
                              }`}
                              style={{
                                backgroundColor: isPlayed 
                                  ? 'rgba(156, 163, 175, 0.1)' // grey background for already played
                                  : `rgba(${difficultyColor.replace('rgb(', '').replace(')', '')}, 0.15)`,
                              }}
                            >
                              {isPlayed && (
                                <div className="absolute top-1 right-1 sm:top-2 sm:right-2">
                                  <span className="text-[9px] sm:text-[10px] font-semibold text-gray-600 bg-gray-200 px-1.5 sm:px-2 py-0.5 rounded">
                                    Already played
                                  </span>
                                </div>
                              )}
                              <div className="text-center">
                                <div className={`text-sm sm:text-base font-semibold mb-2 ${isPlayed ? 'text-gray-600' : 'text-gray-900'}`}>
                                  {dateStr}
                                </div>
                                <div className="space-y-0.5 mb-1">
                                  {puzzle.averageGuesses !== null && (
                                    <div className={`text-[10px] sm:text-xs font-medium ${isPlayed ? 'text-gray-500' : 'text-gray-600'}`}>
                                      Avg {puzzle.averageGuesses.toFixed(1)} guesses
                                    </div>
                                  )}
                                  {puzzle.averageTime !== null && (
                                    <div className={`text-[10px] sm:text-xs font-medium ${isPlayed ? 'text-gray-500' : 'text-gray-600'}`}>
                                      Avg {(puzzle.averageTime / 1000).toFixed(2)}s
                                    </div>
                                  )}
                                  {puzzle.successRate !== null ? (
                                    <div className={`text-[10px] sm:text-xs font-medium ${isPlayed ? 'text-gray-500' : 'text-blue-600'}`}>
                                      {puzzle.successRate.toFixed(1)}% correct
                                    </div>
                                  ) : (
                                    <div className={`text-[10px] sm:text-xs font-medium ${isPlayed ? 'text-gray-500' : 'text-gray-500'}`}>
                                      No plays
                                    </div>
                                  )}
                                </div>
                                {isPlayed && playedInfo && (
                                  <div className="text-[10px] sm:text-xs font-medium text-gray-600 mt-1 pt-1 border-t border-gray-200">
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
                )}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}

export default Archive;

