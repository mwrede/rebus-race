import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Puzzle, Submission } from '../types';
import { incrementWin } from '../lib/stats';
import { getUsername } from '../lib/username';
import { useTimer } from '../contexts/TimerContext';

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
  const [showHintConfirmation, setShowHintConfirmation] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [clueSuggestion, setClueSuggestion] = useState('');
  const [submittingClue, setSubmittingClue] = useState(false);
  const [clueSubmitted, setClueSubmitted] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [submittingEmail, setSubmittingEmail] = useState(false);
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [userHasEmail, setUserHasEmail] = useState(false);
  const [showPrivacyNote, setShowPrivacyNote] = useState(false);
  const { setTimerActive } = useTimer();
  const MAX_GUESSES = 5;
  const MAX_TIME_SECONDS = 300; // 5 minutes
  const HINT_PENALTY_SECONDS = 60; // 1 minute penalty for using hint
  const GAME_STATE_KEY = 'rebus_game_state_today';

  // Save game state to localStorage
  const saveGameState = () => {
    if (puzzle && isReady && !submitted && startTime !== null) {
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
      localStorage.setItem(GAME_STATE_KEY, JSON.stringify(gameState));
    }
  };

  // Load game state from localStorage
  const loadGameState = (puzzleId: string): boolean => {
    try {
      const savedState = localStorage.getItem(GAME_STATE_KEY);
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
    localStorage.removeItem(GAME_STATE_KEY);
  };

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
    checkUserEmail();

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
  }, [setTimerActive]);

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
                    guess_count: MAX_GUESSES,
                  })
                  .select()
                  .single();

                if (error) throw error;

                setSubmission(data);
                setSubmitted(true);
                setTimerActive(false); // Re-enable navigation after timeout
                clearGameState(); // Clear saved game state after timeout
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
            clearGameState(); // Clear any saved game state since they already played
            
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
            // Try to restore saved game state
            const restored = loadGameState(data.id);
            if (!restored) {
              // Don't start timer yet - wait for user to click "ready"
              setIsReady(false);
            }
          }
        } else {
          // Try to restore saved game state
          const restored = loadGameState(data.id);
          if (!restored) {
            // Don't start timer yet - wait for user to click "ready"
            setIsReady(false);
          }
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
      // Get today's date in local timezone (YYYY-MM-DD format) - same as loadTodayPuzzle
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
          // First sort by number of wins (descending - most wins first)
          if (a.puzzlesWon !== b.puzzlesWon) {
            return b.puzzlesWon - a.puzzlesWon;
          }
          // If wins are equal, sort by average time (ascending - fastest first)
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

  const getGuessEmojis = (guessCount: number, isCorrect: boolean): string => {
    if (!isCorrect) {
      // For incorrect, show all X emojis
      return '❌'.repeat(Math.min(guessCount, 5));
    }
    // For correct, show checkmarks for correct guesses
    return '✅'.repeat(guessCount) + '⬜'.repeat(5 - guessCount);
  };

  const handleShare = async () => {
    if (!submission || !puzzle) return;

    const timeSeconds = (submission.time_ms / 1000).toFixed(2);
    const guessEmojis = getGuessEmojis(submission.guess_count || 0, submission.is_correct);
    const rankText = submission.is_correct && rank ? ` Rank #${rank}` : '';
    const shareText = `Rebus Race ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}\n\n${guessEmojis}\n\nTime: ${timeSeconds}s${rankText}\n\n${window.location.origin}`;

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

  const checkUserEmail = async () => {
    const anonId = localStorage.getItem('rebus_anon_id');
    if (!anonId) {
      setUserHasEmail(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('email')
        .eq('anon_id', anonId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking user email:', error);
        return;
      }

      setUserHasEmail(!!data?.email);
    } catch (error) {
      console.error('Error checking user email:', error);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!emailInput.trim()) {
      alert('Please enter an email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput.trim())) {
      alert('Please enter a valid email address');
      return;
    }

    setSubmittingEmail(true);
    try {
      const anonId = localStorage.getItem('rebus_anon_id');
      if (!anonId) {
        alert('Please refresh the page and try again');
        return;
      }

      const { error } = await supabase
        .from('users')
        .upsert({
          anon_id: anonId,
          email: emailInput.trim(),
        }, {
          onConflict: 'anon_id'
        });

      if (error) {
        console.error('Error submitting email:', error);
        alert('Failed to submit email. Please try again.');
        return;
      }

      setEmailSubmitted(true);
      setUserHasEmail(true);
      setEmailInput('');
      alert('Thank you! I can now send you daily reminders.');
    } catch (error) {
      console.error('Error submitting email:', error);
      alert('Failed to submit email. Please try again.');
    } finally {
      setSubmittingEmail(false);
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

      // Get today's date in local timezone (YYYY-MM-DD format) - same as loadTodayPuzzle
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
    if (!puzzle || !answer.trim() || submitted || isSubmitting) return;

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
              guess_count: guessCount + 1,
            })
            .select()
            .single();

          if (error) throw error;

          setSubmission(data);
          setSubmitted(true);
          setTimerActive(false); // Re-enable navigation after submission
          clearGameState(); // Clear saved game state after submission
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

  // Get today's date in a nice format
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-4 pb-2 sm:pb-4">
      <h1 
        className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-1 sm:mb-1.5 text-center"
        style={{
          fontFamily: 'Arial, sans-serif',
          textShadow: '2px 2px 4px rgba(0,0,0,0.2)',
          letterSpacing: '0.1em',
          color: '#2563eb',
          marginTop: '0',
          paddingTop: '0.5rem'
        }}
      >
        {dateStr}
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
                Once you start, you'll have 5 guesses to solve the puzzle
              </p>
              <button
                onClick={handleReady}
                className="bg-blue-600 text-white py-2 sm:py-3 px-6 sm:px-8 md:px-12 rounded-lg hover:bg-blue-700 font-bold text-base sm:text-lg md:text-xl shadow-lg"
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
          <div 
            className="max-w-lg w-full p-6 sm:p-8 relative shadow-2xl" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              fontFamily: 'Georgia, serif',
              background: 'linear-gradient(to bottom, #fef9e7 0%, #fef5e7 100%)',
              backgroundImage: `
                repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px),
                repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)
              `,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(139, 69, 19, 0.2)',
            }}
          >
            <button
              onClick={() => setShowRules(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-amber-100 transition-colors z-10"
            >
              ×
            </button>
            <div className="pr-8">
              <div className="text-center mb-4">
                <div className="text-xs sm:text-sm text-amber-700 italic" style={{ color: '#8b4513' }}>A letter from Michael</div>
              </div>
              <div className="space-y-3 text-sm sm:text-base leading-relaxed" style={{ color: '#3d2817' }}>
                <p>
                  A rebus puzzle is a centuries old tradition dating back to the.... <span className="italic">WHO CARES</span>... it's images put together meant to be a bit of a riddle.
                </p>
                <p>
                  It's tricky, and created by hand by me, <span className="font-semibold" style={{ color: '#8b4513' }}>michael wrede</span>, so may the best rebus puzzler win!
                </p>
                <p>
                  Send me a message at{' '}
                  <a href="mailto:mwrede8@gmail.com" className="text-blue-600 hover:text-blue-800 underline font-semibold">
                    mwrede8@gmail.com
                  </a>{' '}
                  if you have thoughts about the game.
                </p>
                <div className="mt-6 pt-4 border-t" style={{ borderColor: 'rgba(139, 69, 19, 0.3)' }}>
                  <p className="font-semibold mb-1" style={{ color: '#8b4513' }}>
                    Love,
                  </p>
                  <p className="font-semibold text-lg" style={{ color: '#8b4513' }}>
                    Michael
                  </p>
                </div>
              </div>
            </div>
          </div>
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
                to="/leaderboard"
                className="inline-flex items-center gap-1 sm:gap-2 bg-yellow-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-yellow-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>🏆</span> <span>Go to Leaderboard</span>
              </Link>
              <Link
                to="/archive"
                className="inline-flex items-center gap-1 sm:gap-2 bg-blue-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-blue-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>📚</span> <span>Play more</span>
              </Link>
            </div>
          )}
          {submitted && submission && !submission.is_correct && !alreadyPlayed && (
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
          {submitted && submission && !submission.is_correct && !alreadyPlayed && !userHasEmail && (
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-300">
              <p className="text-xs sm:text-sm text-gray-700 mb-2 text-center">
                <span 
                  className="italic cursor-pointer underline hover:text-blue-600"
                  onClick={() => setShowPrivacyNote(true)}
                >
                  Do you want a daily reminder?
                </span>
              </p>
              {!emailSubmitted ? (
                <form onSubmit={handleEmailSubmit} className="space-y-2" noValidate>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Enter your email..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoComplete="email"
                  />
                  <button
                    type="submit"
                    disabled={submittingEmail || !emailInput.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {submittingEmail ? 'Sending...' : 'Submit'}
                  </button>
                </form>
              ) : (
                <p className="text-xs sm:text-sm text-green-600 text-center">Thank you! I can now send you daily reminders.</p>
              )}
            </div>
          )}
          {alreadyPlayed && previousSubmission && previousSubmission.is_correct && (
            <div className="mt-2 sm:mt-3 md:mt-4 pt-2 sm:pt-3 md:pt-4 border-t border-gray-300 text-center space-y-2 sm:space-y-0 sm:space-x-3 flex flex-col sm:flex-row justify-center items-center">
              <button
                onClick={() => {
                  if (previousSubmission) {
                    const timeSeconds = (previousSubmission.time_ms / 1000).toFixed(2);
                    const guessEmojis = getGuessEmojis(previousSubmission.guess_count || 0, previousSubmission.is_correct);
                    const rankText = previousSubmission.is_correct && rank ? ` Rank #${rank}` : '';
                    const today = new Date();
                    const shareText = `Rebus Race ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}\n\n${guessEmojis}\n\nTime: ${timeSeconds}s${rankText}\n\n${window.location.origin}`;

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
                to="/leaderboard"
                className="inline-flex items-center gap-1 sm:gap-2 bg-yellow-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-yellow-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>🏆</span> <span>Go to Leaderboard</span>
              </Link>
              <Link
                to="/archive"
                className="inline-flex items-center gap-1 sm:gap-2 bg-blue-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-blue-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>📚</span> <span>Play more</span>
              </Link>
            </div>
          )}
          {alreadyPlayed && previousSubmission && previousSubmission.is_correct && (
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
          {alreadyPlayed && previousSubmission && previousSubmission.is_correct && !userHasEmail && (
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-300">
              <p className="text-xs sm:text-sm text-gray-700 mb-2 text-center">
                <span 
                  className="italic cursor-pointer underline hover:text-blue-600"
                  onClick={() => setShowPrivacyNote(true)}
                >
                  Do you want a daily reminder?
                </span>
              </p>
              {!emailSubmitted ? (
                <form onSubmit={handleEmailSubmit} className="space-y-2" noValidate>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Enter your email..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoComplete="email"
                  />
                  <button
                    type="submit"
                    disabled={submittingEmail || !emailInput.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {submittingEmail ? 'Sending...' : 'Submit'}
                  </button>
                </form>
              ) : (
                <p className="text-xs sm:text-sm text-green-600 text-center">Thank you! I can now send you daily reminders.</p>
              )}
            </div>
          )}
          {alreadyPlayed && previousSubmission && !previousSubmission.is_correct && (
            <div className="mt-2 sm:mt-3 md:mt-4 pt-2 sm:pt-3 md:pt-4 border-t border-gray-300 text-center space-y-2 sm:space-y-0 sm:space-x-3 flex flex-col sm:flex-row justify-center items-center">
              <button
                onClick={() => {
                  if (previousSubmission) {
                    const timeSeconds = (previousSubmission.time_ms / 1000).toFixed(2);
                    const guessEmojis = getGuessEmojis(previousSubmission.guess_count || 0, previousSubmission.is_correct);
                    const rankText = previousSubmission.is_correct && rank ? ` Rank #${rank}` : '';
                    const today = new Date();
                    const shareText = `Rebus Race ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}\n\n${guessEmojis}\n\nTime: ${timeSeconds}s${rankText}\n\n${window.location.origin}`;

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
                to="/leaderboard"
                className="inline-flex items-center gap-1 sm:gap-2 bg-yellow-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-yellow-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>🏆</span> <span>Go to Leaderboard</span>
              </Link>
              <Link
                to="/archive"
                className="inline-flex items-center gap-1 sm:gap-2 bg-blue-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-blue-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>📚</span> <span>Play more</span>
              </Link>
            </div>
          )}
          {alreadyPlayed && previousSubmission && !previousSubmission.is_correct && (
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
          {alreadyPlayed && previousSubmission && !previousSubmission.is_correct && !userHasEmail && (
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-300">
              <p className="text-xs sm:text-sm text-gray-700 mb-2 text-center">
                <span 
                  className="italic cursor-pointer underline hover:text-blue-600"
                  onClick={() => setShowPrivacyNote(true)}
                >
                  Do you want a daily reminder?
                </span>
              </p>
              {!emailSubmitted ? (
                <form onSubmit={handleEmailSubmit} className="space-y-2" noValidate>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Enter your email..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoComplete="email"
                  />
                  <button
                    type="submit"
                    disabled={submittingEmail || !emailInput.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {submittingEmail ? 'Sending...' : 'Submit'}
                  </button>
                </form>
              ) : (
                <p className="text-xs sm:text-sm text-green-600 text-center">Thank you! I can now send you daily reminders.</p>
              )}
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
                to="/leaderboard"
                className="inline-flex items-center gap-1 sm:gap-2 bg-yellow-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-yellow-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>🏆</span> <span>Go to Leaderboard</span>
              </Link>
              <Link
                to="/archive"
                className="inline-flex items-center gap-1 sm:gap-2 bg-blue-600 text-white py-1.5 sm:py-2 px-4 sm:px-6 rounded-md hover:bg-blue-700 font-medium text-xs sm:text-sm md:text-base"
              >
                <span>📚</span> <span>Go to Archive</span>
              </Link>
            </div>
          )}
          {submission.is_correct && !alreadyPlayed && (
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
          {submission.is_correct && !alreadyPlayed && !userHasEmail && (
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-300">
              <p className="text-xs sm:text-sm text-gray-700 mb-2 text-center">
                <span 
                  className="italic cursor-pointer underline hover:text-blue-600"
                  onClick={() => setShowPrivacyNote(true)}
                >
                  Do you want a daily reminder?
                </span>
              </p>
              {!emailSubmitted ? (
                <form onSubmit={handleEmailSubmit} className="space-y-2" noValidate>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Enter your email..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoComplete="email"
                  />
                  <button
                    type="submit"
                    disabled={submittingEmail || !emailInput.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {submittingEmail ? 'Sending...' : 'Submit'}
                  </button>
                </form>
              ) : (
                <p className="text-xs sm:text-sm text-green-600 text-center">Thank you! I can now send you daily reminders.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Privacy Note Modal */}
      {showPrivacyNote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowPrivacyNote(false)}>
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 sm:p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPrivacyNote(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              ×
            </button>
            <div className="pr-8">
              <p className="text-sm sm:text-base text-gray-800 leading-relaxed">
                I wont use this for anything other than messaging you a reminder <3. I promise
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Today;

