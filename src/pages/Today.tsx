import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Puzzle, Submission } from '../types';
import { incrementWin } from '../lib/stats';
import { getUsername } from '../lib/auth';
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
  const [pastSubmissions, setPastSubmissions] = useState<Submission[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [previousSubmission, setPreviousSubmission] = useState<Submission | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [allTimeRank, setAllTimeRank] = useState<number | null>(null);
  const [previousAllTimeRank, setPreviousAllTimeRank] = useState<number | null>(null);
  const [incorrectPercentage, setIncorrectPercentage] = useState<number | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [todayLeaderboardEntries, setTodayLeaderboardEntries] = useState<Array<{ rank: number; username: string | null; time: number }>>([]);
  const [allTimeLeaderboardEntries, setAllTimeLeaderboardEntries] = useState<Array<{ rank: number; username: string | null; wins: number }>>([]);
  const [averageTimeToday, setAverageTimeToday] = useState<number | null>(null);
  const [averageGuessesToday, setAverageGuessesToday] = useState<number | null>(null);
  const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);
  const [guessCount, setGuessCount] = useState(0);
  const [showHintConfirmation, setShowHintConfirmation] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showCreateRebus, setShowCreateRebus] = useState(false);
  const [rebusImage, setRebusImage] = useState<File | null>(null);
  const [rebusAnswer, setRebusAnswer] = useState('');
  const [submittingRebus, setSubmittingRebus] = useState(false);
  const [rebusSubmitted, setRebusSubmitted] = useState(false);
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
          const restoredWrongGuesses = state.wrongGuesses || [];
          setWrongGuesses(restoredWrongGuesses);
          setGuessCount(restoredWrongGuesses.length); // Ensure guessCount matches wrongGuesses.length
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
      // Save current rank as previous rank before updating
      if (allTimeRank !== null) {
        setPreviousAllTimeRank(allTimeRank);
      }

      // Get today's date in local timezone (YYYY-MM-DD format) - same as loadTodayPuzzle
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;

      // Get all puzzles to check which are archive (date < today)
      const { data: puzzles, error: puzzlesError } = await supabase
        .from('puzzles')
        .select('id, date')
        .order('date', { ascending: false });

      if (puzzlesError) throw puzzlesError;

      const archivePuzzleIds = new Set(
        puzzles?.filter((p: { date: string }) => p.date.split('T')[0] < today).map((p: { id: string }) => p.id) || []
      );

      // Calculate streak: consecutive daily puzzles correct
      const dailyPuzzles = puzzles?.filter((p: { id: string; date: string }) => !archivePuzzleIds.has(p.id)) || [];
      dailyPuzzles.sort((a: { id: string; date: string }, b: { id: string; date: string }) => b.date.localeCompare(a.date));

      // Get user's submissions for daily puzzles
      const { data: userSubmissions, error: userSubError } = await supabase
        .from('submissions')
        .select('puzzle_id, is_correct, created_at')
        .eq('anon_id', anonId)
        .order('created_at', { ascending: false });

      if (userSubError) throw userSubError;

      const submissionMap = new Map<string, boolean>();
      (userSubmissions || []).forEach((s: Submission) => {
        if (!archivePuzzleIds.has(s.puzzle_id) && !submissionMap.has(s.puzzle_id)) {
          submissionMap.set(s.puzzle_id, s.is_correct);
        }
      });

      let currentStreak = 0;
      for (const puzzle of dailyPuzzles) {
        const result = submissionMap.get(puzzle.id);
        if (result === true) {
          currentStreak++;
        } else if (result === false || result === undefined) {
          break;
        }
      }
      setStreak(currentStreak);

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

      // Find user's rank
      const userEntry = entries.findIndex((entry) => entry.anon_id === anonId);
      if (userEntry !== -1) {
        const userRank = userEntry + 1;
        setAllTimeRank(userRank);

        // Get mini leaderboard: person above, user, person below
        const miniLeaderboard: Array<{ rank: number; username: string | null; wins: number }> = [];
        
        // Person above (if exists)
        if (userEntry > 0) {
          const above = entries[userEntry - 1];
          miniLeaderboard.push({
            rank: userRank - 1,
            username: above.username,
            wins: above.puzzlesWon,
          });
        }
        
        // User
        const user = entries[userEntry];
        miniLeaderboard.push({
          rank: userRank,
          username: user.username,
          wins: user.puzzlesWon,
        });
        
        // Person below (if exists)
        if (userEntry < entries.length - 1) {
          const below = entries[userEntry + 1];
          miniLeaderboard.push({
            rank: userRank + 1,
            username: below.username,
            wins: below.puzzlesWon,
          });
        }
        
        setAllTimeLeaderboardEntries(miniLeaderboard);
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

      const username = getUsername();

      const { data, error } = await supabase
        .from('users')
        .upsert({
          anon_id: anonId,
          username: username || null,
          email: emailInput.trim(),
        }, {
          onConflict: 'anon_id'
        })
        .select();

      if (error) {
        console.error('Error submitting email:', error);
        alert('Failed to submit email. Please try again.');
        return;
      }

      console.log('Email successfully saved to users table:', data);
      setEmailSubmitted(true);
      setUserHasEmail(true);
      setEmailInput('');
      setShowPrivacyNote(false);
      alert('Thank you! I can now send you daily reminders.');
    } catch (error) {
      console.error('Error submitting email:', error);
      alert('Failed to submit email. Please try again.');
    } finally {
      setSubmittingEmail(false);
    }
  };

  const handleCreateRebusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!rebusAnswer.trim() && !rebusImage) {
      alert('Please provide either an answer/clue or upload an image');
      return;
    }

    setSubmittingRebus(true);
    try {
      const username = getUsername();
      let imageUrl: string | null = null;

      // Upload image if provided
      if (rebusImage) {
        const timestamp = Date.now();
        const fileExt = rebusImage.name.split('.').pop()?.toLowerCase();
        
        // Check if file is JPG (policy only allows JPG)
        if (fileExt !== 'jpg' && fileExt !== 'jpeg') {
          alert('Only JPG/JPEG images are allowed. Please convert your image to JPG format.');
          setSubmittingRebus(false);
          return;
        }
        
        // Upload to public folder (required by policy)
        const fileName = `public/rebus-submission-${timestamp}.jpg`;

        console.log('Attempting to upload image:', {
          fileName,
          fileSize: rebusImage.size,
          fileType: rebusImage.type,
          bucket: 'Image Upload',
          path: fileName
        });

        const { error: uploadError, data: uploadData } = await supabase.storage
          .from('Image Upload')
          .upload(fileName, rebusImage, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error details:', {
            message: uploadError.message,
            statusCode: uploadError.statusCode,
            error: uploadError
          });
          
          alert(`Failed to upload image: ${uploadError.message || 'Unknown error'}. Please check the console for details and try again.`);
          setSubmittingRebus(false);
          return;
        }

        if (!uploadData) {
          console.error('Upload succeeded but no data returned');
          alert('Image upload completed but no data was returned. Please try again.');
          setSubmittingRebus(false);
          return;
        }

        console.log('Image uploaded successfully:', uploadData);
        
        // Get the public URL
        const { data: urlData } = supabase.storage
          .from('Image Upload')
          .getPublicUrl(fileName);

        if (!urlData || !urlData.publicUrl) {
          console.error('Failed to get public URL for uploaded image');
          alert('Image uploaded but failed to get public URL. Please try again.');
          setSubmittingRebus(false);
          return;
        }

        imageUrl = urlData.publicUrl;
        console.log('Image URL:', imageUrl);
      }

      // Save to image_submissions table
      const submissionData = {
        username: username || null,
        image_url: imageUrl,
        answer: rebusAnswer.trim() || null,
      };
      
      console.log('Saving to database:', submissionData);
      
      const { data: insertData, error: dbError } = await supabase
        .from('image_submissions')
        .insert(submissionData)
        .select();

      if (dbError) {
        console.error('Database error details:', {
          message: dbError.message,
          details: dbError.details,
          hint: dbError.hint,
          code: dbError.code,
          error: dbError
        });
        alert(`Failed to save rebus submission: ${dbError.message || 'Unknown error'}. Please check the console for details.`);
        return;
      }

      console.log('Successfully saved to database:', insertData);

      setRebusSubmitted(true);
      setRebusImage(null);
      setRebusAnswer('');
      setShowCreateRebus(false);
      alert('Thank you for your rebus submission!');
    } catch (error) {
      console.error('Error submitting rebus:', error);
      alert('Failed to submit rebus. Please try again.');
    } finally {
      setSubmittingRebus(false);
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

      // Calculate average time and average guesses for today's puzzle
      if (allSubmissions && allSubmissions.length > 0) {
        const totalTime = allSubmissions.reduce((sum: number, s: Submission) => sum + s.time_ms, 0);
        const avgTime = totalTime / allSubmissions.length;
        setAverageTimeToday(avgTime);

        const submissionsWithGuesses = allSubmissions.filter((s: Submission) => s.guess_count !== null && s.guess_count !== undefined);
        if (submissionsWithGuesses.length > 0) {
          const totalGuesses = submissionsWithGuesses.reduce((sum: number, s: Submission) => sum + (s.guess_count || 0), 0);
          const avgGuesses = totalGuesses / submissionsWithGuesses.length;
          setAverageGuessesToday(avgGuesses);
        }
      }

      // Find user's rank (1-indexed)
      const userIndex = allSubmissions?.findIndex((s: Submission) => s.id === submissionId) ?? -1;
      const userRank = userIndex !== -1 ? userIndex + 1 : null;
      setRank(userRank);

      // Get mini leaderboard: person above, user, person below
      if (userIndex !== -1 && allSubmissions) {
        const miniLeaderboard: Array<{ rank: number; username: string | null; time: number }> = [];
        
        // Person above (if exists)
        if (userIndex > 0) {
          const above = allSubmissions[userIndex - 1];
          miniLeaderboard.push({
            rank: userIndex,
            username: above.username,
            time: above.time_ms,
          });
        }
        
        // User
        const user = allSubmissions[userIndex];
        miniLeaderboard.push({
          rank: userRank!,
          username: user.username,
          time: user.time_ms,
        });
        
        // Person below (if exists)
        if (userIndex < allSubmissions.length - 1) {
          const below = allSubmissions[userIndex + 1];
          miniLeaderboard.push({
            rank: userRank! + 1,
            username: below.username,
            time: below.time_ms,
          });
        }
        
        setTodayLeaderboardEntries(miniLeaderboard);
      }

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
      
      // Build array of all guesses: wrong guesses + current (correct) answer
      const allGuesses = [...wrongGuesses, currentAnswer];
      
      // Map guesses to columns (guess_1 through guess_5)
      const guessColumns: Record<string, string | null> = {};
      for (let i = 0; i < 5; i++) {
        guessColumns[`guess_${i + 1}`] = allGuesses[i] || null;
      }

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
            ...guessColumns,
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
      const newWrongGuesses = [...wrongGuesses, currentAnswer];
      setWrongGuesses(newWrongGuesses);
      const newGuessCount = newWrongGuesses.length;
      setGuessCount(newGuessCount);
      setAnswer(''); // Clear input for next guess

      // If they've used all 5 guesses, submit as incorrect
      if (newGuessCount >= MAX_GUESSES) {
        setIsSubmitting(true);
        const endTime = Date.now();
        const timeMs = startTime ? endTime - startTime : 0;

        // Build array of all guesses (all 5 are wrong)
        const allGuesses = newWrongGuesses;
        
        // Map guesses to columns (guess_1 through guess_5)
        const guessColumns: Record<string, string | null> = {};
        for (let i = 0; i < 5; i++) {
          guessColumns[`guess_${i + 1}`] = allGuesses[i] || null;
        }

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
              guess_count: newGuessCount,
              ...guessColumns,
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

  // Get today's date in a nice format - just "December 7th"
  const today = new Date();
  const month = today.toLocaleDateString('en-US', { month: 'long' });
  const day = today.getDate();
  const getOrdinalSuffix = (num: number) => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return num + 'st';
    if (j === 2 && k !== 12) return num + 'nd';
    if (j === 3 && k !== 13) return num + 'rd';
    return num + 'th';
  };
  const dateStr = `${month} ${getOrdinalSuffix(day)}`;

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-4 pb-2 sm:pb-4">
      <h1 
        className="text-xl sm:text-2xl md:text-3xl lg:text-4xl mb-1 sm:mb-1.5 text-center"
        style={{
          fontFamily: '"Luckiest Guy", cursive',
          fontWeight: 'normal',
          color: '#1e3a8a',
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
        <>
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
                  {MAX_GUESSES - wrongGuesses.length} {MAX_GUESSES - wrongGuesses.length === 1 ? 'guess' : 'guesses'} remaining
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
              {wrongGuesses.length >= 4 && puzzle?.hint && !hintUsed && !submitted && (
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
                    disabled={submitted || timeElapsed >= MAX_TIME_SECONDS || wrongGuesses.length >= MAX_GUESSES}
                    className="w-full px-2 py-1 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    placeholder="Enter your answer..."
                    autoFocus
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitted || timeElapsed >= MAX_TIME_SECONDS || wrongGuesses.length >= MAX_GUESSES || !answer.trim() || isSubmitting}
                  className="w-full bg-blue-600 text-white py-1.5 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-xs sm:text-sm"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Answer'}
                </button>
              </form>
            </>
          )}
          </div>
        </>
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
              backgroundColor: '#FFFFFF',
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

      {/* Create Your Own Rebus Modal */}
      {showCreateRebus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateRebus(false)}>
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 sm:p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCreateRebus(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              ×
            </button>
            <div className="pr-8">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
                Create Your Own Rebus
              </h3>
              {!rebusSubmitted ? (
                <form onSubmit={handleCreateRebusSubmit} className="space-y-4" noValidate>
                  <div>
                    <label
                      htmlFor="rebusAnswer"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Answer or Clue (optional if uploading image)
                    </label>
                    <input
                      type="text"
                      id="rebusAnswer"
                      value={rebusAnswer}
                      onChange={(e) => setRebusAnswer(e.target.value)}
                      placeholder="Enter the answer or clue..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload Image (optional)
                    </label>
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-8 h-8 mb-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="mb-2 text-sm text-gray-500">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">JPG/JPEG only (MAX. 10MB)</p>
                      </div>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setRebusImage(file);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                    {rebusImage && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm text-gray-600">{rebusImage.name}</span>
                        <button
                          type="button"
                          onClick={() => setRebusImage(null)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={submittingRebus || (!rebusAnswer.trim() && !rebusImage)}
                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm"
                  >
                    {submittingRebus ? 'Submitting...' : 'Submit Rebus'}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-green-600 font-medium">
                  Thank you for your rebus submission!
                </p>
              )}
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
                ? null
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
                  <div className="mt-4 space-y-3 sm:space-y-4">
                    {/* Time with average */}
                    <div className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <span>Your time: {(submission.time_ms / 1000).toFixed(2)}s</span>
                      {averageTimeToday !== null && (
                        <span className="text-blue-600 text-sm font-normal">
                          (Avg: {(averageTimeToday / 1000).toFixed(2)}s)
                        </span>
                      )}
                    </div>

                    {/* Number of guesses with average */}
                    {submission.guess_count && (
                      <div className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <span>{submission.guess_count} {submission.guess_count === 1 ? 'guess' : 'guesses'}</span>
                        {averageGuessesToday !== null && (
                          <span className="text-sm font-normal text-gray-600">
                            (Avg: {averageGuessesToday.toFixed(1)})
                          </span>
                        )}
                      </div>
                    )}

                    {/* Streak */}
                    <div className="text-base sm:text-lg font-semibold text-orange-600">
                      🔥 Streak: {streak} {streak === 1 ? 'day' : 'days'}
                    </div>

                    {/* Today's leaderboard */}
                    {todayLeaderboardEntries.length > 0 && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-sm sm:text-base font-bold text-blue-700 mb-2">
                          Today's Leaderboard
                        </div>
                        <table className="w-full text-xs sm:text-sm">
                          <thead>
                            <tr className="border-b border-blue-200">
                              <th className="text-left py-1 px-2 font-semibold text-blue-700">Rank</th>
                              <th className="text-left py-1 px-2 font-semibold text-blue-700">Username</th>
                              <th className="text-right py-1 px-2 font-semibold text-blue-700">Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {todayLeaderboardEntries.map((entry, idx) => (
                              <tr
                                key={idx}
                                className={entry.rank === rank ? 'bg-blue-100 font-semibold' : ''}
                              >
                                <td className="py-1 px-2">{entry.rank}</td>
                                <td className="py-1 px-2">{entry.username || 'Anonymous'}</td>
                                <td className="py-1 px-2 text-right">{(entry.time / 1000).toFixed(2)}s</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* All-time leaderboard */}
                    {allTimeLeaderboardEntries.length > 0 && (
                      <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                        <div className="text-sm sm:text-base font-bold text-purple-700 mb-2">
                          All-Time Leaderboard
                        </div>
                        {previousAllTimeRank !== null && allTimeRank !== null && previousAllTimeRank > allTimeRank && (
                          <div className="text-xs sm:text-sm text-green-600 font-semibold mb-2">
                            Moved up {previousAllTimeRank - allTimeRank} {previousAllTimeRank - allTimeRank === 1 ? 'spot' : 'spots'}!
                          </div>
                        )}
                        <table className="w-full text-xs sm:text-sm">
                          <thead>
                            <tr className="border-b border-purple-200">
                              <th className="text-left py-1 px-2 font-semibold text-purple-700">Rank</th>
                              <th className="text-left py-1 px-2 font-semibold text-purple-700">Username</th>
                              <th className="text-right py-1 px-2 font-semibold text-purple-700">Wins</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allTimeLeaderboardEntries.map((entry, idx) => (
                              <tr
                                key={idx}
                                className={allTimeRank !== null && entry.rank === allTimeRank ? 'bg-purple-100 font-semibold' : ''}
                              >
                                <td className="py-1 px-2">{entry.rank}</td>
                                <td className="py-1 px-2">{entry.username || 'Anonymous'}</td>
                                <td className="py-1 px-2 text-right">{entry.wins}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
                  </div>
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
              <div className="text-center">
                {!rebusSubmitted ? (
                  <button
                    onClick={() => setShowCreateRebus(true)}
                    className="inline-flex items-center gap-2 bg-purple-600 text-white py-2 px-4 sm:px-6 rounded-md hover:bg-purple-700 font-medium text-xs sm:text-sm"
                  >
                    <span>✨</span> <span>Create your own rebus</span>
                  </button>
                ) : (
                  <p className="text-xs sm:text-sm text-green-600">Thank you for your rebus submission!</p>
                )}
              </div>
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
              <div className="text-center">
                {!rebusSubmitted ? (
                  <button
                    onClick={() => setShowCreateRebus(true)}
                    className="inline-flex items-center gap-2 bg-purple-600 text-white py-2 px-4 sm:px-6 rounded-md hover:bg-purple-700 font-medium text-xs sm:text-sm"
                  >
                    <span>✨</span> <span>Create your own rebus</span>
                  </button>
                ) : (
                  <p className="text-xs sm:text-sm text-green-600">Thank you for your rebus submission!</p>
                )}
              </div>
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
              <div className="text-center">
                {!rebusSubmitted ? (
                  <button
                    onClick={() => setShowCreateRebus(true)}
                    className="inline-flex items-center gap-2 bg-purple-600 text-white py-2 px-4 sm:px-6 rounded-md hover:bg-purple-700 font-medium text-xs sm:text-sm"
                  >
                    <span>✨</span> <span>Create your own rebus</span>
                  </button>
                ) : (
                  <p className="text-xs sm:text-sm text-green-600">Thank you for your rebus submission!</p>
                )}
              </div>
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
              <div className="text-center">
                {!rebusSubmitted ? (
                  <button
                    onClick={() => setShowCreateRebus(true)}
                    className="inline-flex items-center gap-2 bg-purple-600 text-white py-2 px-4 sm:px-6 rounded-md hover:bg-purple-700 font-medium text-xs sm:text-sm"
                  >
                    <span>✨</span> <span>Create your own rebus</span>
                  </button>
                ) : (
                  <p className="text-xs sm:text-sm text-green-600">Thank you for your rebus submission!</p>
                )}
              </div>
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
              <p className="text-sm sm:text-base text-gray-800 leading-relaxed mb-4">
                I wont use this for anything other than messaging you a reminder {'<3'}. I promise
              </p>
              {!emailSubmitted ? (
                <form onSubmit={handleEmailSubmit} className="space-y-3" noValidate>
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter your email..."
                      autoComplete="email"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submittingEmail || !emailInput.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm"
                  >
                    {submittingEmail ? 'Submitting...' : 'Submit'}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-green-600 font-medium">
                  Thank you! Your email has been saved.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Today;
