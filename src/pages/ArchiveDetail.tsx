import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Puzzle, Submission } from '../types';
import { getUsername } from '../lib/username';
import { useTimer } from '../contexts/TimerContext';

function ArchiveDetail() {
  const { id } = useParams<{ id: string }>();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState('');
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [anonId, setAnonId] = useState<string>('');
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [previousSubmission, setPreviousSubmission] = useState<Submission | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
  const [totalCorrect, setTotalCorrect] = useState<number>(0);
  const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);
  const [guessCount, setGuessCount] = useState(0);
  const [showHintConfirmation, setShowHintConfirmation] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [clueSuggestion, setClueSuggestion] = useState('');
  const [submittingClue, setSubmittingClue] = useState(false);
  const [clueSubmitted, setClueSubmitted] = useState(false);
  const [incorrectPercentage, setIncorrectPercentage] = useState<number | null>(null);
  const [incorrectCount, setIncorrectCount] = useState<number>(0);
  const [averageTime, setAverageTime] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<Submission[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const { setTimerActive } = useTimer();
  const MAX_GUESSES = 5;
  const MAX_TIME_SECONDS = 300; // 5 minutes
  const HINT_PENALTY_SECONDS = 60; // 1 minute penalty for using hint

  // Save game state to localStorage
  const saveGameState = () => {
    if (puzzle && isReady && !submitted && startTime !== null) {
      const gameStateKey = `rebus_game_state_${puzzle.id}`;
      const currentElapsed = Math.floor((Date.now() - startTime) / 1000);
      const gameState = {
        puzzleId: puzzle.id,
        elapsedTime: currentElapsed,
        wrongGuesses,
        guessCount,
        hintUsed,
        answer,
        isReady: true,
        timestamp: Date.now(),
      };
      localStorage.setItem(gameStateKey, JSON.stringify(gameState));
    }
  };

  // Load game state from localStorage
  const loadGameState = (puzzleId: string): boolean => {
    try {
      const gameStateKey = `rebus_game_state_${puzzleId}`;
      const savedState = localStorage.getItem(gameStateKey);
      if (savedState) {
        const state = JSON.parse(savedState);
        // Only restore if it's for the same puzzle and not too old (within 24 hours)
        const hoursSinceSave = (Date.now() - state.timestamp) / (1000 * 60 * 60);
        if (state.puzzleId === puzzleId && state.isReady && hoursSinceSave < 24) {
          setWrongGuesses(state.wrongGuesses || []);
          setGuessCount(state.guessCount || 0);
          setHintUsed(state.hintUsed || false);
          setAnswer(state.answer || '');
          setIsReady(true);
          // Calculate new startTime based on saved elapsed time
          setStartTime(Date.now() - (state.elapsedTime * 1000));
          setTimerActive(true);
          return true;
        }
      }
    } catch (error) {
      console.error('Error loading game state:', error);
    }
    return false;
  };

  // Clear game state from localStorage
  const clearGameState = () => {
    if (puzzle) {
      const gameStateKey = `rebus_game_state_${puzzle.id}`;
      localStorage.removeItem(gameStateKey);
    }
  };

  useEffect(() => {
    // Get or create anonymous ID
    let anonIdValue = localStorage.getItem('rebus_anon_id');
    if (!anonIdValue) {
      anonIdValue = crypto.randomUUID();
      localStorage.setItem('rebus_anon_id', anonIdValue);
    }
    setAnonId(anonIdValue);

      // Load puzzle using the ID from URL params
      if (id) {
        loadPuzzle(id);
      }

    // Save game state before page unload (refresh/close)
    const handleBeforeUnload = () => {
      saveGameState();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup: save game state and reset timer when component unmounts
    return () => {
      saveGameState();
      setTimerActive(false);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [id, setTimerActive]);

  // Save game state whenever relevant state changes
  useEffect(() => {
    if (puzzle && isReady && !submitted && startTime !== null) {
      saveGameState();
    }
  }, [puzzle, isReady, submitted, startTime, wrongGuesses, guessCount, hintUsed, answer]);

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
                // Save all wrong guesses that were made before timeout
                const username = getUsername();
                for (let i = 0; i < wrongGuesses.length; i++) {
                  await supabase
                    .from('guesses')
                    .insert({
                      puzzle_id: puzzle.id,
                      anon_id: anonId,
                      guess: wrongGuesses[i],
                      is_correct: false,
                      guess_number: i + 1,
                      time_ms: timeMs, // Use timeout time for all guesses
                      username: username || null,
                    });
                }

                // Save the final answer (if any) as a guess
                if (answer.trim()) {
                  await supabase
                    .from('guesses')
                    .insert({
                      puzzle_id: puzzle.id,
                      anon_id: anonId,
                      guess: answer.trim(),
                      is_correct: false,
                      guess_number: wrongGuesses.length + 1,
                      time_ms: timeMs,
                      username: username || null,
                    });
                }

                const { data, error } = await supabase
                  .from('submissions')
                  .insert({
                    puzzle_id: puzzle.id,
                    anon_id: anonId,
                    answer: answer.trim() || '',
                    is_correct: false,
                    time_ms: timeMs,
                    username: username || null,
                    guess_count: MAX_GUESSES, // Timeout = used all guesses
                  })
                  .select()
                  .single();

                if (error) throw error;

                setSubmission(data);
                setSubmitted(true);
                setTimerActive(false); // Re-enable navigation after timeout
                clearGameState(); // Clear saved game state after timeout
                // Don't set alreadyPlayed yet - let the result page show first
                // Load incorrect percentage for timeout
                await loadIncorrectPercentage(puzzle.id);
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
    setTimerActive(true); // Lock in the player - hide nav and prevent navigation
  };

  const handleHintClick = () => {
    setShowHintConfirmation(true);
  };

  const handleHintConfirm = () => {
    if (startTime) {
      // Add 60 seconds to the start time (effectively subtracting from elapsed time)
      setStartTime(startTime - HINT_PENALTY_SECONDS * 1000);
    }
    setHintUsed(true);
    setShowHintConfirmation(false);
  };

  const handleHintCancel = () => {
    setShowHintConfirmation(false);
  };

  const loadPuzzle = async (puzzleId: string) => {
    try {
      const { data, error } = await supabase
        .from('puzzles')
        .select('*')
        .eq('id', puzzleId)
        .single();

      if (error) throw error;
      setPuzzle(data);
      
      // Load leaderboard for this puzzle
      await loadLeaderboard(puzzleId);

      // Check if user has already played this puzzle
      const anonId = localStorage.getItem('rebus_anon_id');
      if (anonId) {
        const { data: existingSubmission, error: submissionError } = await supabase
          .from('submissions')
          .select('*')
          .eq('puzzle_id', puzzleId)
          .eq('anon_id', anonId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingSubmission && !submissionError) {
          setAlreadyPlayed(true);
          setPreviousSubmission(existingSubmission);
          setSubmitted(true);
          setSubmission(existingSubmission);
          clearGameState(); // Clear any saved game state since they already played
          // Load ranking if they got it correct
          if (existingSubmission.is_correct) {
            await loadRankingAndPastResults(puzzleId, existingSubmission.id, existingSubmission.time_ms);
          } else {
            // Load incorrect percentage if they got it wrong
            await loadIncorrectPercentage(puzzleId);
          }
        } else {
          // Try to restore saved game state
          loadGameState(puzzleId);
        }
      }
    } catch (error) {
      console.error('Error loading puzzle:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveGuess = async (guessText: string, isCorrect: boolean, guessNumber: number) => {
    if (!puzzle) return;
    
    try {
      const username = getUsername();
      const endTime = Date.now();
      const timeMs = startTime ? endTime - startTime : 0;

      await supabase
        .from('guesses')
        .insert({
          puzzle_id: puzzle.id,
          anon_id: anonId,
          guess: guessText,
          is_correct: isCorrect,
          guess_number: guessNumber,
          time_ms: timeMs,
          username: username || null,
        });
    } catch (error) {
      console.error('Error saving guess:', error);
      // Don't show alert for guess saving errors - it's not critical
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puzzle || !answer.trim() || submitted || isSubmitting || alreadyPlayed) return;

    const isCorrect = answer.trim().toLowerCase() === puzzle.answer.toLowerCase();
    const currentAnswer = answer.trim();
    const currentGuessNumber = wrongGuesses.length + 1;

    // Save this guess (whether correct or incorrect)
    await saveGuess(currentAnswer, isCorrect, currentGuessNumber);

    if (isCorrect) {
      // Correct answer - submit immediately
      setIsSubmitting(true);
      const endTime = Date.now();
      const timeMs = startTime ? endTime - startTime : 0;
      
      // Calculate guess count: wrong guesses + 1 (the correct guess)
      // If first guess is correct, wrongGuesses.length = 0, so guess_count = 1
      const finalGuessCount = wrongGuesses.length + 1;

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
            guess_count: finalGuessCount,
          })
          .select()
          .single();

        if (error) throw error;

        setSubmission(data);
        setSubmitted(true);
        setTimerActive(false); // Re-enable navigation after submission
        clearGameState(); // Clear saved game state after submission
        // Don't set alreadyPlayed yet - let the result page show first
        // It will be set when they come back later

        // Load ranking and past results for this specific puzzle
        await loadRankingAndPastResults(puzzle.id, data.id, timeMs);
        // Reload leaderboard to include new submission
        await loadLeaderboard(puzzle.id);
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
              guess_count: guessCount + 1,
            })
            .select()
            .single();

          if (error) throw error;

          setSubmission(data);
          setSubmitted(true);
          setTimerActive(false); // Re-enable navigation after submission
          clearGameState(); // Clear saved game state after submission
          // Don't set alreadyPlayed yet - let the result page show first
          // Load incorrect percentage
          await loadIncorrectPercentage(puzzle.id);
        } catch (error) {
          console.error('Error submitting answer:', error);
          alert('Failed to submit answer. Please try again.');
        } finally {
          setIsSubmitting(false);
        }
      }
    }
  };

  const loadRankingAndPastResults = async (puzzleId: string, submissionId: string, _timeMs: number) => {
    setLoadingStats(true);
    try {
      // Get all correct submissions for this puzzle, ordered by time
      const { data: allSubmissions, error: allError } = await supabase
        .from('submissions')
        .select('*')
        .eq('puzzle_id', puzzleId)
        .eq('is_correct', true)
        .order('time_ms', { ascending: true });

      if (allError) throw allError;

      // Find user's rank (1-indexed)
      const userIndex = allSubmissions?.findIndex((s: Submission) => s.id === submissionId) ?? -1;
      const userRank = userIndex >= 0 ? userIndex + 1 : null;
      setRank(userRank);
      setTotalCorrect(allSubmissions?.length || 0);
      
      // Load leaderboard for this puzzle
      await loadLeaderboard(puzzleId);
    } catch (error) {
      console.error('Error loading ranking and past results:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadLeaderboard = async (puzzleId: string) => {
    setLoadingLeaderboard(true);
    try {
      // Get all correct submissions for this puzzle
      const { data: allSubmissions, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('puzzle_id', puzzleId)
        .eq('is_correct', true)
        .order('time_ms', { ascending: true });

      if (error) throw error;

      // Sort by time first, then by guess_count (fewer guesses is better)
      const sorted = (allSubmissions || []).sort((a: Submission, b: Submission) => {
        // First sort by time
        if (a.time_ms !== b.time_ms) {
          return a.time_ms - b.time_ms;
        }
        // If times are equal, sort by guess_count (fewer is better)
        const aGuesses = a.guess_count || 999;
        const bGuesses = b.guess_count || 999;
        return aGuesses - bGuesses;
      });

      setLeaderboard(sorted);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const loadIncorrectPercentage = async (puzzleId: string) => {
    try {
      // Get all submissions for this puzzle
      const { data: allSubmissions, error } = await supabase
        .from('submissions')
        .select('is_correct, time_ms')
        .eq('puzzle_id', puzzleId);

      if (error) throw error;

      if (allSubmissions && allSubmissions.length > 0) {
        const incorrect = allSubmissions.filter((s: Submission) => !s.is_correct);
        const correct = allSubmissions.filter((s: Submission) => s.is_correct);
        
        const incorrectCount = incorrect.length;
        const percentage = (incorrectCount / allSubmissions.length) * 100;
        setIncorrectPercentage(percentage);
        setIncorrectCount(incorrectCount);
        
        // Calculate average time for correct submissions
        if (correct.length > 0) {
          const totalTime = correct.reduce((sum: number, s: Submission) => sum + s.time_ms, 0);
          const avgTime = totalTime / correct.length;
          setAverageTime(avgTime);
        } else {
          setAverageTime(null);
        }
      }
    } catch (error) {
      console.error('Error loading incorrect percentage:', error);
    }
  };

  const handleShare = async () => {
    if (!submission || !puzzle) return;

    const timeSeconds = (submission.time_ms / 1000).toFixed(2);
    const resultText = submission.is_correct 
      ? `I solved a Rebus Race puzzle in ${timeSeconds}s!`
      : `I tried a Rebus Race puzzle but didn't get it right.`;
    const puzzleLink = `${window.location.origin}/archive/${puzzle.id}`;
    const shareText = `I love michael wrede. ${resultText} Can you beat my time?\n\nPlay this puzzle: ${puzzleLink}`;

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

  const handleClueSuggestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!puzzle || !clueSuggestion.trim()) return;

    setSubmittingClue(true);
    try {
      const username = getUsername();
      console.log('Submitting clue suggestion:', {
        puzzle_id: puzzle.id,
        suggestion: clueSuggestion.trim(),
        anon_id: anonId,
        username: username,
      });
      const { error } = await supabase
        .from('clue_suggestions')
        .insert({
          puzzle_id: puzzle.id,
          suggestion: clueSuggestion.trim(),
          anon_id: anonId,
          username: username || null,
        });

      if (error) {
        console.error('Error submitting clue suggestion:', error);
        // Check if it's a table not found error
        if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
          alert('Clue suggestions feature is not available yet. Please try again later.');
        } else {
          alert('Failed to submit clue suggestion. Please try again.');
        }
        return;
      }

      setClueSubmitted(true);
      setClueSuggestion('');
      alert('Thank you for your clue suggestion!');
    } catch (error) {
      console.error('Error submitting clue suggestion:', error);
      alert('Failed to submit clue suggestion. Please try again.');
    } finally {
      setSubmittingClue(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-gray-600">Loading puzzle...</div>
      </div>
    );
  }

  if (!puzzle) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Puzzle Not Found</h1>
        <Link
          to="/archive"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          Back to Archive
        </Link>
      </div>
    );
  }

  // Parse date string directly to avoid timezone issues (same as Archive.tsx)
  const dateParts = puzzle.date.split('T')[0].split('-');
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]) - 1; // 0-indexed
  const day = parseInt(dateParts[2]);
  const puzzleDate = new Date(year, month, day);

  const { isTimerActive } = useTimer();

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-4 pb-2 sm:pb-4">
      {!isTimerActive && !submitted && (
        <Link
          to="/archive"
          className="text-blue-600 hover:text-blue-800 mb-1 sm:mb-2 inline-block text-[10px] sm:text-xs md:text-sm"
        >
          ← Back to Archive
        </Link>
      )}

      <h1 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 mb-1 sm:mb-2">
        Puzzle from {puzzleDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </h1>

      <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-1.5 sm:p-2 md:p-3 mb-2 sm:mb-3">
        <p className="text-[10px] sm:text-xs md:text-sm text-blue-800 font-semibold text-center">
          📊 Archive puzzles contribute to your all-time leaderboard
        </p>
      </div>

      {/* Leaderboard for this puzzle */}
      {puzzle && (
        <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3 text-center">
            Puzzle Leaderboard
          </h2>
          {loadingLeaderboard ? (
            <div className="text-center py-4 text-gray-600 text-sm">
              Loading leaderboard...
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-4 text-gray-600 text-sm">
              No correct submissions yet. Be the first!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rank
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Username
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Guesses
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leaderboard.map((entry, index) => {
                    const currentAnonId = localStorage.getItem('rebus_anon_id');
                    const isCurrentUser = entry.anon_id === currentAnonId;
                    return (
                      <tr
                        key={entry.id}
                        className={`${index < 3 ? 'bg-yellow-50' : ''} ${isCurrentUser ? 'ring-2 ring-blue-500 bg-blue-100' : ''}`}
                      >
                        <td className="px-2 sm:px-3 md:px-4 py-2 whitespace-nowrap">
                          <div className="flex items-center">
                            {index === 0 && <span className="text-lg sm:text-xl mr-1 sm:mr-2">🥇</span>}
                            {index === 1 && <span className="text-lg sm:text-xl mr-1 sm:mr-2">🥈</span>}
                            {index === 2 && <span className="text-lg sm:text-xl mr-1 sm:mr-2">🥉</span>}
                            <span className="text-[10px] sm:text-xs font-medium text-gray-900">
                              #{index + 1}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 whitespace-nowrap">
                          <span className="text-[10px] sm:text-xs font-medium text-gray-900 truncate max-w-[100px] sm:max-w-none">
                            {entry.username || 'Anonymous'}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 whitespace-nowrap">
                          <span className="text-[10px] sm:text-xs text-gray-900 font-semibold">
                            {(entry.time_ms / 1000).toFixed(2)}s
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 whitespace-nowrap">
                          <span className="text-[10px] sm:text-xs text-gray-900 font-semibold">
                            {entry.guess_count || '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {alreadyPlayed && previousSubmission && (
        <div className="bg-gray-100 rounded-lg shadow-md p-2.5 sm:p-3 md:p-4 mb-3 sm:mb-4 opacity-75">
          <div className="text-center mb-2 sm:mb-3">
            <div className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-600 mb-1 sm:mb-2">
              You've already played this puzzle
            </div>
            <div className="mb-2 sm:mb-3">
              <img
                src={puzzle.image_url}
                alt="Rebus puzzle"
                className="w-full rounded-lg border-2 border-gray-300 opacity-60"
              />
            </div>
            <div className="text-center">
              <div
                className={`text-xl sm:text-2xl md:text-3xl mb-1 sm:mb-2 ${
                  previousSubmission.is_correct ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {previousSubmission.is_correct ? '✓ Correct!' : '✗ Incorrect'}
              </div>
              <div className="text-sm sm:text-base md:text-lg font-semibold text-gray-900">
                {previousSubmission.is_correct
                  ? `Your time: ${(previousSubmission.time_ms / 1000).toFixed(2)}s`
                  : `The correct answer was: ${puzzle.answer}`}
              </div>
              {previousSubmission.is_correct && (
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
                            Rank: #{rank}
                          </div>
                          <div className="text-[10px] sm:text-xs md:text-sm text-gray-600">
                            out of {totalCorrect} {totalCorrect === 1 ? 'person' : 'people'} got it right
                          </div>
                        </div>
                      )}

                      <div className="mt-2 sm:mt-3 md:mt-4 space-y-2 sm:space-y-3">
                        {incorrectCount > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-2 sm:p-3">
                            <div className="text-xs sm:text-sm font-semibold text-red-700">
                              {incorrectCount} {incorrectCount === 1 ? 'person' : 'people'} got it wrong
                            </div>
                          </div>
                        )}
                        
                        {averageTime !== null && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3">
                            <div className="text-xs sm:text-sm font-semibold text-blue-700">
                              Average buzz time: {(averageTime / 1000).toFixed(2)}s
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
              {!previousSubmission.is_correct && incorrectPercentage !== null && (
                <div className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">
                  {incorrectPercentage.toFixed(1)}% of players also got it wrong
                </div>
              )}
              <div className="mt-2 sm:mt-3 md:mt-4 pt-2 sm:pt-3 md:pt-4 border-t border-gray-300 text-center space-y-2 sm:space-y-0 sm:space-x-3 flex flex-col sm:flex-row justify-center items-center">
                <button
                  onClick={() => {
                    if (previousSubmission && puzzle) {
                      const timeSeconds = (previousSubmission.time_ms / 1000).toFixed(2);
                      const resultText = previousSubmission.is_correct 
                        ? `I solved a Rebus Race puzzle in ${timeSeconds}s!`
                        : `I tried a Rebus Race puzzle but didn't get it right.`;
                      const puzzleLink = `${window.location.origin}/archive/${puzzle.id}`;
                      const shareText = `I love michael wrede. ${resultText} Can you beat my time?\n\nPlay this puzzle: ${puzzleLink}`;

                      navigator.clipboard.writeText(shareText).then(() => {
                        alert('Result copied to clipboard!');
                      }).catch(() => {
                        prompt('Copy this text:', shareText);
                      });
                    }
                  }}
                  className={`inline-flex items-center gap-1 sm:gap-2 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md font-medium text-xs sm:text-sm md:text-base ${
                    previousSubmission.is_correct 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  <span>📤</span> <span>Share Result</span>
                </button>
                <Link
                  to="/archive"
                  className="inline-flex items-center gap-1 sm:gap-2 bg-blue-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-blue-700 font-medium text-xs sm:text-sm md:text-base"
                >
                  <span>📚</span> <span>Play more</span>
                </Link>
              </div>
              {previousSubmission && (
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-300">
                  <p className="text-xs sm:text-sm text-gray-700 mb-2 text-center">Have clue suggestions?</p>
                  {!clueSubmitted ? (
                    <form onSubmit={handleClueSuggestionSubmit} className="space-y-2" noValidate>
                      <input
                        type="text"
                        value={clueSuggestion}
                        onChange={(e) => setClueSuggestion(e.target.value)}
                        placeholder="Enter your suggestion..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        autoComplete="off"
                      />
                      <button
                        type="submit"
                        disabled={submittingClue || !clueSuggestion.trim()}
                        className="w-full px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {submittingClue ? 'Sending...' : 'Submit'}
                      </button>
                    </form>
                  ) : (
                    <p className="text-xs sm:text-sm text-green-600 text-center">Thank you for your suggestion!</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!submitted && !alreadyPlayed && (
        <div className="bg-white rounded-lg shadow-md p-2 sm:p-3 md:p-4 mb-2 sm:mb-3">
          {!isReady ? (
            <div className="text-center py-3 sm:py-4">
              <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 mb-2 sm:mb-3">
                Are you ready?
              </h2>
              <p className="text-[10px] sm:text-xs text-gray-600 mb-3 sm:mb-4">
                Once you start, you'll have 5 guesses to solve the puzzle
              </p>
              <button
                onClick={handleReady}
                className="bg-blue-600 text-white py-2 sm:py-2.5 px-5 sm:px-8 rounded-lg hover:bg-blue-700 font-bold text-sm sm:text-base md:text-lg shadow-lg"
              >
                Start Timer! ⏱️
              </button>
              <button
                onClick={() => setShowRules(true)}
                className="mt-2 sm:mt-3 text-gray-600 hover:text-gray-800 text-xs sm:text-sm italic py-0.5 px-2 border border-gray-300 rounded hover:border-gray-400 bg-transparent"
              >
                Rules
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

              {/* Hint button - appears after 4 guesses */}
              {guessCount >= 4 && puzzle?.hint && !hintUsed && !submitted && (
                <div className="mb-2">
                  <button
                    onClick={handleHintClick}
                    className="w-full bg-purple-500 text-white py-2 px-4 rounded-md hover:bg-purple-600 font-medium text-xs sm:text-sm shadow-md"
                  >
                    💡 Get Hint (Adds 1 minute to your time)
                  </button>
                </div>
              )}

              {/* Hint display - shown after hint is used */}
              {hintUsed && puzzle?.hint && (
                <div className="mb-2 p-3 bg-purple-50 border-2 border-purple-300 rounded-lg">
                  <div className="text-[10px] sm:text-xs font-semibold text-purple-800 mb-1">
                    💡 Hint:
                  </div>
                  <div className="text-xs sm:text-sm text-purple-900">
                    {puzzle.hint}
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

      {/* Hint Confirmation Dialog */}
      {showHintConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 sm:p-6">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-3">
              Use Hint?
            </h3>
            <p className="text-sm sm:text-base text-gray-700 mb-4">
              Using a hint will add <span className="font-semibold text-red-600">1 minute (60 seconds)</span> to your time.
              Are you sure you want to continue?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleHintCancel}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleHintConfirm}
                className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 font-medium text-sm"
              >
                Yes, Use Hint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Modal - Cute Letter */}
      {showRules && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowRules(false)}>
          <div className="bg-amber-50 rounded-lg shadow-2xl max-w-lg w-full p-6 sm:p-8 relative border-2 border-amber-200" onClick={(e) => e.stopPropagation()} style={{ fontFamily: 'Georgia, serif' }}>
            <button
              onClick={() => setShowRules(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-amber-100 transition-colors"
            >
              ×
            </button>
            <div className="pr-8">
              <div className="text-center mb-4">
                <div className="text-xs sm:text-sm text-amber-700 italic">A letter from Michael</div>
              </div>
              <div className="space-y-3 text-sm sm:text-base text-gray-800 leading-relaxed">
                <p>
                  A rebus puzzle is a centuries old tradition dating back to the.... <span className="italic">WHO CARES</span>... it's images put together meant to be a bit of a riddle.
                </p>
                <p>
                  It's tricky, and created by hand by me, <span className="font-semibold text-amber-800">michael wrede</span>, so may the best rebus puzzler win!
                </p>
                <p>
                  Send me a message at{' '}
                  <a href="mailto:mwrede8@gmail.com" className="text-blue-600 hover:text-blue-800 underline font-semibold">
                    mwrede8@gmail.com
                  </a>{' '}
                  if you have thoughts about the game.
                </p>
                <div className="mt-6 pt-4 border-t border-amber-300 text-right">
                  <p className="text-amber-900 font-semibold">
                    Love,
                  </p>
                  <p className="text-amber-900 font-semibold text-lg">
                    Michael
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {submitted && submission && !alreadyPlayed && (
        <div className={`rounded-lg shadow-md p-2.5 sm:p-3 md:p-4 lg:p-6 bg-white`}>
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
                : `The correct answer was: ${puzzle.answer}`}
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
                          Rank: #{rank}
                        </div>
                        <div className="text-[10px] sm:text-xs md:text-sm text-gray-600">
                          out of {totalCorrect} {totalCorrect === 1 ? 'person' : 'people'} got it right
                        </div>
                      </div>
                    )}

                    <div className="mt-2 sm:mt-3 md:mt-4 space-y-2 sm:space-y-3">
                      {incorrectCount > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2 sm:p-3">
                          <div className="text-xs sm:text-sm font-semibold text-red-700">
                            {incorrectCount} {incorrectCount === 1 ? 'person' : 'people'} got it wrong
                          </div>
                        </div>
                      )}
                      
                      {averageTime !== null && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3">
                          <div className="text-xs sm:text-sm font-semibold text-blue-700">
                            Average buzz time: {(averageTime / 1000).toFixed(2)}s
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
            <div className="text-xs sm:text-sm text-gray-600 mt-2 sm:mt-3">
              (This result does not count toward leaderboards)
            </div>
          </div>
          {submission.is_correct && (
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
                <span>📚</span> <span>Play more</span>
              </Link>
            </div>
          )}
          {submission.is_correct && (
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-300">
              <p className="text-xs sm:text-sm text-gray-700 mb-2 text-center">Have clue suggestions?</p>
              {!clueSubmitted ? (
                <form onSubmit={handleClueSuggestionSubmit} className="space-y-2">
                  <input
                    type="text"
                    value={clueSuggestion}
                    onChange={(e) => setClueSuggestion(e.target.value)}
                    placeholder="Enter your suggestion..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={submittingClue || !clueSuggestion.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {submittingClue ? 'Sending...' : 'Submit'}
                  </button>
                </form>
              ) : (
                <p className="text-xs sm:text-sm text-green-600 text-center">Thank you for your suggestion!</p>
              )}
            </div>
          )}
          {!submission.is_correct && (
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
                <span>📚</span> <span>Play more</span>
              </Link>
            </div>
          )}
          {!submission.is_correct && (
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-300">
              <p className="text-xs sm:text-sm text-gray-700 mb-2 text-center">Have clue suggestions?</p>
              {!clueSubmitted ? (
                <form onSubmit={handleClueSuggestionSubmit} className="space-y-2">
                  <input
                    type="text"
                    value={clueSuggestion}
                    onChange={(e) => setClueSuggestion(e.target.value)}
                    placeholder="Enter your suggestion..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={submittingClue || !clueSuggestion.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {submittingClue ? 'Sending...' : 'Submit'}
                  </button>
                </form>
              ) : (
                <p className="text-xs sm:text-sm text-green-600 text-center">Thank you for your suggestion!</p>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default ArchiveDetail;
