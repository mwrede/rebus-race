import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Puzzle, Submission } from '../types';
import { getUsername } from '../lib/username';

function ArchiveDetail() {
  const { id } = useParams<{ id: string }>();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [anonId, setAnonId] = useState<string>('');
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

    if (id) {
      loadPuzzle(id);
    }
  }, [id]);

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

  const loadPuzzle = async (puzzleId: string) => {
    try {
      const { data, error } = await supabase
        .from('puzzles')
        .select('*')
        .eq('id', puzzleId)
        .single();

      if (error) throw error;
      setPuzzle(data);

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
        }
      }
    } catch (error) {
      console.error('Error loading puzzle:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puzzle || !answer.trim() || submitted || isSubmitting || alreadyPlayed) return;

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
      setAlreadyPlayed(true);
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

  const puzzleDate = new Date(puzzle.date);

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-4 pb-4">
      <Link
        to="/archive"
        className="text-blue-600 hover:text-blue-800 mb-3 sm:mb-4 inline-block text-xs sm:text-sm md:text-base"
      >
        ← Back to Archive
      </Link>

      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">
        Puzzle from {puzzleDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </h1>

      <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-2 sm:p-3 md:p-4 mb-3 sm:mb-4">
        <p className="text-xs sm:text-sm md:text-base text-yellow-800 font-semibold text-center">
          ⚠️ Archive puzzles do NOT count toward leaderboards or statistics
        </p>
      </div>

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
              {previousSubmission.is_correct && (
                <div className="text-sm sm:text-base md:text-lg font-semibold text-gray-900">
                  Your time: {(previousSubmission.time_ms / 1000).toFixed(2)}s
                </div>
              )}
              {!previousSubmission.is_correct && (
                <div className="text-sm sm:text-base md:text-lg font-semibold text-gray-900">
                  The correct answer was: {puzzle.answer}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!submitted && !alreadyPlayed && (
        <div className="bg-white rounded-lg shadow-md p-2.5 sm:p-3 md:p-4 lg:p-6 mb-3 sm:mb-4">
          {!isReady ? (
            <div className="text-center py-4 sm:py-6">
              <div className="mb-4 sm:mb-6">
                <img
                  src={puzzle.image_url}
                  alt="Rebus puzzle"
                  className="w-full rounded-lg border-2 border-gray-200 opacity-50 blur-sm"
                />
              </div>
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">
                Are you ready?
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
                Once you start, you'll have 30 seconds to solve the puzzle!
              </p>
              <button
                onClick={handleReady}
                className="bg-blue-600 text-white py-2 sm:py-3 px-6 sm:px-10 rounded-lg hover:bg-blue-700 font-bold text-base sm:text-lg md:text-xl shadow-lg transform hover:scale-105 transition-all"
              >
                Start Timer! ⏱️
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-2 sm:mb-3">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-600 mb-1 sm:mb-2">
                  {timeLeft}s
                </div>
                <div className="text-[10px] sm:text-xs md:text-sm text-gray-600">Time remaining</div>
              </div>

              <div className="mb-3 sm:mb-4">
                <img
                  src={puzzle.image_url}
                  alt="Rebus puzzle"
                  className="w-full rounded-lg border-2 border-gray-200"
                />
              </div>

              <form onSubmit={handleSubmit}>
                <div className="mb-2 sm:mb-3">
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

      {submitted && submission && !alreadyPlayed && (
        <div className="bg-white rounded-lg shadow-md p-2.5 sm:p-3 md:p-4 lg:p-6">
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
            <div className="text-xs sm:text-sm text-gray-600 mt-2 sm:mt-3">
              (This result does not count toward leaderboards)
            </div>
          </div>
        </div>
      )}

      {timeLeft === 0 && !submitted && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 sm:p-3 md:p-4 mb-3 sm:mb-4">
          <p className="text-yellow-800 text-center text-xs sm:text-sm md:text-base">
            Time's up! You can still submit your answer.
          </p>
        </div>
      )}
    </div>
  );
}

export default ArchiveDetail;
