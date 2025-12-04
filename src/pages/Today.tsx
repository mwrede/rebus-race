import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Puzzle, Submission } from '../types';
import { incrementWin } from '../lib/stats';
import { getUsername } from '../lib/username';

function Today() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [anonId, setAnonId] = useState<string>('');
  const [rank, setRank] = useState<number | null>(null);
  const [totalCorrect, setTotalCorrect] = useState<number>(0);
  const [pastSubmissions, setPastSubmissions] = useState<Submission[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [previousSubmission, setPreviousSubmission] = useState<Submission | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Get or create anonymous ID
    let id = localStorage.getItem('rebus_anon_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('rebus_anon_id', id);
    }
    setAnonId(id);

    // Load today's puzzle
    loadTodayPuzzle();
  }, []);

  useEffect(() => {
    if (isReady && startTime !== null && timeLeft > 0 && !submitted) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isReady, startTime, timeLeft, submitted]);

  const handleReady = () => {
    setIsReady(true);
    setStartTime(Date.now());
  };

  const loadTodayPuzzle = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('puzzles')
        .select('*')
        .eq('date', today)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setPuzzle(data);
        
        // Check if user has already played today
        const anonId = localStorage.getItem('rebus_anon_id');
        if (anonId) {
          const { data: existingSubmission, error: submissionError } = await supabase
            .from('submissions')
            .select('*')
            .eq('puzzle_id', data.id)
            .eq('anon_id', anonId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingSubmission && !submissionError) {
            setAlreadyPlayed(true);
            setPreviousSubmission(existingSubmission);
            setSubmitted(true);
            setSubmission(existingSubmission);
            
            // Load ranking and past results for the previous submission
            if (existingSubmission.is_correct) {
              await loadRankingAndPastResults(
                data.id,
                existingSubmission.id,
                existingSubmission.time_ms
              );
            }
          } else {
            // Don't start timer yet - wait for user to click "ready"
            setIsReady(false);
          }
        } else {
          // Don't start timer yet - wait for user to click "ready"
          setIsReady(false);
        }
      } else {
        // No puzzle for today
        setPuzzle(null);
      }
    } catch (error) {
      console.error('Error loading puzzle:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!submission || !puzzle) return;

    const timeSeconds = (submission.time_ms / 1000).toFixed(2);
    const shareText = `🧩 I solved today's Rebus Race puzzle in ${timeSeconds}s! Can you beat my time?\n\nPlay at: ${window.location.origin}`;

    // Try Web Share API first (mobile-friendly)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Rebus Race Result',
          text: shareText,
          url: window.location.origin,
        });
        return;
      } catch (err) {
        // User cancelled or error occurred, fall back to clipboard
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      alert('Result copied to clipboard!');
    } catch (err) {
      console.error('Error copying to clipboard:', err);
      // Final fallback: show the text
      prompt('Copy this text:', shareText);
    }
  };

  const loadRankingAndPastResults = async (
    puzzleId: string,
    submissionId: string,
    _timeMs: number
  ) => {
    setLoadingStats(true);
    try {
      // Get all correct submissions for today's puzzle, ordered by time
      const { data: allSubmissions, error: allError } = await supabase
        .from('submissions')
        .select('*')
        .eq('puzzle_id', puzzleId)
        .eq('is_correct', true)
        .order('time_ms', { ascending: true });

      if (allError) throw allError;

      // Find user's rank (1-indexed)
      const userRank =
        allSubmissions?.findIndex((s: Submission) => s.id === submissionId) + 1 || null;
      setRank(userRank);
      setTotalCorrect(allSubmissions?.length || 0);

      // Get user's past correct submissions (excluding current puzzle)
      const { data: pastData, error: pastError } = await supabase
        .from('submissions')
        .select('*')
        .eq('anon_id', anonId)
        .eq('is_correct', true)
        .neq('puzzle_id', puzzleId)
        .order('time_ms', { ascending: true })
        .limit(10);

      if (pastError) throw pastError;
      setPastSubmissions(pastData || []);
    } catch (error) {
      console.error('Error loading ranking and past results:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puzzle || !answer.trim() || submitted || isSubmitting) return;

    setIsSubmitting(true);
    const endTime = Date.now();
    const timeMs = startTime ? endTime - startTime : 0;
    const isCorrect = answer.trim().toLowerCase() === puzzle.answer.toLowerCase();

    try {
      const username = getUsername();
      const { data, error } = await supabase
        .from('submissions')
        .insert({
          puzzle_id: puzzle.id,
          anon_id: anonId,
          answer: answer.trim(),
          is_correct: isCorrect,
          time_ms: timeMs,
          username: username || null,
        })
        .select()
        .single();

      if (error) throw error;

      setSubmission(data);
      setSubmitted(true);

      // Increment win count if correct
      if (isCorrect) {
        incrementWin(puzzle.id);
        // Load ranking and past results
        await loadRankingAndPastResults(puzzle.id, data.id, timeMs);
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      alert('Failed to submit answer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-gray-600">Loading today's puzzle...</div>
      </div>
    );
  }

  if (!puzzle) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">No Puzzle Today</h1>
        <p className="text-gray-600">Check back tomorrow for a new puzzle!</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-4 pb-4">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-2 sm:mb-4 md:mb-6 text-center">
        Today's Puzzle
      </h1>

      {alreadyPlayed && previousSubmission && (
        <div className="bg-gray-100 rounded-lg shadow-md p-3 sm:p-4 md:p-6 mb-3 sm:mb-4 md:mb-6 opacity-75">
          <div className="text-center mb-2 sm:mb-3 md:mb-4">
            <div className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-2">
              You've already played today's puzzle
            </div>
            <div className="mb-2 sm:mb-3 md:mb-4">
              <img
                src={puzzle?.image_url}
                alt="Rebus puzzle"
                className="w-full rounded-lg border-2 border-gray-300 opacity-60"
              />
            </div>
          </div>
        </div>
      )}

      {!submitted && !alreadyPlayed && (
        <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 md:p-6 mb-3 sm:mb-4 md:mb-6">
          {!isReady ? (
            <div className="text-center py-6 sm:py-8">
              <div className="mb-6 sm:mb-8">
                <img
                  src={puzzle.image_url}
                  alt="Rebus puzzle"
                  className="w-full rounded-lg border-2 border-gray-200 opacity-50 blur-sm"
                />
              </div>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">
                Are you ready?
              </h2>
              <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8">
                Once you start, you'll have 30 seconds to solve the puzzle!
              </p>
              <button
                onClick={handleReady}
                className="bg-blue-600 text-white py-3 sm:py-4 px-8 sm:px-12 rounded-lg hover:bg-blue-700 font-bold text-lg sm:text-xl md:text-2xl shadow-lg transform hover:scale-105 transition-all"
              >
                Start Timer! ⏱️
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-3 sm:mb-4">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-600 mb-1 sm:mb-2">
                  {timeLeft}s
                </div>
                <div className="text-[10px] sm:text-xs md:text-sm text-gray-600">Time remaining</div>
              </div>

              <div className="mb-4 sm:mb-6">
                <img
                  src={puzzle.image_url}
                  alt="Rebus puzzle"
                  className="w-full rounded-lg border-2 border-gray-200"
                />
              </div>

              <form onSubmit={handleSubmit}>
            <div className="mb-3 sm:mb-4">
              <label
                htmlFor="answer"
                className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2"
              >
                Your Answer
              </label>
              <input
                type="text"
                id="answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={submitted || timeLeft === 0}
                className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                placeholder="Enter your answer..."
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={submitted || timeLeft === 0 || !answer.trim() || isSubmitting}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm sm:text-base"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Answer'}
            </button>
          </form>
            </>
          )}
        </div>
      )}

      {submitted && submission && (
        <div className={`rounded-lg shadow-md p-3 sm:p-4 md:p-6 ${alreadyPlayed ? 'bg-gray-100 opacity-75' : 'bg-white'}`}>
          {alreadyPlayed && (
            <div className="text-center mb-2 sm:mb-4">
              <div className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-2">
                Your Result from Today
              </div>
            </div>
          )}
          <div className="text-center mb-3 sm:mb-4 md:mb-6">
            <div
              className={`text-3xl sm:text-4xl md:text-5xl mb-2 sm:mb-3 md:mb-4 ${
                submission.is_correct ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {submission.is_correct ? '✓ Correct!' : '✗ Incorrect'}
            </div>
            <div className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 mb-1 sm:mb-2">
              {submission.is_correct
                ? `Your time: ${(submission.time_ms / 1000).toFixed(2)}s`
                : `The correct answer was: ${puzzle?.answer}`}
            </div>
            {submission.is_correct && (
              <>
                {loadingStats ? (
                  <div className="text-sm text-gray-600 mt-4">
                    Loading your ranking...
                  </div>
                ) : (
                  <>
                    {rank !== null && (
                      <div className="mt-2 sm:mt-3 md:mt-4 mb-3 sm:mb-4 md:mb-6">
                        <div className="text-lg sm:text-xl md:text-2xl font-bold text-blue-600 mb-0.5 sm:mb-1">
                          Rank #{rank}
                        </div>
                        <div className="text-[10px] sm:text-xs md:text-sm text-gray-600">
                          out of {totalCorrect} correct {totalCorrect === 1 ? 'submission' : 'submissions'}
                        </div>
                      </div>
                    )}

                    {pastSubmissions.length > 0 && (
                      <div className="mt-3 sm:mt-4 md:mt-6 pt-3 sm:pt-4 md:pt-6 border-t border-gray-200">
                        <div className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 mb-2 sm:mb-3">
                          Compared to Your Past Results
                        </div>
                        {(() => {
                          const bestPastTime = Math.min(
                            ...pastSubmissions.map((p) => p.time_ms)
                          );
                          const worstPastTime = Math.max(
                            ...pastSubmissions.map((p) => p.time_ms)
                          );
                          const avgPastTime =
                            pastSubmissions.reduce((sum, p) => sum + p.time_ms, 0) /
                            pastSubmissions.length;
                          const isNewBest = submission.time_ms < bestPastTime;
                          const isFasterThanBest = submission.time_ms < bestPastTime;
                          const isSlowerThanBest = submission.time_ms > bestPastTime;
                          const timeDiffFromBest = Math.abs(
                            submission.time_ms - bestPastTime
                          );
                          const timeDiffFromAvg = Math.abs(
                            submission.time_ms - avgPastTime
                          );

                          return (
                            <div className="space-y-2 sm:space-y-3">
                              <div
                                className={`p-2 sm:p-3 rounded-lg ${
                                  isNewBest
                                    ? 'bg-green-50 border-2 border-green-200'
                                    : isFasterThanBest
                                    ? 'bg-green-50'
                                    : 'bg-gray-50'
                                }`}
                              >
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0">
                                  <span className="text-xs sm:text-sm font-medium text-gray-700">
                                    {isNewBest
                                      ? '🎉 New personal best!'
                                      : isFasterThanBest
                                      ? `✓ ${(timeDiffFromBest / 1000).toFixed(2)}s faster than your best`
                                      : isSlowerThanBest
                                      ? `✗ ${(timeDiffFromBest / 1000).toFixed(2)}s slower than your best`
                                      : '= Same as your best'}
                                  </span>
                                  <span className="text-xs sm:text-sm font-semibold text-gray-900">
                                    Best: {(bestPastTime / 1000).toFixed(2)}s
                                  </span>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-[10px] sm:text-xs md:text-sm">
                                <div className="bg-gray-50 p-1.5 sm:p-2 rounded">
                                  <div className="text-gray-600 text-[10px] sm:text-xs">Average</div>
                                  <div className="font-semibold text-gray-900 text-xs sm:text-sm">
                                    {(avgPastTime / 1000).toFixed(2)}s
                                  </div>
                                  {submission.time_ms < avgPastTime && (
                                    <div className="text-green-600 text-[10px] sm:text-xs mt-0.5 sm:mt-1">
                                      ✓ {(timeDiffFromAvg / 1000).toFixed(2)}s faster
                                    </div>
                                  )}
                                  {submission.time_ms > avgPastTime && (
                                    <div className="text-red-600 text-[10px] sm:text-xs mt-0.5 sm:mt-1">
                                      ✗ {(timeDiffFromAvg / 1000).toFixed(2)}s slower
                                    </div>
                                  )}
                                </div>
                                <div className="bg-gray-50 p-1.5 sm:p-2 rounded">
                                  <div className="text-gray-600 text-[10px] sm:text-xs">Slowest</div>
                                  <div className="font-semibold text-gray-900 text-xs sm:text-sm">
                                    {(worstPastTime / 1000).toFixed(2)}s
                                  </div>
                                  {submission.time_ms < worstPastTime && (
                                    <div className="text-green-600 text-[10px] sm:text-xs mt-0.5 sm:mt-1">
                                      ✓ Faster than worst
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-[10px] sm:text-xs text-gray-500 text-center">
                                Based on {pastSubmissions.length} past{' '}
                                {pastSubmissions.length === 1 ? 'result' : 'results'}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {pastSubmissions.length === 0 && (
                      <div className="mt-2 sm:mt-4 text-xs sm:text-sm text-gray-600">
                        This is your first correct submission! 🎉
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          {alreadyPlayed && previousSubmission && previousSubmission.is_correct && (
            <div className="mt-3 sm:mt-4 md:mt-6 pt-3 sm:pt-4 md:pt-6 border-t border-gray-300 text-center space-y-2 sm:space-y-0 sm:space-x-3 flex flex-col sm:flex-row justify-center items-center">
              <button
                onClick={() => {
                  if (previousSubmission) {
                    const timeSeconds = (previousSubmission.time_ms / 1000).toFixed(2);
                    const shareText = `🧩 I solved today's Rebus Race puzzle in ${timeSeconds}s! Can you beat my time?\n\nPlay at: ${window.location.origin}`;
                    
                    if (navigator.share) {
                      navigator.share({
                        title: 'Rebus Race Result',
                        text: shareText,
                        url: window.location.origin,
                      }).catch(() => {
                        navigator.clipboard.writeText(shareText).then(() => {
                          alert('Result copied to clipboard!');
                        });
                      });
                    } else {
                      navigator.clipboard.writeText(shareText).then(() => {
                        alert('Result copied to clipboard!');
                      }).catch(() => {
                        prompt('Copy this text:', shareText);
                      });
                    }
                  }
                }}
                className="inline-flex items-center gap-1 sm:gap-2 bg-green-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-green-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>📤</span> <span>Share Result</span>
              </button>
              <Link
                to="/archive"
                className="inline-flex items-center gap-1 sm:gap-2 bg-blue-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-blue-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>📚</span> <span>Browse Archive</span>
              </Link>
            </div>
          )}
          {alreadyPlayed && previousSubmission && !previousSubmission.is_correct && (
            <div className="mt-3 sm:mt-4 md:mt-6 pt-3 sm:pt-4 md:pt-6 border-t border-gray-300 text-center">
              <Link
                to="/archive"
                className="inline-flex items-center gap-1 sm:gap-2 bg-blue-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-blue-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>📚</span> <span>Browse Archive</span>
              </Link>
            </div>
          )}
          
          {submission.is_correct && !alreadyPlayed && (
            <div className="mt-3 sm:mt-4 md:mt-6 pt-3 sm:pt-4 md:pt-6 border-t border-gray-200 text-center space-y-2 sm:space-y-0 sm:space-x-3 flex flex-col sm:flex-row justify-center items-center">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1 sm:gap-2 bg-green-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-green-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>📤</span> <span>Share Result</span>
              </button>
              <Link
                to="/archive"
                className="inline-flex items-center gap-1 sm:gap-2 bg-blue-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-blue-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>📚</span> <span>Go to Archive</span>
              </Link>
            </div>
          )}
        </div>
      )}

      {timeLeft === 0 && !submitted && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 sm:p-3 md:p-4 mb-3 sm:mb-4 md:mb-6">
          <p className="text-yellow-800 text-center text-xs sm:text-sm md:text-base">
            Time's up! You can still submit your answer, but it won't count toward the leaderboard.
          </p>
        </div>
      )}
    </div>
  );
}

export default Today;

