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
  const [timeElapsed, setTimeElapsed] = useState(0);
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
  const [allTimeRank, setAllTimeRank] = useState<number | null>(null);
  const [averageTime, setAverageTime] = useState<number | null>(null);
  const [incorrectPercentage, setIncorrectPercentage] = useState<number | null>(null);
  const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);
  const [guessCount, setGuessCount] = useState(0);
  const MAX_GUESSES = 5;
  const MAX_TIME_SECONDS = 300; // 5 minutes

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
    if (isReady && startTime !== null && !submitted) {
      const timer = setInterval(() => {
        if (startTime) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          setTimeElapsed(elapsed);
          
          // Auto-submit when 5 minutes is reached
          if (elapsed >= MAX_TIME_SECONDS && !submitted && puzzle && !isSubmitting) {
            clearInterval(timer);
            const submitTimeout = async () => {
              setIsSubmitting(true);
              const timeMs = MAX_TIME_SECONDS * 1000; // 5 minutes in ms

              try {
                const username = getUsername();
                const { data, error } = await supabase
                  .from('submissions')
                  .insert({
                    puzzle_id: puzzle.id,
                    anon_id: anonId,
                    answer: answer.trim() || '',
                    is_correct: false,
                    time_ms: timeMs,
                    username: username || null,
                  })
                  .select()
                  .single();

                if (error) throw error;

                setSubmission(data);
                setSubmitted(true);
                // Load incorrect percentage for timeout case
                await loadIncorrectPercentage(puzzle.id);
                // Load all-time stats even if incorrect
                await loadAllTimeStats();
              } catch (error) {
                console.error('Error submitting answer:', error);
              } finally {
                setIsSubmitting(false);
              }
            };
            submitTimeout();
          }
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isReady, startTime, submitted, puzzle, isSubmitting, anonId, answer]);

  const handleReady = () => {
    setIsReady(true);
    setStartTime(Date.now());
  };

  const loadTodayPuzzle = async () => {
    try {
      // Get today's date in local timezone (YYYY-MM-DD format)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;
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
              // Load all-time stats
              await loadAllTimeStats();
            } else {
              // Still load all-time stats even if incorrect
              await loadAllTimeStats();
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

  const loadAllTimeStats = async () => {
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
        if (submission.username) {
          stats.username = submission.username;
        }
      });

      // Convert to leaderboard entries and find user's rank
      const entries = Array.from(userStats.entries())
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
        .filter((entry) => entry.puzzlesWon >= 1)
        .sort((a, b) => {
          if (a.averageTime === 0 && b.averageTime === 0) return 0;
          if (a.averageTime === 0) return 1;
          if (b.averageTime === 0) return -1;
          return a.averageTime - b.averageTime;
        });

      // Find user's rank and average
      const userEntry = entries.findIndex((entry) => entry.anon_id === anonId);
      if (userEntry !== -1) {
        setAllTimeRank(userEntry + 1);
        setAverageTime(entries[userEntry].averageTime);
      }
    } catch (error) {
      console.error('Error loading all-time stats:', error);
    }
  };

  const handleShare = async () => {
    if (!submission || !puzzle) return;

    const timeSeconds = (submission.time_ms / 1000).toFixed(2);
    const resultText = submission.is_correct 
      ? `I solved today's Rebus Race puzzle in ${timeSeconds}s!`
      : `I tried today's Rebus Race puzzle but didn't get it right.`;
    const shareText = `I love michael wrede. ${resultText} Can you beat my time?\n\nPlay at: ${window.location.origin}`;

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(shareText);
      alert('Result copied to clipboard!');
    } catch (err) {
      console.error('Error copying to clipboard:', err);
      // Fallback: show the text
      prompt('Copy this text:', shareText);
    }
  };

  const loadIncorrectPercentage = async (puzzleId: string) => {
    try {
      // Get all submissions for this puzzle
      const { data: allSubmissions, error } = await supabase
        .from('submissions')
        .select('is_correct')
        .eq('puzzle_id', puzzleId);

      if (error) throw error;

      if (allSubmissions && allSubmissions.length > 0) {
        const incorrectCount = allSubmissions.filter((s: Submission) => !s.is_correct).length;
        const percentage = (incorrectCount / allSubmissions.length) * 100;
        setIncorrectPercentage(percentage);
      }
    } catch (error) {
      console.error('Error loading incorrect percentage:', error);
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

      // Get user's past correct submissions (excluding current puzzle and archive puzzles)
      const { data: pastData, error: pastError } = await supabase
        .from('submissions')
        .select('*')
        .eq('anon_id', anonId)
        .eq('is_correct', true)
        .neq('puzzle_id', puzzleId)
        .order('time_ms', { ascending: true })
        .limit(100); // Get more to filter out archive puzzles

      if (pastError) throw pastError;

      // Filter out archive puzzles and limit to 10
      const dailyPastSubmissions = (pastData || []).filter(
        (s: Submission) => !archivePuzzleIds.has(s.puzzle_id)
      ).slice(0, 10);

      setPastSubmissions(dailyPastSubmissions);
    } catch (error) {
      console.error('Error loading ranking and past results:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puzzle || !answer.trim() || submitted || isSubmitting) return;

    const isCorrect = answer.trim().toLowerCase() === puzzle.answer.toLowerCase();
    const currentAnswer = answer.trim();

    if (isCorrect) {
      // Correct answer - submit immediately
      setIsSubmitting(true);
      const endTime = Date.now();
      const timeMs = startTime ? endTime - startTime : 0;

      try {
        const username = getUsername();
        const { data, error } = await supabase
          .from('submissions')
          .insert({
            puzzle_id: puzzle.id,
            anon_id: anonId,
            answer: currentAnswer,
            is_correct: true,
            time_ms: timeMs,
            username: username || null,
          })
          .select()
          .single();

        if (error) throw error;

        setSubmission(data);
        setSubmitted(true);

        // Increment win count
        incrementWin(puzzle.id);
        // Load ranking and past results
        await loadRankingAndPastResults(puzzle.id, data.id, timeMs);
        // Load all-time stats
        await loadAllTimeStats();
      } catch (error) {
        console.error('Error submitting answer:', error);
        alert('Failed to submit answer. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Wrong answer - add to wrong guesses
      setWrongGuesses((prev) => [...prev, currentAnswer]);
      setGuessCount((prev) => prev + 1);
      setAnswer(''); // Clear input for next guess

      // If they've used all 5 guesses, submit as incorrect
      if (guessCount + 1 >= MAX_GUESSES) {
        setIsSubmitting(true);
        const endTime = Date.now();
        const timeMs = startTime ? endTime - startTime : 0;

        try {
          const username = getUsername();
          const { data, error } = await supabase
            .from('submissions')
            .insert({
              puzzle_id: puzzle.id,
              anon_id: anonId,
              answer: currentAnswer,
              is_correct: false,
              time_ms: timeMs,
              username: username || null,
            })
            .select()
            .single();

          if (error) throw error;

          setSubmission(data);
          setSubmitted(true);
          // Load incorrect percentage
          await loadIncorrectPercentage(puzzle.id);
          // Load all-time stats even if incorrect
          await loadAllTimeStats();
        } catch (error) {
          console.error('Error submitting answer:', error);
          alert('Failed to submit answer. Please try again.');
        } finally {
          setIsSubmitting(false);
        }
      }
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
    <div className="max-w-2xl mx-auto px-2 sm:px-4 pb-2 sm:pb-4">
      <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-1.5 sm:mb-2 md:mb-3 text-center">
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
        <div className="bg-white rounded-lg shadow-md p-2 sm:p-3 md:p-4 lg:p-6 mb-2 sm:mb-3 md:mb-4">
          {!isReady ? (
            <div className="text-center py-3 sm:py-4 md:py-6">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-2 sm:mb-3 md:mb-4">
                Are you ready?
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 md:mb-6">
                Once you start, you'll have 5 minutes and 5 guesses to solve the puzzle!
              </p>
              <button
                onClick={handleReady}
                className="bg-blue-600 text-white py-2 sm:py-3 px-6 sm:px-8 md:px-12 rounded-lg hover:bg-blue-700 font-bold text-base sm:text-lg md:text-xl shadow-lg"
              >
                Start Timer! ⏱️
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-1 sm:mb-1.5">
                <div className={`text-lg sm:text-xl md:text-2xl font-bold mb-0.5 ${
                  timeElapsed >= MAX_TIME_SECONDS ? 'text-red-600' : 'text-blue-600'
                }`}>
                  {Math.floor(timeElapsed / 60)}:{(timeElapsed % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-[8px] sm:text-[9px] text-gray-600">
                  {timeElapsed >= MAX_TIME_SECONDS ? "Time's up!" : 'Time elapsed'}
                </div>
                <div className="text-[8px] sm:text-[9px] text-gray-600 mt-0.5">
                  {MAX_GUESSES - guessCount} {MAX_GUESSES - guessCount === 1 ? 'guess' : 'guesses'} remaining
                </div>
              </div>

              {timeElapsed >= MAX_TIME_SECONDS && (
                <div className="mb-2 p-2 bg-red-50 border-2 border-red-300 rounded-lg">
                  <p className="text-xs sm:text-sm text-red-800 font-semibold text-center">
                    Incorrect, you wont get it i promise
                  </p>
                </div>
              )}

              {wrongGuesses.length > 0 && (
                <div className="mb-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="text-[9px] sm:text-[10px] font-medium text-gray-700 mb-1">
                    Wrong guesses:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {wrongGuesses.map((guess, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] sm:text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded"
                      >
                        {guess}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-1 sm:mb-1.5">
                <img
                  src={puzzle.image_url}
                  alt="Rebus puzzle"
                  className="w-full rounded-lg border-2 border-gray-200 max-h-[25vh] sm:max-h-[30vh] object-contain"
                />
              </div>

              <form onSubmit={handleSubmit} className="space-y-1">
                <div>
                  <label
                    htmlFor="answer"
                    className="block text-[9px] sm:text-[10px] font-medium text-gray-700 mb-0.5"
                  >
                    Your Answer
                  </label>
                  <input
                    type="text"
                    id="answer"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={submitted || timeElapsed >= MAX_TIME_SECONDS || guessCount >= MAX_GUESSES}
                    className="w-full px-2 py-1 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    placeholder="Enter your answer..."
                    autoFocus
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitted || timeElapsed >= MAX_TIME_SECONDS || guessCount >= MAX_GUESSES || !answer.trim() || isSubmitting}
                  className="w-full bg-blue-600 text-white py-1.5 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-xs sm:text-sm"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Answer'}
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {submitted && submission && (
        <div className={`rounded-lg shadow-md p-2.5 sm:p-3 md:p-4 lg:p-6 ${alreadyPlayed ? 'bg-gray-100 opacity-75' : 'bg-white'}`}>
          {alreadyPlayed && (
            <div className="text-center mb-1.5 sm:mb-2 md:mb-3">
              <div className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600 mb-1">
                Your Result from Today
              </div>
            </div>
          )}
          <div className="text-center mb-2 sm:mb-3">
            <div
              className={`text-2xl sm:text-3xl md:text-4xl mb-1.5 sm:mb-2 md:mb-3 ${
                submission.is_correct ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {submission.is_correct ? '✓ Correct!' : '✗ Incorrect'}
            </div>
            <div className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 mb-1 sm:mb-1.5">
              {submission.is_correct
                ? `Your time: ${(submission.time_ms / 1000).toFixed(2)}s`
                : `The correct answer was: ${puzzle?.answer}`}
            </div>
            {!submission.is_correct && incorrectPercentage !== null && (
              <div className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">
                {incorrectPercentage.toFixed(1)}% of players also got it wrong
              </div>
            )}
            {submission.is_correct && (
              <>
                {loadingStats ? (
                  <div className="text-xs sm:text-sm text-gray-600 mt-2 sm:mt-4">
                    Loading your ranking...
                  </div>
                ) : (
                  <>
                    {rank !== null && (
                      <div className="mt-2 sm:mt-3 md:mt-4 mb-2 sm:mb-3 md:mb-4">
                        <div className="text-base sm:text-lg md:text-xl font-bold text-blue-600 mb-0.5 sm:mb-1">
                          Today's Rank: #{rank}
                        </div>
                        <div className="text-[10px] sm:text-xs md:text-sm text-gray-600">
                          out of {totalCorrect} correct {totalCorrect === 1 ? 'submission' : 'submissions'}
                        </div>
                      </div>
                    )}

                    {(allTimeRank !== null || averageTime !== null) && (
                      <div className="mt-1.5 sm:mt-2 mb-2 sm:mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-center">
                          <div className="text-[10px] sm:text-xs font-bold text-blue-700 mb-0.5 sm:mb-1">
                            All-Time Stats
                          </div>
                          <div className="flex justify-center items-center gap-2 sm:gap-3 text-[10px] sm:text-xs">
                            {allTimeRank !== null && (
                              <span className="font-semibold text-gray-900">
                                Rank: #{allTimeRank}
                              </span>
                            )}
                            {averageTime !== null && (
                              <span className="font-semibold text-gray-900">
                                Avg: {(averageTime / 1000).toFixed(2)}s
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {pastSubmissions.length > 0 && (
                      <div className="mt-2 sm:mt-3 md:mt-4 pt-2 sm:pt-3 md:pt-4 border-t border-gray-200">
                        <div className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 mb-1.5 sm:mb-2">
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
                      <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-gray-600">
                        This is your first correct submission! 🎉
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          {submitted && submission && !submission.is_correct && !alreadyPlayed && (
            <div className="mt-2 sm:mt-3 md:mt-4 pt-2 sm:pt-3 md:pt-4 border-t border-gray-300 text-center space-y-2 sm:space-y-0 sm:space-x-3 flex flex-col sm:flex-row justify-center items-center">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1 sm:gap-2 bg-red-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-red-700 font-medium text-xs sm:text-sm md:text-base"
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
          {alreadyPlayed && previousSubmission && previousSubmission.is_correct && (
            <div className="mt-2 sm:mt-3 md:mt-4 pt-2 sm:pt-3 md:pt-4 border-t border-gray-300 text-center space-y-2 sm:space-y-0 sm:space-x-3 flex flex-col sm:flex-row justify-center items-center">
              <button
                onClick={() => {
                  if (previousSubmission) {
                    const timeSeconds = (previousSubmission.time_ms / 1000).toFixed(2);
                    const resultText = previousSubmission.is_correct 
                      ? `I solved today's Rebus Race puzzle in ${timeSeconds}s!`
                      : `I tried today's Rebus Race puzzle but didn't get it right.`;
                    const shareText = `I love michael wrede. ${resultText} Can you beat my time?\n\nPlay at: ${window.location.origin}`;

                    navigator.clipboard.writeText(shareText).then(() => {
                      alert('Result copied to clipboard!');
                    }).catch(() => {
                      prompt('Copy this text:', shareText);
                    });
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
            <div className="mt-2 sm:mt-3 md:mt-4 pt-2 sm:pt-3 md:pt-4 border-t border-gray-300 text-center space-y-2 sm:space-y-0 sm:space-x-3 flex flex-col sm:flex-row justify-center items-center">
              <button
                onClick={() => {
                  if (previousSubmission) {
                    const timeSeconds = (previousSubmission.time_ms / 1000).toFixed(2);
                    const resultText = previousSubmission.is_correct 
                      ? `I solved today's Rebus Race puzzle in ${timeSeconds}s!`
                      : `I tried today's Rebus Race puzzle but didn't get it right.`;
                    const shareText = `I love michael wrede. ${resultText} Can you beat my time?\n\nPlay at: ${window.location.origin}`;

                    navigator.clipboard.writeText(shareText).then(() => {
                      alert('Result copied to clipboard!');
                    }).catch(() => {
                      prompt('Copy this text:', shareText);
                    });
                  }
                }}
                className="inline-flex items-center gap-1 sm:gap-2 bg-red-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-red-700 font-medium text-xs sm:text-sm md:text-base"
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
          
          {submission.is_correct && !alreadyPlayed && (
            <div className="mt-2 sm:mt-3 md:mt-4 pt-2 sm:pt-3 md:pt-4 border-t border-gray-200 text-center space-y-2 sm:space-y-0 sm:space-x-3 flex flex-col sm:flex-row justify-center items-center">
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

    </div>
  );
}

export default Today;

